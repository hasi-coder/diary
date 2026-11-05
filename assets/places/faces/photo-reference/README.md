# Character face reference

Updated 2026-11-05 with the built-in image generator, following `.claude/skills/generate-face-views/SKILL.md` and matching every current `FaceView` in `src/lib/places/character.ts`.

Style: softly shaded illustration matching the previously generated portrait. Every sprite contains only the head and a short bare neck: no shirt collar, clothes, shoulders, or chest. All eleven files are transparent 512 × 512 RGBA PNGs.

| File | Pose |
|---|---|
| `front.png` | Straight-on face, eyes open; identity and style master |
| `frontLeft.png` | 45° turn, nose to image left, both eyes visible |
| `frontRight.png` | 45° turn, nose to image right, both eyes visible |
| `left.png` | 90° profile, nose to image left, eye open |
| `right.png` | 90° profile, nose to image right, eye open |
| `back.png` | Back of head and bare nape, no face |
| `up.png` | Lying face up, eyes open, chin toward image bottom |
| `sleeping.png` | Lying face up, both eyes closed |
| `sleepingLeft.png` | Left-facing sleeping profile, eye closed |
| `sleepingRight.png` | Right-facing sleeping profile, eye closed |
| `down.png` | Bowed face-down head, crown visible, face hidden |

The original user photograph anchored the previous illustrated set. This revision edited that set's front view to remove the collar, then used the new front as the identity/style master for every other pose. Previous side and back illustrations supplied additional head-shape references where applicable, with instructions to omit their clothing. Details not visible in the original photograph remain generated approximations. No profiles were uploaded or changed.

Prepared with the skill's `prepare_faces.sh`; visually checked directions, eye states, collar removal, and framing. Verified exact coverage of the current `FaceView` union, 512 × 512 dimensions, RGBA mode, and alpha range 0–255 for every image.

## Exact generation prompts

### front

```text
Use case: identity-preserve.
Edit target: the attached illustrated front-view character head. Create its collar-free replacement for a game sprite.
Keep the exact same person, face shape, apparent age, warm medium-brown skin tone, dark brown eyes, broad nose, closed neutral mouth, subtle stubble, thick eyebrows, short curly black hair with fine grey strands and the same softly shaded illustration style. Change only the lower edge: REMOVE THE ENTIRE WHITE SHIRT COLLAR, every white fabric fragment and any coloured outline or stray background pixels. The sprite must contain ONLY a complete head and a very short natural bare neck, ending smoothly just below the chin. No shoulders, chest, clothes, collar, shirt, tie or accessories. Center the full head in a square canvas, top of hair to chin about 76% of image height, with transparent margin on all sides and below the short neck. Head straight, looking directly at viewer, both eyes open, level gaze. Real transparent background, clean silhouette, no shadow, text, frame or watermark. Preserve identity and illustration detail rather than inventing a different face.
```

### frontLeft

```text
Use case: identity-preserve.
Asset type: My Diary Places character frontLeft head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. 
Required pose: Head turned 45 degrees toward the LEFT edge of the image. Three-quarter view: BOTH eyes visible, far eye partly occluded by bridge of nose. Neutral closed mouth and eyes open. Not a full 90-degree profile.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### frontRight

```text
Use case: identity-preserve.
Asset type: My Diary Places character frontRight head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. 
Required pose: Head turned 45 degrees toward the RIGHT edge of the image. Three-quarter view: BOTH eyes visible, far eye partly occluded by bridge of nose. Neutral closed mouth and eyes open. Not a full 90-degree profile.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### left

```text
Use case: identity-preserve.
Asset type: My Diary Places character left head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. Reference image 2 supplies additional head-shape information only; ignore and remove ALL clothing in it.
Required pose: Exact 90-degree side profile, nose points to LEFT edge of image, one eye visible and open. Same profile anatomy as the additional side-view reference, but remove its entire white collar and any fabric. Head upright, neutral mouth.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### right

```text
Use case: identity-preserve.
Asset type: My Diary Places character right head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. Reference image 2 supplies additional head-shape information only; ignore and remove ALL clothing in it.
Required pose: Exact 90-degree side profile, nose points to RIGHT edge of image, one eye visible and open. Same profile anatomy as the additional side-view reference, but remove its entire white collar and any fabric. Head upright, neutral mouth.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### back

