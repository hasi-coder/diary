---
name: generate-face-views
description: Turn one photo of a person into the four head views My Diary's Places world uses for a character (front, left, right, back), in one consistent style, then upload them to that person's profile over the My Diary MCP server (set_person_faces). Use when the user gives a photo of someone in their journal and asks for face views, character faces, or "make them a character" for Places.
---

# Generate face views for a My Diary character

In My Diary's Places world, each person is a small low-poly body with a flat head image that
turns with the camera. The head needs **four images of the same person**:

| View | What it shows | Used when the character… |
|---|---|---|
| `front` | Face straight on | faces the camera |
| `left` | Profile, nose pointing to the **left** of the image | walks toward the lower-left of the screen |
| `right` | Profile, nose pointing to the **right** of the image | walks toward the lower-right of the screen |
| `back` | Back of the head, no face | walks away from the camera |

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

Generate the **front view first**, from the photo. Then generate the other three **from the front
view plus the original photo**, so the four look like one person: same hair, skin tone, age,
glasses, beard and earrings.

**With Codex:** use your built-in image generation, attaching the photo (and, for views 2–4, the
front view you made) as reference images.

**Without built-in image generation:** use the bundled script. It calls the OpenAI Images API
(`gpt-image-1`, edit mode) with `OPENAI_API_KEY` from the environment:

```bash
python3 scripts/generate_view.py --view front --style illustrated \
    --ref /path/photo.jpg --out ~/MyDiaryFaces/<name>/front.png
python3 scripts/generate_view.py --view left --style illustrated \
    --ref ~/MyDiaryFaces/<name>/front.png --ref /path/photo.jpg --out ~/MyDiaryFaces/<name>/left.png
# …the same for right and back
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
- **left:** "Exact side profile: the person has turned so their nose points to the LEFT edge of
  the image; only one eye visible."
- **right:** "Exact side profile: the person has turned so their nose points to the RIGHT edge of
  the image; only one eye visible."
- **back:** "Seen from directly behind: the back of the head and hair only, no face, no ears'
  front, same hairstyle and colour."

Style lines:

- **illustrated:** "Soft flat-colour illustration with clean thin outlines, gentle shading."
- **realistic:** "Photorealistic, neutral studio portrait."
- **cartoon:** "Friendly cartoon style, slightly larger head and eyes, simple shapes."

## 3. Check before uploading

Look at all four images together. Regenerate any view that fails:

- [ ] Same person in all four: hair, skin tone, age, facial hair, glasses.
- [ ] `left` nose points left; `right` nose points right. Swapped profiles are the most common
      mistake. Don't mirror one profile to make the other if the person has a parting, a scar
      or anything else that isn't symmetric.
- [ ] `back` shows no face.
- [ ] Head centred, similar size in all four, nothing cropped off the top.
- [ ] Plain background, no text or watermark.

Then make them square 512 × 512 PNGs:

```bash
bash scripts/prepare_faces.sh ~/MyDiaryFaces/<name>
```

It resizes and pads `front.png`, `left.png`, `right.png` and `back.png` in place (macOS `sips`),
and fails if any of the four is missing.

## 4. Upload to My Diary

Connect to the My Diary MCP server as the `publish-to-my-diary` skill describes (MCP tools, or
its `scripts/mcp_call.py` with the token file). Unlock and **Agent access** must be on.

Call `set_person_faces` with the person's id and the four images as base64:

```bash
python3 ../publish-to-my-diary/scripts/mcp_call.py set_person_faces "$(python3 - <<'EOF'
import base64, json, os, sys
d = os.path.expanduser("~/MyDiaryFaces/<name>")
args = {"name": "<person name>"}
for v in ("front", "left", "right", "back"):
    args[v] = {"base64": base64.b64encode(open(f"{d}/{v}.png", "rb").read()).decode(), "fileName": f"{v}.png"}
print(json.dumps(args))
EOF
)"
```

- **`set_person_faces` isn't in the tool list:** that My Diary build is older than Places. Leave
  the four PNGs in `~/MyDiaryFaces/<name>/` and tell the user to add them under the person's
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
