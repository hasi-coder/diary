---
name: generate-face-views
description: Turn one photo of a person into the head views My Diary's Places world uses for a character (front, two 45° three-quarter views, left and right profiles, back, and optional lying-down views for sleeping), in one consistent style, then upload them to that person's profile over the My Diary MCP server (set_person_faces). Use when the user gives a photo of someone in their journal and asks for face views, character faces, or "make them a character" for Places.
---

# Generate face views for a My Diary character

In My Diary's Places world, each person is a body with a flat head image that turns with the
camera. The camera sits on a diagonal and people face eight ways, so a person is seen straight
on, turned 45°, turned 90° or from behind. The head needs **six images of the same person**, plus five optional ones for people lying down:

| View | What it shows | Used when the character… |
|---|---|---|
| `front` | Face straight on | faces the camera |
| `frontLeft` | Turned **45°**, nose toward the **left** of the image (three-quarter view) | is turned one step to the screen's left |
| `frontRight` | Turned **45°**, nose toward the **right** of the image | is turned one step to the screen's right |
| `left` | **90°** profile, nose pointing to the **left** of the image | walks across the screen to the left |
| `right` | **90°** profile, nose pointing to the **right** of the image | walks across the screen to the right |
| `back` | Back of the head, no face | walks away from the camera |
| `up` | Face **looking up** at the ceiling, seen from above, chin toward the bottom of the image | lies on their back (bed, bath), awake |
| `sleeping` | Same as `up` with **eyes closed**, relaxed | sleeps on their back |
| `sleepingLeft` | **90° profile, eyes closed**, nose toward the **left** of the image | sleeps on their side, resting on a pillow |
| `sleepingRight` | **90° profile, eyes closed**, nose toward the **right** of the image | sleeps on their side |
| `down` | Head turned **down**: forehead and crown of the head, face hidden | lies face down or bows |

`frontLeft` and `frontRight` are the views seen most often, but they're optional: without them
the front image stands in. Make them unless the user asks for only the four. The lying-down views
(`up`, `sleeping`, `sleepingLeft`, `sleepingRight`, `down`) are optional too: without them a
sleeper shows `up`, then `front` (or the plain profile, or the back). Make them when the user wants
sleeping or lying-down scenes to look right, or asks for "all views". Animations choose them with
the `face` key (for example `"face": "sleeping"` in sleep.json).

You make them from **one photo** the user gives you, and upload them to the person's profile.

## 1. Inputs

Ask for anything missing:

- **The photo:** a local file path. One person, head and shoulders visible, face not covered.
  If the photo has several people, ask which one.
- **The person:** their name exactly as in My Diary, or the profile id. You cannot list or search
  people in the journal; the user tells you who it is.
- **Style** (default `illustrated`):
  - `illustrated`: soft flat colours, clean outlines, like a children's book. Matches the
    smooth low-poly world best.
  - `realistic`: photo-like, even studio light.
  - `cartoon`: bigger eyes and head, simple shapes.

Never use a photo of someone the user hasn't said is in their journal, and never generate views
of a public figure.

## 2. Generate

Generate the **front view first**, from the photo. Then generate the others **from the front
view plus the original photo**, so they all look like one person: same hair, skin tone, age,
glasses, beard and earrings.

**With Codex:** use your built-in image generation, attaching the photo (and, for the other
views, the front view you made) as reference images.

**Without built-in image generation:** use the bundled script. It calls the OpenAI Images API
(`gpt-image-1`, edit mode) with `OPENAI_API_KEY` from the environment:

```bash
python3 scripts/generate_view.py --view front --style illustrated \
    --ref /path/photo.jpg --out ~/MyDiaryFaces/<name>/front.png
python3 scripts/generate_view.py --view left --style illustrated \
    --ref ~/MyDiaryFaces/<name>/front.png --ref /path/photo.jpg --out ~/MyDiaryFaces/<name>/left.png
# …the same for frontLeft, frontRight, right and back, and (optionally) up, sleeping,
# sleepingLeft, sleepingRight and down
```

If neither is available, stop and tell the user. Don't draw faces by hand.

Use this prompt for each view, filling in `<view line>` and `<style line>`. The script builds the
same prompt.

