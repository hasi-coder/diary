"""Builds the Places character body from MakeHuman (CC0) assets with MPFB 2.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/places/build_body.py

Needs Blender 4.2+ with the MPFB 2 extension and the MakeHuman system assets
(CC0) installed. Writes:

- public/places/body.glb: a full-detail body (PLACES_PROXY picks the mesh; PLACES_OUT the folder), garments fitted to it and the game
  engine rig. Every mesh carries the same morph targets, one per slider end
  (see SAMPLES), so the app shapes body and clothes together.
- public/places/body.json: the joint offsets for each morph target (the app
  moves the bones to match the shape), each garment's layer and the body
  vertices it hides, and the head (hidden behind the face image).

Garment textures are made grey so the app can tint them any colour.

Morph targets are sampled, not copied from MakeHuman's targets: for each slider
end the script sets the macro, refits the proxy, garments and rig, and stores
the difference from the average body. MakeHuman blends its macro targets
piecewise-linearly, so one slider moved alone is exact; mixed sliders are close.
"""

import json
import os
import shutil

import bmesh
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
from bl_ext.blender_org.mpfb.services import AssetService, HumanService, LocationService, TargetService

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.environ.get("PLACES_OUT") or os.path.join(ROOT, "public", "places")

# female_generic is the full 13.8k-vertex MakeHuman mesh (smooth, anatomical). female1605 is the old
# low-poly body (3.8 MB instead of 6.4 MB, about a third of the fitting time): PLACES_PROXY=female1605.
PROXY = os.environ.get("PLACES_PROXY") or "female_generic"
RIG = "game_engine"
# MakeHuman clothes → the app's garments. The casual suits are a top and jeans in
# one mesh (two separate pieces), so they split at the hip into two garments.
GARMENTS = {
    "female_casualsuit01": {"top": ("fitted_tee", "base"), "bottom": ("slim_jeans", "base")},
    "male_casualsuit02": {"top": ("tee", "base"), "bottom": ("jeans", "base")},
    "shoes02": {"all": ("shoes", "feet")},
    # Draped from a pattern by drape_garment.py (assets/places/garments/<id>/).
    "a_line_skirt": {"all": ("a_line_skirt", "base")},
}
LOCAL = os.path.join(ROOT, "assets", "places", "garments")
TEXTURE = 512

# Slider ends: morph target name → the macro value it was sampled at. Everything
# else stays at MakeHuman's average (0.5). Ages: 0 = 1 year, 0.1875 = 11, 0.5 = 25, 1 = 90.
SAMPLES = {
    "feminine": ("gender", 0.0),
    "masculine": ("gender", 1.0),
    "baby": ("age", 0.0),
    "child": ("age", 0.1875),
    "old": ("age", 1.0),
    "thin": ("weight", 0.0),
    "heavy": ("weight", 1.0),
    "soft": ("muscle", 0.0),
    "muscular": ("muscle", 1.0),
    "short": ("height", 0.0),
    "tall": ("height", 1.0),
    "uncommon": ("proportions", 0.0),
    "ideal": ("proportions", 1.0),
    "small_bust": ("cupsize", 0.0),
    "large_bust": ("cupsize", 1.0),
}

# A body vertex is hidden under a garment when the garment's surface is within
# this distance (metres).
COVER = 0.03


def y_up(v):
    """Blender (Z up) to glTF (Y up)."""
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def set_macro(basemesh, name, value):
    HumanObjectProperties.set_value(name, value, entity_reference=basemesh)
    TargetService.reapply_macro_details(basemesh)
    HumanService.refit(basemesh)
    bpy.context.view_layer.update()


def rest_coords(obj):
    """Vertex positions with the rig switched off, after every other modifier."""
    arm = [m for m in obj.modifiers if m.type == "ARMATURE"]
    for m in arm:
        m.show_viewport = False
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    coords = [obj.matrix_world @ v.co for v in mesh.vertices]
    obj.evaluated_get(depsgraph).to_mesh_clear()
    for m in arm:
        m.show_viewport = True
    return coords


