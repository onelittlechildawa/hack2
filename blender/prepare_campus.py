"""Project an OpenStreetMap extract of RUC Zhongguancun into a north-up local map."""

import heapq
import json
import math
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

WEST, SOUTH, EAST, NORTH = 116.2999, 39.9658, 116.3148, 39.9728
WIDTH = 1000
LON_SCALE = math.cos(math.radians((NORTH + SOUTH) / 2))
HEIGHT = round(WIDTH * (NORTH - SOUTH) / ((EAST - WEST) * LON_SCALE))
ROOT = Path(__file__).resolve().parents[1]
WALKABLE = {"footway", "pedestrian", "path", "living_street", "residential", "service", "unclassified"}
LICENSE = {"source": "© OpenStreetMap contributors", "license": "ODbL 1.0",
           "url": "https://www.openstreetmap.org/copyright"}


def project(lat, lon):
    return (round(WIDTH * (lon - WEST) / (EAST - WEST), 2), round(HEIGHT * (NORTH - lat) / (NORTH - SOUTH), 2))


def tags(e):
    return {item.attrib["k"]: item.attrib["v"] for item in e.findall("tag")}


def closest_point(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    fraction = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy or 1)
    t = max(0, min(1, fraction))
    return (round(a[0] + t * dx, 2), round(a[1] + t * dy, 2))


def contains(p, points):
    x, y = p
    inside = False
    for a, b in zip(points, points[1:] + points[:1]):
        if (a[1] > y) != (b[1] > y) and x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            inside = not inside
    return inside


def center(points):
    ring = points[:-1] if points[-1] == points[0] else points
    return tuple(sum(axis) / len(axis) for axis in zip(*ring))


def within_frame(point):
    return -16 < point[0] < WIDTH + 16 and -16 < point[1] < HEIGHT + 16


def shortest(graph, nodes, origin, target):
    queue = [(0, origin)]
    visited, previous = set(), {}
    best = {origin: 0}
    while queue:
        cost, current = heapq.heappop(queue)
        if current == target:
            path = [target]
            while path[-1] != origin:
                path.append(previous[path[-1]])
            return [nodes[node] for node in reversed(path)]
        if current in visited:
            continue
        visited.add(current)
        for other, length in graph[current]:
            candidate = cost + length
            if candidate < best.get(other, math.inf):
                best[other] = candidate
                previous[other] = current
                heapq.heappush(queue, (candidate, other))
    raise ValueError(f"No connected walk between {origin} and {target}")


