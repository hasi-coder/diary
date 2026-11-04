# Proposal: Places characters — real bodies, layered clothing, skin tones

Status: phase 0 spike done · 2026-11-04

## Built so far (phase 0)

| Piece | State | Notes |
|---|---|---|
| Tooling | Blender 5.2.3, MPFB 2 (extensions.blender.org), MakeHuman system assets (CC0) installed | Headless: `Blender -b --python …` |
| `tools/places/build_body.py` | `female1605` low-poly body (1,605 verts) + `game_engine` rig (53 bones) → `public/places/body.glb` (3.7 MB) + `body.json` | 15 morph targets sampled from MakeHuman macros (feminine/masculine, baby/child/old, thin/heavy, soft/muscular, short/tall, proportions, bust) on body **and** every garment; joint offsets per target; per-garment hidden body vertices; head region |
| Garments | `fitted_tee`, `slim_jeans`, `tee`, `jeans` (MakeHuman casual suits split at the hip), `shoes`, `a_line_skirt` | Textures made grey so any tint works |
| `tools/places/drape_garment.py` | Pattern JSON → Blender cloth sim on the average body → MakeHuman `.mhclo` | `assets/places/garments/a_line_skirt/` (pattern, mhclo, obj, preview). The fabric is a **placeholder drawn with PIL**: the OpenAI account had no credits |
| `src/components/world/body.ts` | `loadBody`, `Body.setShape` (morphs + joints + rebind), `wear` (tint, hide covered skin), `showHead(false)` for the face image, `setSkin` | Not yet wired into `Figure`/WorldScene |

Checked in headless Chrome: six people (8 to 72 years old, different shapes and skin tones) in mixed outfits, face images on the head bone, no skin poking through, skirts with legs showing below.

