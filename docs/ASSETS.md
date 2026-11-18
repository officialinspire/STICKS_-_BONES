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
| `env.resort-patio` | variant (retired from the Story, not bundled) | `environments/Puerto Rico Resort Patio by the Sea.png` | 2,924,393 | 1672×941 | RGB | `4bc5873a1033…` |
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

## Expression verification (2026-11-17)

Every available sprite of Roberto, Marisol, Vale, Luz and Rafa was cropped and inspected cell by cell.
The generated cell order and the earlier prompt wording were not trusted.

### Cast sheets
These are the runtime derivatives (cleaned, baseline- and centre-aligned repacks, `npm run assets:cast`;
the source sheets in `assets/art/characters/` are untouched). Rectangles are in derivative pixels, as
recorded in `src/assets/cast.json` (`meaning`).

**Tomás Vale** (`assets/generated/web/cast-vale.webp`, 1528×836; uniform cells 382×418; dialogue crop inside every cell: x+4, y+3, 374×407; baseline y 407, anchor x 190)

| Frame | Cell rect (x, y, w, h) | Verified meaning |
| --- | --- | --- |
| e1 | 0, 0, 382, 418 | composed, level gaze |
| e2 | 382, 0, 382, 418 | pleasant public smile |
| e3 | 764, 0, 382, 418 | appraising, one brow raised |
| e4 | 1146, 0, 382, 418 | self-satisfied smile, chin up |
| e5 | 0, 418, 382, 418 | cool, narrowed eyes |
| e6 | 382, 418, 382, 418 | hard stare, brows down |
| e7 | 764, 418, 382, 418 | startled, eyes wide |
| e8 | 1146, 418, 382, 418 | tight smirk |

**Luz Rivera** (`assets/generated/web/cast-luz.webp`, 1468×828; uniform cells 367×414; dialogue crop inside every cell: x+4, y+4, 359×400; baseline y 401, anchor x 183)

| Frame | Cell rect (x, y, w, h) | Verified meaning |
| --- | --- | --- |
| e1 | 0, 0, 367, 414 | calm, attentive |
| e2 | 367, 0, 367, 414 | warm smile |
| e3 | 734, 0, 367, 414 | serious, brows drawn |
| e4 | 1101, 0, 367, 414 | speaking, open mouth |
| e5 | 0, 414, 367, 414 | concerned, brows raised |
| e6 | 367, 414, 367, 414 | firm, level |
| e7 | 734, 414, 367, 414 | gentle closed smile |
| e8 | 1101, 414, 367, 414 | knowing soft smile, eyes narrowed |

**Marisol Vélez** (`assets/generated/web/cast-marisol.webp`, 1540×868; uniform cells 385×434; dialogue crop inside every cell: x+4, y+4, 377×422; baseline y 423, anchor x 192)

| Frame | Cell rect (x, y, w, h) | Verified meaning |
| --- | --- | --- |
| e1 | 0, 0, 385, 434 | composed, slight smile |
| e2 | 385, 0, 385, 434 | wry half-smile, eyes squinted |
| e3 | 770, 0, 385, 434 | worried, brows raised, lips parted |
| e4 | 1155, 0, 385, 434 | determined, set jaw |
| e5 | 0, 434, 385, 434 | pained, brows tilted |
| e6 | 385, 434, 385, 434 | warm smile |
| e7 | 770, 434, 385, 434 | suspicious frown |
| e8 | 1155, 434, 385, 434 | broad laughing smile |

**Tío Rafa** (`assets/generated/web/cast-rafa.webp`, 1552×826; uniform cells 388×413; dialogue crop inside every cell: x+4, y+5, 380×400; baseline y 402, anchor x 193)

| Frame | Cell rect (x, y, w, h) | Verified meaning |
| --- | --- | --- |
| e1 | 0, 0, 388, 413 | calm, looking off |
| e2 | 388, 0, 388, 413 | laughing |
| e3 | 776, 0, 388, 413 | sly grin |
| e4 | 1164, 0, 388, 413 | looking up, wistful |
| e5 | 0, 413, 388, 413 | sad, brows tilted |
| e6 | 388, 413, 388, 413 | downcast, eyes lowered |
| e7 | 776, 413, 388, 413 | proud, chin up |
| e8 | 1164, 413, 388, 413 | broad warm smile |

### Roberto
`cousin.atlas.portrait` (runtime): frame rectangles in the manifest.
- **Verified meanings:**
  - neutral: calm closed smile, hands on hips
  - smirk: sly smirk, head tilt
  - thinking: hand on chin, mouth set
  - explaining: open hand, speaking
  - laughing: open laugh
  - surprised: "ooh", palms up
  - delighted: wide grin, palms up
  - pumped: grin, fists at chest