> Portrait of the same person as in the reference image, head and top of the shoulders only,
> centred, the head filling about 70% of the height. `<view line>` `<style line>` Plain
> transparent background (or flat white if transparency isn't possible). Even, soft light from
> the front, no strong shadows. No text, no frame, no hands, no accessories that aren't in the
> reference. Keep the person's age, skin tone, hairstyle, hair colour, facial hair, glasses and
> earrings exactly as in the reference.

View lines:

- **front:** "Looking straight at the viewer, face fully visible, neutral friendly expression."
- **frontLeft:** "Three-quarter view: the person has turned 45 degrees so their nose points toward the LEFT edge of the image; both eyes visible, the far eye partly hidden by the nose bridge; not a full profile, not straight on."
- **frontRight:** "Three-quarter view: the person has turned 45 degrees so their nose points toward the RIGHT edge of the image; both eyes visible, the far eye partly hidden by the nose bridge; not a full profile, not straight on."
- **left:** "Exact side profile: the person has turned so their nose points to the LEFT edge of
  the image; only one eye visible."
- **right:** "Exact side profile: the person has turned so their nose points to the RIGHT edge of
  the image; only one eye visible."
- **back:** "Seen from directly behind: the back of the head and hair only, no face, no ears'
  front, same hairstyle and colour."
- **up:** "The person is lying on their back and looking up at the viewer, who is above them: face fully visible, chin toward the bottom of the image, eyes open, relaxed expression."
- **sleeping:** "The person is lying on their back, seen from above: face fully visible, chin toward the bottom of the image, eyes gently closed, completely relaxed, peaceful sleeping expression."
- **sleepingLeft:** "Exact side profile of a sleeping person: nose points to the LEFT edge of the image, one eye visible and gently closed, relaxed peaceful expression."
- **sleepingRight:** "Exact side profile of a sleeping person: nose points to the RIGHT edge of the image, one eye visible and gently closed, relaxed peaceful expression."
- **down:** "The person's head is bowed face-down, seen from above and slightly behind: the forehead and crown of the head with hair, the face hidden, same hairstyle and colour."

Style lines:

- **illustrated:** "Soft flat-colour illustration with clean thin outlines, gentle shading."
- **realistic:** "Photorealistic, neutral studio portrait."
- **cartoon:** "Friendly cartoon style, slightly larger head and eyes, simple shapes."

## 3. Check before uploading

Look at all the images together. Regenerate any view that fails:

- [ ] Same person in all of them: hair, skin tone, age, facial hair, glasses.
- [ ] `left` nose points left; `right` nose points right. Swapped profiles are the most common
      mistake. Don't mirror one profile to make the other if the person has a parting, a scar
      or anything else that isn't symmetric.
- [ ] `frontLeft` and `frontRight` are about **45°**: both eyes visible, the far one partly
      behind the nose. A full profile or a straight-on face there is wrong; so is a turn the
      other way from its name.
- [ ] `left` and `right` are **90°**: only one eye visible.
- [ ] `back` shows no face.
- [ ] `sleeping`, `sleepingLeft` and `sleepingRight` have closed eyes; `up` has open eyes; `down` shows no face.
- [ ] Head centred, similar size in all of them, nothing cropped off the top.
- [ ] Plain background, no text or watermark.

Then make them square 512 × 512 PNGs:

```bash
bash scripts/prepare_faces.sh ~/MyDiaryFaces/<name>
```

It resizes and pads the views in place (macOS `sips`): `front.png`, `left.png`, `right.png` and
`back.png` must be there; the optional `frontLeft`, `frontRight`, `up`, `sleeping`, `sleepingLeft`, `sleepingRight` and `down` PNGs are done when present.

## 4. Upload to My Diary

Connect to the My Diary MCP server as the `publish-to-my-diary` skill describes (MCP tools, or
its `scripts/mcp_call.py` with the token file). Unlock and **Agent access** must be on.

Call `set_person_faces` with the person's id and the images as base64:

```bash
python3 ../publish-to-my-diary/scripts/mcp_call.py set_person_faces "$(python3 - <<'EOF'
import base64, json, os, sys
d = os.path.expanduser("~/MyDiaryFaces/<name>")
args = {"name": "<person name>"}
for v in ("front", "frontLeft", "frontRight", "left", "right", "back", "up", "sleeping", "sleepingLeft", "sleepingRight", "down"):
    if os.path.exists(f"{d}/{v}.png"):
        args[v] = {"base64": base64.b64encode(open(f"{d}/{v}.png", "rb").read()).decode(), "fileName": f"{v}.png"}
print(json.dumps(args))
EOF
)"
```

- **The person isn't in My Diary yet:** add them with `create_person` (name, relationship, birthday, terms, and an `avatar` / `cover` photo), passing the views as its `faces` object in the same call, or add them first and then call `set_person_faces`. `update_person` changes details or replaces photos later.
- **`set_person_faces` isn't in the tool list:** that My Diary build is older than Places. Leave
  the PNGs in `~/MyDiaryFaces/<name>/` and tell the user to add them under the person's
  profile › About › Character › Face views.
- **"No person named …":** ask the user for the exact name or the profile id. Don't guess.
- Other errors (`locked`, `Agent access is turned off`, `Invalid token`): see the
  `publish-to-my-diary` skill.

## 5. Report back

Name the person, the style, where the PNGs are saved, and whether they were uploaded. Mention any
view you had to regenerate.

## Rules

- Only people the user names, from photos the user gives you.
- The photo and the generated images are private. Don't upload them anywhere except My Diary and
  the image generator the user's setup already uses.
- Never echo or store the My Diary token or the OpenAI key.
