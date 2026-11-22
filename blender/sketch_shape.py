"""Turn a front-view sketch into a closed, inflated surface in Blender coordinates."""

from collections import deque
from math import ceil, hypot, sqrt

SIZE = 97
STEP = 0.0267
DIAGONAL = sqrt(2)


def mark_strokes(strokes, radius):
    pixels = [False] * (SIZE * SIZE)
    offsets = [(dx, dz) for dx in range(-radius, radius + 1) for dz in range(-radius, radius + 1)
               if dx * dx + dz * dz <= radius * radius]
    for stroke in strokes:
        starts = [stroke[0], *stroke[:-1]]
        for (x, z), (end_x, end_z) in zip(starts, stroke):
            length = max(1, ceil(hypot(end_x - x, end_z - z) * 1.5))
            for i in range(length + 1):
                u = round(x + (end_x - x) * i / length)
                v = round(z + (end_z - z) * i / length)
                for dx, dz in offsets:
                    if 0 < u + dx < SIZE - 1 and 0 < v + dz < SIZE - 1:
                        pixels[(v + dz) * SIZE + u + dx] = True
    return pixels


def neighbors(i):
    u, v = i % SIZE, i // SIZE
    if u > 0:
        yield i - 1
    if u < SIZE - 1:
        yield i + 1
    if v > 0:
        yield i - SIZE
    if v < SIZE - 1:
        yield i + SIZE


def fill_outline(ink):
    outside = {0}
    queue = deque([0])
    while queue:
        for neighbor in neighbors(queue.popleft()):
            if not ink[neighbor] and neighbor not in outside:
                outside.add(neighbor)
                queue.append(neighbor)
    return [i not in outside for i in range(len(ink))]


def largest_island(mask):
    remaining = {i for i, solid in enumerate(mask) if solid}
    largest = []
    while remaining:
        island = [remaining.pop()]
        for i in island:
            for neighbor in neighbors(i):
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    island.append(neighbor)
        if len(island) > len(largest):
            largest = island
    return set(largest)


def hull(points):
    points = sorted(set(points))
    if len(points) < 3:
        return points

    def half(sequence):
        result = []
        for point in sequence:
            while len(result) > 1:
                a, b = result[-2:]
                cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])
                if cross > 0:
                    break
                result.pop()
            result.append(point)
        return result

    return half(points)[:-1] + half(reversed(points))[:-1]


def distance(mask, target):
    values = [0.0 if cell == target else float(SIZE) for cell in mask]
    for columns, rows, direction in (
        (range(SIZE), range(SIZE), -1),
        (range(SIZE - 1, -1, -1), range(SIZE - 1, -1, -1), 1),
    ):
        for v in rows:
            for u in columns:
                i = v * SIZE + u
                x, z = u + direction, v + direction
                if 0 <= x < SIZE:
                    values[i] = min(values[i], 1 + values[v * SIZE + x])
                if 0 <= z < SIZE:
                    values[i] = min(values[i], 1 + values[z * SIZE + u])
                    for dx in (-1, 1):
                        if 0 <= u + dx < SIZE:
                            values[i] = min(values[i], DIAGONAL + values[z * SIZE + u + dx])
    return values


def soften(field):
    for _ in range(4):
        blurred = field.copy()
        for v in range(1, SIZE - 1):
            for u in range(1, SIZE - 1):
                i = v * SIZE + u
                edges = field[i - 1] + field[i + 1] + field[i - SIZE] + field[i + SIZE]
                corners = field[i - SIZE - 1] + field[i - SIZE + 1] + field[i + SIZE - 1] + field[i + SIZE + 1]
                blurred[i] = (4 * field[i] + 2 * edges + corners) / 16
        field = blurred
    return field


