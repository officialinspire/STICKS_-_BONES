# Asset audit and runtime plan

Audit date: 2026-11-15. Source of truth for numbers: [`src/assets/manifest.ts`](../src/assets/manifest.ts).
Every number below was **measured from the files**, not taken from filenames or
assumptions. `npm run assets:verify` re-measures each file and fails if any byte
count, SHA-256, dimension, alpha flag or frame rectangle drifts, if an image under
`assets/` isn't registered, or if art turns up uncatalogued at the repository root.

## What was supplied

- **18 PNG images** were uploaded to the repository root (commits `fa2bf37`, `dcb5ec6`).
  They now live in `assets/art/<category>/` under their **original filenames**,
  moved with `git mv`, so content is byte-identical and the SHA-256 is unchanged.
  The original root README already pointed to `assets/art/`.
- **No video** and **no audio** were supplied. Music will come later from the owner.
- **No rules documents** were supplied (see `docs/RULES.md` → Sources).
- No source file has been edited, re-encoded, resized or cropped. Any derivative,
  such as WebP backgrounds or cut-out portraits, must be a **new file with its own
  manifest entry** that names its source.

### Status meanings

- **runtime**: bundled by Vite through `src/assets/urls.ts` and used now.
- **variant**: kept for a later stage. Not bundled yet.
- **reference**: opaque-background turnaround sheet. Not usable at runtime as-is.
- **duplicate**: byte-identical copy. Preserved, never bundled.

## Inventory

| Asset id | Status | File (under `assets/art/`) | Bytes | Pixels | Mode | SHA-256 |
| --- | --- | --- | ---: | --- | --- | --- |
| `cousin.atlas.portrait` | runtime | `characters/Eight-expression transparent portrait atlas-2.png` | 1,532,373 | 1254×1254 | RGBA | `9d557d503e10…` |
| `cousin.atlas.large` | variant | `characters/Roberto’s Eight-Expression Character Atlas.png` | 2,060,957 | 1254×1254 | RGBA | `1c47eb672777…` |
| `cousin.atlas.large.copy` | duplicate | `characters/Roberto’s Eight-Expression Character Atlas-1.png` | 2,060,957 | 1254×1254 | RGBA | `1c47eb672777…` |
| `cousin.anim.place` | variant | `characters/Six-Frame Domino Gesture Sequence.png` | 1,249,710 | 2172×724 | RGBA | `2d8262a10d21…` |
| `cousin.anim.slam` | variant | `characters/Confident six-frame domino slam.png` | 1,783,741 | 2172×724 | RGBA | `dd4c4aef83d3…` |
| `cousin.ref.host` | reference | `characters/Cousin_ Puerto Rican Dominoes Host.png` | 2,289,954 | 1536×1024 | RGB | `d9e780d4a48f…` |
| `cousin.ref.silhouette` | reference | `characters/Character sheet with charcoal seated silhouette.png` | 2,094,181 | 1536×1024 | RGB | `dd0066d55131…` |
| `tile.materials` | variant (atlas source) | `tiles/Four pristine domino material sprites.png` | 1,484,710 | 1774×887 | RGBA | `02e9201095d2…` |
| `tile.atlas` | runtime (generated) | `../generated/tiles/double-six-atlas.png` | 652,285 | 624×1000 | RGBA | `a65ce0df6ebb…` |
| `fx.sheet` | variant | `effects/Eight polished dominoes effect sprites.png` | 649,575 | 1774×887 | RGBA | `e657fe72c78f…` |
| `table.weathered` | runtime | `tables/Weathered Caribbean game tabletop.png` | 2,938,960 | 1536×1024 | RGBA | `5a5bd2e50c6a…` |
| `table.worn` | variant | `tables/Worn wood tabletop with cream-teal border.png` | 1,583,657 | 1254×1254 | RGBA | `aabc8b425498…` |
| `env.neighborhood-patio` | runtime | `environments/Shaded Puerto Rican Neighborhood Patio.png` | 2,754,726 | 1672×941 | RGB | `31966bdf144a…` |
| `env.back-alley` | variant | `environments/Sunlit San Juan Back Alley.png` | 2,832,333 | 1672×941 | RGB | `c7d502f6a0a1…` |
| `env.resort-patio` | variant | `environments/Puerto Rico Resort Patio by the Sea.png` | 2,924,393 | 1672×941 | RGB | `4bc5873a1033…` |
| `env.executive-terrace` | variant | `environments/Sleek Puerto Rican Executive Resort Terrace.png` | 2,576,870 | 1672×941 | RGB | `ef862bdfed3c…` |
| `env.moonlit-promenade` | variant | `environments/Moonlit Puerto Rican Beachfront Promenade.png` | 2,493,674 | 1672×941 | RGB | `fd3231aad8c7…` |
| `env.jungle-camp` | variant | `environments/Puerto Rican Jungle Camp Clearing.png` | 3,342,573 | 1672×941 | RGB | `2ff66fe10f71…` |
| `env.cave-waterfall` | variant | `environments/Secret Cave Waterfall Platform.png` | 3,063,918 | 1672×941 | RGB | `e1548692a36b…` |

