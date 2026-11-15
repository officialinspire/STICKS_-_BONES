/* Asset manifest — measured from source files. Regenerate numbers with `npm run assets:measure`; verify with `npm run assets:verify`. */
import type { ImageAsset, MissingAsset } from './types';

export const ASSET_MANIFEST_VERSION = 1;

export const IMAGE_ASSETS = [
  {
    id: "cousin.atlas.portrait",
    category: "character",
    status: "runtime",
    path: "assets/art/characters/Eight-expression transparent portrait atlas-2.png",
    originalName: "Eight-expression transparent portrait atlas-2.png",
    bytes: 1532373,
    sha256: "9d557d503e10d74747d496ad3a02d6607624f5d1ad47b9169bf9a4046b1ed291",
    width: 1254,
    height: 1254,
    hasAlpha: true,
    layout: { rows: 2, cols: 4, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "neutral", label: "Neutral smile, hands on hips", rect: { x: 29, y: 110, w: 258, h: 451 }, cell: { x: 0, y: 0, w: 315, h: 649 }, touchesNeighbor: false },
      { id: "smirk", label: "Sly smirk, head tilt", rect: { x: 343, y: 110, w: 257, h: 451 }, cell: { x: 315, y: 0, w: 315, h: 649 }, touchesNeighbor: false },
      { id: "thinking", label: "Thinking, hand on chin", rect: { x: 661, y: 110, w: 254, h: 451 }, cell: { x: 630, y: 0, w: 311, h: 649 }, touchesNeighbor: false },
      { id: "explaining", label: "Explaining, one open hand", rect: { x: 967, y: 110, w: 260, h: 451 }, cell: { x: 941, y: 0, w: 313, h: 649 }, touchesNeighbor: false },
      { id: "laughing", label: "Big laugh", rect: { x: 30, y: 739, w: 257, h: 449 }, cell: { x: 0, y: 649, w: 313, h: 605 }, touchesNeighbor: false },
      { id: "surprised", label: "Surprised “ooh”, both palms up", rect: { x: 339, y: 738, w: 262, h: 450 }, cell: { x: 313, y: 649, w: 315, h: 605 }, touchesNeighbor: false },
      { id: "delighted", label: "Delighted grin, both palms up", rect: { x: 655, y: 739, w: 260, h: 449 }, cell: { x: 628, y: 649, w: 313, h: 605 }, touchesNeighbor: false },
      { id: "pumped", label: "Pumped, fists at chest", rect: { x: 967, y: 739, w: 263, h: 449 }, cell: { x: 941, y: 649, w: 313, h: 605 }, touchesNeighbor: false }
    ],
    proposedUse: "Primary host (Roberto “Cousin”) expression portraits for menus, dialogue and reactions. Chosen for runtime because every frame has clear transparent gutters (no neighbour bleed)."
  },
  {
    id: "cousin.atlas.large",
    category: "character",
    status: "variant",
    path: "assets/art/characters/Roberto’s Eight-Expression Character Atlas.png",
    originalName: "Roberto’s Eight-Expression Character Atlas.png",
    bytes: 2060957,
    sha256: "1c47eb6727777b1ab014ed3e990c8b7237f186cd704bca18bdad167727f2e3e8",
    width: 1254,
    height: 1254,
    hasAlpha: true,
    layout: { rows: 2, cols: 4, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "neutral", label: "Neutral smile, hands on hips", rect: { x: 1, y: 50, w: 313, h: 550 }, cell: { x: 0, y: 0, w: 314, h: 637 }, touchesNeighbor: true },
      { id: "smirk", label: "Sly smirk, head tilt", rect: { x: 314, y: 51, w: 313, h: 549 }, cell: { x: 314, y: 0, w: 318, h: 637 }, touchesNeighbor: true },
      { id: "thinking", label: "Thinking, hand on chin", rect: { x: 637, y: 51, w: 303, h: 549 }, cell: { x: 632, y: 0, w: 308, h: 637 }, touchesNeighbor: true },
      { id: "explaining", label: "Explaining, one open hand", rect: { x: 940, y: 50, w: 314, h: 550 }, cell: { x: 940, y: 0, w: 314, h: 637 }, touchesNeighbor: true },
      { id: "laughing", label: "Big laugh", rect: { x: 1, y: 675, w: 313, h: 552 }, cell: { x: 0, y: 637, w: 314, h: 617 }, touchesNeighbor: true },
      { id: "surprised", label: "Surprised “ooh”, both palms up", rect: { x: 314, y: 675, w: 314, h: 550 }, cell: { x: 314, y: 637, w: 314, h: 617 }, touchesNeighbor: true },
      { id: "delighted", label: "Delighted grin, both palms up", rect: { x: 628, y: 678, w: 313, h: 549 }, cell: { x: 628, y: 637, w: 313, h: 617 }, touchesNeighbor: true },
      { id: "pumped", label: "Pumped, fists at chest", rect: { x: 941, y: 678, w: 313, h: 549 }, cell: { x: 941, y: 637, w: 313, h: 617 }, touchesNeighbor: true }
    ],
    proposedUse: "Same eight expressions at larger scale (~313×550 per frame). Frames touch neighbours at low alpha, so drawing a frame rect can include faint neighbour halo; keep as a high-res variant until a cleaned derivative is produced."
  },
  {
    id: "cousin.atlas.large.copy",
    category: "character",
    status: "duplicate",
    path: "assets/art/characters/Roberto’s Eight-Expression Character Atlas-1.png",
    originalName: "Roberto’s Eight-Expression Character Atlas-1.png",
    bytes: 2060957,
    sha256: "1c47eb6727777b1ab014ed3e990c8b7237f186cd704bca18bdad167727f2e3e8",
    width: 1254,
    height: 1254,
    hasAlpha: true,
    duplicateOf: "cousin.atlas.large",
    proposedUse: "Byte-identical duplicate of cousin.atlas.large (same SHA-256). Preserved as supplied; never bundled."
  },
  {
    id: "cousin.anim.place",
    category: "character",
    status: "variant",
    path: "assets/art/characters/Six-Frame Domino Gesture Sequence.png",
    originalName: "Six-Frame Domino Gesture Sequence.png",
    bytes: 1249710,
    sha256: "2d8262a10d21311bb558959c60b2087cc0736166c23a37280fe4a30a882c47fb",
    width: 2172,
    height: 724,
    hasAlpha: true,
    layout: { rows: 1, cols: 6, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "ready", label: "Holding tile at waist", rect: { x: 50, y: 134, w: 292, h: 495 }, cell: { x: 0, y: 0, w: 372, h: 724 }, touchesNeighbor: false },
      { id: "lift", label: "Raising tile to chest", rect: { x: 402, y: 134, w: 296, h: 495 }, cell: { x: 372, y: 0, w: 360, h: 724 }, touchesNeighbor: false },
      { id: "present", label: "Extending tile forward", rect: { x: 766, y: 134, w: 291, h: 495 }, cell: { x: 732, y: 0, w: 358, h: 724 }, touchesNeighbor: false },
      { id: "place", label: "Hand flat over tile on table", rect: { x: 1124, y: 133, w: 290, h: 496 }, cell: { x: 1090, y: 0, w: 356, h: 724 }, touchesNeighbor: false },
      { id: "slide", label: "Pushing tile into place", rect: { x: 1478, y: 134, w: 294, h: 495 }, cell: { x: 1446, y: 0, w: 357, h: 724 }, touchesNeighbor: false },
      { id: "settle", label: "Tile placed, hand returning", rect: { x: 1835, y: 133, w: 295, h: 496 }, cell: { x: 1803, y: 0, w: 369, h: 724 }, touchesNeighbor: false }
    ],
    proposedUse: "Host “place a tile” gesture loop for a calm play reaction (later presentation stage)."
  },
  {
    id: "cousin.anim.slam",
    category: "character",
    status: "variant",
    path: "assets/art/characters/Confident six-frame domino slam.png",
    originalName: "Confident six-frame domino slam.png",
    bytes: 1783741,
    sha256: "dd4c4aef83d3e0655357f8067b90612db96dc5a6c59ec07e0b624a5f7c6bec52",
    width: 2172,
    height: 724,
    hasAlpha: true,
    layout: { rows: 1, cols: 6, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "ready", label: "Holding tile at waist", rect: { x: 8, y: 78, w: 351, h: 586 }, cell: { x: 0, y: 0, w: 361, h: 724 }, touchesNeighbor: false },
      { id: "lift", label: "Raising tile", rect: { x: 364, y: 78, w: 356, h: 586 }, cell: { x: 361, y: 0, w: 367, h: 724 }, touchesNeighbor: false },
      { id: "aim", label: "Tile forward, aiming", rect: { x: 737, y: 78, w: 346, h: 586 }, cell: { x: 728, y: 0, w: 362, h: 724 }, touchesNeighbor: false },
      { id: "slam", label: "Hand down on tile", rect: { x: 1098, y: 78, w: 347, h: 586 }, cell: { x: 1090, y: 0, w: 361, h: 724 }, touchesNeighbor: false },
      { id: "press", label: "Pressing tile on table", rect: { x: 1457, y: 78, w: 350, h: 586 }, cell: { x: 1451, y: 0, w: 363, h: 724 }, touchesNeighbor: false },
      { id: "recover", label: "Tile placed, hand returning", rect: { x: 1821, y: 78, w: 350, h: 586 }, cell: { x: 1814, y: 0, w: 358, h: 724 }, touchesNeighbor: false }
    ],
    proposedUse: "Host emphatic “slam” gesture for a winning or domino-out play (later presentation stage)."
  },
  {
    id: "cousin.ref.host",
    category: "character",
    status: "reference",
    path: "assets/art/characters/Cousin_ Puerto Rican Dominoes Host.png",
    originalName: "Cousin_ Puerto Rican Dominoes Host.png",
    bytes: 2289954,
    sha256: "d9e780d4a48f0dfccfc712b9626f228802a617a431fdb594472186388723afad",
    width: 1536,
    height: 1024,
    hasAlpha: false,
    layout: { rows: 1, cols: 3, detect: { kind: "background", distance: 40 } },
    frames: [
      { id: "front", label: "Front view, standing", rect: { x: 5, y: 10, w: 610, h: 999 }, cell: { x: 0, y: 0, w: 615, h: 1024 }, touchesNeighbor: true },
      { id: "three-quarter", label: "Three-quarter view, standing", rect: { x: 615, y: 13, w: 483, h: 994 }, cell: { x: 615, y: 0, w: 489, h: 1024 }, touchesNeighbor: true },
      { id: "seated", label: "Seated at domino table", rect: { x: 1111, y: 203, w: 421, h: 652 }, cell: { x: 1104, y: 0, w: 432, h: 1024 }, touchesNeighbor: false }
    ],
    proposedUse: "Character turnaround reference on an opaque grey background. Not usable at runtime without a cut-out derivative."
  },
  {
    id: "cousin.ref.silhouette",
    category: "character",
    status: "reference",
    path: "assets/art/characters/Character sheet with charcoal seated silhouette.png",
    originalName: "Character sheet with charcoal seated silhouette.png",
    bytes: 2094181,
    sha256: "dd0066d55131876f676c82fec5166c1009f12b69d2f2cef35e6507d5a17f7dc1",
    width: 1536,
    height: 1024,
    hasAlpha: false,
    layout: { rows: 1, cols: 3, detect: { kind: "background", distance: 40 } },
    frames: [
      { id: "front", label: "Front view, standing", rect: { x: 4, y: 10, w: 612, h: 1000 }, cell: { x: 0, y: 0, w: 616, h: 1024 }, touchesNeighbor: true },
      { id: "three-quarter", label: "Three-quarter view, standing", rect: { x: 616, y: 13, w: 482, h: 994 }, cell: { x: 616, y: 0, w: 488, h: 1024 }, touchesNeighbor: true },
      { id: "silhouette-seated", label: "Charcoal seated silhouette at table", rect: { x: 1110, y: 203, w: 422, h: 651 }, cell: { x: 1104, y: 0, w: 432, h: 1024 }, touchesNeighbor: false }
    ],
    proposedUse: "Turnaround reference plus seated silhouette (opponent-seat placeholder idea). Opaque grey background; reference only."
  },
  {
    id: "tile.materials",
    category: "tile",
    status: "runtime",
    path: "assets/art/tiles/Four pristine domino material sprites.png",
    originalName: "Four pristine domino material sprites.png",
    bytes: 1484710,
    sha256: "02e9201095d20d4aee06818f2c6b6666665fdfcba6a8b0dd952552822882f0ef",
    width: 1774,
    height: 887,
    hasAlpha: true,
    layout: { rows: 1, cols: 4, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "face-ivory-divided", label: "Ivory face with centre divider (portrait)", rect: { x: 52, y: 104, w: 342, h: 678 }, cell: { x: 0, y: 0, w: 444, h: 887 }, touchesNeighbor: false },
      { id: "back-teal-weave", label: "Teal woven-pattern back", rect: { x: 495, y: 104, w: 341, h: 678 }, cell: { x: 444, y: 0, w: 442, h: 887 }, touchesNeighbor: false },
      { id: "face-ivory-rimmed", label: "Ivory face with raised rim, no divider", rect: { x: 936, y: 104, w: 344, h: 678 }, cell: { x: 886, y: 0, w: 444, h: 887 }, touchesNeighbor: false },
      { id: "back-walnut-inlay", label: "Walnut back with gold inlay", rect: { x: 1381, y: 104, w: 342, h: 678 }, cell: { x: 1330, y: 0, w: 444, h: 887 }, touchesNeighbor: false }
    ],
    proposedUse: "Domino face/back skins. Pips are NEVER baked in: runtime draws canonical pips over the face sprite, and draws an SVG face when the sprite is missing."
  },
  {
    id: "fx.sheet",
    category: "effect",
    status: "variant",
    path: "assets/art/effects/Eight polished dominoes effect sprites.png",
    originalName: "Eight polished dominoes effect sprites.png",
    bytes: 649575,
    sha256: "e657fe72c78f47375a577899daadbf57b1561138dfed11a1c39472b1c8a3f9e3",
    width: 1774,
    height: 887,
    hasAlpha: true,
    layout: { rows: 2, cols: 4, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "dust-puff", label: "Dust puff", rect: { x: 134, y: 158, w: 194, h: 141 }, cell: { x: 0, y: 0, w: 439, h: 424 }, touchesNeighbor: false },
      { id: "impact-burst", label: "Radial impact lines", rect: { x: 550, y: 133, w: 228, h: 169 }, cell: { x: 439, y: 0, w: 460, h: 424 }, touchesNeighbor: false },
      { id: "glint", label: "Double glint streak", rect: { x: 1027, y: 150, w: 153, h: 161 }, cell: { x: 899, y: 0, w: 431, h: 424 }, touchesNeighbor: false },
      { id: "sparkle-cluster", label: "Teal-white sparkle cluster", rect: { x: 1475, y: 136, w: 152, h: 169 }, cell: { x: 1330, y: 0, w: 444, h: 424 }, touchesNeighbor: false },
      { id: "confetti", label: "Confetti scatter", rect: { x: 137, y: 589, w: 167, h: 149 }, cell: { x: 0, y: 424, w: 423, h: 463 }, touchesNeighbor: false },
      { id: "glow-ring", label: "Soft glow ring", rect: { x: 537, y: 537, w: 253, h: 259 }, cell: { x: 423, y: 424, w: 457, h: 463 }, touchesNeighbor: false },
      { id: "ripple", label: "Concentric ripple ellipses", rect: { x: 970, y: 596, w: 270, h: 145 }, cell: { x: 880, y: 424, w: 472, h: 463 }, touchesNeighbor: false },
      { id: "star-gold", label: "Gold four-point star", rect: { x: 1490, y: 597, w: 123, h: 133 }, cell: { x: 1352, y: 424, w: 422, h: 463 }, touchesNeighbor: false }
    ],
    proposedUse: "Tile placement / win feedback effects (later presentation stage). Frames are independent effects, not an animation strip."
  },
  {
    id: "table.weathered",
    category: "table",
    status: "runtime",
    path: "assets/art/tables/Weathered Caribbean game tabletop.png",
    originalName: "Weathered Caribbean game tabletop.png",
    bytes: 2938960,
    sha256: "5a5bd2e50c6aaf12cab2dcfec2887278d57bacbc1fd48b57354e810f94a4d11d",
    width: 1536,
    height: 1024,
    hasAlpha: true,
    layout: { rows: 1, cols: 1, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "surface", label: "Table surface with border", rect: { x: 35, y: 76, w: 1467, h: 871 }, cell: { x: 0, y: 0, w: 1536, h: 1024 }, touchesNeighbor: false }
    ],
    proposedUse: "Default board surface (landscape). Placeholder screen uses it now."
  },
  {
    id: "table.worn",
    category: "table",
    status: "variant",
    path: "assets/art/tables/Worn wood tabletop with cream-teal border.png",
    originalName: "Worn wood tabletop with cream-teal border.png",
    bytes: 1583657,
    sha256: "aabc8b4254989876988332d324684866b53c2117c9ecabac94b5c1958949519a",
    width: 1254,
    height: 1254,
    hasAlpha: true,
    layout: { rows: 1, cols: 1, detect: { kind: "alpha", alphaThreshold: 8 } },
    frames: [
      { id: "surface", label: "Table surface with cream-teal border", rect: { x: 28, y: 306, w: 1197, h: 695 }, cell: { x: 0, y: 0, w: 1254, h: 1254 }, touchesNeighbor: false }
    ],
    proposedUse: "Alternate board surface. Content occupies only the middle band of the square canvas — always crop to the frame rect."
  },
  {
    id: "env.neighborhood-patio",
    category: "environment",
    status: "runtime",
    path: "assets/art/environments/Shaded Puerto Rican Neighborhood Patio.png",
    originalName: "Shaded Puerto Rican Neighborhood Patio.png",
    bytes: 2754726,
    sha256: "31966bdf144ab39c8fffc901b45264fd3c351d8febf865a14a51a96a7469c9e2",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Default table setting / placeholder screen backdrop."
  },
  {
    id: "env.back-alley",
    category: "environment",
    status: "variant",
    path: "assets/art/environments/Sunlit San Juan Back Alley.png",
    originalName: "Sunlit San Juan Back Alley.png",
    bytes: 2832333,
    sha256: "c7d502f6a0a10f086ff88a82dbb5fe6d05e392be4988aaa6624fd0f37a9ebb54",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Selectable table setting."
  },
  {
    id: "env.resort-patio",
    category: "environment",
    status: "variant",
    path: "assets/art/environments/Puerto Rico Resort Patio by the Sea.png",
    originalName: "Puerto Rico Resort Patio by the Sea.png",
    bytes: 2924393,
    sha256: "4bc5873a103301f87ba0dd73240a078acb6d9fd6a00e575bc030090b3a7785e2",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Selectable table setting."
  },
  {
    id: "env.executive-terrace",
    category: "environment",
    status: "variant",
    path: "assets/art/environments/Sleek Puerto Rican Executive Resort Terrace.png",
    originalName: "Sleek Puerto Rican Executive Resort Terrace.png",
    bytes: 2576870,
    sha256: "ef862bdfed3c129277ac39312f681d91f0daf4ec3357bed6fc49f3435ad6e70d",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Selectable table setting."
  },
  {
    id: "env.moonlit-promenade",
    category: "environment",
    status: "variant",
    path: "assets/art/environments/Moonlit Puerto Rican Beachfront Promenade.png",
    originalName: "Moonlit Puerto Rican Beachfront Promenade.png",
    bytes: 2493674,
    sha256: "fd3231aad8c7a3ee7aa8ace409d5135cdbbcaf5a7eed886f1d6581a458dabc23",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Selectable table setting (night)."
  },
  {
    id: "env.jungle-camp",
    category: "environment",
    status: "variant",
    path: "assets/art/environments/Puerto Rican Jungle Camp Clearing.png",
    originalName: "Puerto Rican Jungle Camp Clearing.png",
    bytes: 3342573,
    sha256: "2ff66fe10f712a689d8a874767777345a8e654bde3be76c6617f39d799d56fe3",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Selectable table setting."
  },
  {
    id: "env.cave-waterfall",
    category: "environment",
    status: "variant",
    path: "assets/art/environments/Secret Cave Waterfall Platform.png",
    originalName: "Secret Cave Waterfall Platform.png",
    bytes: 3063918,
    sha256: "e1548692a36bb34690c0a34d6b4dbebdd9abfc8977b90eedc9a5de4f9ed81265",
    width: 1672,
    height: 941,
    hasAlpha: false,
    proposedUse: "Selectable table setting."
  }
] as const satisfies readonly ImageAsset[];

export type ImageAssetId = (typeof IMAGE_ASSETS)[number]['id'];

export const MISSING_ASSETS: readonly MissingAsset[] = [
  { id: 'audio.music', kind: 'audio', description: 'Original music (owner will supply later).', fallback: 'Silence; no audio is loaded.' },
  { id: 'audio.sfx', kind: 'audio', description: 'Tile click/slam, shuffle, draw, pass, win sound effects.', fallback: 'Silence; visual feedback only.' },
  { id: 'video.intro', kind: 'video', description: 'No video was supplied. None is required for v1.', fallback: 'Static illustrated title screen.' },
  { id: 'image.opponents', kind: 'image', description: 'Opponent / partner seat portraits for AI and second-human seats.', fallback: 'Seat badges with initials; silhouette reference exists but has an opaque background.' },
  { id: 'image.tile-sideview', kind: 'image', description: 'Edge-on / stacked tile art for the boneyard and opponent hands.', fallback: 'SVG tile backs rendered from the teal back sprite or flat colour.' },
  { id: 'image.ui-icons', kind: 'image', description: 'App icon / favicon and UI glyphs.', fallback: 'Inline SVG favicon with a 6|6 domino.' },
];
