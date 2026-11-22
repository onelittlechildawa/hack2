"""Render the four moods and five intensities using the production mascot builder."""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from build_mascot import Mascot

ROOT = Path(__file__).resolve().parents[1]
EXPRESSIONS = json.loads((ROOT / "shared/expressions.json").read_text(encoding="utf-8"))
MOOD_COLORS = {"offline": "grape", "overheat": "peach", "blank": "blue", "giddy": "lemon"}


def render_sheet(kind, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    cell = 2.08

    for row, (mood, palette) in enumerate(MOOD_COLORS.items()):
        for column, expression in enumerate(EXPRESSIONS[mood]):
            mascot = Mascot({"kind": kind, "mood": mood, "palette": palette, "intensity": column + 1,
                             "expression": expression, "form": "blob", "ears": "none", "width": 1.0,
                             "height": 0.91, "lean": 0.0})
            for part in (*mascot.arms.values(), *mascot.feet.values()):
                part.hide_render = True
                for child in part.children_recursive:
                    child.hide_render = True
            for part in mascot.squish.children:
                if part.name.split(".")[0] in {"Belly patch", "Sketch emboss", "Sketch dot"}:
                    part.hide_render = True
            mascot.root.location = ((column - 2) * cell, 0, (1.5 - row) * cell - mascot.center)

    for name, direction, strength, color in [
        ("Soft key", (.36, .72, -.60), 2.5, (1.0, .92, .83)),
        ("Fill", (-.36, .60, -.44), .64, (.78, .87, 1.0)),
        ("Rim", (-.22, -.38, -.88), 1.1, (1.0, .87, .73)),
    ]:
        bpy.ops.object.light_add(type="SUN")
        lamp = bpy.context.object
        lamp.name = name
        lamp.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
        lamp.data.energy = strength
        lamp.data.angle = math.radians(18)
        lamp.data.color = color

    world = bpy.data.worlds.new("Preview fill")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (.51, .56, .67, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = .51
    scene.world = world
    bpy.ops.object.camera_add(location=(0, -24, 0), rotation=(math.pi / 2, 0, 0))
    scene.camera = bpy.context.object
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = cell * 5
    scene.camera.data.clip_end = 60
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 880
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 91
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(output / f"{kind}.webp")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    output = ROOT / "public" / "faces"
    output.mkdir(parents=True, exist_ok=True)
    for kind in ("gag", "soft"):
        render_sheet(kind, output)
