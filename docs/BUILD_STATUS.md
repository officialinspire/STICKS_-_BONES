# Build status

## Stage 1 — Foundation ✅ (2026-11-15)

### Completed

- **Repository audit.** There was no `AGENTS.md` or prior code. The owner had
  uploaded 18 PNGs to the repo root, with no audio, video or rules documents.
  Two of the PNGs are byte-identical (`Roberto’s … Atlas.png` and `… Atlas-1.png`).
- **Art preserved and organized.** All 18 files moved with `git mv` to
  `assets/art/{characters,tiles,effects,tables,environments}/` under their original
  filenames. Content is byte-identical (SHA-256 recorded and verified). The
  original README's link to `assets/art/README.md` now resolves.
- **Typed asset manifest** (`src/assets/manifest.ts`, `types.ts`, `urls.ts`):
  measured bytes, SHA-256, dimensions, alpha, status (runtime/variant/reference/
  duplicate), proposed use, and per-frame content rects and cells for every
  sheet (48 frames over 10 sheets). Also records the missing audio, video and
  image assets with their fallbacks. Full write-up in `docs/ASSETS.md`.
- **Asset verification command** (`npm run assets:verify`). It re-measures every
  file and fails on byte/hash/dimension/alpha/frame drift, unregistered images,
  stray root uploads, or runtime-URL/manifest mismatch. Frame detection
  (`scripts/lib/measure.ts`) takes only rows × cols and finds uneven cut lines;
  it never assumes even packing. `npm run assets:measure` prints fresh numbers.
- **Runnable TypeScript + Vite app.** Vite 8, TypeScript 6 strict, ESLint 9
  flat config with engine-purity rules, Vitest 5. Relative base `./` for GitHub
  Pages subpaths (optional `BASE_PATH`). Emitted asset names are slugified to be
  URL-safe, and a post-build `check-dist` checks the output.
- **Illustrated placeholder screen.** Neighborhood-patio backdrop, Roberto
  portrait (atlas-2 `explaining` frame cropped via SVG viewBox), weathered table
  with a sample line of play (crosswise doubles, matching joints), three mode
  cards built from the preset (disabled "Play" buttons: no game yet), and the
  house-rules disclaimer. Responsive layout from 390 px phones to desktop.
- **Fallbacks.** Tiles draw a vector base, divider and canonical pips under and
  over the face sprite. Broken `<image>` elements are removed. The host falls
  back to a monogram, and backgrounds fall back to gradients.
- **Engine foundation** (`src/engine/`, pure and serializable):
  - `types.ts`: `Pip`, `TileId` (`t<high><low>`), `SeatIndex`, `ModeId`, `TargetScore`.
  - `tiles.ts`: canonical double-six generator (28 frozen tiles, canonical order),
    id parsing/validation, pip helpers, opening-strength comparator.
  - `rng.ts`: seedable, serializable RNG and shuffle contract `sfc32-fy/1`
    (cyrb128/splitmix32 seeding → SFC32 → rejection-sampled ints → Fisher–Yates),
    pure functional state, locked with golden vectors.
  - `rules/presets.ts`: versioned **Cousin's House Rules v1** for `draw2`, `block2`,
    `partnership4` (stock, no-move rule, opening rules for first hand, after
    out, after a block win and after a block tie, scoring, teams, turn order,
    targets), registry by `id@version`, and `checkPresetConsistency`.
  - `config.ts`: `MatchConfig` schema v1, `validateMatchConfig(unknown)` (never
    throws; rejects bad presets, modes, targets, seat counts/order, controllers,
    0 or 3+ humans, bad slots, AI profiles and names), and `createMatchConfig`
    (AI fills open seats). No seeds in configs.
  - `seats.ts`: counterclockwise `nextSeat`, `teamOf`, presentation `tablePosition`.
  - `deal.ts`: deterministic deal from the shuffle contract, checked against
    the preset's stock size.
- **Docs:** `docs/RULES.md` (house rules, seat/turn diagram, config validation,
  pagat.com sources with our deliberate differences), `docs/ASSETS.md`,
  `assets/art/README.md`, `README.md` (setup and commands), `AGENTS.md`.

