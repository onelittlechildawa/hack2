import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from sketch_shape import SketchShape

TAU = 2 * math.pi
PALETTES = json.loads((Path(__file__).resolve().parents[1] / "shared" / "palettes.json").read_text(encoding="utf-8"))

EYE_STROKES = {
    "line": ((-.092, 0), (.092, 0)),
    "closed": ((-.116, .023), (-.053, -.015), (0, -.028), (.059, -.015), (.115, .025)),
    "droop": ((-.114, -.041), (-.05, -.019), (.024, -.006), (.114, .033)),
    "happy": ((-.116, -.038), (-.055, .030), (0, .051), (.058, .030), (.116, -.037)),
    "squeeze": ((.085, .066), (-.086, 0), (.083, -.071)),
}
EYE_OVALS = {
    "dot": (.060, .063, False), "button": (.078, .104, False), "lid": (.128, .066, True),
    "alert": (.131, .129, True), "wide": (.152, .158, True), "star": (.153, .161, True),
}
GAZES = {"side": (.30, .06), "down": (0, -.20), "up": (0, .18)}
BROWS = {
    "flat": (.193, 0, .004), "soft": (.204, -.008, .033), "tired": (.214, -.033, -.012),
    "tense": (.208, .042, .004), "pinched": (.215, .067, -.010),
    "worried": (.225, -.050, .024), "raised": (.226, .013, .046),
}
MOUTH_LINES = {
    "flat": (.109, .004, 0), "wry": (.132, .016, .024),
    "frown": (.148, -.050, 0), "smile": (.145, .054, 0),
}
# Width, height, lifted corners, and the two details visible inside the mouth.
MOUTH_OVALS = {
    "purse": (.044, .027, 0, False, False), "o": (.080, .063, 0, False, False),
    "yawn": (.125, .155, 0, False, True), "gasp": (.151, .147, 0, False, True),
    "grit": (.202, .080, -.025, True, False), "shout": (.265, .164, -.040, True, True),
    "grin": (.226, .108, .046, True, False), "laugh": (.307, .153, .076, True, True),
    "beam": (.337, .185, .084, True, True),
}


def linear(value):
    value /= 255
    return value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, color, roughness=0.38, coat=0.2):
    rgba = tuple(linear(int(color[i:i + 2], 16)) for i in (1, 3, 5)) + (1.0,)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = coat
    return mat


def mesh(name, vertices, faces, mat, parent):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    return obj


