# Proposal: Places — a walkable isometric world for My Diary

Status: phases 0–4 built, phase 5 partly · 2026-11-03

## Built so far

| Area | State | Differs from the plan below |
|---|---|---|
| 3D tour removed | Done: tab, `PlanEditor`, `PlaceScene`, `plan.ts`, `set_place_plan` gone; old `plan` values are dropped on load | — |
| Layout model | `Profile.layout`, schema in `src/lib/places/layout.ts`, templates in `src/lib/places/templates/` (home, clinic, clothing shop, cafe) | **1 m cells**, not 0.5 m: one person per cell, sizing rules (§3.2) still hold |
| World | Full window (inside the app window): iso camera, 4 rotations, zoom, pan, top view, minimap, cut-away walls, A*, doors, seats, cubicles and fitting rooms that lock with a group inside | Not OS full screen |
| People | `Profile.character` (Character card on About), `Profile.faces` (four photo slots), drawn faces as fallback, invite / follow / wait / send home | A person's places are the **existing relationships** (Home, Workplace, School, Favourite spot), not a new `places` field |
| Cities and diary | Places page in the menu, Place tab on profiles, "Open place" on posts, "Save moment" | A place joins a city with a new **City** relationship |
| Agents | `set_place_layout`, `set_person_faces`, the `generate-face-views` skill | `create_place`, `add_room`, `add_items`, `create_city`, `set_character` not yet |
| Doing things together | Interactions as JSON (`src/lib/places/interactions/*.json`, format in its README): formation (spots, ring, stay), keyframed poses per role (arms, legs, knees, lean, tilt, turn, bob, steps, emotes). Nine to start: dance together, slow dance, hug, high five, twirl, circle dance, cheer, wave hello, bow. **Together** in the world, and pair actions in a person's menu | Not in the original plan |
| Build mode | Template picker and JSON editor with a live preview | The visual editor (drag rooms, doors, items, kits, checks) is still to do |
| Demo | `npm run seed:demo`: Minneapolis with Home, Sunrise Clinic, Saree House (fitting rooms), The Rusty Bean (cafe), Lakeside General Hospital (no layout); June (elder), Maya (child), Theo (teen); three group-visit posts | Uses the seed's people and shops instead of the names in §7.2 |

## 1. Summary

Replace the per-page "3D tour" tab with **Places**: a full-window isometric world. Cities hold places, places hold rooms and everyday furniture, and the diary author walks through them, opens doors, sits down and invites people from the journal.

- **Remove:** the "3D tour" tab on place, shop and page profiles (`PlaceTab`, `PlanEditor`, the free-camera `PlaceScene`) and the `set_place_plan` MCP tool.
- **Keep and evolve:** the floor-plan idea in `src/lib/plan.ts` (rooms, openings, furniture kinds such as `toilet`, `sofa`, `bed`). It becomes a grid-snapped *layout* the world can walk, path-find and edit.
- **Add:** cities (a list of places with a picture), a Place view (the walkable maze), characters for journal people (child, teen, adult, elder; four face images made by the `generate-face-views` skill), each profile's own places (home, work, places they visit), "open this post's place" with the post's people already there, place templates (home, hospital, clinic, shop, cafe, office) and an editor.
- **Look:** smooth low-poly 3D seen through the late-90s isometric management-sim camera (Theme Hospital era): tilted top-down, cut-away walls, small characters. All art, maps and mechanics are our own; we borrow the camera and the feel, not any game's assets, rooms or rules.
- **First milestone:** a demo workspace (`npm run seed:demo`) with one city, a home, a hospital, a clinic and a shop, and five characters to invite.

## 2. Experience

Three screens, all full-window (the top bar and side nav are hidden; `Esc` returns to the diary).

### 2.1 City view
- A city is a **list of places with a picture** (no streets to walk). Each card shows the place's picture (its cover, or a rendered thumbnail of its layout), name, category, and who calls it home / work.
- A place without a layout shows "Build" (pick a template); one with a layout shows "Enter".
- City switcher at the top (Lakeside, Colombo, …). Places with no city go under "Elsewhere".

