# Interactions

Things people do together in the Places world: dance, hug, high-five, cheer. Every `*.json` file
in this folder is one interaction; the app loads them all (`index.ts`), skipping (with a console
warning) any that don't pass `interactionProblems` in [../interaction.ts](../interaction.ts).

In the world, actions open as a Sims-style **action wheel**: click yourself or press
**Actions** for yours, click a person for things to do with them, or click furniture for its
actions. The wheel shows groups (Friendly, Romantic, Dance, Home, Care)
that open into rings of a few actions each, with **More** turning the page, so nothing scrolls.
An action's group is its `category` (see `ACTION_CATEGORIES` in `../interaction.ts`). With several
people around, a together action asks who with; an outfit action asks which outfit. People walk to an open
space or to the selected furniture, play the keyframes, and stop when it ends,
when you walk away, or when you press Stop.

## Changing clothes any time

Click yourself (or your chip at the bottom left, or **Change my clothes** in Actions), or click
someone and pick **Change clothes**, to open the outfit bar: ready-made outfits apply and save at
once, and **Dressing room** opens the full layer-by-layer editor. It is unavailable while that
person is in the middle of an action. The wardrobe action still plays its cutaway.

## Available actions

Alongside the original dances, hug, wave, bow, cheer and high five:

| Actions | Furniture |
|---|---|
| Hold hands, kiss, cheek kiss, forehead kiss | Open floor |
| Cuddle | Sofa or bench with two free seats |
| Woohoo | Bed; embrace, change into underwear, waist-level cover with visible upper bodies, then dress again |
| Sleep, sleep beside each other | Bed; lie down until Stop |
| Change outfit | Wardrobe; choose an outfit before starting |
| Wash hands, wash face, brush teeth | Sink |
| Use toilet | Toilet; cubicle locks when configured, then the person leaves the seat |
| Take a shower, take a bath | Shower or bath, respectively, in view |
| Leg massage, bed exercises | Bed; the client lies, the therapist stands at the side |
| Examine on the bed, deliver a baby | Bed; the patient lies, the doctor stands at the side or foot |

All new actions are enabled by default. Participant age mappings come from the
main **Settings → Places animations & actions** page; Woohoo defaults to 18+.
The JSON and renderers contain no participant rules. Woohoo stays in the room, lying on the bed in view. No explicit poses
are rendered. Changing gestures and floating clothing icons mark the transition
to underwear and back. Both original outfits are restored on completion, Stop,
or a settings change; temporary scene outfits are never saved over profiles.
Only the wardrobe action uses a cutaway card.
Wardrobe changes update the visible outfit and save
the character on completion; Stop before completion restores the previous outfit.
If saving fails, the new outfit remains for the current visit and a message explains why.

The Home template includes a shower. Existing saved layouts are not changed:
add a Shower from the Bathroom furniture group to use that action there.

## Shape

```json
{
  "id": "dance-pair",
  "label": "Dance together",
  "emoji": "💃",
  "description": "Face to face, swaying side to side with arms up.",
  "people": { "min": 2, "max": 2 },
  "beat": 0.45,
  "length": 8,
  "loop": true,
  "stagger": 0,
  "formation": {
    "type": "spots",
    "spin": 0,
    "spots": [
      { "role": "lead", "at": [0, 0], "facing": 0 },
      { "role": "partner", "at": [0, 1.0], "facing": 180 }
    ]
  },
  "roles": {
    "lead": [
      { "beat": 0, "armL": [40, 30], "armR": [40, 30], "emote": "♪" },
      { "beat": 1, "armL": [150, 20], "legL": 25, "kneeL": 30, "bob": 0.08, "move": [0.15, 0] }
    ],
    "partner": [{ "beat": 0 }]
  }
}
```

