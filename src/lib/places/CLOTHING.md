# Layered clothing

The everyday catalogue has **180 choices**: ten distinct categories in each of six
layers for feminine, masculine and neutral style collections. The eight original
garment ids remain valid. Style collections are only a browsing filter, and the dressing room opens on
"All": every garment is offered to every body (trans women and men, non-binary
people, any age or shape), and nothing in rendering, saving or the MCP tools checks
figure, shape or age against a garment.

The Sri Lankan collection adds **nine independently editable pieces** and four
complete outfit presets alongside the everyday catalogue.

| Layer | Pieces that can coexist |
|---|---|
| Underwear | Foundation top, camisole or vest, briefs, thermal leggings or petticoat |
| Base | Top plus bottom, or dress/tunic |
| Mid | Cardigan/knitwear plus warm lower layers |
| Outer | Jacket plus outer trousers, or a coat |
| Footwear | Socks plus shoes |
| Accessories | Tie/bow, scarf, belt/sash/suspenders, wristwear |

Open the profile's **Character → Change clothes** button to enter the popup
dressing room. A layer chip opens that layer directly. Click a wardrobe card or
drag it onto the avatar to try it on. Choose a style collection, search for a
piece, or start from an outfit preset. Each piece has colour controls, extra fit
clearance and a hem/sleeve length adjustment.

The large fitting preview supports front/back/side views, drag-to-turn, zoom,
upper/lower-body framing and optional spin. **Inspect this layer** previews the
chosen layer and underwear without removing any saved outfit pieces. Undo, Redo
and Start over work inside the popup. Cancel, Escape and the backdrop discard
the try-on session. **Apply outfit** updates the Character card's draft; **Save
character** persists it with the rest of the character settings.

Changing a piece preserves other layers. A dress replaces conflicting
top/bottom pieces on its own layer. Outfit presets can keep the current underwear.
The bottom layer is the bare body: nothing is added automatically, and removing
a piece reveals the layer beneath it (finally, skin). Only characters saved before
`wearing` existed start with underwear under their old top and bottom colours.

## Data and compatibility

- `clothingTypes.ts` defines layers, slots, regions and geometry recipes.
- `clothingCatalog.ts` defines ten cuts per layer/style, with stable garment ids.
- `sriLankanClothing.ts` adds the regional garments without replacing existing cuts.
- `garments.ts` resolves legacy ids, replaces same-layer clashes, orders layers,
  preserves underwear, and derives legacy `top`, `bottom` and `skirt` fields.
- `outfits/*.json` combine many garments into complete outfits.
- `components/ClothingEditor.tsx` opens the popup and its individual layers.
- `components/DressingRoom.tsx` provides the try-on session and fitting preview.
- `clothingFit.ts` normalizes optional per-piece fit and updates worn pieces.

Profiles store `wearing: [{ garment, color, fit? }]`; existing journal data needs
no database migration. No gender, age or action eligibility rules are defined in
clothing rendering. Action eligibility continues to use the central Settings
mapping.

`fit.ease` is extra clearance in metres (0–0.04); `fit.length` is a cut multiplier
(0.75–1.25). Default values are omitted. Changing colours preserves a piece's fit,
as do underwear retention and saved-profile round trips. Resetting a fit restores
the original geometry and coverage. These adjustments refine the procedural cut;
they do not perform cloth simulation or guarantee perfect tailoring in every pose.

Each garment declares a layer, a sub-layer depth, occupied body regions, style
collections and a recipe. Conflicts are limited to the same slot or overlapping
regions at the same depth. A bra and a camisole have separate depths. Socks sit
below trousers; shoes sit above socks. Warm leggings fit beneath base skirts.

## Rendering

`components/world/clothingGeometry.ts` generates garments only when they are
worn. It reuses the shipped body's skin weights and morph targets. The recipes
produce fitted tops, sleeve and neckline cuts, shorts/trousers, flared/pleated
skirts, multi-piece dresses and coats, socks, shoe cuts and boots. Shirt collars,
buttons, pockets, waistbands, ties, scarves, belts and wristwear are separate
rigged geometry pieces.