def joints(rig):
    return {b.name: rig.matrix_world @ b.head_local for b in rig.data.bones}


def flat_material(name, image=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    if image:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def mhclo_path(source):
    local = os.path.join(LOCAL, source)
    if os.path.exists(os.path.join(local, source + ".mhclo")):
        # MPFB refits clothes by finding them in its own library.
        shutil.copytree(local, LocationService.get_user_data(os.path.join("clothes", source)), dirs_exist_ok=True)
        AssetService.update_all_asset_lists()
    return AssetService.find_asset_absolute_path(source + "/" + source + ".mhclo", asset_subdir="clothes")


def grey_texture(source):
    """The garment's diffuse texture (or a draped garment's fabric.png) as greyscale,
    brightest cloth near white, so a tint shows true."""
    folder = os.path.dirname(mhclo_path(source))
    path = next((p for p in (os.path.join(folder, source + "_diffuse.png"), os.path.join(folder, "fabric.png")) if os.path.exists(p)), None)
    if not path:
        return None
    img = bpy.data.images.load(path)
    img.scale(TEXTURE, TEXTURE)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    lum = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
    lum = np.clip(lum / np.percentile(lum, 97), 0, 1) ** 0.6
    out = bpy.data.images.new(source + "_grey", TEXTURE, TEXTURE)
    out.pixels.foreach_set(np.stack([lum, lum, lum, np.ones_like(lum)], axis=1).ravel())
    out.pack()
    bpy.data.images.remove(img)
    return out


def baked_copy(obj, name, rig, samples, image=None):
    """A clean mesh with the rig's weights and one shape key per sample."""
    for m in obj.modifiers:
        if m.type == "ARMATURE":
            m.show_viewport = False
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    mesh.name = name
    copy = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(copy)
    copy.matrix_world = obj.matrix_world
    # The mesh keeps its vertex groups (names live on the mesh); only bone weights go to glTF.
    bones = {b.name for b in rig.data.bones}
    for g in list(copy.vertex_groups):
        if g.name not in bones:
            copy.vertex_groups.remove(g)
    mesh.materials.clear()
    mesh.materials.append(flat_material(name, image))
    copy.shape_key_add(name="Basis")
    for key, coords in samples.items():
        sk = copy.shape_key_add(name=key)
        inv = copy.matrix_world.inverted()
        for i, co in enumerate(coords):
            sk.data[i].co = inv @ co
    if name == "body":
        # glTF splits vertices at UV seams; the app maps them back with this.
        vid = mesh.attributes.new("_vid", "FLOAT", "POINT")
        vid.data.foreach_set("value", [float(i) for i in range(len(mesh.vertices))])
    copy.parent = rig
    mod = copy.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    return copy


def covered(body_coords, part):
    """Body vertices with the garment surface close by, inside or out: the low-poly
    body cuts corners, so a garment fitted to MakeHuman's full mesh can sit just inside it."""
    coords = [part.matrix_world @ v.co for v in part.data.vertices]
    tree = BVHTree.FromPolygons(coords, [tuple(p.vertices) for p in part.data.polygons])
    return {i for i, co in enumerate(body_coords) if tree.find_nearest(co, COVER)[0] is not None}


def split(obj, hip):
    """{"top": obj, "bottom": obj}: the mesh's separate pieces, by whether they sit above the hip."""
    parts = {}
    for side in ("top", "bottom"):
        part = obj.copy()
        part.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(part)
        bm = bmesh.new()
        bm.from_mesh(part.data)
        seen, drop = set(), []
        for v in bm.verts:
            if v in seen:
                continue
            piece, stack = [], [v]
            seen.add(v)
            while stack:
                x = stack.pop()
                piece.append(x)
                for e in x.link_edges:
                    y = e.other_vert(x)
                    if y not in seen:
                        seen.add(y)
                        stack.append(y)
            mean = sum((obj.matrix_world @ x.co).z for x in piece) / len(piece)
            if (mean > hip) != (side == "top"):
                drop.extend(piece)
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
        bm.to_mesh(part.data)
        bm.free()
        parts[side] = part
    bpy.data.objects.remove(obj)
    return parts


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    basemesh = HumanService.create_human()
    rig = HumanService.add_builtin_rig(basemesh, RIG)
    body = HumanService.add_mhclo_asset(AssetService.find_asset_absolute_path(PROXY + "/" + PROXY + ".proxy", asset_subdir="proxymeshes"), basemesh, asset_type="Proxymeshes", subdiv_levels=0, material_type="NONE")
    sources = {}
    for g in GARMENTS:
        sources[g] = HumanService.add_mhclo_asset(mhclo_path(g), basemesh, asset_type="Clothes", subdiv_levels=0, material_type="NONE")
    meshes = {"body": body, **sources}
    for obj in meshes.values():
        for m in list(obj.modifiers):
            if m.type == "SUBSURF":
                obj.modifiers.remove(m)
    # MakeHuman hides the skin under some garments (shoes) with a mask on the body.
    # The app does the hiding, so keep the whole body and remember those vertices.
    deleted = {}
    for g in sources:
        group = body.vertex_groups.get("Delete." + g)
        deleted[g] = {v.index for v in body.data.vertices if group and any(x.group == group.index for x in v.groups)}
    for m in list(body.modifiers):
        if m.type == "MASK":
            body.modifiers.remove(m)
    head_group = body.vertex_groups["head"].index
    head = sorted(v.index for v in body.data.vertices if any(x.group == head_group and x.weight > 0.5 for x in v.groups))

    set_macro(basemesh, "gender", 0.5)
    neutral = {k: rest_coords(o) for k, o in meshes.items()}
    neutral_joints = joints(rig)
    hip = neutral_joints["pelvis"].z
    samples = {k: {} for k in meshes}
    joint_deltas = {}
    for key, (macro, value) in SAMPLES.items():
        set_macro(basemesh, macro, value)
        for k, o in meshes.items():
            samples[k][key] = rest_coords(o)
        js = joints(rig)
        joint_deltas[key] = {b: y_up(js[b] - neutral_joints[b]) for b in js if (js[b] - neutral_joints[b]).length > 1e-4}
        set_macro(basemesh, macro, 0.5)

    keep = [rig, baked_copy(body, "body", rig, samples["body"])]
    garments = {}
    for g, parts in GARMENTS.items():
        whole = baked_copy(sources[g], g, rig, samples[g], grey_texture(g))
        pieces = {"all": whole} if "all" in parts else split(whole, hip)
        for side, (gid, layer) in parts.items():
            obj = pieces[side]
            obj.name = obj.data.name = gid
            keep.append(obj)
            # MakeHuman's delete group covers the whole suit; each half keeps its side of the hip.
            mine = {i for i in deleted[g] if side == "all" or (neutral["body"][i].z > hip) == (side == "top")}
            garments[gid] = {"layer": layer, "from": g, "hides": sorted(mine | covered(neutral["body"], obj))}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o)
    rig.name = "rig"
    keep[1].name = keep[1].data.name = "body"
    copies = keep[1:]

    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for c in copies:
        c.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, "body.glb"),
        export_format="GLB",
        use_selection=True,
        export_morph=True,
        export_morph_normal=False,
        export_skins=True,
        export_animations=False,
        export_yup=True,
        export_attributes=True,
    )
    meta = {
        "source": "MakeHuman system assets (CC0) via MPFB 2",
        "proxy": PROXY,
        "rig": RIG,
        "samples": {k: {"macro": m, "value": v} for k, (m, v) in SAMPLES.items()},
        "joints": {"neutral": {b: y_up(p) for b, p in neutral_joints.items()}, "deltas": joint_deltas},
        "regions": {"head": head},
        "garments": garments,
    }
    with open(os.path.join(OUT, "body.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))
    print("BUILT", {c.name: len(c.data.vertices) for c in copies}, {g: (m["layer"], len(m["hides"])) for g, m in garments.items()}, "head", len(head))


main()