### Commands run and results (clean `rm -rf node_modules && npm ci`)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass, 0 errors |
| `npm run lint` | pass, 0 problems |
| `npm test` | pass, **56 tests in 6 files** (tiles: 28 unique ids / all pairs / 168 pips; RNG golden vectors, determinism, serialization, uniformity; preset consistency and defaults; seat order/teams; deal partitions all 28 for every mode; 21 invalid-config rejections plus valid solo/two-human cases; fallback pip rendering for all 49 orderings; synthetic uneven-sheet measurement) |
| `npm run assets:verify` | pass. 18 assets, all frame rects re-measured exactly. Negative check: changing one byte count and one rect in the manifest and adding a stray PNG produced 3 errors and exit 1, as expected (then reverted). |
| `npm run build` | pass. 7 files, 8.7 MB, base `./`. `check-dist` passed. Also passes with `BASE_PATH=/STICKS_-_BONES/`. |
| Headless Chromium on `dist/` served at `/STICKS_-_BONES/` | 390×844 and 1366×900: no failed requests or console errors, no horizontal overflow, 30 pips rendered (= 6+6+6+4+4+1+1+1+1+0). With **all PNGs blocked**, tiles still showed correct pips and the host monogram appeared. |

### Known issues

- **Payload:** runtime PNGs total ≈ 8.7 MB (backdrop 2.75 MB, table 2.94 MB).
  Derived WebP sizes are needed for mobile (as new manifest entries, sources untouched).
- The large Roberto atlas frames bleed into their neighbours at low alpha, so the
  runtime uses atlas-2. The reference sheets have opaque backgrounds and need cut-outs.
- `npm audit` reports a **moderate** advisory in `minimatch`, pulled in by
  `typescript-eslint` (lint-time dev dependency only, not shipped). The suggested
  "fix" downgrades typescript-eslint, so we've left it alone until upstream updates.
- No rules source documents were included in the prompt pack. `docs/RULES.md` cites
  pagat.com pages (checked 2026-11-15) for comparison only.