### 2.2 Place view (the maze)
- Isometric camera, fixed pitch (~35°), rotates in 90° steps (`Q` / `E`), zooms (wheel), pans (drag / edge scroll).
- **Walls cut away** automatically: walls between the camera and the author drop to knee height (the same idea as today's "walls down"). Toggle: walls up / cut away / down.
- **Top view** (`T`): a flat overhead map of the whole floor — rooms, doors, furniture icons, people as dots — like a building plan. Click anywhere to walk there. A minimap of the same sits in a corner of the iso view.
- Floors: `PgUp` / `PgDn` or stairs / lift furniture.
- HUD: place name, current room, the people here, buttons for Invite, Top view, Save moment, Exit.

### 2.3 Author movement and actions
| Action | Input | Behaviour |
|---|---|---|
| Walk | click a tile, or `W A S D` / arrows | A* path over the walk grid, character turns and walks; `Shift` runs |
| Go to room | click a room name, or pick it from the room list | Walks to the room's door, then its centre |
| Open / close door | click the door, or walk into it | Doors swing open as you pass and close behind you (setting: auto-close on/off). Locked doors show a padlock |
| Sit | click a chair, sofa, bench, bed edge | Walk to the seat's approach tile, turn, sit. Click elsewhere to stand |
| Use toilet | click a toilet | Walk into the cubicle, door closes and locks, sits; the cubicle door shows "occupied" |
| Lie down | click a bed / sofa (long press) | Lies down |
| Look | hold right mouse | Turns the author toward the pointer |

### 2.4 Inviting people
- Invited people are **journal people** (person profiles); there are no other real users in the world.
- **Invite** opens a picker of person profiles. Invited people appear at the place's entrance and walk to the author, then stay near them.
- Idle behaviour: an invited person who has nothing to do sits in the nearest free seat in the author's room, or stands nearby facing the author.
- Click a person: their name, relationship, "Follow me" / "Wait here" / "Sit there", "Send home".
- **Save moment** creates a diary post: the place as check-in (`place_id` already exists on posts), the people present as mentions, and a rendered snapshot of the current view as the photo.

### 2.5 Who is already there
- When you enter a place, the people whose **home** or **work** it is are there: at home they idle in the living room or bedroom, at work at their desk or counter.
- **Open a post's place:** a post with a check-in and tagged people gets an "Open place" button. The place opens with those people already inside, gathered in one room (e.g. the group visiting the clinic sits in the waiting room). The post's date shows in the HUD.
- World state is not saved between visits: doors start closed and people start at their usual spots each time.

### 2.6 In the diary
- New side-nav entry **Places**: cities, then places per city, each with its iso thumbnail and recent visits.
- Place / shop / page profiles get a **Place** tab in place of "3D tour": the thumbnail, "Enter" (opens the full-window world), and the posts saved there.
- Posts with a check-in show the snapshot and an "Enter" link.

## 3. Content model

Everything stays in the existing encrypted store as JSON on profiles, the same way `plan` is stored today.

| Thing | Where it lives | Shape (sketch) |
|---|---|---|
| City | a `Place` profile with `category: "City"` | No layout; its cover photo is the city's picture. The list order is by name |
| Place in a city | relation `located-in` → the city (relations already exist) | — |
| Place layout | `Profile.layout` (replaces `Profile.plan`) | `{ version: 2, cell: 0.5, floors: [{ name, spawn, rooms, doors, walls, items }] }` |
| Room | in a floor | `{ id, name, type, cells: [x1,y1,x2,y2] \| polygon, floor: "tile" \| "wood" \| ..., wallColor }` — room `type` (ward, waiting, toilet, kitchen, …) drives labels and templates |
| Door | in a floor | `{ id, at: [x,y], edge: "n"\|"e"\|"s"\|"w", width, kind: "door" \| "double" \| "sliding" \| "arch", locked?, autoClose? }` |
| Item (furniture) | in a floor | `{ id, kind, at: [x,y], rotation: 0\|90\|180\|270, color?, label? }` |
| Character | `Profile.character` on person / me profiles | `{ age: "child"\|"teen"\|"adult"\|"elder", build: "slim"\|"average"\|"broad", figure: "masculine"\|"feminine"\|"neutral", height?, skin, hair: { style, color }, outfit: { top, bottom, shoes } }` |
| Faces | `Profile.faces` on person / me profiles | `{ front, left, right, back: MediaRef }` — encrypted media like avatars; `front` falls back to the avatar. Made from one photo by the `generate-face-views` skill (Codex) |
| A profile's places | `Profile.places` on person / me profiles | `[{ placeId, role: "home" \| "work" \| "school" \| "visits", spot?: roomId }]` — shown on the About tab ("Lives at", "Works at", "Often at") and used to put people in places |
| A post's group visit | existing `place_id` + mentions on posts | No new fields: "Open place" spawns the mentioned people in the checked-in place |
| World state (session) | memory only, reset on every visit | door open/closed, who is where, who sits where |

Notes:
- Coordinates snap to a **0.5 m cell grid**. Walls sit on cell edges; doors on wall edges; items on cells. This is what makes path-finding, the editor and templates simple.
- The character's `figure` is a body-shape choice for the sprite, separate from the profile's `genders` / `pronouns`, which stay the source of truth for how a person is described.

### 3.1 Furniture catalogue (first set)

Each kind has a footprint (cells), a model, and **interaction slots**: where a character stands to use it, which way it faces, and the pose.

| Group | Kinds | Interactions |
|---|---|---|
| Seating | chair, office chair, armchair, sofa (2/3 seats), bench, stool, waiting-room chair row | sit (one slot per seat) |
| Tables | dining table, coffee table, desk, round table, reception counter, shop counter | stand at / sit at (via chairs) |
| Bathroom | toilet, sink, bath, shower, mirror, **toilet cubicle** and **family / accessible cubicle** (partition + door + toilet + standing room), urinal, hand dryer | sit on toilet, wash hands; the cubicle door locks while in use, with everyone inside it |
| Bedroom | bed (single/double), hospital bed, cot, wardrobe, bedside table, lamp | lie, sit on edge |
| Kitchen | fridge, stove, sink unit, cupboard, kettle, microwave, dining set | stand and use |
| Living | TV, TV stand, bookshelf, rug, plant, floor lamp, curtains, fireplace | watch TV (from a seat), read |
| Health | exam couch, doctor's desk, screen curtain, wheelchair, drip stand, medicine cabinet, x-ray, scales | lie on couch, push wheelchair (later) |
| Shop | shelf, rack, mannequin, display table, till, **fitting room** (curtain or door + bench + mirror + standing room), basket stack | browse, pay at till, try on (the fitting room closes while in use, with everyone inside it) |
| Office | desk, office chair, copier, filing cabinet, whiteboard, water cooler | sit and type |
| Structure | stairs, lift, window, pillar, partition wall, railing | change floor (stairs/lift) |
| Outside | tree, bench, lamp post, bin, car, bicycle rack, sign | sit on bench |

### 3.2 Room for groups

Places are visited in groups (a parent and child, a family, friends shopping), so every space must hold **more than one person**. A person takes one 0.5 m cell; walking needs a 1 m (2-cell) path. Templates, room kits and the editor's checks use these minimums:

| Space | Minimum (m) | Fits |
|---|---|---|
| Corridor, aisle between shelves | 1.5 wide | two people passing |
| Interior door | 1.0 wide; main entrances 2.0 (double) | one person and a wheelchair or a child beside them |
| Toilet cubicle | 1.0 × 2.0, with 1 m clear in front of the toilet | one person standing at the door, one sitting |
| Family / accessible cubicle | 2.0 × 2.0 | a parent and a child, or a person and a carer |
| Fitting room | 2.0 × 2.0, bench + mirror | one trying on, one or two helping or waiting |
| Waiting area outside fitting rooms / toilets | 2 × 2 clear, plus a seat | a queue of two or three |
| Consulting room | 3 × 4 | patient, companion, doctor; two visitor chairs |
| Lift | 2 × 2 | four people |
| Clear space around a table or bed | 1 m on the sides people use | people sitting and passing behind them |

Rules that follow from it:
- **Every interactive item has several spots**, not one: a table one per chair, a counter a queue line, a TV a viewing area, a bed two edge seats, a sink a "waiting" spot behind it.
- **Closed spaces hold groups.** A cubicle or fitting room locks with everyone in it; followers walk in with the person they follow if there is a free cell, and otherwise wait at its waiting spot.
- **Rooms have a capacity** (free cells ÷ 2). Invite warns when a group is larger than the room you are in.
- **The editor flags spaces below these minimums** (e.g. "Fitting room 2 is 1 × 1.5 m — too small for two people").

## 4. Rendering and engine

**Decision: three.js, smooth low-poly (flat-coloured meshes, soft shadows, rounded bevels), an orthographic isometric camera, and characters as 3D bodies with 2D face billboards.** three.js is already a dependency, and today's `PlaceScene.tsx` already builds floors, walls, doors and furniture from a plan; it is the starting point for a rewritten `WorldScene`.

| Part | Approach |
|---|---|
| Camera | `OrthographicCamera` at a fixed pitch, 4 rotations, zoom by frustum size. Top view = the same scene from straight above with labels |
| Floors, walls | Merged geometry per room / wall run, simple flat colours and a light texture; wall cut-away by lowering wall meshes on the camera side of the author |
| Doors | Hinged leaf meshes with a tweened rotation; open/closed in world state |
| Furniture | Low-poly models built in code per kind (as today), later swappable for `.glb` files in `src/assets/items/` |
| Characters | A procedural low-poly body sized by `age` × `build` × `figure` (child ~1.1 m, teen ~1.55 m, adult ~1.7 m, elder ~1.65 m with a stoop), coloured by `outfit`. The head is a camera-facing quad textured with one of the four face images, chosen from the angle between where the character faces and the camera: front, left, right, back. Two-frame walk swing, sit and lie poses |
| Walk grid | Built from the layout: each 0.5 m cell is free, wall, item or door. Closed doors are passable for the author (they auto-open) |
| Path-finding | A* on the grid with diagonal moves; small, runs on the main thread |
| Interactions | A click ray hits an item → its nearest free interaction slot → path to the slot → play the pose |
| People AI | A tiny state machine per invited person: `arrive → follow → idle (find seat) → leave` |
| Snapshot | `renderer.domElement.toDataURL()` → stored as post media through the existing upload path |
| Performance target | A 3-floor hospital (~60 rooms, ~800 items, 10 people) at 60 fps on an M1, using instanced meshes for repeated items |

Alternative considered: a 2D canvas with pre-drawn isometric sprites (closest to the 90s look). Rejected: every furniture kind would need 4 hand-drawn rotations and every character pose its own sprite sheet; the 3D route gives rotation, zoom and top view for free.

## 5. Authoring custom places

Adding a hospital, clinic or shop must take minutes, not a JSON file.

1. **New place** → pick a template (Home, Apartment, Hospital, Clinic, Shop, Cafe, Office, Empty) → pick a size (S/M/L) → pick its city. The template generates a layout.
2. **Editor** (inside the full-window world, `B` for Build):
   - **Rooms:** drag a rectangle on the grid, pick a room type; shared edges become one wall. Delete / rename / recolour.
   - **Doors and windows:** click a wall edge.
   - **Items:** a catalogue panel by group (§3.1); drag onto the grid, `R` to rotate, auto-snap to walls for wall items (sink, toilet, TV).
   - **Room kits:** "Toilet block (3 cubicles + 2 sinks)", "Waiting area (8 chairs + plant)", "GP office", "Ward (4 beds)", "Kitchen", "Bedroom". One drop places a set of items.
   - Undo / redo, and validation: every room reachable from the entrance, doors not blocked.
3. **Agent authoring over MCP** (replacing `set_place_plan`):
   - `create_place { name, template, size, city }`
   - `set_place_layout { id, layout }` (the v2 schema)
   - `add_room`, `add_items` for incremental edits
   - `create_city`, `set_character { id, character }`, `set_person_faces { id or name, front, left, right, back }`

   Today's MCP server only reaches pages, shops and products. `set_person_faces` and `set_character` are the first tools that write to a person profile; they take a person id the user gives and return nothing else about the journal.
4. **Faces with Codex:** the project skill `.claude/skills/generate-face-views/` turns one photo of a person into the four views (front, left, right, back) in one consistent style, checks them, and uploads them with `set_person_faces` (or saves them for upload in the Character section until that tool exists).

   An agent can then build "a two-floor clinic with a pharmacy" from a description or a photo of a floor plan.

Templates live as JSON in `src/lib/places/templates/` (one file each), generated by small functions so S/M/L sizes come from one definition.

## 6. Integration with the existing app

| Area | Change |
|---|---|
| `src/components/PlaceTab.tsx`, `PlanEditor.tsx` | Delete |
| `src/components/PlaceScene.tsx` | Replace with `src/world/WorldScene.tsx` (reusing its wall/door/furniture builders) |
| `src/lib/plan.ts`, `src/lib/plans/dunder-mifflin.*` | Delete; replaced by `src/lib/places/layout.ts` (v2 schema, grid helpers), `catalogue.ts`, `templates/` |
| `src/views/ProfileView.tsx` | "3D tour" tab → "Place" tab (thumbnail, Enter, posts here, who lives / works here). Person / me profiles get a "Character" section (body options + four face slots) and "Places" (home, work, visits) on About |
| `src/components/PostCard.tsx` | "Open place" on posts with a check-in that has a layout |
| New views | `src/views/CityView.tsx`, `src/views/PlacesView.tsx` (diary list), `src/world/WorldView.tsx` (full window: City → Place) |
| `src/App.tsx`, `Shell.tsx` | A world route that renders without `TopBar` / `SideNav`; "Places" in the side nav |
| `src-tauri/src/model.rs` | `Profile.plan` → `Profile.layout`; add `Profile.character`, `Profile.faces` |
| `src-tauri/src/model.rs` (more) | `Profile.places` (home / work / school / visits) |
| `src-tauri/src/store.rs` | `set_profile_layout`, `set_profile_character`, `set_profile_faces` (faces reuse avatar media handling), `set_profile_places`; old `plan` values are dropped on load |
| `src-tauri/src/commands.rs`, `mcp.rs` | Commands and MCP tools from §5; remove `set_place_plan` |
| `src-tauri/src/bin/seed.rs` | The demo world (§7.2) |
| Window | Optional true fullscreen via Tauri's `getCurrentWindow().setFullscreen(true)` when entering the world |

## 7. Plan

### 7.1 Phases

| Phase | Delivers | Done when |
|---|---|---|
| 0. Clear the ground | Remove 3D tour tab, PlanEditor, `set_place_plan`, old plans; v2 layout schema | App builds, old workspaces open, no plan UI left |
| 1. Walkable home | Full-window world route, iso camera (rotate, zoom, pan), walls cut-away, top view + minimap, walk grid, A*, click-to-walk + WASD, doors open/close, the author as a placeholder character | The author walks from the front door to the bedroom in the demo home, opening doors |
| 2. Furniture and actions | Catalogue §3.1 with interaction slots; sit, lie, toilet + cubicle lock; room kits; the §3.2 sizes in kits and templates | The author sits on the sofa; the author and Saki use the family cubicle together; two people share a fitting room |
| 3. Characters and invites | Character section on profiles, procedural bodies by age/build/figure, four-view face billboards, `set_person_faces` + the face skill, invite / follow / idle-sit, Save moment → post | Five demo people come when invited, sit in free chairs, and a saved moment shows in the timeline |
| 4. Places of people, cities, diary | `Profile.places`, people at home / work on entry, "Open place" from a post, City list, Places side-nav view, Place tab on profiles | Opening the demo "clinic visit" post shows Amma and Kavi in the waiting room |
| 5. Build mode and agents | Editor (rooms, doors, items, kits, undo, validation), templates S/M/L, MCP tools | A new clinic is built in the editor in under 5 minutes, and an agent builds one over MCP |

Phases 1–3 are the core; 4 and 5 can swap order.

### 7.2 Demo workspace (`npm run seed:demo`)

- **City:** Lakeside.
- **Places:**
  - *Home* (author's house): hall, living room (sofa, armchair, TV, coffee table, rug), kitchen (fridge, stove, sink, dining table + 4 chairs), bathroom (toilet, sink, bath), two bedrooms (double bed, single bed, wardrobes), garden with a bench.
  - *Lakeside General Hospital* (2 floors): entrance, reception counter, waiting room (chair rows, plants, water cooler), 3 GP offices (desk, chairs, exam couch, screen), toilet block with 3 cubicles each side, pharmacy, ward with 4 hospital beds, staff room, lift and stairs.
  - *Sunrise Clinic*: reception, waiting area, 2 consulting rooms, 1 toilet.
  - *The Rusty Bean* (existing seed shop): counter, till, tables and chairs, toilet.
  - *Corner Grocer*: shelves, fridges, till, basket stack.
  - *River & Rose* (clothing shop): shop floor with 1.5 m aisles, till, three 2 × 2 m fitting rooms with a bench and mirror, a waiting armchair, a staff-only stockroom.
  - The old *Dunder Mifflin Building* plan is removed from the seed.
- **People with characters:** the author (adult), an elder parent, a teen, a child, and two existing seed friends (adults). Their four face images are generated by the seed as simple drawn faces (the seed already writes PNGs procedurally), so the demo needs no real photos; real faces come later from the skill.
- **Their places:** the author and the family have *Home* as home; Nimal works at *Lakeside General Hospital*; Robin works at *The Rusty Bean*; Amma "often at" *Sunrise Clinic*.
- **Group-visit posts:** "Amma's check-up" (at Sunrise Clinic, with Amma and Kavi) and "Coffee after work" (at The Rusty Bean, with Robin and Nimal), each with "Open place".

## 8. Decisions and open questions

Decided (2026-11-03):

| Question | Decision |
|---|---|
| Where faces come from | One photo → four views generated with Codex, through the `generate-face-views` skill |
| Who can be invited | Journal people only (person profiles) |
| People in places | Each profile lists its places (home, work, school, visits); posts with a check-in and tagged people open the place with them inside |
| Old floor plans | Dropped |
| Look | Smooth low-poly |
| Cities | A list of places with a picture; no walkable streets |

Still open:

1. Should a person's spot in a place be chosen (Nimal's desk is "GP office 2") or picked automatically from the room type?
2. Should "Save moment" also save a short note typed in the world, or only the snapshot and the people?
3. Do face views need a style choice (realistic, illustrated, cartoon) per workspace, or one fixed style?

See also the mock UIs in `places_world_proposal.html`.