def empty(name, parent=None, point=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = point
    return obj


def ball(name, point, axes, mat, parent, rotation=0, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = point
    obj.rotation_euler.y = rotation
    for vertex in obj.data.vertices:
        vertex.co = [vertex.co[i] * axes[i] for i in range(3)]
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def tube(name, points, radius, mat, parent):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for handle, co in zip(spline.points, points):
        handle.co = (*co, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    # The glTF exporter consumes mesh objects.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


class Mascot:
    def __init__(self, recipe):
        self.recipe = recipe
        self.outline = SketchShape(**recipe["outline"]) if recipe.get("outline") else None
        self.gag = recipe["kind"] == "gag"
        self.form = recipe["form"]
        self.width = recipe["width"] * (0.94 if self.gag else 0.83)
        self.height = recipe["height"] * (0.94 if self.form == "cookie" else 0.97)
        self.depth = 0.42 if self.form == "cookie" else (0.70 if self.gag else 0.65)
        self.center = self.height + 0.19
        self.lean = recipe["lean"]
        intensity = recipe["intensity"]
        mood = recipe["mood"]
        stress = {"offline": 0.86, "overheat": 1.0, "blank": 0.82, "giddy": 1.06}
        tempo = {"offline": 1.14, "overheat": 0.96, "blank": 1.21, "giddy": 0.90}
        self.strength = (0.50 + 0.1 * intensity) * stress[mood]
        self.duration = tempo[mood] * (1.12 - 0.04 * intensity)
        self.actors = {}

        palette = PALETTES[recipe["palette"]]
        self.skin = material("Satin clay", palette["skin"])
        self.belly = material("Soft belly", palette["belly"])
        self.rose = material("Cheeks", palette["cheek"], 0.44)
        self.rim = material("Lip clay", palette["rim"], 0.42)
        self.dark = material("Blackberry", "#30203d", 0.41)
        self.cream = material("Vanilla", "#fff5db", 0.31)
        self.tongue = material("Bubble gum", "#ff8f9c", 0.39)
        self.iris = material("Deep plum", "#252039", 0.24)

        self.root = empty("Mascot")
        self.squish = empty("Squish", self.root)
        self.make_body()
        self.make_face()
        self.make_ears()
        self.make_badge()
        self.make_limbs()
        self.clearance = 0

    def profile(self, t):
        weight = {"blob": 0.11, "bean": 0.23, "cookie": 0.10}[self.form]
        waist = 1 - 0.16 * math.exp(-((t - 0.06) / 0.23) ** 2) if self.form == "cookie" else 1
        return (self.lean * t, self.width * (1 - weight * t) * waist, self.depth * (1 - 0.13 * t))

    def inside_body(self, position):
        x, y, z = position
        if self.outline:
            distance = self.outline.sample(x, z)
            return distance > -0.013 and abs(y) <= self.outline.thickness(distance) + 0.021
        t = (z - self.center) / self.height
        if abs(t) >= 1:
            return False
        shift, width, depth = self.profile(t)
        return ((x - shift) / width) ** 2 + (y / depth) ** 2 + t * t < 1.012

    def front(self, x, z, offset=0):
        if self.outline:
            return -self.outline.thickness(self.outline.sample(x, z)) - offset
        t = (z - self.center) / self.height
        shift, width, depth = self.profile(t)
        return -depth * math.sqrt(max(0.001, 1 - t * t - ((x - shift) / width) ** 2)) - offset

    def make_body(self):
        if self.outline:
            vertices, faces = self.outline.surface()
            mesh("Inflated hand-drawn outline", vertices, faces, self.skin, self.squish)
            print(f"Sketch surface: {self.outline.method}, {len(vertices)} vertices", flush=True)
            return
        body = ball("Body", (0, 0, 0), (1, 1, 1), self.skin, self.squish, segments=64, rings=40)
        for vertex in body.data.vertices:
            x, y, t = vertex.co
            shift, width, depth = self.profile(t)
            vertex.co = (shift + x * width, y * depth, self.center + t * self.height)

    def emblem(self, name, x, z, rx, rz, mat, offset, lift=0, emboss=0.008):
        vertices = [(x, self.front(x, z, offset + emboss), z)]
        rings, segments = 7, 52
        for ring in range(1, rings + 1):
            r = ring / rings
            for i in range(segments):
                angle = TAU * i / segments
                dx = math.cos(angle) * r
                px = x + rx * dx
                pz = z + rz * math.sin(angle) * r + lift * dx * dx
                vertices.append((px, self.front(px, pz, offset + (1 - r * r) * emboss), pz))
        faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
        for ring in range(rings - 1):
            inner = 1 + ring * segments
            outer = inner + segments
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((inner + i, outer + i, outer + j, inner + j))
        mesh(name, vertices, faces, mat, self.squish)

    def perk(self, name, x, z, axes, mat, inset=0, turn=0):
        return ball(name, (x, self.front(x, z, inset), z), axes, mat, self.squish, turn)

    def face_stroke(self, name, points, radius, mat):
        trace = [(x, self.front(x, z, radius * 0.72), z) for x, z in points]
        tube(name, trace, radius, mat, self.squish)

    def expression_eye(self, kind, gaze, side, x, z, scale):
        if kind == "uneven":
            kind = "droop" if side < 0 else "alert"
        if kind in EYE_STROKES:
            self.face_stroke("Expressive eyelid", [(x + side * px * scale, z + pz * scale)
                             for px, pz in EYE_STROKES[kind]], 0.019 * scale, self.iris)
            return

        rx, rz, has_white = EYE_OVALS[kind]
        size = 1.0 if self.gag else 0.85
        rx, rz = rx * scale * size, rz * scale * size
        if not has_white:
            pupil = self.perk("Button eye", x, z, (rx, 0.037 * scale, rz), self.iris, 0.006 * scale)
            if kind != "dot":
                ball("Eye catchlight", (x - 0.26 * rx, pupil.location.y - 0.034 * scale, z + 0.34 * rz),
                     (0.19 * rx, 0.009 * scale, 0.17 * rz), self.cream, self.squish, segments=16, rings=10)
            return

        white = self.perk("Eye white", x, z, (rx, 0.072 * scale, rz), self.cream, -0.009 * scale)
        dx, dz = GAZES.get(gaze, (0, 0))
        px, pz = x + rx * dx, z + rz * dz
        py = white.location.y - 0.064 * scale
        if kind == "star":
            star_y = py - 0.014 * scale
            vertices = [(px, star_y - 0.002 * scale, pz)]
            for index in range(10):
                angle = math.pi / 2 + math.pi * index / 5
                radius = (0.76 if index % 2 == 0 else 0.35) * min(rx, rz)
                vertices.append((px + radius * math.cos(angle), star_y, pz + radius * math.sin(angle)))
            mesh("Star pupil", vertices, [(0, index + 1, 1 + (index + 1) % 10) for index in range(10)], self.iris, self.squish)
            return

        iris_x, iris_z = 0.54 * rx, 0.62 * rz
        ball("Pupil", (px, py, pz), (iris_x, 0.025 * scale, iris_z), self.iris, self.squish, segments=24, rings=16)
        ball("Eye catchlight", (px - 0.26 * iris_x, py - 0.022 * scale, pz + 0.30 * iris_z),
             (0.25 * iris_x, 0.010 * scale, 0.24 * iris_z), self.cream, self.squish, segments=16, rings=10)

    def expression_mouth(self, kind, x, z, scale):
        mood_size = (1.10 if self.gag else 0.83) * (0.91 + 0.038 * self.recipe["intensity"])
        if kind in MOUTH_LINES:
            half, bend, skew = MOUTH_LINES[kind]
            points = [(x + half * scale * mood_size * t, z + scale * (bend * t * t + skew * t))
                      for t in [i / 10 - 1 for i in range(21)]]
            self.face_stroke("Mouth line", points, (0.021 if self.gag else 0.017) * scale, self.dark)
            return

        rx, rz, lift, teeth, tongue = MOUTH_OVALS[kind]
        rx, rz, lift = (v * scale * mood_size for v in (rx, rz, lift))
        if rx > 0.12 * scale:
            self.emblem("Lip rim", x, z, rx * 1.08, rz * 1.13, self.rim, 0.014 * scale, lift, 0.003 * scale)
        self.emblem("Open mouth", x, z, rx, rz, self.dark, 0.026 * scale, lift, 0.004 * scale)
        if tongue:
            self.emblem("Tongue", x + 0.05 * rx, z - 0.48 * rz, 0.52 * rx, 0.24 * rz,
                        self.tongue, 0.041 * scale, emboss=0.003 * scale)
        if teeth:
            self.emblem("Vanilla teeth", x, z + 0.45 * rz, 0.69 * rx, 0.28 * rz, self.cream,
                        0.043 * scale, 0.35 * lift, 0.003 * scale)

    def make_expression(self, preset, center_x, center_z, scale):
        for side in (-1, 1):
            x = center_x + side * 0.255 * scale
            z = center_z + 0.258 * scale
            self.expression_eye(preset["eyes"], preset.get("gaze"), side, x, z, scale)
            brow = BROWS.get(preset["brows"])
            if brow:
                height, tilt, arc = brow
                points = [(x + side * 0.102 * scale * t, z + scale * (height + tilt * t + arc * (1 - t * t)))
                          for t in [i / 6 - 1 for i in range(13)]]
                self.face_stroke("Eyebrow", points, 0.015 * scale, self.dark)
            self.perk("Blush", center_x + side * 0.52 * scale, center_z + 0.014 * scale,
                      (0.088 * scale, 0.022 * scale, 0.048 * scale), self.rose, 0.003 * scale, -0.13 * side)
        self.expression_mouth(preset["mouth"], center_x, center_z - 0.145 * scale, scale)
        if preset.get("accent") == "sweat":
            cool = material("Cool sweat", "#91d9e9", 0.31)
            self.perk("Sweat drop", center_x + 0.52 * scale, center_z + 0.246 * scale,
                      (0.041 * scale, 0.027 * scale, 0.074 * scale), cool, 0.010 * scale, 0.32)

    def make_face(self):
        center_x, center_z = 0, self.center
        s, w, h = 1, self.width, self.height
        if self.outline:
            s = w = h = self.outline.face_scale
            center_x, center_z = self.outline.face_x, self.outline.face_z
        if self.recipe.get("expression"):
            safe_scale = min(s, self.outline.sample(center_x, center_z) / 0.72) if self.outline else min(w, h)
            self.emblem("Belly patch", center_x, center_z - 0.47 * safe_scale, 0.45 * safe_scale,
                        0.20 * safe_scale, self.belly, 0.010 * safe_scale, emboss=0.005 * safe_scale)
            self.make_expression(self.recipe["expression"], center_x, center_z, safe_scale)
            return
        eye_height = (0.34 if self.gag else 0.30) if self.outline else (0.38 if self.gag else 0.32)
        eye_z = center_z + h * eye_height
        crossed = self.recipe["eyes"] == "crossed"
        dozy = self.recipe["eyes"] == "dozy"
        for side in (-1, 1):
            x = center_x + side * w * (0.28 if self.gag else 0.32) + self.lean * 0.23 * s
            z = eye_z + (side * 0.045 * s if crossed else 0)
            if self.gag:
                radius = (0.219 if side == -1 or not crossed else 0.187) * s
                eye = self.perk("Eye white", x, z, (radius, 0.132 * s, radius * 1.03), self.cream, -0.024 * s)
                pos_x = x - side * 0.053 * s if crossed else x + 0.018 * s
                pupil_z = z - (0.020 if side < 0 else 0.026) * s
                pupil = ball("Pupil", (pos_x, eye.location.y - 0.12 * s, pupil_z),
                             (0.094 * s, 0.050 * s, 0.106 * s), self.iris, self.squish)
                ball("Eye catchlight", (pos_x - 0.023 * s, pupil.location.y - 0.046 * s, pupil_z + 0.037 * s),
                     (0.025 * s, 0.014 * s, 0.028 * s), self.cream, self.squish, segments=16, rings=12)
            elif dozy:
                arc = []
                for step in range(17):
                    offset = (step / 16 - 0.5) * 0.165
                    px = x + offset * s
                    pz = z - 0.033 * s * math.cos(offset / 0.165 * math.pi)
                    arc.append((px, self.front(px, pz, 0.025 * s), pz))
                tube("Sleepy eye", arc, 0.024 * s, self.iris, self.squish)
            else:
                eye = self.perk("Button eye", x, z, (0.078 * s, 0.041 * s, 0.109 * s), self.iris, 0.007 * s)
                ball("Eye shine", (x - 0.018 * s, eye.location.y - 0.034 * s, z + 0.034 * s),
                     (0.021 * s, 0.014 * s, 0.024 * s), self.cream, self.squish, segments=16, rings=12)

            self.perk("Blush", center_x + side * w * (0.63 if self.gag else 0.51), center_z + h * 0.04,
                      (0.103 * s, 0.023 * s, 0.064 * s), self.rose, 0.008 * s, side * -0.16)

        belly_z = center_z - h * (0.45 if self.outline else 0.52)
        self.emblem("Belly patch", center_x, belly_z, w * 0.49, h * 0.235, self.belly, 0.010)
        if self.gag:
            mouth_z = center_z - h * 0.12
            rx = w * 0.48 * self.recipe["mouth"]
            rz = h * 0.20 * self.recipe["mouth"]
            self.emblem("Lip rim", center_x, mouth_z, rx * 1.06, rz * 1.15, self.rim, 0.018, 0.078 * s)
            self.emblem("Big grin", center_x, mouth_z, rx, rz, self.dark, 0.034, 0.074 * s)
            self.emblem("Tongue", center_x + rx * 0.12, mouth_z - rz * 0.56, rx * 0.56, rz * 0.35, self.tongue, 0.055)
            for x in (-rx * 0.17, rx * 0.17):
                self.perk("Milk tooth", center_x + x, mouth_z + rz * 0.7, (rx * 0.12, 0.038 * s, rz * 0.27),
                          self.cream, 0.055, x * 0.16)
        else:
            smile = []
            for step in range(23):
                a = math.pi * (1 + step / 22)
                x = center_x + math.cos(a) * 0.103 * s * self.recipe["mouth"]
                z = center_z + h * 0.055 + 0.051 * s * math.sin(a)
                smile.append((x, self.front(x, z, 0.014), z))
            tube("Small smile", smile, 0.022, self.dark, self.squish)

    def make_ears(self):
        style = self.recipe["ears"]
        if self.outline or style == "none":
            return
        top = self.center + self.height
        if style == "antenna":
            points = [(0.02 + t * t * 0.16, 0.09, top - 0.07 + t * 0.44) for t in [i / 12 for i in range(13)]]
            tube("Antenna stem", points, 0.056, self.skin, self.squish)
            ball("Antenna tip", points[-1], (0.132, 0.116, 0.128), self.rose, self.squish)
            return
        for side in (-1, 1):
            x = side * self.width * (0.39 if style == "nubs" else 0.28) + self.lean
            if style == "bunny":
                z = top + (0.205 if side < 0 else 0.11)
                turn = side * (0.22 if side < 0 else 0.45)
                ear = ball("Floppy ear", (x, 0.065, z), (0.167, 0.139, 0.378), self.skin, self.squish, turn)
                ball("Ear lining", (ear.location.x + side * 0.021, -0.050, z + 0.051),
                     (0.099, 0.048, 0.246), self.belly, self.squish, turn)
            else:
                z = top - (0.071 if side < 0 else 0.12)
                ball("Squishy crown", (x, 0.045, z), (0.245, 0.232, 0.239 if side < 0 else 0.188),
                     self.skin, self.squish, side * 0.24)

    def make_badge(self):
        strokes = self.recipe.get("mark") or [[[-0.031, 0.106], [-0.100, -0.013], [0.005, -0.013], [-0.028, -0.109], [0.097, 0.030], [0.004, 0.029], [0.033, 0.106]]]
        width, height = self.width, self.height
        center_x, center_z = 0, self.center - self.height * 0.54
        if self.outline:
            width = height = self.outline.face_scale
            center_x, center_z = self.outline.face_x, self.outline.face_z - height * 0.48
        for stroke in strokes:
            coords = [(center_x + x * width, center_z + y * height) for x, y in stroke]
            points = [(x, self.front(x, z, 0.032), z) for x, z in coords]
            if len(points) > 1:
                tube("Sketch emboss", points, 0.012, self.rim, self.squish)
            elif points:
                ball("Sketch dot", points[0], (0.014, 0.014, 0.014), self.rim, self.squish, segments=12, rings=8)

    def make_limbs(self):
        shoulder_z = self.center + self.height * 0.09
        t = (shoulder_z - self.center) / self.height
        shift, width, _ = self.profile(t)
        self.arm_length = (0.51 if self.gag else 0.43) if self.outline else (0.63 if self.gag else 0.48)
        self.arms = {}
        self.feet = {}
        inset = 0.037 if self.form == "cookie" else 0.076
        for side in (-1, 1):
            arm_point = (shift + side * (width * math.sqrt(1 - t * t) - inset), 0, shoulder_z)
            if self.outline:
                arm_point = self.outline.shoulders[side]
            arm = ball("L mitt" if side > 0 else "R mitt", arm_point,
                       (0.129, 0.127, self.arm_length / 2), self.skin, self.squish, segments=28, rings=18)
            for vertex in arm.data.vertices:
                vertex.co.z += self.arm_length / 2
            self.arms[side] = arm
            self.actors[arm.name] = arm

            foot_point = self.outline.feet[side] if self.outline else (side * self.width * 0.38, 0.025, 0.295)
            foot = empty("L ankle" if side > 0 else "R ankle", self.squish, foot_point)
            toes = min(0.218, 0.11 + abs(foot_point[0]) * 0.42) if self.outline else 0.235
            heel = 0.253 if self.outline else 0.286
            ball("Soft foot", (side * 0.042, -0.073, -0.139), (toes, heel, 0.157), self.skin, foot)
            self.feet[side] = foot
            self.actors[foot.name] = foot
        self.actors[self.root.name] = self.root
        self.actors[self.squish.name] = self.squish
        self.actors = list(self.actors.values())

    def point_arm(self, side, rise, reach):
        arm = self.arms[side]
        start = Vector((side * math.cos(rise) * math.cos(reach), -math.sin(reach), math.sin(rise) * math.cos(reach)))
        axis = Vector((0, 0, 1))

        def clears(rotation):
            return not any(self.inside_body(arm.location + rotation @ v.co)
                           for v in arm.data.vertices if v.co.z >= self.arm_length * 0.35)

        rotation = axis.rotation_difference(start)
        if not clears(rotation):
            # Find the nearest safe tilt toward the outside of the shoulder.
            outward = Vector((side, 0, 0))
            rotation = axis.rotation_difference(outward)
            if not clears(rotation):
                raise ValueError("Unable to clear the body with the mitten sweep")
            blocked, clear = 0.0, 1.0
            for _ in range(8):
                fraction = (blocked + clear) / 2
                direction = start.lerp(outward, fraction).normalized()
                candidate = axis.rotation_difference(direction)
                if clears(candidate):
                    clear = fraction
                    rotation = candidate
                else:
                    blocked = fraction
        arm.rotation_mode = "QUATERNION"
        arm.rotation_quaternion = rotation
        self.clearance += 1

    def pose(self, action, progress, direction="auto", authored=False):
        t = TAU * progress
        envelope = math.sin(t / 2) ** 2
        power = self.strength
        squash, lift, yaw, tilt = (0, 0, 0, 0)
        nod = 0
        rise = {-1: -0.48, 1: -0.48}
        reach = {-1: 0.14, 1: 0.14}
        # Blender's front is -Y, so +X is the character's own left.
        side_hint = {"left": 1, "right": -1}.get(direction, 0)
        leading = (side_hint or 1,)
        if direction == "both":
            leading = (-1, 1)
        kick = 0
        if action == "shake":
            for side in ((side_hint,) if side_hint else rise):
                rise[side] += power * envelope * (1.67 + 0.25 * math.sin(t * 3 + side))
            tilt = 0.15 * power * envelope * math.sin(t * 3)
            yaw = 0.20 * power * envelope * math.sin(t * 2)
            squash = 0.10 * power * envelope * math.cos(t * 3)
        elif action == "laugh":
            pulse = envelope * (0.5 + 0.5 * math.cos(t * 4))
            squash = -power * 0.24 * pulse
            lift = power * 0.095 * pulse
            yaw = 0.12 * power * envelope * math.sin(t * 3)
            for side in rise:
                reach[side] += power * 0.78 * envelope
                rise[side] += power * (-0.17 * envelope + 0.30 * pulse)
        elif action == "kick":
            lift = 0.37 * power * envelope
            kick = power * envelope * (-side_hint or math.sin(t * 2 + 0.7))
            tilt = 0.15 * kick
            squash = 0.11 * power * envelope * math.sin(t * 2)
            rise[-1] += power * envelope * 1.1
            rise[1] += power * envelope * 0.82
        elif action == "wave":
            for side in leading:
                rise[side] += envelope * (1.15 + power * (0.22 + 0.27 * math.sin(t * (1 if authored else 4))))
                reach[side] += 0.26 * envelope
            tilt = 0.085 * power * envelope * math.sin(t)
        elif action == "breathe":
            squash = 0.12 * power * envelope * (0.55 + 0.45 * math.sin(t))
            reach[-1] += 0.16 * power * envelope
            reach[1] += 0.16 * power * envelope
        elif action == "bounce":
            lift = 0.21 * power * envelope
            squash = 0.14 * power * envelope * math.sin(t * 2)
            tilt = 0.09 * power * envelope * math.sin(t)
            rise[-1] += 0.54 * power * envelope
            rise[1] += 0.54 * power * envelope
        elif action == "spin":
            yaw = (side_hint or 1) * TAU * (progress * progress * (3 - 2 * progress))
        elif action == "turn":
            yaw = (side_hint or 1) * 0.79 * power * envelope
        elif action == "nod":
            nod = 0.22 * power * envelope
        elif action == "pause":
            squash = 0.004 * power * envelope

        self.root.location.z = lift + abs(tilt) * 0.69 + abs(nod) * 0.37
        self.root.rotation_euler = (nod, tilt, yaw)
        self.squish.scale = (1 - squash * 0.58, 1 - squash * 0.65, 1 + squash)
        for side in rise:
            self.point_arm(side, rise[side], reach[side])
            self.feet[side].rotation_euler.x = min(0, side * kick) * 0.83

    def animate(self):
        scene = bpy.context.scene
        scene.render.fps = 24
        scene.frame_start = 1
        plan = self.recipe.get("clips")
        if not plan:
            clips = ("shake", "laugh", "kick") if self.gag else ("wave", "breathe", "bounce")
            plan = [{"id": move, "steps": [{"move": move, "repeats": 1, "pace": 1, "side": "auto"}]} for move in clips]
        base = {"shake": 2.5, "laugh": 2.5, "kick": 2.1, "wave": 2.5, "breathe": 3.2, "bounce": 2.3,
                "spin": 1.65, "turn": 1.4, "nod": 1.1, "pause": 0.65}
        schedule = []
        for clip in plan:
            steps = clip["steps"]
            authored = clip.get("authored", False)
            tempo = 0.64 if authored or len(steps) > 1 else 1
            times = [step.get("seconds") or base[step["move"]] * self.duration * step["pace"] * step["repeats"] * tempo
                     for step in steps]
            scale = min(1, 13.5 / sum(times))
            lengths = [max(12, round(seconds * scale * scene.render.fps)) for seconds in times]
            schedule.append((clip["id"], steps, lengths, authored))
        scene.frame_end = max(sum(lengths) for _, _, lengths, _ in schedule) + 1
        for name, steps, lengths, authored in schedule:
            frame = 1
            for index, (step, length) in enumerate(zip(steps, lengths)):
                for elapsed in range(length + int(index == len(steps) - 1)):
                    progress = elapsed * step["repeats"] / length % 1 if elapsed < length else 1
                    self.pose(step["move"], progress, step["side"], authored)
                    for obj in self.actors:
                        rotation = "rotation_quaternion" if obj.rotation_mode == "QUATERNION" else "rotation_euler"
                        for property_name in ("location", rotation, "scale"):
                            obj.keyframe_insert(data_path=property_name, frame=frame, group=obj.name)
                    frame += 1
            for obj in self.actors:
                animation = obj.animation_data
                action = animation.action
                action.name = f"{name} {obj.name}"
                animation.action = None
                track = animation.nla_tracks.new()
                track.name = name
                track.strips.new(name, 1, action)
                track.mute = True
        self.pose(None, 0)
        scene.frame_set(1)
        print(f"Verified {self.clearance} posed mitten sweeps across 3 clips", flush=True)


def make_poster(path):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_x = 540
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.46, 0.56, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.70

    def aim(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

    for name, pos, strength, diameter, color in [
        ("Softbox", (-3.8, -5.0, 6.8), 590, 4.8, (1.0, 0.91, 0.78)),
        ("Fill", (4.4, -3.5, 3.3), 190, 3.6, (0.78, 0.82, 1.0)),
        ("Rim", (2.5, 3.6, 5.8), 500, 2.8, (1.0, 0.83, 0.64)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=pos)
        light = bpy.context.object
        light.name = name
        light.data.energy = strength
        light.data.shape = "DISK"
        light.data.size = diameter
        light.data.color = color
        aim(light, (0, 0, 1.1))

    bpy.ops.object.camera_add(location=(3.1, -12.0, 3.4))
    scene.camera = bpy.context.object
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = 3.55
    aim(scene.camera, (0, 0, 1.24))
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    recipe_path, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    mascot = Mascot(recipe)
    mascot.animate()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output / "mascot.glb"), export_format="GLB", export_animation_mode="NLA_TRACKS",
        export_animations=True, export_frame_range=True, export_force_sampling=True,
    )
    make_poster(output / "poster.png")


if __name__ == "__main__":
    main()