- No deployment workflow yet (deploying wasn't authorized for this stage).

## Stage 2 — Pure rules engine ✅ (2026-11-15)

### Completed

- **State machine** (`src/engine/match.ts`): `createMatch` (validated config +
  seed → shuffle/deal → opener), `createMatchWithDeal` (explicit deals for tests
  and tutorials), and `applyCommand(state, command)`, which returns either a
  validated next state plus presentation events or the untouched state plus a
  typed error. Also `legalMoves`, `legalMovesForHand`, `availableAction`.
  Commands: `play`, `draw`, `pass`, `resolve-hand`, `start-next-hand`, each
  carrying `seq` to guard against stale turns.
- **Logical line** (`line.ts`): head → tail chain, two open ends, crosswise
  doubles (never spinners), one placement per matching end (both-end choices
  stay distinct), canonical tile id kept when flipped (`isFlipped` is a
  display hint only).
- **Opening** (`opening.ts`): highest double, else heaviest tile with ties
  broken by the higher end; double-six holder; previous winner; rotation;
  seat that went out; lowest member of the winning team with a turn-order
  tie-break; tie fallbacks. All driven by preset data.
- **Draw/pass/block/out**: draw one tile at a time only without a legal move,
  must play a drawn playable tile, pass only with an empty boneyard. Block
  when every seat passes in a row; plays reset the counter; draws can't trigger
  a block.
- **Resolution and scoring** (`scoring.ts`): final hands and totals are collected
  before anything is cleared, scored exactly once (duplicate resolves are
  rejected), and the target is checked → `match-over`. `start-next-hand` deals
  from the persisted RNG and picks the next opener.
- **Views/events** (`view.ts`, `events.ts`): per-seat redacted `seatView`.
  `redactEventsForSeat` hides drawn tiles and the opener's required tile from
  other seats.
- **Persistence/safety** (`serialize.ts`, `invariants.ts`, `simulate.ts`): JSON
  save/restore with full re-validation, whole-state invariants, and a bounded
  seeded simulator whose errors report the seeds needed to replay.
- **Docs:** new `docs/ENGINE.md` (flow, commands, line model, rule details,
  hidden information).

### Tests (`npm test` → 123 tests in 9 files, all passing)

- `line.test.ts` (8): opening placement, head/tail growth, both-end choices
  (different and equal pips), flip identity, crosswise doubles, blanks and the
  double-blank, illegal placement and broken-chain detection.
- `match.test.ts` (47): deal uniqueness/conservation and determinism; opening with
  the highest double, with no dealt doubles (6‑3 beats 5‑4), Block first hand,
  partnership double-six; every later-hand opener rule including teammate
  tie-breaks and tie fallbacks; both-end plays via commands; pass reset and
  counterclockwise order; forced draw until playable, can't draw/pass with a legal
  tile, exhausted boneyard with no premature block, no draw in Block; 14
  command-rejection cases plus replayed/stale commands and no input mutation;
  Draw out/block, Draw blocked tie, Block out/block/tie, partner going out,
  partnership block with the opener tie-break, partnership tie → double-six;
  exactly-once resolution; threshold crossing, exact target, falling short, and
  a 100-point partnership target; hidden-information views and event redaction.
- `simulate.test.ts` (12): **7 configs** (all modes; solo, two humans as
  partners/opponents; 100 and 200 targets) × 120 seeded matches. An **independent
  oracle** re-derives scoring and next opener straight from RULES.md and checks
  every hand. Invariants are checked after every command, with caps of 20,000
  commands per match and 400 hands; every outcome kind (out, block win, tie) is
  covered. Also: replay determinism, save → JSON → restore mid-hand at 3 points per
  mode continuing byte-identically, tampered-save rejection, deep-frozen inputs
  surviving a full match, and the simulator's cap error carrying both seeds.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (engine purity rules: no DOM/timers/`Math.random`/UI-asset-audio imports) |
| `npm test` | pass, 123 tests, ~4 s |
| `SIM_SEEDS=600 npx vitest run src/engine/simulate.test.ts` | pass, 4,200 matches, ~16 s |
| `npm run assets:verify`, `npm run build` | pass (no runtime change; bundle unchanged) |
| Fault injection (temporary, reverted) | Changing Block block-scoring in the preset, flipping the teammate tie-break, or dropping the pass-counter reset each made tests fail (oracle, opener and invariant checks respectively). |

### Decisions recorded

- `resolve-hand` is a separate command, so the UI can reveal hands before scores
  apply, and so "score once" is enforced by state, not by caller discipline.
- One `draw` command draws one tile, so the UI can animate each draw. The
  simulator and AI loop on `availableAction`.
- On an empty line either end is accepted and recorded as `head`.
- The opener's required tile is hidden from other seats until it's played. It's
  public in practice a moment later, but hiding it is the safe default for
  pass-and-play.
- Invariants enforce realism in no-draw modes (no hand larger than dealt; hands
  + line = 28).

### Known issues

- Payload, the large-atlas bleed, the dev-only `minimatch` audit advisory and the
  missing deploy workflow carry over from Stage 1.
- `HandResult.finalHands` keeps every hand in `history`. That's fine for local
  saves, but the UI must only show them after a hand ends (they're public then).
- Nothing is connected to the UI yet: the screen is still the Stage 1 placeholder.

## Stage 3 — First playable two-player table ✅ (2026-11-16)

### Completed

- **Tile atlas** (`npm run atlas:build`, `scripts/lib/atlas.ts`): 28 double-six faces
  plus 2 backs, built from **verified** `tile.materials` frame rects. Faces are
  96×192 with 4 px transparent padding, in stable canonical order (documented in
  ASSETS.md), with a JSON rectangle manifest. Identity comes from JSON ids, never
  cell position. Registered as derived asset `tile.atlas`.
- **Shared pip geometry** (`src/render/pips.ts`) is used by both the raster atlas
  and the SVG fallback. `src/render/tile-art.ts` serves faces from the atlas
  (looked up by id) and falls back to SVG until the atlas loads, if it fails, or
  when forced.
- **Developer contact sheet** (`/dev/contact-sheet.html`, dev server only): every
  face labelled by id, next to its SVG fallback and at 4 rotations, with 90
  in-browser checks (ids, values, bounds, alpha padding, pip pixel counts).
- **Board layout** (`src/board/layout.ts`): a pure, centre-out wrapping snake
  projected from the logical chain.
  - The head arm goes left then wraps up; the tail arm goes right then wraps down.
    Doubles sit crosswise and corners use a vertical turning tile.
  - Existing tiles never move when one is added, and wrapping can't change the
    logical ends.
  - The board pans (scrolls) and zooms (26–60 px per unit; the default is about
    29 px on phones and 46 px on desktop) instead of shrinking pips.
- **Table UI** (`src/ui/table.ts`, rendered only from the viewer's `SeatView`):
  - Scores with progress to the target, current turn, Cousin with a mood-matched
    portrait and running commentary, opponent backs and count, boneyard or
    set-aside count.
  - Tap-to-place: selecting a tile highlights its legal ends, and tapping an end
    confirms. When both ends are legal the player has to choose.
  - Keyboard: arrows/Home/End move through the hand, Enter selects, focus moves to
    the ends (arrows cycle them), Enter places, Escape cancels.
  - Hand sorting (by value / doubles first / as dealt) and a horizontally
    scrolling hand that holds 21 tiles.
  - Draw/Pass with a visible reason whenever disabled, buttons to jump to each
    end, round-results sheet that reveals both hands only after the hand ends,
    Next hand / Play again, and confirmation before Restart or Menu.
- **GameSession** (`src/app/session.ts`): the only place commands are applied.
  - Solo vs Cousin (fair AI `src/ai/simple.ts` reads only `seatView`).
  - Two players on one device, with a handoff screen that shows no hidden
    information.
  - **Developer-controlled local mode** (`dev-both`: both seats, no handoff).
  - AI turns and hand resolution are scheduled with stale-turn protection.
- **Menu** (`src/ui/menu.ts`): Draw/Block (Partnership shown as coming soon),
  opponent, 100/200 target. The **developer tools** panel (dev builds only)
  offers a seed, both-seats mode, force SVG, layout fixtures and a contact sheet
  link. Production seeds come from `crypto.getRandomValues` and are never shown.
- **Dev fixtures** (`src/dev/fixtures.ts`): max board (26 on the table → 27),
  21-tile Draw hand, and a both-ends choice.
- **E2E** (`npm run e2e`, `scripts/e2e.ts`): browser acceptance using the
  machine's Playwright against the Vite dev server.
- Removed the Stage 1 title screen. The material sheet is no longer bundled (the
  atlas replaces it), so dist dropped from 8.7 to 8.0 MB.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | pass |
| `npm test` | pass, **145 tests in 12 files**. New: atlas (5: identity, bounds/padding, pip blob counts for all 28 faces, backs, deterministic regeneration), layout (6: empty board, full 28-tile chain at widths 8–30, every intermediate line from 36 seeded games at 4 widths, wrapping keeps logical ends, added tiles never move, width clamp), session (9) and helpers (2) |
| `npm run assets:verify` | pass. 19 assets; the atlas's 30 frames re-measured and equal to its JSON rects |
| `npm run build` | pass. 8.0 MB, base `./`. Dev code, fixtures and the debug hook are not in the bundle |
| `npm run e2e` | pass. Full rounds in Draw vs AI (phone), Block vs AI (desktop), Draw pass-and-play with handoffs (tablet) and Block dev-both, each followed by Next hand. Pips counted from screenshots on all 26 board tiles at **rotations 0/90/180/270** in both the **atlas and SVG** renderers. Max board at phone (29 px units) and desktop (46 px); 6\|6 offers both ends, both visible after focus; 27 tiles after the final play. 21-tile hand: 42/48 px tiles, scrolls, End reveals the last tile. No overlap between HUD, Cousin, board, controls and hand; no horizontal page scroll. Keyboard-only placement with a both-ends choice and Escape. Restart/Menu confirmations. AI tiles never in the DOM during play. Contact sheet: 90/90 checks |
| Production smoke (dist served at `/STICKS_-_BONES/`) | menu has no dev panel; a vs-AI game starts, the atlas renderer is active, 3 tiles on the board, no console or network errors |
| Fault injection (temporary, reverted) | Flipping the high-half direction, or offsetting the turning tile, made the layout tests fail |

### Decisions recorded

- Wrapping snake plus pan/zoom instead of shrink-to-fit. The minimum unit is
  26 px; the pip diameter is about 19% of the tile's short side.
- Tapping an end is always required to confirm, even with only one legal end, so
  the interaction is the same every time.
- Corners: the turning tile is always vertical. A double right after a corner
  shifts one unit so it never overlaps the turning tile.
- Rejected moves and illegal taps put a reason in the status line (`role=status`)
  instead of failing silently.
- Seat 0 is always the human in solo play. In pass-and-play the bottom of the
  screen shows the active player only after they confirm the handoff.

### Known issues

- No local save/resume yet. Partnership (4 seats) isn't playable yet, though the
  engine supports it.
- Animations are minimal (glow on the newest tile). There's no drag-and-drop and no audio.
- The AI is a single heuristic level.
- E2E needs the machine's Playwright (it isn't a project dependency) and isn't in `npm run check`.
- Payload is still ≈ 8 MB of PNGs. WebP derivatives are still pending.
- Carried over: large-atlas bleed, dev-only `minimatch` advisory, no deploy workflow.

## Next stage — Stage 4: Partnership table, persistence and polish

Four-seat table (partner opposite, two AI or human seats, team scores), local
save/resume via `serializeMatch`/`restoreMatch` (stored locally only), an
event-driven animation queue (slide-in, draw, pass, host gestures from the
6-frame strips), smarter AI difficulty, settings (table setting picker from
the seven environments, reduced motion), WebP derivatives, and a GitHub Pages
deploy workflow if authorized.