| Field | Meaning |
|---|---|
| `category` | The wheel group it sits in: `social`, `romantic`, `dance`, `household`, `care`; `other` when left out |
| `people` | How many can take part, the person who starts it included |
| `beat` | Seconds per beat; keyframes are placed in beats |
| `length` | Beats in one round |
| `loop` | Repeat until stopped; otherwise it ends after one round |
| `stagger` | Beats between one person and the next (a wave running round a group) |
| `formation` | Where everyone stands, below |
| `roles` | Keyframes per role, in beat order |
| `target` | `{ "kinds": ["sink"], "posture": "stand" }`; posture is `stand`, `sit`, `lie` or `inside` |
| `cutaway` | `{ "from": 1, "to": 7, "label": "Changing…", "emoji": "👕" }`; a full-screen card, **only for outfit changes** (needs `outfitAt`). Every other action stays on screen |
| `target.roles` | Per-role placement at the furniture: `{ "therapist": { "posture": "stand", "side": "right", "along": 0.5 }, "client": { "posture": "lie", "side": "right", "across": 0.4 } }`. `side` is the left or right of someone lying on it, `across` metres toward that side, `along` metres toward the feet |
| `wardrobe` | `{ "at": 4, "restoreAt": 15, "outfitId": "underwear" }`; temporary preset change, restored before the scene ends |
| `wardrobe.preferUnderlayers` | Use each person's saved underwear garments and colours when present, filling missing layers from the preset |
| `outfitAt` | Beat when the selected outfit is applied; committed on completion, rolled back on Stop |
| `held` (key) | `"toothbrush"` or `"baby"` in the right hand from this key on; `""` puts it down |
| `water` | Show water droplets at the target fixture while playing |

Furniture actions reserve distinct entry positions, require reachable paths, and
use the furniture's orientation. `sit` uses real seats; `lie` rotates about the
hips on the bed surface; `inside` stands at the middle of the fixture. Nobody is ever hidden. Set
`target.leaveSeat` to true for an action that should get up afterwards. On stopping
a surface action, people return to their entry positions. Furniture controls
placement; `formation` still assigns the roles in participant order.

### Underwear

`garments.ts` exposes foundation tops, underwear tops/bottoms and underlayers.
The catalogue includes ten underwear choices per style collection. Each piece
has independent colour controls. The Underwear preset works without outer
garments; other outfits retain underlayers beneath their clothing. Higher opaque
garments hide only the covered triangles, preserving exposed parts of lower layers.
The shared `components/world/clothingGeometry.ts` pipeline uses the existing rig,
bone weights and morph targets. See [../CLOTHING.md](../CLOTHING.md) for the full
six-layer clothing model and catalogue.
Woohoo keeps saved underlayer choices and colours, uses the Underwear preset for
missing layers, and removes outer clothes and shoes for the scene. Use the profile's
Character editor → Clothes to choose the Underwear preset or edit either layer.

### Formations

- **`spots`**: one spot per person, in order; the person who starts it takes the first.
  `at` is `[right, forward]` in metres from that person, where forward points at the second
  person. `facing` is degrees from forward (0 the same way, 180 back toward the first). `spin`
  turns the whole group about its middle, in degrees per beat (a slow dance turning). A spots
  formation needs as many spots as `people.max`.
- **`ring`**: everyone on a circle facing the middle, all playing `role`. `radius` in metres
  (default 0.26 m per person, at least 0.75), `spin` in degrees per beat (a circle dance stepping round).
- **`stay`**: everyone where they are, turned to face the middle of the group, all playing `role`.
  People sitting down stay seated and do it with their upper body.

The world looks within six cells of the first person for a spot where the whole formation
(turning all the way round, if it spins) is on open floor with no furniture, wall or partition
inside it, and says "Not enough room" if there's none.

### Keyframes

Each key has a `beat` and any of these; anything left out is the neutral standing pose at that
key. Between keys the pose eases smoothly; a loop eases from the last key back to the first.

| Key | Units | Meaning |
|---|---|---|
| `armL`, `armR` | `[forward°, out°]` | 90 forward = arm straight ahead, 180 = straight up; 90 out = straight out to the side, negative = across the body (a hug) |
| `elbowL`, `elbowR` | degrees | Bend the elbow forward from the rig's rest pose; follows the shoulder when the arm is raised |
| `forearmL`, `forearmR` | degrees | Rotate the forearm around its length, outward on each side |
| `wristL`, `wristR` | `[forward bend°, outward bend°, outward twist°]` | Move the hand independently of the forearm |
| `legL`, `legR` | degrees | Thigh forward (negative = back) |
| `kneeL`, `kneeR` | degrees | Knee bend |
| `ankleL`, `ankleR` | `[toes up°, outward roll°]` | Move the foot independently of the calf |
| `lean` | degrees | Upper body forward from the hips (45 = a bow) |
| `tilt` | degrees | Upper body to the person's right (negative = left) |
| `twist` | degrees | Turn the torso to the person's right, keeping the feet facing their spot |
| `neck`, `head` | `[nod forward°, turn right°, tilt right°]` | Independent rotations relative to the parent; neck carries the head with it |
| `turn` | degrees | Turn on the spot, clockwise seen from above; 0 → 360 over a few beats is a twirl |
| `bob` | metres | Rise: a bounce or a hop |
| `move` | `[right, forward]` metres | Step away from the spot, in the person's own frame |
| `face` | a head view | Which face image shows from this key on: `"sleeping"`, `"up"`, `"sleepingLeft"`, `"sleepingRight"`, `"down"` or any other view in `FACE_DEFS` (`character.ts`); `""` goes back to automatic. Without a `face`, a head lying face up shows `up`, face down shows `down`, and standing people pick by camera angle. A person without that image sees the nearest one |
| `face` | head view | Which face image shows from this key on: `"sleeping"`, `"up"`, `"sleepingLeft"`, `"sleepingRight"`, `"down"`, or any view in `FACE_DEFS` (`character.ts`); `""` goes back to automatic. With no `face`, a head lying face up shows `up`, face down shows `down`, and standing people pick by camera angle. A person without that image gets the nearest one |
| `emote` | text | A bubble over the head from this key on (`"♪"`, `"👏"`); `""` clears it |

