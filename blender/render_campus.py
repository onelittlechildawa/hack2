"""Render the oblique campus view and export its ground-plane projection."""

import json
import math
import random
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "public/campus/geometry.json").read_text(encoding="utf-8"))
WIDTH, HEIGHT = DATA["size"]["width"], DATA["size"]["height"]
RNG = random.Random(208)
VIEW_WIDTH, VIEW_HEIGHT = 1125, 700


def srgb(color):
    values = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, dark, light, scale=.16, roughness=.78):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*srgb(light), 1)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3
    geometry = nodes.new("ShaderNodeNewGeometry")
    links.new(geometry.outputs["Position"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*srgb(dark), 1)
    ramp.color_ramp.elements[1].color = (*srgb(light), 1)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    return mat


def ring(points):
    non_duplicate = [p for i, p in enumerate(points) if p != points[i - 1]]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(non_duplicate, non_duplicate[1:] + non_duplicate[:1]))
    return list(reversed(non_duplicate)) if area > 0 else non_duplicate


def site_mesh(name, verts, faces, materials):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for mat in materials:
        data.materials.append(mat)
    return obj


def surface(name, points, level, mat):
    points = ring(points)
    if len(points) > 2:
        site_mesh(name, [(x, HEIGHT - y, level) for x, y in points], [tuple(range(len(points)))], [mat])


def structure(points, height, wall, roof, collection=None):
    points = ring(points)
    n = len(points)
    if n < 3:
        return
    verts = [(x, HEIGHT - y, z) for z in (.4, height) for x, y in points]
    faces = [tuple(range(n, 2 * n))]
    faces.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
    obj = site_mesh("Building", verts, faces, [roof, wall])
    if collection is not None:
        collection.objects.link(obj)
    for face in obj.data.polygons[1:]:
        face.material_index = 1
    trim = obj.modifiers.new("Roof edges", "BEVEL")
    trim.width = .34
    trim.segments = 1


def facade_windows(points, height, vertices, faces):
    floors = min(8, int(height / 3.4))
    if floors < 1:
        return
    points = [Vector((x, HEIGHT - y, 0)) for x, y in ring(points)]
    for start, end in zip(points, points[1:] + points[:1]):
        edge = end - start
        length = edge.length
        if length < 5:
            continue
        axis = edge.normalized()
        outward = Vector((axis.y, -axis.x, 0)) * .13
        count = max(1, round(length / 4.2))
        half_window = axis * min(1.19, length / count * .28)
        for column in range(count):
            center = start + axis * (length * (column + .5) / count) + outward
            for floor in range(floors):
                z = (floor + .56) * height / floors
                corners = (center - half_window, center + half_window)
                offset = len(vertices)
                vertices.extend((corner.x, corner.y, level) for level in (z - .64, z + .64) for corner in corners)
                faces.append((offset, offset + 1, offset + 3, offset + 2))


def make_camera(scene):
    azimuth, elevation = math.radians(24), math.radians(51)
    direction = Vector((math.sin(azimuth) * math.cos(elevation),
                        -math.cos(azimuth) * math.cos(elevation), math.sin(elevation)))
    target = Vector((WIDTH / 2, HEIGHT / 2, 0))
    bpy.ops.object.camera_add(location=target + direction * 1120)
    camera = scene.camera = bpy.context.object
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    rotation = camera.rotation_euler.to_matrix()
    local = [rotation.transposed() @ (Vector((x, HEIGHT - y, 4)) - camera.location) for x, y in DATA["campus"]]
    left, right = min(p.x for p in local), max(p.x for p in local)
    bottom, top = min(p.y for p in local), max(p.y for p in local)
    camera.location += rotation @ Vector(((left + right) / 2, (bottom + top) / 2, 0))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(right - left + 88, (top - bottom + 88) * VIEW_WIDTH / VIEW_HEIGHT)
    camera.data.clip_end = 2600
    bpy.context.view_layer.update()


def export_projection(scene):
    def point(x, y):
        projected = world_to_camera_view(scene, scene.camera, Vector((x, HEIGHT - y, 0)))
        return Vector((projected.x * VIEW_WIDTH, (1 - projected.y) * VIEW_HEIGHT))

    origin = point(0, 0)
    east, south = point(WIDTH, 0) - origin, point(0, HEIGHT) - origin
    projection = {"size": {"width": VIEW_WIDTH, "height": VIEW_HEIGHT}, "origin": list(origin),
                  "east": list(east), "south": list(south), "north": math.degrees(math.atan2(-south.x, south.y))}
    (ROOT / "shared/campus-oblique.json").write_text(json.dumps(projection, indent=2) + "\n", encoding="utf-8")