Found on the way:
- MakeHuman ages run short (8 years → 1.05 m, 15 → 1.48 m); default heights per age need calibrating in `morphWeights`.
- The MakeHuman pack has **no underwear**, so that layer has to come from the drape pipeline (it's the next garment to make).
- A loose skirt only hides the thighs near it; walking legs may poke through a flared skirt. That needs skirt bones or a wider hide region.
- Interaction poses are not yet mapped to the rig's bones (phase 1).

## 1. Summary

Today a person in the Places world is a stack of rounded boxes (`Figure` in `src/components/world/scene.ts`): two boxes per leg, a chest box, two sleeve boxes, a sphere for each hand and a sprite head that shows the drawn or photo face. Clothing is two colours (`top`, `bottom`) and a `skirt` flag. Body shape is three builds and three figures.

Replace the boxes with a **skinned, morphable human mesh** built from open-source assets, and replace `top`/`bottom` with a **wardrobe of layered garments**:

- **Body:** one base mesh with sliders for feminine ↔ masculine, age (child to elder), height, weight, muscle and a few proportions (shoulders, bust, waist, hips). It covers children, teens, adults and elders, men and women, and everyone in between.
- **Skin:** a palette of 10 tones from the Monk Skin Tone Scale plus a free colour picker.
- **Clothing:** garments sit on layers (underwear, base, mid, outer, accessories). A person wears any set that doesn't clash. Two-piece and many-piece outfits (suit, saree, school uniform) are saved **outfits**, each a named list of garments.
- **Kept:** the four face views (`Profile.faces`) and the drawn-face fallback stay on the head, and hair stays painted in those images. The camera, cut-away walls, interactions and posts work as they do now.
- **Made with AI:** pieces MakeHuman doesn't have (saree drape, dresses, lungi, sarong, kurta, abaya …) are generated: AI writes the sewing pattern and the fabric print, Blender drapes the pattern on the MakeHuman body (§6).

## 2. Open-source options

| Source | What it gives | License | Fit |
|---|---|---|---|
| **MakeHuman / MPFB 2** (Blender add-on) | Base mesh with morph targets for gender, age, weight, muscle, height and proportions, plus low-poly proxy meshes, CC0 clothes (MHCLO) fitted to the base, and rigs. MPFB 2.08 exports glTF. | Bundled assets (base mesh, proxies, targets, MHCLO clothes, textures) are CC0. Exports carry no MakeHuman claims. Community assets each carry their own license, often CC-BY. | **Best fit.** Its clothing already has a draw order (`z_depth`) and hides the body under clothes (`delete_verts`). That is the layer model we want. |
| **Anny** (NAVER LABS Europe, 2025) | A parametric human for all ages built on the MakeHuman assets, with Python code to generate meshes | Apache 2.0, assets CC0. The optional SMPL-X topology is non-commercial, so don't use it. | Good for **generating** bodies offline, especially children and elders. It ships no clothing. |
| **Quaternius** Universal Base Characters + Modular Outfits | Stylised low-poly male/female bases (regular, teen, superhero) with a humanoid rig, and modular outfit parts | itch.io lists them as CC0, but a secondary source says newer packs move to a "Quaternius Asset Licence". **Check each pack before use.** | Good stylised look, but has few body sliders and only fantasy outfits. A fallback if MakeHuman looks too realistic. |
| VRoid Studio / VRM (`three-vrm`) | Anime-style avatars with a clothing editor | The app is free, and each model's terms are set by its creator | Wrong art style, and every avatar has to be built by hand. Skip. |
| SMPL / SMPL-X | Research body models | Non-commercial | Not usable. |
| Monk Skin Tone Scale (Google, Ellis Monk) | 10 skin tones | CC BY 4.0 (needs credit in About) | Use it for the palette. |

**Recommendation:** build the body and clothes with **MakeHuman assets through MPFB 2**, using its low-poly proxy so it suits the iso camera. Use Anny's generator only if we want sliders that MPFB can't bake. Everything we ship is CC0 (MakeHuman) or CC BY 4.0 (the skin palette, credited).

## 3. How it works at runtime (three.js)

One rig, many meshes:

1. **Body:** `body.glb` holds the low-poly base, the skeleton and the morph targets (shape keys) for every slider. Sliders set `morphTargetInfluences`.
2. **Garments:** each garment is a `SkinnedMesh` in its own `.glb`. It is skinned to the **same bone names** and carries **the same morph targets**, transferred from the body in Blender. The same slider values drive body and clothes, so a shirt fits a broad elder and a slim teen alike. This avoids the usual "shirt sinks into a wider body" problem.
3. **Hiding the body:** every body vertex belongs to a region (`chest`, `belly`, `upperArm.L`, `thigh.R`, …), stored once as a vertex attribute. Each garment lists the regions it covers fully. The body shader discards the covered regions, so no skin pokes through. This is MakeHuman's `delete_verts` done per region instead of per vertex.
4. **Stacking layers:** garments draw in layer order. Each layer is pushed out a few millimetres along the normals (`layer × 2 mm`) and uses `polygonOffset`, so a jacket never flickers through the shirt under it. A covered lower layer is hidden only where the upper layer is opaque, which keeps open jackets, cropped tops and skirts over leggings working.
5. **Colour and pattern:** garments are authored in greyscale with a mask. Each garment tints with up to two colours (main, trim) and an optional pattern texture (stripes, checks, print). Tinting is done in the material, so one mesh serves any colour.
6. **Head:** the MakeHuman head is a hidden region; a head bone carries the existing face sprite instead, so photo faces, painted hair and the four-view switching (`viewFor`) stay unchanged. The sprite is sized from the body's head bone so it matches every age and height.
7. **Motion:** the interaction poses (`arms`, `legs`, `knees`, `lean`, `tilt`, `turn`, `bob`) become bone rotations through a small mapping (`arms` → shoulder and upper arm, `lean` → spine, and so on). The interaction JSON files keep their format. Sitting uses the same seat heights.
8. **Budget:** the low-poly proxy is about 2–5k triangles per body, garments are 0.5–2k each, and textures are 256–512 px. Meshes use meshopt or Draco compression. Twenty people in a place stay well inside a laptop GPU budget. `Figure` keeps the box body as a fallback while the meshes load, and for thumbnails.

## 4. Content model

`Profile.character` is free JSON already (`set_profile_character`), so no Rust schema change is needed. Version 2:

```ts
interface Character {
  version: 2;
  /** 0 = feminine, 1 = masculine; neutral sits in between. Body shape only, never gender. */
  shape: number;
  /** Years, or an age group when the birthday is unknown. */
  age: number | Age;
  height: number;   // -1..1 around the average for the age
  weight: number;   // -1..1
  muscle: number;   // -1..1
  proportions?: { shoulders?: number; bust?: number; waist?: number; hips?: number };
  skin: { color: string; scale?: "monk"; step?: number };   // step 1–10 when picked from the scale
  /** Only used by drawn faces; photo faces carry their own hair. */
  hair: { style: HairStyle; color: string };
  glasses?: boolean;
  beard?: boolean;
  /** What they wear now, bottom layer first. */
  wearing: Worn[];
  /** Saved outfits: "Work", "Avurudu saree", "Gym". */
  outfits?: { name: string; wearing: Worn[] }[];
}

interface Worn { garment: string; colors?: [string, string?]; pattern?: string }
```

The garment catalogue lives in the app (`src/lib/places/garments.ts` plus `public/places/garments/*.glb`) and works like `ITEM_KINDS`:

```ts
interface Garment {
  id: string;                 // "tshirt", "saree-drape"
  label: string;
  layer: "under" | "base" | "mid" | "outer" | "feet" | "accessory";
  /** Body regions it covers; used to hide skin and to find clashes. */
  covers: Region[];
  /** Regions it only partly covers (open jacket, sheer drape): skin and lower layers stay drawn. */
  partly?: Region[];
  colors: 1 | 2;
  ages?: Age[];               // a school pinafore for children, etc.
}
```

**Rules:**
- Two garments on the **same layer** may not cover the same region: no two pairs of trousers, but a vest and a shirt sit on different layers.
- A person always wears at least an `under` top and bottom, or something that covers those regions. The editor adds plain underwear when a layer is removed, so a body never renders bare.
- **Two-piece and many-piece:** a two-piece is just two garments (a crop top with a skirt, a kurta with pyjama trousers). A ready-made **outfit preset** fills several garments at once. Examples:
  - Suit: shirt, trousers, jacket, tie
  - Saree: blouse, underskirt, drape
  - School uniform: shirt, skirt or shorts, socks, shoes
- **Old characters** migrate on load: `top` becomes a T-shirt in that colour, `bottom` becomes trousers (or a skirt when `skirt` was set), `figure` becomes `shape`, `build` becomes `weight`, and `skin` keeps its colour.

**First catalogue (about 20 garments):**

| Layer | Garments |
|---|---|
| under | briefs, boxers, bra, vest, undershirt |
| base | T-shirt, shirt, blouse, trousers, jeans, shorts, skirt, dress, leggings |
| mid | sweater, cardigan, waistcoat |
| outer | jacket, coat, saree drape |
| feet | socks, shoes, sandals |
| accessory | tie, scarf |

The saree drape and the dress need hand modelling. The rest start from MakeHuman's CC0 clothes or are simple to make.

## 5. Editor

The Character card on About becomes a three-tab editor with the live `CharacterPreview`, which rotates and can switch outfits.

- **Body:** shape, age, height, weight and muscle sliders, with proportions under "More".
- **Skin and hair:** 10 Monk swatches, then a custom picker, then hair style and colour.
- **Clothes:** the layers as a stack, top layer first. Each row has a garment picker, colour swatches and a remove button, and a clash shows inline. Below the stack: an outfit preset picker, and "Save as outfit".

**MCP:** add `set_person_character`, which takes the v2 JSON, validates garments and clashes, and returns problems the way `layoutProblems` does. It lets an agent dress people, for example "put June in her Avurudu saree".

## 6. Making garments with AI

MakeHuman's CC0 clothes cover the basics (underwear, T-shirt, shirt, trousers, jeans, shorts, sweater, shoes). Everything else is generated through a **sewing pattern**, not straight to a 3D mesh. Image-to-3D models (TRELLIS, Hunyuan3D) make one rigid shell with no inside, poor topology and no fit to our body, so they are kept for accessories only (bags, jewellery, hats).

Pipeline (a `make-garment` skill, run in this repo, all on the Mac; no CUDA needed):

1. **Describe:** the user gives a name and a photo or a few words ("Kandyan saree, maroon with gold border", "A-line midi dress, short sleeves").
2. **Pattern:** Claude writes the garment as a parametric sewing pattern with **pygarment** (GarmentCode's library, MIT): panels, darts, seams, and which seams join. Measurements come from the base body, so one pattern fits any slider setting. A saree is a 5.5 m rectangle with pleats and a pinned waist, written the same way. The pattern is source we keep: `assets/places/garments/<id>/pattern.py`.
3. **Fabric:** an image model (OpenAI `gpt-image-1`, as `generate-face-views` uses) makes a tileable print and, for sarees and sarongs, a border strip. The garment stores a greyscale mask too, so its colours stay editable.
4. **Drape:** headless Blender with MPFB 2 loads the base body (average adult, A-pose), places the panels around it, sews the seams with cloth-sim sewing springs, pins waistbands, and simulates until it settles.
5. **Fit for runtime:** shrink-wrap cleanup, then copy skin weights and every body shape key from the body to the garment (Data Transfer modifier), set the layer, regions covered and partial regions, and export `garment.glb`. A check renders it on five bodies (child, slim teen, broad adult, curvy adult, elder) and fails on poke-through.
6. **Review:** the skill shows the five renders. The user accepts, or asks for changes in words ("longer pallu", "puff sleeves") and steps 2–5 run again.

Research to watch: ChatGarment (CVPR 2025, images or text → GarmentCode patterns) and GarmageNet (SIGGRAPH Asia 2025) do step 2 with trained models. Both need an NVIDIA GPU and drape on SMPL bodies (non-commercial), so we use Claude for the pattern and Blender for the drape instead.

## 7. Plan

| Phase | Work | Done when |
|---|---|---|
| 0. Spike | Install Blender 4.2+ and MPFB 2 with the CC0 system assets. Script (headless) one low-poly body with 5 shape keys and a game rig, plus a T-shirt, trousers and a jacket, to glTF. Load them in the dev-world harness with a face sprite on the head bone. Also drape one AI pattern (a wrap skirt) to prove the §6 pipeline. | A screenshot shows the body with sliders, three layers, the face image and no poke-through. |
| 1. Body | Swap the `Figure` boxes for the skinned body, map the interaction poses to bones, add the Monk palette and the v2 `Character` with migration. | All demo people render, walk, sit and run the nine interactions. |
| 2. Clothing | Garment catalogue, region hiding, layer offsets, tint and pattern, the MakeHuman basics, then the `make-garment` skill for the saree, dress and skirt. | The demo people are dressed from their old colours, and June wears a saree. |
| 3. Editor and MCP | The three-tab editor, outfit presets, `set_person_character` | A person can be dressed and saved without touching JSON. |
| 4. Later | More garments through the skill, accessories through image-to-3D, the outfit for a post's date ("Open place" uses the outfit saved with the post) | — |

## 8. Decisions

Taken 2026-11-04:
1. **Body source:** MakeHuman assets through MPFB 2, low-poly proxy, MakeHuman's own look (no toon pass for now).
2. **Hair:** stays in the face images; no hair meshes.
3. **Hand-made pieces:** generated with AI through sewing patterns (§6).

Open:
1. **Repo layout for assets:** `assets/places/` holds `.blend` and pattern sources, `public/places/` holds the exported `.glb`. Do the Blender sources get committed, or only the patterns and scripts that rebuild them?
2. **Body shape stays separate from gender:** `shape` is only geometry. Pronouns and genders stay on the profile, as now, and only fill in a default.
3. **Credits:** MakeHuman (CC0, thanks only) and the Monk Skin Tone Scale (CC BY 4.0) in Settings → About.