```text
Use case: identity-preserve.
Asset type: My Diary Places character back head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. Reference image 2 supplies additional head-shape information only; ignore and remove ALL clothing in it.
Required pose: Seen directly from behind, back of head with same dense short curly black and subtly grey hair, ears symmetrically viewed from behind and small bare nape. Absolutely no face, nose or eyes. Match additional back-view reference but remove its white collar entirely.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### up

```text
Use case: identity-preserve.
Asset type: My Diary Places character up head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. 
Required pose: The person is lying flat on their back and looking up at the viewer, whose camera is directly overhead. Face fully visible, relaxed eyes OPEN, chin toward the BOTTOM of image, top of curly hair toward TOP. Head naturally reclined with subtly relaxed cheeks. A bare isolated head, not a scene. No bed or pillow.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### sleeping

```text
Use case: identity-preserve.
Asset type: My Diary Places character sleeping head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. 
Required pose: The person is asleep lying flat on their back, seen directly from above. Face fully visible, BOTH EYES GENTLY CLOSED, relaxed brow and lips, peaceful resting expression. Chin toward BOTTOM and curly hair toward TOP. No bed or pillow; isolated head only.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### sleepingLeft

```text
Use case: identity-preserve.
Asset type: My Diary Places character sleepingLeft head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. Reference image 2 supplies additional head-shape information only; ignore and remove ALL clothing in it.
Required pose: Exact 90-degree LEFT-facing profile of the same person sleeping on their side. Nose points toward LEFT edge of image. Visible eye GENTLY CLOSED, brow and mouth relaxed, peaceful expression. Match side-view reference anatomy with collar completely removed. Head upright within canvas; no bed or pillow.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### sleepingRight

```text
Use case: identity-preserve.
Asset type: My Diary Places character sleepingRight head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. Reference image 2 supplies additional head-shape information only; ignore and remove ALL clothing in it.
Required pose: Exact 90-degree RIGHT-facing profile of the same person sleeping on their side. Nose points toward RIGHT edge of image. Visible eye GENTLY CLOSED, brow and mouth relaxed, peaceful expression. Match side-view reference anatomy with collar completely removed. Head upright within canvas; no bed or pillow.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

### down

```text
Use case: identity-preserve.
Asset type: My Diary Places character down head sprite, single isolated head on a square transparent canvas.
Reference image 1 is the collar-free front-view master: match this exact person's identity and softly shaded illustrated style. Reference image 2 supplies additional head-shape information only; ignore and remove ALL clothing in it.
Required pose: Head bowed fully FACE-DOWN, seen from above and slightly behind: crown, top and back of curly head dominate; at most tiny forehead strip, entire face hidden, NO visible eyes, nose or mouth. Hair whorl visible on crown. Same hairstyle and silhouette as master and additional back reference. Isolated head only, no body or bed.
Preserve the master's apparent age, rounded face and jaw, warm medium-brown skin tone, broad nose, dark brown eyes when open, thick eyebrows, short dense curly black hair with fine subtle grey strands, modest sideburns and subtle facial stubble. Keep realistic adult proportions, same gentle illustrated detail and even soft light. No chibi or exaggerated eyes. Show ONLY complete head and VERY SHORT BARE NECK, ending smoothly just below jaw or nape. NO SHIRT COLLAR, clothing, white fabric, shoulders, chest, body, accessories, bedding, pillow or objects. Full hair silhouette must be inside frame, head centered and upright in image, hair-to-chin roughly 76% of image height, generous transparent margins. Genuine alpha transparency, clean silhouette with no stray pixels or colour fringes, no cast shadow. No text, labels, frame or watermark. Single pose, not a sheet.
```