- **Same box for every expression:** the dialogue crop is `bustBox(stage, frame, DIALOGUE_ASPECT)`, which
  is the same for every expression (`src/render/stage.test.ts`).

### Identity-consistent variants

| Asset | Status | Finding |
| --- | --- | --- |
| `cousin.atlas.portrait` | runtime | The 8 expressions above. Same hat, sunglasses, tattoos and brown shirt over a cream tank in every frame. |
| `cousin.atlas.large` (+ byte-identical copy) | variant | Same 8 expressions, same order and outfit, larger (~313×550 per frame). Frames touch their neighbours at low alpha: usable only after a cleaned derivative. It's the route to larger crisp figures on DPR 3 phones. |
| `cousin.anim.slam` / `cousin.anim.place` | runtime / variant | Same outfit. Gesture strips (slam, placing a tile), not expressions. |
| `cousin.ref.host` | reference | A different render (heavier build, different face) on an opaque background: not used beside the atlas. |
| `cousin.ref.silhouette` | reference | Front and three-quarter references and a seated silhouette. Not runtime. |
| Cast sheets (4) | runtime | One outfit per character across all 8 frames (Vale tan suit, Luz green field shirt and satchel, Marisol coral polo with lanyard, Rafa cream guayabera). |

### How expressions reach dialogue (`src/story/expressions.ts`)
- **Vocabulary** (semantic): neutral, teasing, concern, firmness, vulnerability, affection, menace,
  fear, amusement, surprise, suspicion, pride, wistful, thinking, explaining, delight, charm.
- **Per-character maps:** verified frames; an expression the art lacks falls back to the neutral
  default (cast e1; Roberto neutral).
  - Roberto has no somber, frightened or hostile frame: concern, vulnerability and wistful use his
    contemplative `thinking` frame, and the rest his calm `neutral`.
- **Line table:** 311 of 358 spoken lines are tagged by stable id (`<scene>#<n>`), chosen from each
  line's words and the script's stage directions. A test pins every id to its speaker and opening
  text.
- **Defaults:** untagged cast lines are neutral; untagged Roberto lines keep the stage directions' mood.
- **Never random, never a double face:**
  - A frame swap is an instant background-position change (cast) or viewBox change (Roberto) inside the
    same box.
  - A change of speaker fades the old figure out completely before the next fades in.

## Integration stage: remaining-asset re-audit, cast portraits, portrait crops (2026-11-17)

### Re-audit: what was supplied since the last stage

Nothing. `origin/main` is unchanged (`cb4ac97`, already merged into the branch), there are no uploads
at the repository root, and `npm run assets:verify` finds no unregistered file. No new character sheets,
expressions, story illustrations, props or audio exist to integrate. What this stage integrated is the
art already in the repository that was not yet runtime: the four cast atlases.

### Remaining-asset checklist (final assets still missing)