Opaque garments mask only covered triangles of lower layers. This preserves a
shirt through an open jacket, longer sleeves under a vest and exposed socks above
a shoe. Body-derived shells use their actual triangle coverage, and skin beneath
cut edges stays visible to close gaps under raised hems. Coverage is computed in the neutral pose, so masks do not jump while
walking or animating. Layer offsets and polygon offsets reduce flicker. Garment
meshes and their original indices are cached per figure; removing a layer restores
the lower garment's original triangles.

Fit changes rebuild only the affected garment and update its coverage. The fitting
preview reuses the existing figure for clothing changes; body/face changes still
rebuild skin binding. Legacy template garments also accept the fit controls.

These are procedural low-poly cuts on the existing rig, not 180 separately
tailored cloth-simulation assets. Complex drape and tailoring remain approximate.
The temporary box-body fallback simplifies the clothing silhouette while the GLB
loads.

## Sri Lankan school uniforms

The presets include a white pleated frock, white shirt with blue shorts, white
shirt with white trousers, and a white-shorts variant. Generic blouse/pleated-skirt
and navy-trousers presets remain available. Shirts have collars, buttons and
pockets; frocks have a bodice, pleated skirt and waistband. Underwear, socks,
shoes and optional belts/ties remain independent pieces.

Uniforms vary by school. The configurable variants follow examples in published
school guidance rather than claiming one universal uniform:

- [S. Thomas' Preparatory School](https://stps.edu.lk/about/general-rules/): white short-sleeve shirt and blue shorts.
- [St. Lawrence's Convent](https://www.slcw.edu.lk/about-school/rules-regulations): white frock with box pleats.
- [Maliyadeva College](https://www.maliyadeva.edu.lk/about/college-uniform): white shirt, white longs or primary-school shorts.
- [Sri Sumangala Balika Vidyalaya](https://www.sumangalabalika.sch.lk/index.php/about-school/identity): white dress, tie, socks and shoes.

No school crest or logo is invented. Colours and accessories can be adjusted to
the particular school's requirements.

## Sri Lankan outfits

Choose **Character → Change clothes → Try a complete outfit** and select one of:

- **Sri Lankan · Saree**: cropped blouse, long pleated wrap, shoulder pallu and gold borders.
- **Sri Lankan · Kandyan osariya**: fuller puff-sleeve blouse, shoulder drape and a pleated neriya waist frill.
- **Sri Lankan · Redda and hatte**: light blouse and a long overlapping wrap skirt with a woven border.
- **Sri Lankan · Salwar kameez**: long tunic, separate trousers and an independently coloured dupatta shawl.

Search for “Sri Lanka”, “saree”, “osariya”, “redda”, “hatte”, “salwar”, “kameez” or
“dupatta” to select individual pieces. Blouses, wraps, trousers and shawls keep
their own colours and fit controls. The saree and osariya presets include a
petticoat; the existing Keep underwear option works with these presets too.

Shoulder panels follow the torso surface, skin weights and body morphs. The
osariya frill, front pleats, wrap overlap and hem/pallu borders are actual mesh
pieces. They approximate draped fabric on the existing rig; there is no cloth
simulation, so deep bends and wide leg poses can still intersect the fabric.

Long wraps use measured waist/hip profiles for their morphs, with a resolved fan
of front pleats and a level hem. The blouse uses a curved neckline that retains
the shoulder seam. The fitting-pose checks cover both feminine and masculine
body shapes. Wardrobe cards use larger, garment-specific SVG illustrations,
including distinct saree, osariya, shawl, underwear, footwear and accessory cuts.

The silhouettes follow the sari, osariya, redde/hatte and salwar kameez described
in the [Sri Lanka culture guide, section 9](https://www.govinfo.gov/content/pkg/GOVPUB-D301-PURL-gpo91821/pdf/GOVPUB-D301-PURL-gpo91821.pdf).
They are configurable outfit examples rather than one universal Sri Lankan dress.

## Extending and checking

Add a catalogue choice with a unique category/id, a slot, occupied regions and a
recipe. Add an outfit JSON to combine it with other layers. The same geometry
pipeline handles every body shape; collections do not fork the skeleton.

Run `npm run test:animation` for catalogue counts, unique ids, every garment's
generated mesh/morphs, preset compatibility, partial occlusion, restoration,
underwear retention, socks/shoes and animation regressions. Run `npm run build`
for the production typecheck and frontend build.

Run `npm run test:clothing` for regional outfit compatibility, independent pieces,
underwear retention and the drapes' geometry, skin weights and morphs.