def road_surface(points, width, level, mat):
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        dist = math.hypot(dx, dy)
        if dist < .05:
            continue
        x, y = -dy * width / (2 * dist), dx * width / (2 * dist)
        surface("Road", [(a[0] + x, a[1] + y), (b[0] + x, b[1] + y),
                         (b[0] - x, b[1] - y), (a[0] - x, a[1] - y)], level, mat)


def is_inside(point, outline):
    x, y = point
    inside = False
    for a, b in zip(outline, outline[1:] + outline[:1]):
        if (a[1] > y) != (b[1] > y) and x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            inside = not inside
    return inside


def stadium(points, inset):
    min_x, max_x = min(p[0] for p in points) + inset, max(p[0] for p in points) - inset
    min_y, max_y = min(p[1] for p in points) + inset, max(p[1] for p in points) - inset
    radius = (max_x - min_x) / 2
    x = (min_x + max_x) / 2
    def arc(y, start):
        return [(x + radius * math.cos(start + i * math.pi / 30), y + radius * math.sin(start + i * math.pi / 30))
                for i in range(31)]
    return arc(min_y + radius, math.pi) + arc(max_y - radius, 0)


def run():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # Bright sunlit comic-illustrated campus palette
    ground = material("District", "#e8e8df", "#faf9f2", .075, .82)
    campus_ground = material("Campus grounds", "#b5e07d", "#d8f2a4", .072, .80)
    greens = material("Lawn", "#7ad156", "#aef078", .16, .78)
    asphalt = material("Roads", "#cfd5de", "#e7ecf2", .27, .82)
    paving = material("Campus paving", "#f6e4a8", "#fff5cc", .32, .80)
    water = material("Water", "#3399ff", "#78d5ff", .18, .28)
    running = material("Track", "#ff5247", "#ff806e", .45, .75)
    lanes = material("Track markings", "#fff2cc", "#ffffff", .16, .75)
    grass = material("Playing field", "#4ec953", "#83e66e", .075, .78)
    white = material("Field paint", "#f5f8eb", "#ffffff", .16, .75)
    wall = material("Stone facades", "#e6e3da", "#ffffff", .27, .76)
    brick = material("Red brick", "#df6c57", "#f79c84", .31, .76)
    glass = material("Window panes", "#3366cc", "#6da6f5", .8, .32)
    roofs = [material("Roof", a, b, .22, .74) for a, b in [
        ("#eceee9", "#ffffff"), ("#f8f0d8", "#fffdf2"), ("#dce7f5", "#f2f8ff"),
        ("#e2eef0", "#f7fcfd"), ("#f5ebe0", "#fffaf2"),
    ]]
    red_roof = material("Dormitory roofs", "#e87058", "#ff9e85", .31, .74)
    library_roof = material("Library roof", "#3d7eff", "#78b2ff", .18, .68)
    trees = [material("Canopy", a, b, .23, .72) for a, b in [
        ("#33b845", "#6be86b"), ("#4cc93e", "#93f06e"), ("#2ea85a", "#6be088"),
        ("#75cf42", "#bbf26b"), ("#3ec24c", "#82eb73"),
    ]]
    surface("District", [(-1000, -1000), (2000, -1000), (2000, 1700), (-1000, 1700)], 0, ground)
    surface("Campus land", DATA["campus"], .04, campus_ground)
    for i, item in enumerate(DATA["greens"]):
        surface("Green space", item["points"], .075 + i * .0001, greens)

    for i, item in enumerate(DATA["roads"]):
        major = item["kind"] in {"trunk", "primary", "secondary", "tertiary"}
        width = 12 if major else 2.7 if item["kind"] in {"footway", "path"} else 6
        road_surface(item["points"], width, .13 + i * .0001, asphalt if major else paving)
    for points in DATA["water"]:
        surface("Pond edge", points, .21, water)

    for item in DATA["pitches"]:
        points = item["points"]
        if item["id"] == "78142346":
            surface("Running track", stadium(points, 1), .24, running)
            for i in range(6):
                surface("Lane paint", stadium(points, 2.5 + i * 1.55), .251 + i * .004, lanes)
                surface("Lane", stadium(points, 2.75 + i * 1.55), .253 + i * .004, running)
            surface("Infield", stadium(points, 12), .284, grass)
        else:
            surface("Sports court", points, .24, grass)
    soccer = next((p for p in DATA["pitches"] if p["id"] == "524200099"), None)
    if soccer:
        road_surface(soccer["points"], .55, .29, white)

    buildings_col = bpy.data.collections.new("Buildings")
    scene.collection.children.link(buildings_col)
    windows, window_faces = [], []
    for item in DATA["buildings"]:
        height = item["height"]
        roof = library_roof if item["id"] == "513262252" else red_roof if item["material"] == "brick" else RNG.choice(roofs)
        structure(item["points"], height, brick if item["material"] == "brick" else wall, roof, buildings_col)
        facade_windows(item["points"], height, windows, window_faces)
    site_mesh("Windows", windows, window_faces, [glass])
    library_height = next((b["height"] for b in DATA["buildings"] if b["id"] == "513262252"), 9)
    for courtyard in DATA["courtyards"]:
        surface("Library roof court", courtyard, library_height + .06, wall)

    land = DATA["campus"]
    sites = DATA["buildings"]
    canopy_points = list(DATA["trees"])
    for green in DATA["greens"]:
        points = green["points"]
        x0, x1 = min(p[0] for p in points), max(p[0] for p in points)
        y0, y1 = min(p[1] for p in points), max(p[1] for p in points)
        for _ in range(min(36, round((x1 - x0) * (y1 - y0) / (55 if green["wood"] else 210)))):
            point = (RNG.uniform(x0, x1), RNG.uniform(y0, y1))
            if is_inside(point, points) and is_inside(point, land) and not any(is_inside(point, p["points"]) for p in sites):
                canopy_points.append(point)

    prototypes = []
    for index, mat in enumerate(trees):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        obj = bpy.context.object
        for vert in obj.data.vertices:
            vert.co *= RNG.uniform(.84, 1.13)
        for face in obj.data.polygons:
            face.use_smooth = True
        obj.data.materials.append(mat)
        obj.location = (-400, -400, -50 - index)
        prototypes.append(obj)
    for x, y in canopy_points:
        obj = RNG.choice(prototypes).copy()
        bpy.context.collection.objects.link(obj)
        radius = RNG.uniform(2.5, 5)
        obj.location = (x, HEIGHT - y, radius * 1.45)
        obj.scale = (radius, radius * RNG.uniform(.82, 1.18), radius * RNG.uniform(1, 1.45))

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 150))
    sun = bpy.context.object
    sun.rotation_euler = Vector((.6, -.45, -1)).to_track_quat("-Z", "Y").to_euler()
    sun.data.energy = 3.8
    sun.data.angle = math.radians(6)
    sun.data.color = (1, .97, .90)
    world = bpy.data.worlds.new("Sunny comic sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (.82, .91, 1.0, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world

    # Subtle comic ink outlines on buildings only
    scene.render.use_freestyle = True
    scene.render.line_thickness = 1.1
    layer = scene.view_layers[0]
    layer.use_freestyle = True
    layer.freestyle_settings.crease_angle = math.radians(130)
    lineset = layer.freestyle_settings.linesets[0] if layer.freestyle_settings.linesets else layer.freestyle_settings.linesets.new("ComicInk")
    lineset.name = "ComicInk"
    lineset.select_silhouette = True
    lineset.select_crease = True
    lineset.select_border = True
    lineset.select_external_contour = True
    lineset.select_by_collection = True
    lineset.collection = buildings_col
    lineset.linestyle.color = (0.04, 0.04, 0.04)
    lineset.linestyle.alpha = 0.78
    lineset.linestyle.thickness = 1.1

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1120
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 89
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.18
    try:
        scene.view_settings.look = "AgX - Punchy"
    except Exception:
        pass
    if "--north-up" in sys.argv:
        bpy.ops.object.camera_add(location=(WIDTH / 2, HEIGHT / 2, 550), rotation=(0, 0, 0))
        scene.camera = bpy.context.object
        scene.camera.data.type = "ORTHO"
        scene.camera.data.ortho_scale = WIDTH
        scene.render.resolution_x = 1700
        scene.render.resolution_y = round(1700 * HEIGHT / WIDTH)
        name = "zhongguancun.webp"
    else:
        make_camera(scene)
        export_projection(scene)
        name = "zhongguancun-oblique.webp"
    scene.render.filepath = str(ROOT / "public/campus" / name)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    run()