| Asset | Status | What the game shows instead |
| --- | --- | --- |
| **Expression labels** for Vale, Luz, Marisol, Rafa | **verified by inspection** (see "Expression verification") | All eight frames in use through `src/story/expressions.ts`; the owner may correct any reading in that one file |
| Portraits for Worker (Ch. 3), Representative (Ch. 7), the contractor speaker and the trail voice (Ch. 6) | **missing** | Name tag (and caption-only audio) |
| Story illustrations / props / evidence-card art | **none supplied** | Typeset evidence card and notebook panels |
| Opponent seat portraits for Quick Play | **missing** | Initial badges |
| Edge-on tile art (boneyard, opponents' hands) | **missing** | Vector backs |
| INSPIRE studio intro video (`assets/video/inspiresoftwareintro.mp4`) | **missing** | A 1.6 s typeset text credit ("INSPIRE / presents"), skippable, then the menu. It is code-drawn type, not a substitute logo or video |
| Recorded domino foley, commissioned music, speaker recording | **missing** | CC0 stand-ins / silence + ambience / captions (`docs/AUDIO.md`) |
| Cousin's large atlas and reference sheets | variant/reference | Not runtime (need cleaned cut-outs) |

No temporary monogram, drawn fallback or synthesized sound has been relabelled as final art: the cast
derivatives are cleaned copies of the owner's own sheets, and everything in the table above is listed as
missing in `src/assets/manifest.ts` (`MISSING_ASSETS`).

### Cast portraits (`npm run assets:cast` → `assets/generated/web/cast-*.webp`, `src/assets/cast.json`)

The originals are only read. Each frame is searched inside its manifest cell, then:

| Sheet | Size | Mean err / edge p99 / alpha | Repairs (derivative only) | Placement drift in the source | Runtime cell |
| --- | --- | --- | --- | --- | --- |
| `cast.vale.atlas` (Tomás Vale) | 1468 KB PNG → **180 KB** WebP (1528×836) | 1.96 / 11.9 / exact | 8 specks (8 px) · fringe 2364 → 0 px · bright orphans cleared 0 | baseline ±2 px, centre ±10.9 px, height ±5 px | 382×418, anchor x 190, baseline y 407 |
| `cast.luz.atlas` (Luz Rivera) | 1424 KB PNG → **163 KB** WebP (1468×828) | 2.01 / 10.9 / exact | 18 specks (37 px) · fringe 193 → 0 px · bright orphans cleared 0 | baseline ±4 px, centre ±1.8 px, height ±2 px | 367×414, anchor x 183, baseline y 401 |
| `cast.marisol.atlas` (Marisol Vélez) | 1742 KB PNG → **244 KB** WebP (1540×868) | 2.61 / 14.9 / exact | 42 specks (62 px) · fringe 8377 → 0 px · bright orphans cleared 7 | baseline ±2 px, centre ±7.7 px, height ±0 px | 385×434, anchor x 192, baseline y 423 |
| `cast.rafa.atlas` (Tío Rafa) | 1739 KB PNG → **214 KB** WebP (1552×826) | 2.12 / 11.7 / exact | 23 specks (38 px) · fringe 6705 → 0 px · bright orphans cleared 0 | baseline ±7 px, centre ±1.6 px, height ±4 px | 388×413, anchor x 193, baseline y 402 |

- **Identity consistency:** checked by eye against each sheet (same person, costume and framing in all eight
  frames). Measured placement drift between frames is small (above); the repack aligns every frame's
  baseline and bust centre, so a later expression swap cannot make a figure jump.
- **Measured rectangles:** the source frame rects in `manifest.ts` are re-verified by `assets:verify`; the
  derivative's uniform cells and anchors are recorded in `cast.json` and checked for bounds.
- **Alpha edges:** stray specks (alpha islands outside the figure) were removed; semi-transparent edge pixels
  whose colour clashed with the nearby opaque body by more than 64 (the red/yellow lines along Vale's,
  Marisol's and Rafa's bottom crop edges) were recoloured from it. A first pass also cleared dark hair
  wisps on Marisol; it was narrowed to bright saturated colour only and the result re-checked visually.
- **Baseline anchors:** the baseline is the last row where the bust is ≥ 30 % opaque (the crop line that sits
  on the dialogue panel); `anchorX` is the bust's centre at the baseline.
- **Scene assignments** (from the script's speakers; `src/story/scene-images.ts`, tested against what the Story
  layer loads): Ch. 1 Rafa, Marisol · Ch. 2 Marisol, Vale · Ch. 3 Vale, Marisol, Rafa · Ch. 4 Rafa, Marisol ·
  Ch. 5 Luz, Marisol · Ch. 6 Marisol, Luz · Ch. 7 Vale, Marisol, Rafa · Epilogue Marisol.
- **Runtime:** the speaker's portrait appears on their lines (decorative; the name tag stays the accessible
  label), only once the sheet has decoded; otherwise the name tag stands alone.

**Expression meanings are not labelled.** This build's reading of each frame, for the owner to confirm or
correct (nothing at runtime depends on it):

| Character | Frames (inspection only, unconfirmed) |
| --- | --- |
| Tomás Vale | e1 composed, level gaze · e2 pleasant smile · e3 appraising, slight frown · e4 self-satisfied smile, chin up · e5 cool, narrowed eyes · e6 hard stare, brows down · e7 startled, eyes wide · e8 tight smirk |
| Luz Rivera | e1 calm, attentive · e2 warm smile · e3 serious, brows drawn · e4 speaking, open mouth · e5 concerned, brows raised · e6 firm, level · e7 gentle smile · e8 soft smile, eyes narrowed |
| Marisol Vélez | e1 composed, slight smile · e2 wry half-smile · e3 worried, brows raised · e4 determined, set jaw · e5 pained, brows tilted · e6 warm smile · e7 suspicious frown · e8 broad smile |
| Tío Rafa | e1 calm, looking off · e2 laughing · e3 sly grin · e4 looking up, wistful · e5 sad, brows tilted · e6 downcast, eyes lowered · e7 proud, chin up · e8 broad smile |

### Portrait crops of the environments

Each environment now has a 3:4 crop centred on its focal point (`src/assets/focal.ts`, the single source for
the staging positions too — tested). Viewports no wider than 3:4 load the crop instead of the full frame:
the same visible area under `background-size: cover`, far fewer bytes. Rotation re-picks (decoded first).

