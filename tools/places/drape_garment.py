"""Drapes a garment pattern on the average MakeHuman body and saves it as
MakeHuman clothes (.mhclo + .obj), so build_body.py fits, rigs and shapes it
like the CC0 clothes.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/places/drape_garment.py -- assets/places/garments/a_line_skirt

The folder holds pattern.json (written by Claude from a description; see
character_body_proposal.md §6) and, optionally, fabric.png. Writes <id>.mhclo,
<id>.obj and preview.png into the same folder.

Pattern kinds so far:
- skirt: a tube from the waist down `length` metres, `ease` looser than the
  body, widening to `flare` × the hips at the hem. Pinned at the waistband,
  then cloth-simulated onto the body.
"""

import json
import math
import os
import sys
import uuid

import bpy
from mathutils import Vector

from bl_ext.blender_org.mpfb.services import ClothesService, HumanService

FRAMES = 50
SEGMENTS = 64
ROW = 0.02


def landmarks(basemesh):
    """Waist and hip heights, and the body's centre line, from a temporary rig."""
    rig = HumanService.add_builtin_rig(basemesh, "game_engine")
    head = lambda b: rig.matrix_world @ rig.data.bones[b].head_local
    marks = {"waist": head("spine_01").z + 0.03, "hip": head("thigh_l").z - 0.06, "crotch": head("thigh_l").z - 0.12, "centre": head("pelvis")}
    return rig, marks


def envelope(points, centre, z, band=0.015):
    """Distance from the centre line to the body surface at height z, per angle."""
    r = [0.0] * SEGMENTS
    for p in points:
        if abs(p.z - z) > band:
            continue
        a = math.atan2(p.y - centre.y, p.x - centre.x) % (2 * math.pi)
        i = int(a / (2 * math.pi) * SEGMENTS) % SEGMENTS
        r[i] = max(r[i], math.hypot(p.x - centre.x, p.y - centre.y))
    for _ in range(SEGMENTS):  # fill gaps from neighbours
        r = [x or max(r[i - 1], r[(i + 1) % SEGMENTS]) for i, x in enumerate(r)]
    return r


def body_points(basemesh, rig):
    """Torso and leg surface points (arms hang beside the hips in the A-pose)."""
    keep = {basemesh.vertex_groups[g].index for g in ("pelvis", "spine_01", "spine_02", "thigh_l", "thigh_r") if g in basemesh.vertex_groups}
    body = basemesh.vertex_groups["body"].index
    out = []
    for v in basemesh.data.vertices:
        groups = {g.group: g.weight for g in v.groups}
        if body in groups and any(groups.get(k, 0) > 0.3 for k in keep):
            out.append(basemesh.matrix_world @ v.co)
    return out


def skirt(pattern, basemesh, marks, points):
    rows = max(2, round(pattern["length"] / ROW))
    top, centre = marks["waist"], marks["centre"]
    hip = max(envelope(points, centre, marks["hip"]))
    radius = envelope(points, centre, top)
    verts, faces = [], []
    for j in range(rows + 1):
        z = top - pattern["length"] * j / rows
        if z > marks["crotch"]:
            radius = [max(a, b) for a, b in zip(radius, envelope(points, centre, z))]
        t = max(0.0, (marks["hip"] - z) / max(0.01, marks["hip"] - (top - pattern["length"])))
        for i in range(SEGMENTS):
            a = 2 * math.pi * i / SEGMENTS
            r = radius[i] * pattern["ease"] + 0.006
            if z < marks["hip"]:
                r = max(r, hip * pattern["ease"] * (1 + (pattern["flare"] - 1) * t))
            verts.append((centre.x + r * math.cos(a), centre.y + r * math.sin(a), z))
    for j in range(rows):
        for i in range(SEGMENTS):
            a, b = j * SEGMENTS + i, j * SEGMENTS + (i + 1) % SEGMENTS
            faces.append((a, b, b + SEGMENTS, a + SEGMENTS))
    mesh = bpy.data.meshes.new(pattern["id"])
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v = mesh.loops[li].vertex_index
            i, j = v % SEGMENTS, v // SEGMENTS
            # Close the seam: the last column wraps to u = 1, not 0.
            if i == 0 and any(mesh.loops[k].vertex_index % SEGMENTS == SEGMENTS - 1 for k in poly.loop_indices):
                i = SEGMENTS
            # The print repeats about every 30 cm.
            uv.data[li].uv = (i / SEGMENTS * 3, (rows - j) * ROW * 3)
    obj = bpy.data.objects.new(pattern["id"], mesh)
    bpy.context.scene.collection.objects.link(obj)
    pin = obj.vertex_groups.new(name="pin")
    pin.add(list(range(SEGMENTS * 2)), 1.0, "REPLACE")
    return obj


def drape(obj, basemesh):
    coll = basemesh.modifiers.new("Collision", "COLLISION")
    basemesh.collision.thickness_outer = 0.006
    cloth = obj.modifiers.new("Cloth", "CLOTH")
    s = cloth.settings
    s.quality = 10
    s.mass = 0.25
    s.tension_stiffness = s.compression_stiffness = 20
    s.bending_stiffness = 0.6
    s.vertex_group_mass = "pin"
    cloth.collision_settings.use_self_collision = False
    cloth.collision_settings.distance_min = 0.005
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, FRAMES
    cloth.point_cache.frame_end = FRAMES
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)
    basemesh.modifiers.remove(coll)
    scene.frame_set(1)


def preview(folder, obj, basemesh):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = 600, 800
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "OBJECT"
    obj.color = (0.85, 0.35, 0.45, 1)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = (1.2, -3.2, 1.0)
    cam.rotation_euler = (math.radians(88), 0, math.radians(20))
    scene.camera = cam
    scene.render.filepath = os.path.join(folder, "preview.png")
    bpy.ops.render.render(write_still=True)


def main():
    folder = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
    with open(os.path.join(folder, "pattern.json")) as f:
        pattern = json.load(f)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    basemesh = HumanService.create_human()
    rig, marks = landmarks(basemesh)
    points = body_points(basemesh, rig)
    bpy.data.objects.remove(rig)
    for m in [m for m in basemesh.modifiers if m.type == "ARMATURE"]:
        basemesh.modifiers.remove(m)
    obj = {"skirt": skirt}[pattern["kind"]](pattern, basemesh, marks, points)
    drape(obj, basemesh)
    preview(folder, obj, basemesh)
    # MakeClothes matches each vertex against the base mesh faces of its group.
    obj.vertex_groups.clear()
    obj.vertex_groups.new(name="body").add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mhclo = ClothesService.create_mhclo_from_clothes_matching(basemesh, obj, properties_dict={"name": pattern["id"], "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, "my-diary/" + pattern["id"])), "z_depth": 50})
    mhclo.write_mhclo(os.path.join(folder, pattern["id"] + ".mhclo"), also_export_obj=True)
    print("DRAPED", pattern["id"], len(obj.data.vertices), "verts")


main()
