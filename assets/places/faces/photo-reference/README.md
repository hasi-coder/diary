# Character face reference

Generated from the user-provided portrait with the built-in image generator.
Style: softly shaded illustration, following `.claude/skills/generate-face-views/SKILL.md`.

Four transparent 512 × 512 PNGs for the Places character head:

- `front.png`: straight-on face; style and identity master.
- `left.png`: nose points toward the image's left edge.
- `right.png`: nose points toward the image's right edge.
- `back.png`: back of head; no face visible.

The original photograph anchored the front view. Both the photograph and the generated front view were supplied as references for the other views. Side and back details absent from the photograph are generated approximations. Files were prepared with the skill's `prepare_faces.sh`. Saved locally; no journal profile was updated.

## Prompts

### front

```text
Use case: stylized-concept.
Asset type: My Diary Places character head reference, FRONT view, square PNG.
Input image: the user's attached portrait is the identity reference. Generate only this person.
Portrait of the same person as in the reference image, head and very top of the shoulders only, centred, the full head from top of hair to chin filling about 70% of image height. Looking straight at the viewer, face fully visible, neutral friendly closed-mouth expression. Soft flat-colour illustration with clean thin outlines and gentle shading, accurate adult proportions rather than chibi or exaggerated cartoon. Preserve the person's age, warm medium-brown skin tone, rounded face and jaw, broad nose, dark brown eyes, thick dark eyebrows, short dense curly black hair with subtle grey strands, hairline and subtle facial stubble exactly as in the photo. No glasses, no earrings. The hair silhouette must remain fully visible with generous clear margin above and to both sides. Small neck and only a hint of the original white shirt collar at bottom; no chest or tie. Real transparent background with no drop shadow. Even soft front light. No text, no frame, no watermark, no hands or new accessories. Produce a single isolated head, not a sheet.
```

### left

```text
Use case: stylized-concept.
Asset type: My Diary Places character head reference, LEFT view, square transparent PNG.
Input images: original user portrait is the identity reference; the generated front-view illustration is the exact style, identity, palette and head-scale master. Generate another view of THAT SAME adult person in THAT SAME gently illustrated rendering style.
Exact LEFT-facing side profile: nose points to the LEFT edge of the image, only one eye visible. Anatomically this shows the person's right side. Head upright and level, no three-quarter angle.
Portrait of head and tiny top of shoulders only, centred, full head from top of hair to chin filling about 70% of image height. Match the master front image's adult proportions, rounded face and jaw, warm medium-brown skin, broad nose, dark brown eye, dark eyebrows, short dense curly black hair with subtle grey strands, modest sideburns, subtle facial stubble, and small white shirt collar. Same apparent age and facial structure. Keep the same softly rendered illustrated style, clean thin contours and gentle shading; no change to a different cartoon or photographic style. Neutral closed mouth where visible. Hair silhouette completely within frame, generous clear margin. Very small neck and a hint of original white shirt collar at bottom, no chest or tie. Actual transparent background with no cast shadow, even soft light. Single head only. No text, labels, grids, frame, hands, watermark, glasses, earrings or invented accessories. Do not mirror another view; generate this orientation using the original photo and master front.
```

### right

```text
Use case: stylized-concept.
Asset type: My Diary Places character head reference, RIGHT view, square transparent PNG.
Input images: original user portrait is the identity reference; the generated front-view illustration is the exact style, identity, palette and head-scale master. Generate another view of THAT SAME adult person in THAT SAME gently illustrated rendering style.
Exact RIGHT-facing side profile: nose points to the RIGHT edge of the image, only one eye visible. Anatomically this shows the person's left side. Head upright and level, no three-quarter angle.
Portrait of head and tiny top of shoulders only, centred, full head from top of hair to chin filling about 70% of image height. Match the master front image's adult proportions, rounded face and jaw, warm medium-brown skin, broad nose, dark brown eye, dark eyebrows, short dense curly black hair with subtle grey strands, modest sideburns, subtle facial stubble, and small white shirt collar. Same apparent age and facial structure. Keep the same softly rendered illustrated style, clean thin contours and gentle shading; no change to a different cartoon or photographic style. Neutral closed mouth where visible. Hair silhouette completely within frame, generous clear margin. Very small neck and a hint of original white shirt collar at bottom, no chest or tie. Actual transparent background with no cast shadow, even soft light. Single head only. No text, labels, grids, frame, hands, watermark, glasses, earrings or invented accessories. Do not mirror another view; generate this orientation using the original photo and master front.
```

### back

```text
Use case: stylized-concept.
Asset type: My Diary Places character head reference, BACK view, square transparent PNG.
Input images: original user portrait is the identity reference; the generated front-view illustration is the exact style, identity, palette and head-scale master. Generate another view of THAT SAME adult person in THAT SAME gently illustrated rendering style.
Seen directly from BEHIND: back of head, curly hair and nape only, absolutely no face, nose, eyes, or cheek. Match the same short dense curly hairstyle and natural hairline. Both ears may be seen symmetrically from behind.
Portrait of head and tiny top of shoulders only, centred, full head from top of hair to chin filling about 70% of image height. Match the master front image's adult proportions, rounded face and jaw, warm medium-brown skin, broad nose, dark brown eye, dark eyebrows, short dense curly black hair with subtle grey strands, modest sideburns, subtle facial stubble, and small white shirt collar. Same apparent age and facial structure. Keep the same softly rendered illustrated style, clean thin contours and gentle shading; no change to a different cartoon or photographic style. Neutral closed mouth where visible. Hair silhouette completely within frame, generous clear margin. Very small neck and a hint of original white shirt collar at bottom, no chest or tie. Actual transparent background with no cast shadow, even soft light. Single head only. No text, labels, grids, frame, hands, watermark, glasses, earrings or invented accessories. Do not mirror another view; generate this orientation using the original photo and master front.
```