Left and right are the person's own. Two people facing each other who should move the same way
across the room mirror each other: swap `L` and `R`, and negate `move[0]`, `tilt` and `turn`.
Also negate `twist`, and the turn/tilt components of `neck` and `head`. Outward
forearm, wrist and ankle values already mirror by side: swap L/R without negating them.

The skinned body and the fallback box body both support these joints. Faces are
still image sprites: head turns select a view, tilts roll the image, and nods move
the head anchor and foreshorten the image. This is an approximation of a 3D face.
Idle arm clearance applies only outside an authored pose, so arms can cross the
body in an animation.

For example, these keys raise a hand toward the face while turning the head:

```json
[
  { "beat": 0 },
  { "beat": 1, "armR": [25, 12], "elbowR": 100, "forearmR": 20, "wristR": [10, 0, 15], "head": [8, 15, 0] },
  { "beat": 3, "armR": [25, 12], "elbowR": 100, "forearmR": 20, "wristR": [-10, 0, 15], "head": [8, 15, 0] },
  { "beat": 4 }
]
```

Joint values must be finite numbers with the tuple sizes shown above. The pose
system does not impose angle limits or age/relationship rules. Older files need
no changes: omitted joints use their neutral values at each key.

## Central availability

[../../interactionSettings.ts](../../interactionSettings.ts) owns the settings
store, defaults, age mappings, persistence and view notifications. All actions,
including newly added files, are enabled by default. The special age mapping is:

```ts
export const ACTION_AGE_MAPPING = {
  woohoo: { defaultMinimumAge: 18, choices: [18, 21] },
};
```

The main Settings page has a master switch and, for each action, an enabled
checkbox and an age-group selector. **Action settings** in the world's toolbar
opens that section of the main Settings page. Preferences are saved on the current
device and restored on later visits.

`setInteractionEnabled(id, enabled)` changes an individual switch; use `null` for
the master switch. `setInteractionMinimumAge(id, age)` changes its age mapping,
using the choices declared in the settings store. `0` means any age for actions
that support it. Subscribers update the views immediately.

[../interactionPolicy.ts](../interactionPolicy.ts) evaluates the shared settings
for menus and playback. It has no action-specific defaults; `INTERACTION_POLICY`
is a compatibility alias for the settings store. Age mappings are never embedded
in animation JSON, individual view components or renderers.

Both menus and direct playback consult the same policy. A running activity stops
on the next simulation update if it becomes disabled. Add any future eligibility
decisions to this policy rather than to JSON keyframes or individual renderers.

View wiring: `src/views/SettingsView.tsx` includes `InteractionSettingsCard`;
`src/views/WorldView.tsx` contains `TogetherPanel` (Actions and furniture) and
`PersonMenu`. `src/lib/places/world.ts` checks the policy again when starting and
updating an activity. `WorldScene.tsx` renders the resulting
state and have no participant eligibility logic.

## Adding one

1. Copy the closest file, give it a new `id` and `label`.
2. Keep `move` small (under about 0.3 m): people stay near their spot and don't walk into furniture.
3. For two people, put spots 0.45 m apart to touch (a hug, a slow dance), 0.7 to 1 m to dance
   or high-five.
4. Run the app, open a place, pick **Actions**. A file that doesn't load is named in the
   developer console.

Run `node tools/places/test_animation.mjs` to check interpolation, compatibility,
central availability and the shipped GLB's joint movement without a browser.
