# Interactions

Things people do together in the Places world: dance, hug, high-five, cheer. Every `*.json` file
in this folder is one interaction; the app loads them all (`index.ts`), skipping (with a console
warning) any that don't pass `interactionProblems` in [../interaction.ts](../interaction.ts).

In the world, **Together** lists them for the people you pick (you always take part), and a
person's menu offers the two-person ones. People walk to an open space near you, play the
keyframes, and stop when it ends, or when you walk away or press Stop.

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
| `people` | How many can take part, the person who starts it included |
| `beat` | Seconds per beat; keyframes are placed in beats |
| `length` | Beats in one round |
| `loop` | Repeat until stopped; otherwise it ends after one round |
| `stagger` | Beats between one person and the next (a wave running round a group) |
| `formation` | Where everyone stands, below |
| `roles` | Keyframes per role, in beat order |

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
| `legL`, `legR` | degrees | Thigh forward (negative = back) |
| `kneeL`, `kneeR` | degrees | Knee bend |
| `lean` | degrees | Upper body forward from the hips (45 = a bow) |
| `tilt` | degrees | Upper body to the person's right (negative = left) |
| `turn` | degrees | Turn on the spot, clockwise seen from above; 0 → 360 over a few beats is a twirl |
| `bob` | metres | Rise: a bounce or a hop |
| `move` | `[right, forward]` metres | Step away from the spot, in the person's own frame |
| `emote` | text | A bubble over the head from this key on (`"♪"`, `"👏"`); `""` clears it |

Left and right are the person's own. Two people facing each other who should move the same way
across the room mirror each other: swap `L` and `R`, and negate `move[0]`, `tilt` and `turn`.

## Adding one

1. Copy the closest file, give it a new `id` and `label`.
2. Keep `move` small (under about 0.3 m): people stay near their spot and don't walk into furniture.
3. For two people, put spots 0.45 m apart to touch (a hug, a slow dance), 0.7 to 1 m to dance
   or high-five.
4. Run the app, open a place, pick **Together**. A file that doesn't load is named in the
   developer console.