def pack(paths):
    trees, elements, ways = [], {}, {}
    for path in paths:
        doc = ET.parse(path).getroot()
        elements.update((e.attrib["id"], e) for e in doc.findall("node"))
        ways.update((e.attrib["id"], e) for e in doc.findall("way"))
    nodes = {id: project(float(e.attrib["lat"]), float(e.attrib["lon"])) for id, e in elements.items()}
    way_nodes = {id: [n.attrib["ref"] for n in e.findall("nd") if n.attrib["ref"] in nodes] for id, e in ways.items()}
    rings = {id: [nodes[node] for node in refs] for id, refs in way_nodes.items() if refs}
    campus = rings["30725330"]
    roads, footprints, greens, water, pitches = [], [], [], [], []
    graph = defaultdict(list)
    edges = set()

    def connect(a, b):
        length = math.dist(nodes[a], nodes[b])
        graph[a].append((b, length))
        graph[b].append((a, length))

    for id, e in ways.items():
        points, refs, t = rings.get(id, []), way_nodes[id], tags(e)
        if len(points) < 2 or not any(within_frame(point) for point in points):
            continue
        kind, name = t.get("highway"), t.get("name", "")
        inside = contains(center(points), campus)
        if kind in WALKABLE | {"trunk", "primary", "secondary", "tertiary"} and len(points) < 100:
            roads.append({"kind": kind, "points": points})
            if kind in WALKABLE and not t.get("area") == "yes":
                for a, b in zip(refs, refs[1:]):
                    midpoint = tuple((p + q) / 2 for p, q in zip(nodes[a], nodes[b]))
                    edge = tuple(sorted((a, b)))
                    if within_frame(midpoint) and (contains(midpoint, campus) or name in {"明志路", "品园路", "林园路"}) and edge not in edges:
                        edges.add(edge)
                        connect(a, b)
        if len(points) < 4 or refs[0] != refs[-1] or not within_frame(center(points)):
            continue
        if (t.get("building") and t["building"] != "construction") or id == "513262252":
            levels = t.get("building:levels", "")
            height = float(levels) * 2.5 if levels.replace(".", "", 1).isdigit() else 7 + int(id) % 10
            if t.get("building") == "dormitory":
                height = max(12, height)
            footprints.append({"id": id, "points": points, "height": min(38, height),
                               "inside": inside, "material": "brick" if "品园" in name or "红" in name else "stone"})
        if t.get("natural") == "water":
            water.append(points)
        if t.get("landuse") in {"forest", "grass"} or t.get("leisure") in {"park", "garden"} or t.get("natural") == "wood":
            greens.append({"points": points, "wood": t.get("landuse") == "forest" or t.get("natural") == "wood"})
        if t.get("leisure") == "pitch" and inside:
            pitches.append({"id": id, "points": points, "sport": t.get("sport")})
    for id, e in elements.items():
        if tags(e).get("natural") == "tree" and within_frame(nodes[id]) and contains(nodes[id], campus):
            trees.append(nodes[id])

    # Only use streets and paths in the main connected campus network.
    remaining = set(graph)
    components = []
    while remaining:
        group = [remaining.pop()]
        for a in group:
            for b, _ in graph[a]:
                if b in remaining:
                    remaining.remove(b)
                    group.append(b)
        components.append(group)
    main = set(max(components, key=len))
    walk_segments = [(a, b) for a, b in sorted(edges) if a in main and b in main]
    targets = {
        "gate": ("东门", nodes["5100299693"], (11, 44), "gate"),
        "library": ("图书馆", center(rings["513262252"]), (-2, -21), "library"),
        "pool": ("一勺池", center(rings["334850785"]), (-9, -24), "pool"),
        "canteen": ("中区食堂", center(rings["513380875"]), (22, 1), "canteen"),
        "dorm": ("品园宿舍", center(rings["182856687"]), (-11, 24), "dorm"),
        "field": ("田径场", center(rings["78142346"]), (7, 32), "field"),
    }
    landmarks = {}
    for id, (name, center_point, (dx, dy), icon) in targets.items():
        goal = center_point
        if id == "field":
            goal = (max(p[0] for p in rings["78142346"]), center_point[1])
        if id == "library":
            goal = (center_point[0], max(p[1] for p in rings["513262252"]))
        a, b = min(walk_segments, key=lambda edge: math.dist(goal, closest_point(goal, nodes[edge[0]], nodes[edge[1]])))
        point = closest_point(goal, nodes[a], nodes[b])
        nodes[id] = point
        connect(id, a)
        connect(id, b)
        landmarks[id] = {"name": name, "x": point[0], "y": point[1], "labelX": round(center_point[0] + dx, 2),
                         "labelY": round(center_point[1] + dy, 2), "icon": icon}
        print(name, "walk anchor", point, "distance to approach", round(math.dist(goal, point), 1))

    routes = {a: {b: shortest(graph, nodes, a, b) for b in targets} for a in targets}
    size = {"width": WIDTH, "height": HEIGHT}
    geometry = {"size": size, "license": LICENSE, "campus": campus, "roads": roads, "buildings": footprints,
                "greens": greens, "water": water, "pitches": pitches, "trees": trees,
                "courtyards": [rings[id] for id in ("524117757", "524117758", "524117760") if id in rings]}
    layout = {"size": size, "license": LICENSE, "places": landmarks, "routes": routes}
    return geometry, layout


if __name__ == "__main__":
    geometry, layout = pack(sys.argv[1:])
    for file, content in (("public/campus/geometry.json", geometry), ("shared/campus-layout.json", layout)):
        (ROOT / file).write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