| Environment | Full frame | Portrait crop | Crop | Mean err |
| --- | --- | --- | --- | --- |
| `env.neighborhood-patio` | 229 KB | 90 KB | x = 483 (focal 50.0% inside the crop) | 4.38 |
| `env.cave-waterfall` | 285 KB | 93 KB | x = 483 (focal 50.0% inside the crop) | 4.9 |
| `env.back-alley` | 236 KB | 96 KB | x = 399 (focal 50.1% inside the crop) | 4.84 |
| `env.moonlit-promenade` | 191 KB | 50 KB | x = 483 (focal 50.0% inside the crop) | 3.68 |
| `env.jungle-camp` | 428 KB | 182 KB | x = 483 (focal 50.0% inside the crop) | 5.42 |
| `env.executive-terrace` | 209 KB | 96 KB | x = 98 (focal x = 0.27: the glass lobby, canopy and tower; 50.1% inside the crop) | 4.89 |

`env.resort-patio` (a leisure patio by the sea) had a crop here until the resort correction below; it is
no longer derived or bundled.

### Resort backdrop correction (owner direction)

The resort scenes now use the approved **corporate** resort art, not the leisure patio.
- **Source:** `environments/Sleek Puerto Rican Executive Resort Terrace.png` (`env.executive-terrace`, 1672×941,
  SHA `ef862bdfed3c…`, unchanged).
- **Inspection:** a glass-fronted modern lobby under a flat canopy (left), a multi-storey hotel tower, a
  stone-paved plaza with planters, and the sea beyond the terrace edge. It reads as Vale's executive world.
  `Puerto Rico Resort Patio by the Sea.png` (thatched umbrellas, loungers, pool deck) reads as leisure; it
  stays in `assets/art/` as supplied, but is retired from the Story (manifest status `variant`, with a note).
- **Where it is used:** Chapter 3's establishing shot, every Chapter 3 dialogue beat and its partnership hand,
  plus Chapter 7's executive confrontation and its hand. `STAGING` gives both scenes `env` and `handEnv` =
  `env.executive-terrace`. The table host takes the hand's backdrop from `setEnvBackdrop`
  (`src/assets/env.ts`), which records `data-env-id` so a rotation re-picks the same place. The patio
  (Chapters 1–2, the epilogue, Quick Play), back alley, promenade, jungle and cave are unchanged.
- **Every story hand's backdrop is now explicit** (hardening pass; superseding the note that Chapter 6 kept
  the patio):

  | Hand | Backdrop |
  | --- | --- |
  | Chapter 1 | patio |
  | Chapter 2 | back alley |
  | Chapters 3 and 7 | executive terrace |
  | Chapter 4 | promenade |
  | Chapter 5 | jungle camp |
  | Chapter 6 | `null`: the modern rest area has no art, and the cave art is the ancient platform, so its table is drawn, with no photo |

  - No story table falls back to the patio, and the rotation handler re-picks only elements that name their
    place (it no longer defaults to the patio).
  - A drawn backdrop sets `--env-image: none` explicitly; otherwise it would inherit the menu's patio from
    `#app`, which the fault test caught.
  - Tests: `src/story/staging.test.ts` (explicit, preloaded, offline-mapped, both derivatives) and `npm run
    faults` § H (all seven tables in the browser).
- **Focal point:** `x = 0.27` (was 0.5, which in portrait kept the open sea and cut away both façades).
  - Landscape: positioned at `27% 50%`.
  - Portrait: the 3:4 crop is re-derived at x = 98 (96 KB) and shows the lobby, canopy and tower.
  - The full-frame WebP is byte-identical to before.
- **Removed:** `resort-patio.webp` and `resort-patio-portrait.webp` from `assets/generated/web/`, their URLs,
  the derive entry and the focal entry.
  - `check-dist` refuses any `resort-patio` file in a build.
  - `npm run pwa` plants an old `resort-patio` file in the story cache and checks that the update prunes it.

### Cousin's portrait sheet: cleaned derivative (character framing stage)

Dialogue now shows Cousin much larger, which made the source sheet's stray specks and red/yellow edge
fringes visible. `cousin.atlas.portrait`'s WebP derivative is now cleaned with the same code as the cast
sheets (`scripts/lib/clean.ts`). It stays the **same size**, so every frame rect and stage box still applies,
and it is gated against the cleaned pixels: **175 specks (842 px) removed, fringe pixels 426 → 0**, mean
error 1.50, alpha exact (297 KB → 202 KB, since the faint haze no longer needs encoding). The original is
unchanged. The slam strip (`cousin.anim.slam`) is only shown small on wide tables and is not cleaned yet.