class SketchShape:
    def __init__(self, strokes, aspect):
        lines = [[(x * aspect, 1 - y) for x, y in stroke] for stroke in strokes]
        points = [point for stroke in lines for point in stroke]
        xs, zs = zip(*points)
        span_x, span_z = max(xs) - min(xs), max(zs) - min(zs)
        span = max(span_x, span_z, 0.085)
        mid_x, mid_z = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
        scale = (SIZE / 2 - 8) * 2 / span
        raster = [[((x - mid_x) * scale + SIZE / 2, (z - mid_z) * scale + SIZE / 2)
                   for x, z in stroke] for stroke in lines]
        closed = [
            [*line, line[0]] if len(line) > 3 and hypot(line[-1][0] - line[0][0], line[-1][1] - line[0][1]) < 6
            else line for line in raster
        ]
        ink = mark_strokes(closed, 3)
        traced = fill_outline(ink)
        self.method = "traced"
        if sum(traced) - sum(ink) < max(26, 0.095 * span_x * span_z * scale * scale):
            outline = hull([point for line in raster for point in line])
            padded = mark_strokes([[*outline, outline[0]]], 7)
            traced = fill_outline(padded)
            self.method = "inferred"
        island = largest_island(traced)
        solid = [i in island for i in range(SIZE * SIZE)]
        away_from_outside = distance(solid, False)
        away_from_inside = distance(solid, True)
        signed = [(a - b - (0.5 if inside else -0.5)) for a, b, inside in zip(away_from_outside, away_from_inside, solid)]
        self.field = soften(signed)
        surface = {i for i in island if self.field[i] > 0}
        cols = [i % SIZE for i in surface]
        rows = [i // SIZE for i in surface]
        self.origin_x = -(min(cols) + max(cols)) / 2 * STEP
        self.origin_z = 0.23 - min(rows) * STEP
        self.width = (max(cols) - min(cols) + 1) * STEP
        target_z = (min(rows) + max(rows)) / 2
        deepest = max(surface, key=lambda i: self.field[i] - 0.09 * abs(i // SIZE - target_z))
        self.face_x, self.face_z = self.point(deepest)
        self.face_scale = min(1.29, max(0.19, self.field[deepest] * STEP / 0.66))
        self.depth = min(0.64, 0.29 + 0.27 * self.width)
        # Attach mittens near the outer edges at a contour height close to the face.
        self.shoulders = {}
        self.feet = {}
        for side in (-1, 1):
            edge = min(cols) if side < 0 else max(cols)
            candidates = [i for i in surface if abs(i % SIZE - edge) <= 1]
            index = min(candidates, key=lambda i: abs(self.point(i)[1] - self.face_z))
            _, height = self.point(index)
            self.shoulders[side] = (self.origin_x + edge * STEP - side * 0.032, 0.012, height)
            half = [i for i in surface if self.point(i)[0] * side >= self.width * 0.09]
            bottom = min(half, key=lambda i: (i // SIZE, abs(self.point(i)[0] - side * self.width * 0.28)))
            foot_x, foot_z = self.point(bottom)
            self.feet[side] = (foot_x, 0.02, foot_z + 0.065)

    def point(self, index):
        return (self.origin_x + index % SIZE * STEP, self.origin_z + index // SIZE * STEP)

    def sample(self, x, z):
        u = (x - self.origin_x) / STEP
        v = (z - self.origin_z) / STEP
        if not (0 <= u < SIZE - 1 and 0 <= v < SIZE - 1):
            return -1.0
        col, row = int(u), int(v)
        dx, dz = u - col, v - row
        i = row * SIZE + col
        low = self.field[i] * (1 - dx) + self.field[i + 1] * dx
        high = self.field[i + SIZE] * (1 - dx) + self.field[i + SIZE + 1] * dx
        return (low * (1 - dz) + high * dz) * STEP

    def thickness(self, distance_to_edge):
        ratio = min(1, max(0, distance_to_edge / 0.36))
        return self.depth * sqrt(ratio * (2 - ratio))

    def surface(self):
        vertices, faces, cache = [], [], {}

        def pair(key, x, z, d):
            if key not in cache:
                depth = self.thickness(d * STEP)
                front = len(vertices)
                vertices.append((x, -depth, z))
                rear = front
                if depth > 0:
                    rear = len(vertices)
                    vertices.append((x, depth, z))
                cache[key] = (front, rear)
            return cache[key]

        def corner(i):
            return pair(i, *self.point(i), self.field[i])

        def crossing(i, j):
            if abs(self.field[i]) < 1e-8:
                return corner(i)
            if abs(self.field[j]) < 1e-8:
                return corner(j)
            x, z = self.point(i)
            next_x, next_z = self.point(j)
            t = self.field[i] / (self.field[i] - self.field[j])
            return pair((min(i, j), max(i, j)), x + (next_x - x) * t, z + (next_z - z) * t, 0)

        for v in range(SIZE - 1):
            for u in range(SIZE - 1):
                a = v * SIZE + u
                b, c, d = a + 1, a + SIZE + 1, a + SIZE
                for triangle in ((a, b, c), (a, c, d)):
                    polygon = []
                    for i, j in zip(triangle, (*triangle[1:], triangle[0])):
                        inside, next_inside = self.field[i] > 0, self.field[j] > 0
                        if inside:
                            polygon.append(corner(i))
                        if inside != next_inside:
                            polygon.append(crossing(i, j))
                    polygon = list(dict.fromkeys(polygon))
                    if len(polygon) >= 3:
                        faces.append(tuple(front for front, _ in polygon))
                        faces.append(tuple(rear for _, rear in reversed(polygon)))
        return vertices, faces