Notes from the audit:

- `Roberto’s Eight-Expression Character Atlas.png` and `…Atlas-1.png` are
  **byte-identical** (same SHA-256). Both are kept and only one is catalogued as the source.
- `Eight-expression transparent portrait atlas-2.png` has the same eight expressions,
  smaller (~258×450 per frame) and with **clean transparent gutters**. The larger atlas's
  frames touch their neighbours at low alpha (faint halos/limbs cross the cut lines).
  **The runtime portrait source is therefore atlas-2.**
- Both character sheets (`Cousin_ Puerto Rican Dominoes Host.png`, `Character sheet with
  charcoal seated silhouette.png`) are **RGB with an opaque light-grey background**
  (≈ rgb(206,198,194)). The standing front and three-quarter figures touch each
  other. They are reference only.
- The material sheet's tile faces have **no pips baked in**. Pips are always drawn from
  canonical tile values.
- `Worn wood tabletop…` is a 1254×1254 canvas, but the table occupies only the band
  y = 306…1000. Always crop to its frame rect.
- Every environment is 1672×941 RGB (≈16:9), 2.5–3.3 MB. They're too heavy for
  mobile as-is (see Known issues).

## Frame rectangles

How they're measured (`scripts/lib/measure.ts`): the only input is the expected
rows × columns. Cut lines go at the emptiest row/column within ±30% of each
nominal boundary, so **sheets are never assumed to be evenly packed**. The cells
differ in width (e.g. the effect sheet's cells range from 422 to 472 px). Each
frame's *content rect* is the tight bounding box of content pixels inside its
cell. Draw with the content rect. The cell is the safe padding region.

#### `cousin.atlas.portrait` — 2×4, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `neutral` Neutral smile, hands on hips | 29, 110, 258, 451 | 0, 0, 315, 649 | no |
| 1 | `smirk` Sly smirk, head tilt | 343, 110, 257, 451 | 315, 0, 315, 649 | no |
| 2 | `thinking` Thinking, hand on chin | 661, 110, 254, 451 | 630, 0, 311, 649 | no |
| 3 | `explaining` Explaining, one open hand | 967, 110, 260, 451 | 941, 0, 313, 649 | no |
| 4 | `laughing` Big laugh | 30, 739, 257, 449 | 0, 649, 313, 605 | no |
| 5 | `surprised` Surprised “ooh”, both palms up | 339, 738, 262, 450 | 313, 649, 315, 605 | no |
| 6 | `delighted` Delighted grin, both palms up | 655, 739, 260, 449 | 628, 649, 313, 605 | no |
| 7 | `pumped` Pumped, fists at chest | 967, 739, 263, 449 | 941, 649, 313, 605 | no |

#### `cousin.atlas.large` — 2×4, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `neutral` Neutral smile, hands on hips | 1, 50, 313, 550 | 0, 0, 314, 637 | **yes** |
| 1 | `smirk` Sly smirk, head tilt | 314, 51, 313, 549 | 314, 0, 318, 637 | **yes** |
| 2 | `thinking` Thinking, hand on chin | 637, 51, 303, 549 | 632, 0, 308, 637 | **yes** |
| 3 | `explaining` Explaining, one open hand | 940, 50, 314, 550 | 940, 0, 314, 637 | **yes** |
| 4 | `laughing` Big laugh | 1, 675, 313, 552 | 0, 637, 314, 617 | **yes** |
| 5 | `surprised` Surprised “ooh”, both palms up | 314, 675, 314, 550 | 314, 637, 314, 617 | **yes** |
| 6 | `delighted` Delighted grin, both palms up | 628, 678, 313, 549 | 628, 637, 313, 617 | **yes** |
| 7 | `pumped` Pumped, fists at chest | 941, 678, 313, 549 | 941, 637, 313, 617 | **yes** |

#### `cousin.anim.place` — 1×6, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `ready` Holding tile at waist | 50, 134, 292, 495 | 0, 0, 372, 724 | no |
| 1 | `lift` Raising tile to chest | 402, 134, 296, 495 | 372, 0, 360, 724 | no |
| 2 | `present` Extending tile forward | 766, 134, 291, 495 | 732, 0, 358, 724 | no |
| 3 | `place` Hand flat over tile on table | 1124, 133, 290, 496 | 1090, 0, 356, 724 | no |
| 4 | `slide` Pushing tile into place | 1478, 134, 294, 495 | 1446, 0, 357, 724 | no |
| 5 | `settle` Tile placed, hand returning | 1835, 133, 295, 496 | 1803, 0, 369, 724 | no |

#### `cousin.anim.slam` — 1×6, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `ready` Holding tile at waist | 8, 78, 351, 586 | 0, 0, 361, 724 | no |
| 1 | `lift` Raising tile | 364, 78, 356, 586 | 361, 0, 367, 724 | no |
| 2 | `aim` Tile forward, aiming | 737, 78, 346, 586 | 728, 0, 362, 724 | no |
| 3 | `slam` Hand down on tile | 1098, 78, 347, 586 | 1090, 0, 361, 724 | no |
| 4 | `press` Pressing tile on table | 1457, 78, 350, 586 | 1451, 0, 363, 724 | no |
| 5 | `recover` Tile placed, hand returning | 1821, 78, 350, 586 | 1814, 0, 358, 724 | no |

#### `cousin.ref.host` — 1×3, detect RGB distance > 40 from corner background

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `front` Front view, standing | 5, 10, 610, 999 | 0, 0, 615, 1024 | **yes** |
| 1 | `three-quarter` Three-quarter view, standing | 615, 13, 483, 994 | 615, 0, 489, 1024 | **yes** |
| 2 | `seated` Seated at domino table | 1111, 203, 421, 652 | 1104, 0, 432, 1024 | no |

#### `cousin.ref.silhouette` — 1×3, detect RGB distance > 40 from corner background

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `front` Front view, standing | 4, 10, 612, 1000 | 0, 0, 616, 1024 | **yes** |
| 1 | `three-quarter` Three-quarter view, standing | 616, 13, 482, 994 | 616, 0, 488, 1024 | **yes** |
| 2 | `silhouette-seated` Charcoal seated silhouette at table | 1110, 203, 422, 651 | 1104, 0, 432, 1024 | no |

#### `tile.materials` — 1×4, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `face-ivory-divided` Ivory face with centre divider (portrait) | 52, 104, 342, 678 | 0, 0, 444, 887 | no |
| 1 | `back-teal-weave` Teal woven-pattern back | 495, 104, 341, 678 | 444, 0, 442, 887 | no |
| 2 | `face-ivory-rimmed` Ivory face with raised rim, no divider | 936, 104, 344, 678 | 886, 0, 444, 887 | no |
| 3 | `back-walnut-inlay` Walnut back with gold inlay | 1381, 104, 342, 678 | 1330, 0, 444, 887 | no |

#### `fx.sheet` — 2×4, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `dust-puff` Dust puff | 134, 158, 194, 141 | 0, 0, 439, 424 | no |
| 1 | `impact-burst` Radial impact lines | 550, 133, 228, 169 | 439, 0, 460, 424 | no |
| 2 | `glint` Double glint streak | 1027, 150, 153, 161 | 899, 0, 431, 424 | no |
| 3 | `sparkle-cluster` Teal-white sparkle cluster | 1475, 136, 152, 169 | 1330, 0, 444, 424 | no |
| 4 | `confetti` Confetti scatter | 137, 589, 167, 149 | 0, 424, 423, 463 | no |
| 5 | `glow-ring` Soft glow ring | 537, 537, 253, 259 | 423, 424, 457, 463 | no |
| 6 | `ripple` Concentric ripple ellipses | 970, 596, 270, 145 | 880, 424, 472, 463 | no |
| 7 | `star-gold` Gold four-point star | 1490, 597, 123, 133 | 1352, 424, 422, 463 | no |

#### `table.weathered` — 1×1, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `surface` Table surface with border | 35, 76, 1467, 871 | 0, 0, 1536, 1024 | no |

#### `table.worn` — 1×1, detect alpha > 8

| # | Frame | Content rect (x, y, w, h) | Cell (x, y, w, h) | Touches neighbour |
| --- | --- | --- | --- | --- |
| 0 | `surface` Table surface with cream-teal border | 28, 306, 1197, 695 | 0, 0, 1254, 1254 | no |

## Generated double-six atlas (`tile.atlas`)

`npm run atlas:build` writes `assets/generated/tiles/double-six-atlas.png` and
`double-six-atlas.json`. It is a **derived** asset (`derivedFrom: tile.materials`);
the source sheet is only read.

- **Inputs:** the verified `tile.materials` frame rects `face-ivory-divided`,
  `back-teal-weave` and `back-walnut-inlay` (taken from the manifest, never
  guessed). The generator refuses to run if the source SHA-256 differs.
- **Faces:** each frame is area-resampled (premultiplied alpha) to **96×192 px**.
  Pips come from `src/render/pips.ts` (face space 100×200, pip radius 9.5,
  centres at 27/50/73 of each half). The SVG fallback uses the same geometry.
- **Orientation contract:** faces are portrait, with the **top half showing the high
  pip** and the bottom half the low pip (`t64` = 6 over 4). The renderer only
  rotates by quarter turns.
- **Cells:** 6 columns × 5 rows of 104×200 cells. Each face sits inside a
  **4 px fully transparent padding** ring, so sampling can't bleed into a
  neighbour. Image size 624×1000.
- **Stable canonical ordering:** cells 0–27 hold `t00, t10, t11, t20, t21, t22,
  t30 … t66` (high ascending, then low ascending, the same as
  `CANONICAL_TILE_IDS`). Cell 28 is `back-teal-weave` and cell 29 is
  `back-walnut-inlay`. **Identity comes from the JSON** (`id`, `high`, `low`, `rect`
  for each entry). Runtime looks faces up by id and never derives identity from
  cell position.
- **Checks:**
  - `assets:verify` re-measures the 30 frames and requires them to equal the JSON
    rects and the source hash.
  - `scripts/lib/atlas.test.ts` checks unique ids and valid values, bounds,
    non-overlap and transparent padding. It **counts the pip blobs in each half
    from the pixels** for all 28 faces, and regenerates the atlas in memory to
    confirm the pixels are byte-identical.
  - The developer contact sheet (`npm run dev` → `/dev/contact-sheet.html`, which
    is not in the production build) shows every face labelled by id, next to its
    SVG fallback and at 0/90/180/270°, and runs the same checks in the browser.

## Runtime use

| Use | Asset / frame | Status now |
| --- | --- | --- |
| Title/placeholder backdrop | `env.neighborhood-patio` | **in use** |
| Board surface | `table.weathered` / `surface` | **in use** |
| Host portrait | `cousin.atlas.portrait`: `explaining` on the menu; the table switches frames by mood (neutral, smirk, thinking, explaining, laughing, surprised, delighted, pumped) | **in use** |
| Tile faces (board, hand, results) | `tile.atlas` faces by id; SVG fallback with the same pip geometry | **in use** |
| Tile backs (opponent hand, boneyard) | `tile.atlas` / `back-teal-weave` (alt `back-walnut-inlay` in atlas) | **in use** |
| Atlas source | `tile.materials` (face-ivory-divided, both backs) → `tile.atlas` | build-time only (not bundled) |
| Selected/highlight tile skin | `tile.materials` / `face-ivory-rimmed` | planned |
| Table setting picker | the other six `env.*` | planned |
| Alternate board | `table.worn` | planned |
| Host slam | `cousin.anim.slam` (6 frames, shared stage, loaded on first use) | **in use** (optional) |
| Host place gesture | `cousin.anim.place` | not used (slam covers the reaction) |
| Play/pass/win feedback | `fx.sheet`: impact-burst, star-gold, ripple (cell-safe square boxes) | **in use** (optional; CSS ring fallback) |
| Opponent seat placeholder | `cousin.ref.silhouette` / `silhouette-seated` → needs cut-out derivative | planned |

Rendering contracts:

- Character frames render through a **shared stage box per sheet** (`src/render/stage.ts`): bottom-centre anchor, full content included, never outside the frame's cell. Tested for every frame (see `docs/PRESENTATION.md`).

- Frames are cropped with an SVG `viewBox` set to the manifest rect (`src/ui/sprite.ts`),
  which scales to any CSS size.
- **Fallbacks:** each tile is a vector ivory base, divider and canonical pips, with the face
  sprite layered in between. If the sprite is missing or fails to load, the broken
  `<image>` is removed and the tile still shows valid pips. The host portrait falls
  back to a monogram badge. Backgrounds fall back to CSS gradients. We confirmed
  this with every PNG request blocked in a headless browser.
- Asset URLs come from `new URL(literal, import.meta.url)`, so Vite emits hashed
  files with URL-safe names (`vite.config.ts` slugifies the output names) relative
  to the page, which is safe on GitHub Pages subpaths.

## Missing assets

| Id | Kind | Needed for | Fallback today |
| --- | --- | --- | --- |
| `audio.music` | audio | Original soundtrack (owner to supply) | Silence |
| `audio.sfx` | audio | Recorded domino foley, the contractor speaker recording, commissioned beds/stingers | Selected CC0 samples and beds (`docs/SOUND_SOURCES.md`, tile sounds are stand-ins); captions for the speaker; silence + ambience for the missing music |
| `video.intro` | video | Not required for v1 | Static title screen |
| `image.opponents` | image | AI / second-human seat portraits | Initial badges |
| `image.tile-sideview` | image | Edge-on/stacked tiles for the boneyard and opponents' hands | Vector backs |
| `image.ui-icons` | image | App icon, PWA icons, UI glyphs | Inline SVG 6|6 favicon |

## Known issues / follow-ups

- **Payload:** the runtime PNGs total ≈ 7.9 MB: backdrop 2.75 MB, table 2.94 MB, portrait atlas 1.53 MB and tile atlas 0.65 MB. The 1.48 MB material sheet is no longer bundled. A later stage should add
  *derived* WebP/AVIF sizes (e.g. 960 px and 1920 px backgrounds, 2× portrait
  frames) as separate manifest entries generated from these sources. The sources
  themselves stay untouched.
- The large Roberto atlas and both reference sheets need cleaned cut-outs before
  runtime use.
- The material face sprite (342×678) is drawn into a 1:2 box. That's a ≈1% vertical
  stretch, which is acceptable.

## Updating the manifest

1. Put new art under `assets/art/<category>/` (never overwrite an existing file).
2. `npm run assets:measure` prints measured bytes, SHA-256, dimensions and frames.
3. Add an entry to `src/assets/manifest.ts`. If it's used at runtime, add a
   `new URL(...)` line to `src/assets/urls.ts`.
4. `npm run assets:verify` must pass.

## Runtime derivatives (Stage 9)

The app no longer bundles the PNG originals. `npm run assets:derive` writes WebP
derivatives to `assets/generated/web/`, at the same pixel dimensions, so every
frame rectangle above still applies. Their bytes, hashes, source hash and
measured edge/alpha quality are in `src/assets/derivatives.json`, and
`npm run assets:verify` re-checks them. The originals in `assets/art/` are
unchanged. Sizes, quality gates and the loading order are in
[PERFORMANCE.md](PERFORMANCE.md).

## Stage 12 — story cast, story backdrop, fonts and brand

- **Story cast atlases** (the owner's asset-production upload, Nov 16, 2026). Four
  eight-expression portrait sheets (2 × 4 grids, 1774 × 887, transparent) were moved
  from the repository root into `assets/art/characters/` with their **original
  filenames unchanged**:
  - `cast.vale.atlas`: Tomás Vale, tan suit;
  - `cast.luz.atlas`: Luz Rivera, green field shirt;
  - `cast.marisol.atlas`: Marisol Vélez, coral polo and lanyard;
  - `cast.rafa.atlas`: Tío Rafa, cream guayabera.

  Their frames are measured and verified (no neighbour contact). Status is
  **variant**: they aren't bundled yet. The owner hasn't labelled which expression
  each frame shows, so frames are named `e1`–`e8` by position.
- **`env.cave-waterfall`** is now **runtime**: a WebP derivative (292 KB), used for the
  Prologue's dream and warmed only when Story opens.
- **Fonts** (DM Sans, Bricolage Grotesque; SIL OFL 1.1) and the **wordmark** vectors
  are described in [DESIGN.md](DESIGN.md).
