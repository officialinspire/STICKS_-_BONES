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

## Stage 4 — Fair AI (Easy / Normal / Hard) and solo Partnership ✅ (2026-11-16)

### Completed

- **Sanitized observation** (`src/ai/observation.ts`): own hand, legal moves,
  public chain and ends, public turn history, tile counts, mode/team/partner info,
  public rules, scores. It is deep-copied and frozen. Nothing hidden: no other
  hands, stock, boneyard order, seed or RNG state. ESLint blocks policy code from
  importing authoritative engine or app modules.
- **Engine: public action log** (`HandState.log`, state schema v2). Plays, passes
  with the ends at the time, and who drew (never which tile). Exposed through
  `SeatView`, and checked by invariants.
- **Policies** (`src/ai/`):
  - **Easy:** weighted random.
  - **Normal:** one-ply heuristic using pip disposal, doubles, suit coverage,
    opponents' pass voids, partner awareness, endgame weighting and lock-pip
    estimates.
  - **Hard:** determinized Monte Carlo, 64 worlds sampled consistently with pass
    voids and opening exclusions, with greedy rollouts.
  - Methods are reported honestly (`Decision.method`); see `docs/AI.md`.
- **Independent AI randomness:** one RNG stream per AI seat from a separate AI
  seed, never shared with the shuffle.
- **Runner** (`src/ai/runner.ts`, `worker.ts`): Web Worker in the browser, inline
  fallback.
- **GameSession:**
  - Async AI with `{epoch, seq, seat}` tokens. Reset/exit, pause, load and hand
    completion invalidate in-flight decisions.
  - A move applies only when both the decision and the presentation delay are
    done.
  - AI commands go through `applyCommand` exactly like human commands.
  - `pause()` / `resume()` / `load()` added. The table pauses while a confirmation
    dialog is open or the tab is hidden.
- **Solo play wired up** against Cousin in Draw and Block, and **solo Partnership**
  with three AI seats (Luz as your partner, against Cousin and Tío Rafa). Easy /
  Normal / Hard is chosen in the menu.
- **4-seat table UI:** partner opposite, opponents left and right, seat chips with
  counts, turn highlight and "passed / drew / thinking…" badges, team scores and
  team names, 4-hand results with team pip totals.
- Dev tools: an independent AI seed field and a "fast AI" delay toggle (dev only).
- `npm run ai:tournament`: mirrored seeded duels plus decision timing.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | pass (including the new AI import restrictions) |
| `npm test` | pass, **166 tests in 13 files**. New `src/ai/ai.test.ts` (16): observation whitelist with no hidden ids or RNG; **identical decisions after reshuffling all hidden tiles** (60+ positions × 3 difficulties); inference soundness against the real hands; sampled worlds respect sizes/voids/exclusions (relaxed < 2%); determinism; AI seed changes choices but not the deal; 9 full matches (3 modes × 3 pairings) with only legal commands; difficulties disagree on real positions; Normal > Easy and Hard > Normal in every mode (mirrored, fixed seeds); Hard < 500 ms; Normal uses an opponent's pass, and in Partnership treats a partner's void and an opponent's void oppositely. Session tests (15) now include full matches in all modes and difficulties, **reset during an AI turn cannot place a ghost tile**, pause/resume moves exactly once, load discards an in-flight decision, and requests carry no hidden data. Engine test for the public log |
| `npm run ai:tournament` (20 deals) | Normal vs Easy +2.9 / +3.3 / +13.5; Hard vs Normal +10.1 / +0.8 / +1.7; Hard vs Easy +15.2 / +3.6 / +20.2 points per hand (Draw / Block / Partnership). Hard decision time mean 0.9–1.6 ms, worst 15 ms |
| `npm run assets:verify` / `npm run build` | pass. The worker is emitted as its own chunk |
| `npm run e2e` | pass. Rounds completed: Draw vs Easy, Block vs Normal, Partnership vs Hard (phone), Partnership vs Normal (desktop), pass-and-play, dev-both. AI ran in a **Web Worker**, with **0 ms** of main-thread long tasks during play. **Restart during Cousin's thinking**: the restarted match stayed at seq 0 with 0 tiles. **Pause**: 0 tiles while the confirmation was open, exactly 1 AI lead after resuming. Every Stage 3 check still passes (pips at all rotations, fixtures, keyboard, hidden tiles) |

### Decisions recorded

- A draw isn't used as evidence (can't separate held from drawn tiles), so the inference stays sound.
- Partnership is solo-only in the menu for now. The session already supports two humans as partners.
- The AI seed is separate from the shuffle seed, both in production (two `crypto` seeds) and in the dev panel.
- State schema bumped to v2 for the public log. No v1 saves exist.

### Known issues

- Hard's sampler is approximately uniform. Rollouts are greedy and assume every seat
  plays the same simple policy. The edge over Normal is small in Block.
- No local save/resume UI yet (`GameSession.load` exists). No animation queue, no audio.
- Partnership with two humans and pass-and-play isn't exposed in the menu.
- Carried over: ≈ 8 MB PNG payload, large-atlas bleed, dev-only `minimatch` advisory, no deploy workflow.

## Stage 5 — Two humans on one device ✅ (2026-11-16)

### Completed

- **Two-human play in Draw, Block and Partnership.** Partnership seating is chosen
  before dealing: Player 2 across (partners), on the right, or on the left
  (opponents). Computers fill the other two seats. Player names flow into the
  match config, scores and covers. See `docs/SHARED_DEVICE.md`.
- **Controller state machine** (`src/app/privacy.ts`): `covered`, `revealing`,
  `human-turn`, `ai-turn`, `round-results`, `paused`. It is independent of game
  legality. Two explicit taps reveal a hand (*Ready*, then *Reveal hand*). Pause, tab
  hide, `pagehide`, orientation change, resume and restore all land on the cover.
- **TableController** (`src/app/controller.ts`):
  - The only object the UI talks to. It renders one revealed human's view or a
    concealed public table.
  - It redacts events for the revealed seat, and forwards intents only from the
    revealed human on turn.
  - Pausing cancels pending AI and resolve timers through the session's epoch tokens.
- **Engine:** `concealedView(state, perspective)` (no hand from any seat) and
  `SeatView.concealed`. `createMatchConfig` accepts display names.
- **GameSession** is now seat-explicit (`play/draw/pass(seat, …)`, `viewFor`,
  `concealedView`). Its viewer/handoff logic moved to the controller, and it emits
  raw events for the controller only. It also supports custom human seats, names,
  and AI RNG export/import.
- **Table UI:**
  - An opaque privacy cover outside the table, with the table `inert` and
    `aria-hidden` while it's up.
  - No hand in the DOM unless revealed, a public message during computer turns,
    and public-only bubble/live-region text (never a drawn tile).
  - Status and selection are cleared when the hand isn't revealed.
- **Local save/resume** (`src/app/save.ts`): autosave after every change, Resume or
  Discard in the menu with a public summary, full re-validation on load, and
  tolerant of storage that throws. Restored two-human games open covered.
  Developer matches aren't saved.
- **Menu:** two-player options for every mode (names, Partnership seating), the
  skill option shown only when a computer plays, and fieldsets fixed so the
  setup fits at 320 px.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | pass |
| `npm test` | pass, **183 tests in 16 files**. New: `privacy.test.ts` (6 state-machine cases); `controller.test.ts` (9): all five seatings × 3+ complete hands with random tab-hide/resume and orientation events, a privacy scan of the rendered view at every step, covered→revealing before every human turn, no drawn tile while covered, turn order from the public log, scores and team names; AI turns between humans; restore opens covered; solo never covers; covered intents ignored. `save.test.ts` (3): round trip, tampered/finished/dev saves rejected, throwing storage. Session tests updated for the seat-explicit API |
| `npm run assets:verify` / `npm run build` | pass |
| `npm run e2e` | pass. Five two-human seatings × 2 complete hands each, with 0 hand flashes recorded by a DOM mutation observer. While covered: no hand tiles or private `data-tile`, table `inert`, the cover is `aria-modal`, the accessibility snapshot has no hand labels, and no drawn tile in the live region or bubble. Tab hide, orientation change and a cancelled menu each re-cover, followed by an explicit re-reveal. Reload → Resume (public summary, no tile ids) → covered with no hydration flash. Menu fits at 320 px. Solo, ghost-tile, pause, pip-rotation, fixture and keyboard checks from earlier stages all still pass |

### Decisions recorded

- "Not \<name\>" on the reveal step returns to the pass-the-device cover.
- Opening a confirmation dialog pauses the table. In two-human games, cancelling it
  re-covers the hand, as the spec requires ("on pause … default to covered").
- Bubble and live-region text are always public on a shared device. Private hints
  appear only in the status line next to the revealed hand.
- Leaving a match keeps its save (Resume from the menu). Restart starts fresh.

### Known issues

- Privacy is ordinary shared-device protection: the save and devtools expose
  everything (documented).
- The cover is a deliberate two-tap flow, which some players may find slow. A
  setting could merge the steps later.
- Carried over: no animation queue or audio, ≈ 8 MB PNG payload, large-atlas
  bleed, dev-only `minimatch` advisory, no deploy workflow.

## Stage 6 — Art integration, Cousin's voice, menus and table polish ✅ (2026-11-16)

### Completed

- **Art with stable anchors** (`src/render/stage.ts`, `src/ui/host.ts`):
  - Every Cousin frame is shown through a shared, bottom-anchored stage box per
    sheet. Tested for every frame: full figure included (hat never cropped), never
    outside its own cell (no neighbours), drift ≤ 6 px, no distortion (`meet`).
  - A compact bust on small screens; the full figure on wide screens, in menus and
    in results.
  - The patio backdrop and weathered tabletop are the one polished setting.
    Optional slam strip and effects sheet, each loaded on first use.
  - Code-drawn placeholders for every missing image. The monogram shows only when
    the portrait art actually fails.
- **Expressions and slam** driven by public engine events. The slam plays on a
  domino and when Cousin plays a double, in the full-figure view only. It is never
  awaited and is skipped under reduced motion or when turned off.
- **Cousin's voice** (`src/app/banter.ts`):
  - Opening line "Fuck that, we playing DOMINOES!", or "Forget that, we playing
    DOMINOES!" with the explicit-language setting off (on by default, as specified).
  - Short contextual lines in plain English (no phonetic accents), last-8 repeat
    suppression, routine lines only sometimes, a banter-off switch.
  - The live region announces exactly what the bubble shows, and lines are chosen
    from public events only.
- **Screens:**
  - Home (New game / Resume / How to play / Settings).
  - Setup, with the **selected mode's rules generated from preset data, shown above
    Deal** (`src/ui/rules-summary.ts`).
  - Rules for all modes, and Settings: language, banter, slam, motion, computer
    speed (presentation delay only, via `GameSession.setThinkingSpeed`).
  - A compact HUD with a **pause sheet**: Resume, Restart, Leave, Rules, Settings.
  - Results with larger Cousin art, a score tally, and **Rematch** (same setup;
    works for resumed games).
- **Table feedback:** selection outline; ✓ badge on legal tiles (not colour alone);
  **endpoint ghost preview** oriented as the tile would land, on each legal end;
  260 ms placement easing; a restrained impact puff (gold star on a domino); a pass
  "knock" on the passer's chip; the score tally. Effects are `pointer-events: none`,
  sit below the end targets and HUD, last ≤ 0.9 s, and are cleared under a privacy
  cover.
- **Reduced motion:** follows the device by default, or can be forced on or off.
  Reduced means no effects, slam or easing, and an instant tally.
- New dev fixture **match-point** (Draw, 95 points, one tile from going out) for
  testing match results and rematch.
- Docs: `docs/PRESENTATION.md`; ASSETS, README and AGENTS updated.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | pass |
| `npm test` | pass, **196 tests in 19 files**. New: stage boxes (6: portrait atlas, slam and place strips per frame; large atlas proven unstageable; bust keeps the hat; effect boxes), banter (6: both opening variants, clean mode profanity-free across all contexts, banter off, no repeats in the window, routine vs big moments, live reconfiguration), rules summary from preset data |
| `npm run assets:verify` / `npm run build` | pass. Dist is 10.5 MB (slam strip and effects sheet now bundled, loaded lazily) |
| `npm run e2e` | pass. Opening line explicit, then clean after the Settings change, with the live region matching the bubble; banter turned off from the pause sheet leaves facts only; setup shows the selected mode's rules above Deal and updates with the mode; every Cousin frame swap observed on phone (bust) and desktop (full, slam played) matches its stage box; while effects play, end targets stay topmost, effects take no input and the scores stay visible; reduced motion → 0 effects, no slam, instant tally; match point → match result → Rematch → Hand 1; every PNG blocked → vector tiles, visible monogram, no overflow. All Stage 1–5 checks still pass (privacy covers ×5 seatings, ghost tile, pause, pips at all rotations, fixtures, keyboard) |

### Decisions recorded

- Explicit language is on by default because the owner specified the opening line.
  Clean wording is one setting away, and banter off silences Cousin entirely
  (facts stay).
- The slam only plays where the full figure is visible; the compact bust keeps
  static expressions.
- The place-gesture strip is not used. The large Roberto atlas stays unused (it
  can't be staged cleanly, as a test shows).
- Restart and Leave moved into the pause sheet to keep the HUD compact.
- E2E loop clicks use short timeouts and re-check state, because the table can
  legitimately change (cover, results) between finding a button and clicking it.

### Known issues

- Payload is now ≈ 10.5 MB of PNG (the optional art loads on demand). WebP
  derivatives remain the main size win.
- No audio yet: the knock and slam are visual only, and music is still to come
  from the owner.
- Carried over: dev-only `minimatch` advisory, no deploy workflow.

## Stage 7 — Start screen, studio intro and audio ✅ (2026-11-16)

### Completed

- **Owner's music integrated:** "Patio Dominoes (Take 2)" (menu/results) and
  "Domino Table (Subtle Vibe)" (gameplay), merged from `main` and moved
  byte-identical to `assets/audio/music/`.
  - Measured audio manifest (`src/assets/audio-manifest.ts`): duration, format,
    LUFS, normalisation gain, silences, ending type. Bytes and SHA-256 are verified.
- **Loop points:** analysed with `scripts/audio-audit.py` and **not assumed**. No
  seam is proven seamless, so runtime plays each composed ending and restarts.
  The candidates are recorded with `auditioned: false`, and there's a dev audition
  page at `/dev/audio-audition.html`.
- **Startup:** start screen (touch, click or any key) → studio intro, if
  `assets/video/inspiresoftwareintro.mp4` is supplied (it isn't yet) → controlled
  fade through black → menu.
  - The intro has accessible Skip (Esc too) and Mute buttons.
  - One guarded `IntroController.finish()` handles Skip, ended, error,
    start/stall/overall timeouts, play() refusal and a missing file.
  - The video is released before menu music can start.
  - The start gesture plays no sound.
- **AudioManager:**
  - Exclusive scenes: init, intro, menu, gameplay, paused, results.
  - Gesture unlock (no AudioContext before the gesture) and persisted
    master/music/SFX/voice/ambience levels plus mute.
  - Fades with no music overlap, a token guard on every async step, per-sound and
    global SFX caps, graceful missing/broken files, and visibility/focus handling
    that resumes only the current scene.
- **Web Audio backend:** music streams from `<audio>` elements through gain nodes.
- **Placeholders, clearly labelled:** code-synthesized SFX (place, knock, draw,
  slam, tap) and an optional patio ambience bed (off by default, seamless loop by
  construction).
- **Optional haptics,** feature-detected.
- **Voice:** none recorded, so subtitles and expressions carry Cousin.
- **Settings:** Sound section (mute, five sliders, ambience, haptics).
- **Table and menu wiring:** scene changes, SFX and haptics on public events, and
  reset on teardown.
- Docs: `docs/AUDIO.md`.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | pass |
| `npm test` | pass, **216 tests in 22 files**. New: audio manager (11), intro races (8), ambience loop continuity (1) |
| `npm run assets:verify` / `npm run build` | pass. Dist 18 MB, of which music is 7.5 MB, streamed on demand |
| `npm run e2e` | pass. No-video start (menu once, music only after the gesture, background → silent → resumed, reload silent until tapped). A generated WebM credit played out with at most 1 concurrent media source. Double-click start + mute + double Skip + Escape → one menu, mute kept, no stale callbacks. 404, play() refusal and a hanging download each enter the menu once. Mobile-emulated tap start. Gameplay → results → rematch → pause → restart with ≤ 1 music source and SFX cut on reset. No unhandled rejections. All earlier stages still pass |

### Known issues

- The intro video isn't supplied yet. When it is, H.264 MP4 plays on mobile
  Safari/Chrome; open-source Chromium (as used in e2e) lacks H.264, so e2e uses a
  WebM fixture.
- SFX and ambience are placeholders until the owner supplies files. Music loops
  await the owner's audition.
- One e2e run stalled in a two-human Partnership round while a CPU-heavy build ran
  alongside it. It didn't reproduce in isolation or on re-run. Stuck-round
  diagnostics now print the full table state if it happens again.
- Music files embed 1.4 MB of cover art (a stripped derivative would save space).

## Stage 8 — Versioned saves, statistics, help and results arithmetic ✅ (2026-11-16)

### Completed

- **Versioned local records** (`src/app/storage.ts`): `{format, version, data}`
  envelopes for the match save (v2, migrates the Stage 5 save), settings (v2,
  migrates the legacy object) and statistics (v1).
  - Reading never throws.
  - Damaged data is "corrupt"; newer data or an unknown rules preset is
    "incompatible". Either way it is quarantined to `<key>.quarantine` and the menu
    explains what happened.
  - Blocked storage is announced too.
- **Match saves** (`src/app/save.ts`): full deterministic engine state with the
  preset id and version, the AI RNG streams, the setup and a match id. No
  presentation state.
  - Restore re-derives everything: an AI turn asks once afresh (a stale in-flight
    decision is dropped), a finished hand is scored exactly once, an already-scored
    hand keeps its score.
  - Two-human games open covered.
  - Autosave after every change; a finished match clears its save.
- **Actions in every state:** resume, next hand, rematch/restart, menu and reset
  all work during human turns, AI thinking, results and handoffs. The cover has a
  new "Save & leave to menu" button, because under the cover the table is
  inert, so Pause was unreachable.
- **Statistics** (`src/app/stats.ts`, menu → Statistics):
  - wins and losses vs the computer by mode × difficulty;
  - two-player completed matches, plus the partners' win–loss record;
  - **abandoned kept separate from losses** (discard, restart, or replacement by a
    new game; leaving to the menu keeps the save);
  - recorded once per match id; a two-tap reset.
- **Help screen** (`src/ui/help.ts`): written from RULES.md, covering opening,
  drawing/passing, blocked scoring, counterclockwise turn order (diagram) and the
  bonus exclusions. Tests cross-check it against RULES.md and the presets.
- **Results arithmetic** (`src/app/explain.ts`): per-hand pip sums (zero-pip tiles
  and empty hands shown), team sums, the decision, and the points rule with its
  arithmetic. Always equal to the engine's points.
- **Fixed — a Stage 7 regression in `main.ts`:** a script edit had duplicated the
  boot block into `onDiscard` and `resume`, so **Discard re-ran the start screen**.
  It compiled and wasn't covered by a test. `main.ts` is rewritten, and e2e now
  checks Discard.
- New dev fixture `match-point-solo` (counts in statistics).
- Docs: `docs/SAVES.md`.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | pass |
| `npm test` | pass, **232 tests in 24 files**. New: storage recovery (missing/ok/migrated/corrupt/newer/unavailable, quarantine), settings migration and fallback, save v2 round trip, v1 migration, tampered/unknown-preset/truncated/future saves, restore at hand end (scored once), after scoring (not re-scored, Next hand works), during AI thinking (old decision dropped, one fresh move), uninterrupted vs save-and-resume giving an identical history and scores, statistics (once per id, abandoned ≠ loss, two-player and partners, damaged data), results arithmetic against engine points on more than 150 simulated hands plus tie, zero-pip and preset wording, and the help screen against RULES.md |
| `npm run assets:verify` / `npm run build` | pass |
| `npm run e2e` | pass. Refresh during a human turn → Resume gives an identical engine state and match id. Refresh during AI thinking → restored = saved, then fresh AI decisions, 0 stale. Damaged save + settings → notice, quarantined, defaults. Statistics: a win counted once and persisted across reload; leaving to the menu isn't abandoned; replacing or restarting counts as abandoned, never lost. Discard returns to the menu with feedback. Leave/resume during a handoff (covered) and with the results sheet up (no double score, Next hand works). No dead buttons (home, statistics, rules, pause sheet). All earlier stages still pass |

### Known issues

- Statistics and saves are per device and browser (by design, no accounts).
- The quarantine keeps one slot per record; a second damaged copy replaces the first.
- Carried over: intro video not yet supplied; placeholder SFX/ambience; music loops
  await the owner's audition; ≈ 18 MB dist (music streamed on demand).

## Stage 9 — Rendered-screen QA, accessibility, input and performance ✅ (2026-11-16)

Full write-ups: `docs/QA.md` (screens, faults, a11y results, browsers, devices still
needed) and `docs/PERFORMANCE.md` (measurements, derivatives, loading, byte budget).

### Completed

- **New evidence tools:**
  - `npm run qa`: 6 viewports × 9 real screens, with DOM metrics, contact
    sheets and an atlas-bleed check at DPR 1/2/3.
  - `npm run a11y`: axe, keyboard, focus traps, screen-reader privacy,
    non-colour cues, reduced motion, emulated safe areas, orientation.
  - `npm run perf`: profiles the production build on emulated 4G with a 4× CPU
    slowdown, and can measure an older commit through `PERF_ROOT`.
  - `npm run assets:derive`: builds the WebP derivatives.
- **First QA pass: 62 failures → 0.**
  - Fixes are listed in `docs/QA.md`.
  - High impact: phone landscape was unplayable; the landscape menu had every
    button below the fold; open ends were 24–27 px tall on phones; results opened
    scrolled past the title; Tab escaped modal sheets and the cover.
- **Board fit-to-height:** the whole chain and both open ends show on short
  screens; manual zoom still overrides.
- **Comfortable targets:** 44 px for repeated controls. Hand tiles are 40/38 px
  wide on the smallest screens (above the 32-px floor) so a 7-tile hand fits.
- **Fixed — audio:** a scene change during the 0.45 s fade-out could leave the
  old track playing under the new one. Found by the new rapid-action e2e; unit
  tests fail on the old code.
- **Runtime images are WebP derivatives:**
  - same dimensions, originals untouched;
  - edge error and alpha are measured and gated;
  - 10,069 KB → 1,417 KB, with the tile atlas lossless;
  - `assets:verify` checks hashes, source and dimensions, and that `urls.ts`
    serves the derivative.
- **Loading:** only the backdrop and portrait load at the start screen. The atlas
  and tabletop are then warmed through a queue of at most 2 downloads, followed
  by optional art this device will show.
- **Byte budget** enforced in `npm run build` (table in `docs/PERFORMANCE.md`).
- **E2E:**
  - new section 9: a 400-tap seeded rapid-action burst, plus a double-tap on an
    open end that must play exactly one tile;
  - the missing-art test now blocks WebP as well as PNG.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run check` (typecheck, lint, **239 unit tests in 25 files**, assets:verify, build + budget) | pass |
| `npm run qa` | **0 failures** across 54 screen captures. 6 comfort warnings, all the deliberate 40×80 / 38×76 hand tiles. Smallest pip 4.56 px (board, 360×800 longest chain). Largest Cousin upscale ×1.24. Atlas bleed: 0 neighbour pixels in 27 cases (DPR 1/2/3). |
| `npm run a11y` | **0 failures.** axe 0 violations on 12 screens; keyboard, traps, privacy, cues, reduced motion, safe areas, orientation all pass. |
| `npm run e2e` | pass. All earlier stages plus rapid actions: 400 taps; at most 1 table, 1 music track and 1 dialog at a time; board = engine line; a double-tap plays one tile. |
| `npm run perf` (5 runs each, Stage 8 build vs this) | Start-screen bytes 4,882 → 579 KB. Menu backdrop 7.3 s → 1.2 s. Tabletop ready 5.7 s *before* the deal (was 6.0 s after). Session image bytes 8,331 → 1,155 KB. Decode work up (75 → 132 ms) but 0 ms on the main thread. Longest play task 60 → 59 ms and input 80 → 64 ms, ranges overlapping: no regression, not claimed as a win. |

### Known issues

- **Firefox and WebKit were not tested.** No build is available here and
  Playwright browsers must not be downloaded. The real-device list in
  `docs/QA.md` is outstanding: none of it has happened.
- Hand tiles under 44 px on 360-px phones and in phone landscape (deliberate).
- WebP costs more decode CPU than the old PNGs (off the main thread).
- Carried over: intro video not supplied; placeholder SFX/ambience; music loops
  await the owner's audition. The dist is now ≈ 8.9 MB, mostly music.

## Stage 10 — Installable PWA with safe offline play, updates and repair ✅ (2026-11-16)

Full write-up: `docs/PWA.md`.

### Completed

- **Manifest** (`public/manifest.webmanifest`): `id`, `start_url` and `scope` are
  relative, so the app works under any GitHub Pages subpath. Display is standalone.
  It lists 4 icons (192/512, any + maskable), plus an Apple touch icon.
- **Icons** (`npm run icons:build`):
  - generated from the approved portrait atlas, using the game's own bust box;
  - **maskable safe area measured**: foreground within r = 0.392–0.395 of a 0.40
    limit;
  - hash-locked and source-locked in `assets:verify`, which also checks that the
    manifest icons and URLs are relative.
- **Service worker** (`src/pwa/sw.js`, generated per build by the `sticks-pwa`
  Vite plugin, build id = hash of every emitted file):
  - scope = the app directory only;
  - only `inspire:sticks-and-bones:*` caches;
  - no unregister, and no `skipWaiting` without the player's action;
  - **minimal shell** precached all-or-nothing (7 files);
  - **optimized WebP images** cached deliberately, 2 at a time; truncated
    downloads are never stored; quota errors are reported;
  - **no PNG source sheets, music or video** (the build fails if a PNG sheet is
    bundled).
- **Offline status** on the menu and in Settings → Offline & storage, as a live
  `role="status"` line, for example "✓ Ready to play offline (1.6 MB saved on
  this device). Music needs a connection." There are also partial, quota and
  unsupported states.
- **Update available** (menu banner and pause sheet). "Update now" does this:
  - saves the engine state;
  - stops the table, so no AI move can land after the save;
  - clears the screen, so no hand is visible;
  - lets the waiting worker take over, then reloads;
  - afterwards a notice is shown, and Resume restores the match (behind the cover
    for two humans).
- **Repair offline files** deletes and re-downloads only this app's caches; saves
  and settings are kept. **Erase saved game, settings & statistics** is a
  separate two-tap action: it removes only `sticks-and-bones.*` keys and keeps
  the offline files.
- `<html data-build>` shows which build is running (`SB_BUILD_TAG`).
- Byte budget gains `icons` (140 KB) and `service worker` (16 KB) lines.

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run check` | pass, **242 unit tests in 26 files**. New: cache/storage isolation with look-alike names; status wording. |
| `npm run pwa` | **pass.** The full scenario list is in `docs/PWA.md`. **Measured cache: 1,668,179 B** (shell 211.8 KB in 7 files + images 1,417.2 KB in 6 files). |
| `npm run e2e` / `npm run qa` / `npm run a11y` | pass / 0 failures / 0 failures (dev server; the PWA UI only exists in production builds and is axe-checked by `npm run pwa`) |

What `npm run pwa` covered:
- subpath first visit;
- offline reload completing a hand vs the computer (silent music; 0 app files
  requested from the network);
- interrupted downloads → partial status → offline hand with vector faces →
  Repair → ready;
- quota at 700 KB and at 40 KB → storage message, online play still works;
- update A → B mid-match with two humans → identical save, opens covered, old
  shell cache gone;
- repair and erase leave the other app's worker, caches and localStorage intact;
- axe: 0 violations on the offline panel and on the pause sheet with the update
  banner.

### Known issues / browser limitations

- Only Chromium was tested. iOS Safari has no install prompt, gives home-screen
  apps separate storage, and may evict storage after about 7 days without use.
  Firefox desktop doesn't install sites as apps. Private modes may disable
  service workers. Details are in `docs/PWA.md`; none of this has been verified
  on devices.
- Music and the (unsupplied) intro video are never cached: offline play is silent.
- Storage is best effort (no `navigator.storage.persist()` request).

## Stage 11 — Release prep: analytics adapter, CI, Pages workflow, handoff ✅ (2026-11-16)

Full handoff: `docs/RELEASE_HANDOFF.md`. Also new: `RELEASE_NOTES.md`,
`docs/ANALYTICS.md`, `docs/PLAYTEST.md`.

### Completed

- **Analytics: inspected first, then a disabled adapter.**
  - This repository has no analytics implementation, configuration, consent
    behaviour, keys or attribution contract.
  - A code search of the owner's account found one in `officialinspire/SPIRITBALL`
    (`js/analytics.js` + QA). Attaching that repository was **refused**, so it was
    not inspected and nothing from it was copied.
  - `src/app/analytics.ts` covers these events: `game_launch`, `match_start`
    (fresh/rematch/restart, on the first real move), `match_resume` (explicit,
    never a start), `round_end`, `match_end`, and sanitised `app_error`.
  - Every payload is rebuilt from a per-event allowlist, so no hands, seeds,
    moves, names, saves or images can be included. Events are de-duplicated
    against re-renders, restores, rematches and double taps.
  - It is **disabled**: no transport, consent treated as "not granted". No
    query parameters are read; promo/launch-ID support is pending a contract.
- **Complete matches in every supported arrangement** (`npm run matches`): 3 vs
  the computer + 5 two-human (Draw, Block, Partnership across/right/left).
- **Grammar fix:** team names now take "win" ("Cousin & Tío Rafa win the match!").
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, unit/engine tests, asset
  verify, build (budget + base path + PWA), browser smoke (`npm run smoke`) on
  every push and pull request.
- **Pages deploy** (`.github/workflows/deploy-pages.yml`): runs only on a push to
  `main` or a manual dispatch; check + smoke, then upload `dist/`. **Not run, and
  nothing is deployed.**

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run check` | pass, 250 tests in 27 files |
| `npm run e2e` | pass |
| `npm run matches` | pass: 8/8 complete matches, clean console, analytics labels correct |
| `npm run pwa` | pass, offline cache 1,672,882 B |
| `npm run qa` / `npm run a11y` | 0 failures / 0 failures |
| `npm run smoke` | pass |
| GitHub Actions CI | **success**: run 2 on da30779 (https://github.com/officialinspire/STICKS_-_BONES/actions/runs/43944065875). npm ci, typecheck, lint, tests, assets:verify, build and the Playwright browser smoke all passed on ubuntu-latest in 2 min 20 s. Run 1 (c6fd219, same code) was superseded by run 2 through the workflow's concurrency setting. |

### Known issues

The list is in `docs/RELEASE_HANDOFF.md` §3:
- analytics inputs are still needed;
- placeholder SFX and ambience;
- music loops unauditioned;
- intro video missing;
- Firefox, WebKit and real devices untested;
- platform PWA limits.

## Stage 12 — Visual identity, responsive interface and the Story shell ✅ (2026-11-16)

Story tracking: `docs/STORY_BUILD_STATUS.md`. Design system: `docs/DESIGN.md`.

### Completed

- **Owner inputs merged from `main` without overwriting:**
  - the approved script, `docs/STORY_SCRIPT.md` v0.2;
  - four story-cast atlases, catalogued under `assets/art/characters/` with their
    original filenames: Vale, Luz, Marisol, Rafa (variants).
- **Scope:** `AGENTS.md` now records the owner's approval of NO REST FOR COUSIN,
  replacing the old no-campaign rule. Every architectural requirement is kept.
- **Design tokens:** six colours plus an explicit allowlist of pairings, contrast-tested
  (including disabled states, a two-tone focus ring and scrims over the worst-case
  backdrop). Gold on ivory (1.65:1) is forbidden for text. Destructive buttons became
  outlined ivory.
- **Fonts:**
  - Bricolage Grotesque (61 KB) and DM Sans (21 KB), self-hosted WOFF2 subsets;
    OFL 1.1 verified, with no Reserved Font Name; licenses shipped in `licenses/`.
  - Spanish accents, ñ, ¿, ¡ and typographic quotes included.
  - Metric-matched fallbacks: measured CLS 0.0199.
  - Tabular scores via Bricolage's `tnum` (this DM Sans build has none).
  - The base font is now `1rem`, which fixes a bug where the player's browser
    text-size setting was ignored.
- **Wordmark:** vector master, monochrome and compact variants, with a domino-linked
  ampersand and accessible text. It's used on the start screen, the menu and Story,
  where the subtitle reads NO REST FOR COUSIN.
- **Destinations:** Story / Quick Play / Two Players, with How to Play · Settings ·
  Statistics. Quick Play and Two Players preselect their opponent. Every existing
  mode still works (8 complete matches).
- **Story shell:**
  - New Case / Continue Case, a two-tap start-over that resets Story only.
  - Chapter selection for all seven chapters (titles, locations and hands come from
    the script).
  - A notebook and evidence panel.
  - **The Prologue plays from the verbatim script** with captions, transcript, text
    size, skip, back and keyboard control.
  - Story progress is a separate versioned record.
  - Chapter play and replay are labelled "next build stage".
- **Script pipeline:** `npm run story:build` turns section 4 into `src/story/script.json`
  (492 blocks), loaded as a lazy 76 KB chunk. A test proves it reproduces section 4
  line for line.
- **Components:** speaker labels, dialogue and caption panels, chapter cards, evidence
  panel, notebook entries, cinematic controls. Sheets and covers are re-skinned.
- **Layouts:**
  - portrait stacked;
  - short landscape split (compact wordmark, nothing below the fold);
  - tablet balanced;
  - desktop composed (max 1080 px, no stretched panels).
- **Hand targets:** gap-split `::before` hit areas give ≥ 44 px without overlapping
  neighbours (40 + 4, 38 + 6). The QA comfort warnings are gone.
- **Prologue backdrop:** the cave is now a runtime WebP derivative (292 KB), warmed
  only when Story opens.
- **Found and fixed during QA:**
  - the vignette layer painted over the scene player;
  - a generic positioning rule broke the privacy cover's fixed position (page scroll
    under the cover);
  - chapter-location text was clamped and hidden;
  - axe: a label-content mismatch on Back, a nested `<main>`, a missing `h1` in the
    scene.
- **Earlier findings:**
  - Save failures now show a persistent "Not saved" banner (autosave and Story); the
    update-time retry is still open.
  - The PWA base-path build warning was rechecked: it's an intentional runtime
    resolution, now annotated, and the build is warning-free.
  - Music recovery, AI worker resilience and version alignment remain open (see
    `docs/STORY_BUILD_STATUS.md`).
- **Budgets restructured from measurements:** core code 268/300 KB, story script
  75/100, fonts 80/100, images 1,703/2,000, startup 868/900 KB. Fonts and the script
  chunk are now precached for offline play.

### Commands run and results (Chromium only)

| Command | Result |
| --- | --- |
| `npm run check` | pass: **278 tests in 30 files**. New: tokens/contrast, the script's verbatim round-trip and structure (3 Draw, 2 Block, 2 Partnership), story progress, speaker labels. Asset verify and build budgets pass. |
| `npm run qa` | **0 failures, 0 comfort warnings**: 6 viewports × 11 screens (new: story case file, story scene); atlas bleed 0/27; browser text size 150% and 200% on menu, story and setup; tabular digits; CLS 0.0199 |
| `npm run a11y` | **0 failures**: axe clean on 15 screens and dialogs, including the story case file, scene and transcript; keyboard Enter advances; the transcript traps Tab and closes on Escape |
| `npm run e2e` | pass (all earlier stages, including the 400-tap rapid-action burst). The first attempt failed only because I edited a source file mid-run and the dev server hot-reloaded the page; the re-run without edits passed. |
| `npm run matches` | pass: complete matches in all 8 arrangements, clean console |
| `npm run pwa` | pass: offline cache **2,188,958 B** (10-file shell, 435 KB, now including both fonts and the lazy script chunk; plus 7 images, 1,702.5 KB). Offline hand, interrupted downloads (now "2 of 7"), quota, update A → B and repair/erase all pass. The test's hard-coded "of 6" was replaced by the build's own image count. |
| `npm run build` + `npm run smoke` | pass (production subpath, offline restart, clean console) |

### Known issues

- **Not tested:** Firefox, WebKit and real devices; safe areas are emulated only.
- **Cast portraits** need expression labels before they can be used.
- **Story chapters 1–7 and the epilogue** aren't playable yet (labelled in the UI).
- **The total dist is 9.58 MB of a 9.8 MB budget**, mostly music. The next story
  backdrops will need a deliberate raise.

## Stage 13 — Playable story chapters and the cinematic presentation system ✅ (2026-11-17)

Details: `docs/CINEMATICS.md`. Story checklist: `docs/STORY_BUILD_STATUS.md`.

### Completed

- **Chapter play** (it didn't exist yet, despite the brief's "now-playable story"):
  - one guarded hand per chapter, on the frozen presets with the fair AI;
  - named seats (Tío Rafa, Marisol, Vale, Luz) via a new `seatNames` session option;
  - any result advances: verbatim Win/Loss/Tie insert → common continuation → notebook
    entry → next scene;
  - epilogue "Case complete";
  - replay of completed chapters is memory-only.
- **Progress v2** (migrates v1) saves the scene, part, beat and outcome, plus the
  in-progress hand **from the deal onward**. Completion is written once, together with
  the outcome.
- **SceneDirector** (`src/story/director.ts`):
  - explicit states;
  - tokens that every async continuation must still hold;
  - `settle()`, so backgrounding or Skip never leaves a blocker;
  - reveal-first single-step input with a 180 ms double-tap guard;
  - `enterHand` only once per scene;
  - default timings (550 ms scene fades, 260 ms actors) and reduced-motion timings
    (120 ms simple fades, no reveal or move).
- **Stage view:**
  - backdrops are decoded before the curtain opens, with a drawn fallback and no blank;
  - light grades, threshold glow, water, boundary, warmth;
  - Roberto's bust via `HostView` (stable boxes, no double face), in the flow above the
    dialogue, shown only on his lines and reaction beats.
- **Staging for every moment in the brief:** anchored to the script's exact stage
  directions (tested). Chapter 6's hand and rest-area beats are never on the ancient
  platform.
- **Five chapter backdrops** as on-demand WebP derivatives (the jungle at q84, because
  q80 failed the quality gate).
- **The Story layer is now a lazy chunk:** startup fell from 894 to 866 KB.
- **Story audio cue hooks** route through the central AudioManager; story tables have no
  banter.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass (new tests: director 9, staging 3, chapters 4) |
| `npm run story:e2e` (new) | pass. Covered: rapid taps (0–1 beat per burst); skip during transitions; double Deal → one hand; refresh mid-dialogue (same beat) and mid-hand (identical tiles); a real hand → its verbatim insert (passed as a win and as a loss on separate runs); completion once; missing images; backgrounding; reduced motion; rotation; repeated navigation; 10 staged moments in portrait and short landscape |
| `npm run e2e` / `npm run qa` / `npm run a11y` | pass / 0 failures / 0 failures |
| `npm run pwa` / `npm run smoke` | pass (offline cache 3,595,963 B, including the scene backdrops) / pass |

### Bugs found and fixed while testing

- A refresh before the first move dealt a new hand: the deal is now saved.
- Resuming at Chapter 6's rest-area beat showed the platform: replayed cues now set the
  backdrop intent before preparing.
- An inline `none` hid the drawn fallback.
- Roberto's face appeared beside other speakers' lines, and long lines covered it.
- Next wasn't focused when a scene opened.

### Known issues

- **Other characters' portraits** are pending expression labels (staged with name tags,
  light and text).
- **Audio:** story cue hooks other than the knock are reserved, waiting for the sound bank.
- **Browsers and devices:** only Chromium was tested.

## Audio stage — Scene soundtrack and tactile sound ✅ (2026-11-17)

### Completed

- **Audit.** Kept the two approved music tracks. The SFX and the patio bed were code-synthesized
  placeholders: they're replaced by **selected local CC0 samples**. The synth stays only as the
  fallback while a sample decodes or if its file is missing.
- **Sources and licences** (`docs/SOUND_SOURCES.md`, generated from `src/assets/sound-manifest.json`):
  - Kenney Interface Sounds 1.0 and Casino Audio 1.1, licence read from the `License.txt` in each
    zip. kenney.nl returned 403 here, so Kenney's own OpenGameArt uploads were used.
  - BigSoundBank (Joseph Sardin), CC0 per sound page.
  - Freesound was **not** used; no sound API exists at runtime; no credentials anywhere.
  - Every file records source, creator, licence, edits, bytes, sha256 and `final: false`.
    `npm run assets:verify` enforces CC0 and exact hashes.
- **One manager** (`src/audio/manager.ts`) now owns:
  - SFX: decoded buffers, matched variants, no back-to-back repeats, restrained variation,
    instance limits, quiet defaults.
  - Ambience beds on their own bus with gentle cross-fades (≤ 2 beds).
  - Per-scene story **profiles** (`src/audio/profiles.ts`): one track or none, plus a bed, for
    dialogue and hand.
  - Story **cues** scheduled on the audio clock, with cancellation.
- **The motif** is exact: three matched knocks 0.62 s apart, then the answer from beyond
  1.15 s after the third. The prologue splits it across its two beats; soft and single variants
  are used for the taps, the domino box, the gate and "one quiet knock". The fake speaker and the
  trail voice are **caption-only** (no impersonation).
- **No ghost sounds:** cue voices are cancelled on each beat, skip, card, scene or profile change,
  reset and backgrounding. A resumed scene restores mix-state cues but never replays its knock.
- **UI and table sounds:** one delegated listener (capture phase; refused during init/intro, so
  nothing leaks into the credit); pickup / invalid on tile taps; shuffle on fresh deals; Cousin
  slaps his doubles.
- **Scene ambience on by default** (real recordings now). The short SFX are precached for offline
  play; music, beds and video are never cached.
- **Music briefs** for the missing night-investigation bed, cave suspense bed and stingers
  (`docs/MUSIC_BRIEFS.md`); no music was generated.
- **Audition page** (`/dev/audio-audition.html`): bed wraps exactly as the game loops them, the
  motif, and every SFX variant, for the owner's listening pass.
- **New browser suite** `npm run audio`.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: 313 tests in 34 files, lint, assets:verify (30 SFX + 5 beds, CC0, hashes), all budgets (code 279/300 KB, sfx 554/720, ambience 2035/2200, total 13558/13900) |
| `npm run audio` (new) | pass: A–J (see `docs/AUDIO.md` § Verification) |
| `npm run story:e2e` | pass |
| `npm run e2e` | pass (see the bugs list: the first run was invalidated by an HMR reload, the second caught a stale assertion) |
| `npm run qa` / `npm run a11y` | 0 failures, 0 comfort warnings / 0 failures |
| `npm run pwa` / `npm run smoke` | pass, offline cache 4,175,553 B (shell 473.5 KB + assets 3,604.2 KB, now including the 30 SFX) / pass |

### Bugs found and fixed while testing

- The first bed build's ffmpeg graph silently dropped the loop cross-fade (beds 3 s short, hard
  wrap; patio's wrap jump was 43× a typical step). Rebuilt with an exact equal-power cross-fade
  in numpy and one static gain; every wrap is now inside the bed's normal step range.
- Resuming exactly on a knock beat replayed the knock.
- A fresh match's first deal had no shuffle (it happens before the table subscribes).
- Small WAVs were being inlined into the JS bundle as data URLs; audio is no longer inlined.
- e2e's "reset during sounds" demanded zero active SFX after a restart; the new match's deal now
  shuffles, so it checks instead that only that shuffle survives (`activeSfxIds()`).
- A first e2e run failed with "no dev hook" because a source file was edited mid-run (the dev
  server reloaded the page). A standalone repro and the isolated rerun pass.

### Known issues

- **Nothing has been listened to.** This environment has no audio output: no headphone or
  speaker check, and no seam audition by ear. All sounds are `final: false`; all seams are
  `auditioned: false`.
- Tile sounds are casino-chip/card **stand-ins** until real dominoes are recorded.
- Missing: the intro video (fallback works), commissioned music, the speaker recording.
- Only Chromium was tested (Safari's MP3 decoding may add priming; `src/audio/loop.ts` trims it).

## Character framing stage: larger dialogue characters (2026-11-17)

### Completed

- **Inspected first:** at 390×844, 844×390, 768×1024 and 1366×768 the dialogue figures were 86–170 px tall,
  with most of the stage empty.
- **Sized from visible bounds:**
  - **Cast:** the box is cropped to the visible figure (head top to baseline, padding trimmed), the same crop
    for every frame.
  - **Cousin:** a new upper-body dialogue crop (`HostView` variant `dialogue`, 275×363 source px, hat
    included), one box for every expression.
  - Boxes always take the region's own aspect, so art is never stretched.
- **No blur:** each figure is capped at the height where its source pixels would be upscaled 1.6× on this
  screen (`devicePixelRatio`). The cap is recomputed on resize, browser zoom and rotation.
- **Responsive framing:**
  - **Dialogue:** generous upper bodies, standing on the panel's top edge with only the lowest 22 %
    tucked behind it.
  - **Two characters:** Cousin on the left, the cast member on the right. The listener is dimmed, never
    rescaled; the speaker stands in front where the two overlap on narrow phones; the name tag moves to
    the speaker's side.
  - **Resume:** the last cast speaker comes back as the listener.
  - **Head-matched scale:** Cousin ×1.146, measured, within his own cap.
  - **Domino play:** compact head-and-shoulders portraits beside the cast seats on story tables.
- **Clean edges:** Cousin's portrait derivative is now cleaned like the cast sheets (shared
  `scripts/lib/clean.ts`): 175 specks removed, fringe 426 → 0 px, same size, so every rect still applies.
  The original is untouched.
- **Reduced motion:** both the OS preference and the in-game setting turn the figure transitions off.

| Viewport (emulated, DPR 2) | Cousin before → after | Cast before → after |
| --- | --- | --- |
| 390×844 | 177 → 268 px | 185 → 220 px |
| 844×390 | 90 → 206 px | 94 → 180 px |
| 768×1024 | 179 → 290 px | 186 → 325 px |
| 1366×768 | 161 → 290 px | 168 → 325 px |

At DPR 3 (most phones) the resolution cap binds earlier: Cousin about 194 px, cast about 216 px tall.
Larger crisp figures on those screens need higher-resolution character art.

### Defects found and fixed

- **The story stage stayed drawn under the table during every story hand.** Its `display: grid` overrode
  `hidden`, so the scene bar and controls ghosted behind the board and stayed in the accessibility tree.
  Fixed, with a regression check (story e2e § I).
- Cousin's sheet had visible red/yellow edge specks at the larger size: cleaned derivative.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: 340 tests in 36 files, lint, assets, all budgets (code 297/300 KB, core images 2,961 KB) |
| `npm run story:e2e` | pass. § G now checks the actual FACE regions of both figures (clear of the panel and the scene bar) and that cast and Roberto stay ≤ 1.6× upscale, in 10 staged moments × portrait/landscape |
| `npm run qa` | 0 failures, 1 documented comfort warning (8 viewports × 13 screens, including the cast line) |
| `npm run a11y` / `npm run e2e` | 0 failures / pass |
| `npm run perf:story` | pass: 8 chapter visits, no growth in nodes, listeners, timers, workers or audio sources (the new resize listener is removed on dispose) |

### Known issues

- Phones at DPR 3 are limited by the art's resolution (above). Higher-resolution cast and Cousin art would
  allow larger figures there.
- Expression labels are still missing; figures show the current mappings (Cousin's moods, cast frame
  `e1`).
- Only Chromium; no real devices.

## Gameplay polish stage (2026-11-17)

### Inspected
Every supported mode was played in Chromium at 390×844, 844×390, 768×1024 and 1366×768: Draw, Block and
Partnership against the computer, two humans on one device, and the both-ends, 21-tile-hand, max-board and
match-point fixtures. Captures covered the selected tile, legal ends, draw/pass guidance, the results sheet
and the handoff cover.

### Defects found and fixed
- **The selected tile was clipped:** its lift, ring and ✓ badge were cut off at the top of the hand row in
  every layout (the row scrolls sideways, so it clips vertically). The row now has room above it.
- **Long hands hid the playable tiles:** a 21-tile hand showed 7 tiles on a phone, and the only playable
  ones could be off-screen.
  - Tall screens now show long hands in two rows.
  - The first playable tile is scrolled into view once per turn, never fighting the player's own scrolling.
  - Scrollable edges fade.
  - Short landscape keeps one row, and rotating recomputes the layout.
- **Selection was hard to read:** while one tile is picked up, the other playable tiles step back.
- **Partner identity:** the partner's seat chip now carries the team colour as well as the word "Partner".
- **Results:** a player who went out read "no tiles left" twice. It now appears once.
- **ResizeObserver loop error (found by e2e):** the row layout now runs on the next frame, outside the
  observer callback.

### Verified
- e2e § 5b:
  - 5 rapid taps on a tile settle on one selection with both ends offered;
  - the selection and both ends survive rotating 390×844 → 844×390 → 667×375, with the badge and ring
    unclipped at every size, and the tile is then placed;
  - the 21-tile hand shows 2 rows with a playable tile visible;
  - partner chip; results.
- Existing coverage still passes: complete hands in every setup, blocked outcomes, restart, resume
  (including during AI thinking, with 0 stale AI decisions), rapid actions and double-tap (exactly one tile
  placed), keyboard-only placement, and privacy covers at every handoff.

## Menu / interface polish stage (2026-11-17)

### Inspected
Home, Quick Play, Two Players, How to Play, Settings, Statistics and the Story case file at 390×844,
667×375, 768×1024 and 1366×768.

### Defects found and fixed
- **Discard on the home screen deleted a saved game in one tap.** It now opens a confirmation sheet.
- **One confirmation sheet for every destructive action:** discarding a saved game, resetting statistics,
  erasing data and starting the Story over (`src/ui/confirm.ts`).
  - It replaces the inconsistent two-tap "Tap again" buttons and matches the table's ivory sheet.
  - Focus starts on the safe choice; Escape cancels; focus returns to the opener.
  - Destructive buttons carry the guava outline and ⚠ mark.
- **Statistics needed sideways scrolling on phones** (a six-column table in its own scroller). It is now one
  card per mode. Reset is offered only when there is something to reset.
- **Sub-pages started below a full-size wordmark.** They now use the one-line mark. On desktop the panel is
  wider and Cousin stays in view beside it.
- **Inconsistent Back labels** ("← Back" in menus, "← Menu" in Story): now "← Menu" everywhere.
- **Back navigation:**
  - The browser/OS Back button and Escape now return from any menu sub-page, with focus back on the button
    that opened it.
  - Back does nothing once a table or Story is open.
  - Escape on the Story case file returns to the menu.
- **Setup heading:** it now follows the players choice ("Quick Play" or "Two Players"), so switching never
  leaves a stale title.
- **Home hierarchy:**
  - Story is the single gold primary, with a guava offset like the subtitle tag. It reads New Case,
    Continue Case (with chapter, e.g. "Chapter 3 of 7") or Case Closed from the saved progress
    (read-only).
  - Quick Play is deep sea and Two Players is ink.
  - The four secondary links share one grid.
- **Achievements:** a reserved destination labelled "Soon". Its page says "Coming in a later update" and
  that nothing is tracked yet. It has no dead controls and invents no data.

Saves are untouched by navigation: the confirmation sheets guard every delete, and the Story card only reads
progress. Only approved token pairings are used (ink on gold, gold on ink, ivory on deep sea and ink).

### Budget
Code is **305 KB / 310 KB** (the budget was 300). The +6 KB is recorded in `docs/PERFORMANCE.md`, and the
CSS for the removed statistics table was deleted. Startup is 816 / 900 KB.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: 340 tests, lint, assets, budgets (code 305/310 KB) |
| `npm run e2e` | pass (incl. new § 5b gameplay and § 8c menu checks) |
| `npm run qa` | 0 failures, 1 documented comfort warning (end slots 62×40 on the longest chain at 667×375). The first run found 2 real defects, both fixed: the home menu scrolled sideways at 200 % browser text (now an em-based grid that drops columns as text grows) and the Settings volume sliders were 32 px tall (a more specific rule overrode the 44 px one) |
| `npm run a11y` | 0 failures (now also scans Two Players and Achievements) |
| `npm run pwa` | pass (erase via Cancel and confirm) |
| `npm run story:e2e` | pass (start over through the confirmation sheet) |
| `npm run matches` / `npm run smoke` | pass / pass |

New coverage:
- e2e § 8c: Back, Escape and ← Menu on 6 sub-pages; focus on the heading, then back on the opener; no
  sideways scrolling or nested sideways scrollers at 360 px; setup heading; Achievements placeholder; Story
  card states.
- e2e: discard via Cancel, Escape and confirm.
- pwa: erase via Cancel and confirm.
- qa: stats, settings and achievements screens on all 8 viewports.
- a11y: Two Players and Achievements pages.

### Known issues
- Only Chromium; no real devices.
- Achievements are a placeholder until stage 5.
- Browser Back is not wired inside Story runs or the table (they keep their own Menu/Pause controls).

## Startup stage: initialization → start → credit → reveal (2026-11-17)

Extends the existing pipeline: the start screen, `IntroController`, the bounded `warm` loader and the one
audio manager. No new manager.

### Completed
- **Initialization before the start prompt:** fonts (FontFace API), the menu backdrop, Cousin's portrait
  and the tile atlas.
  - Images are fetched AND decoded through `warm`, using the new `warmWithRetry`: same queue, 3 attempts,
    400 / 800 ms backoff.
  - Progress is truthful ("Loading… n of 4"). Failures are named, with **Try again** (retries only what
    failed), and play is never blocked: drawn stand-ins are used.
  - No artificial wait: ready the moment everything settles. A slow network gets the prompt after 8 s,
    with the screen saying it's still loading.
  - The credit video is buffered only after initialization.
- **Start:** one gesture (tap, click or Enter) unlocks audio; the start tap makes no sound. The silent
  'intro' scene refuses SFX through the credit.
- **Credit:** the owner's video if supplied (still missing). Otherwise a 1.6 s typeset "INSPIRE /
  presents" card that is honest about being text. Both are skippable with the button or Esc.
- **Backgrounding mid-credit:** `IntroController.suspend()/resume()` pause the video and every timer, so
  nothing times out and no menu opens while hidden. The text card holds the same way.
- **Fade through black, then the menu reveal:** the backdrop first, then title, panel, Cousin and footer
  in a 1.2 s stagger.
  - Any input completes it at once; reduced motion (OS or in-game) skips it.
  - Menu music starts only after the credit.
  - If the credit ends while an essential is still loading, the black waits at most 1.5 s for it.

### Budgets (measured, `docs/PERFORMANCE.md`)
- **Code: 310 / 320 KB** (raised from 310, +5 KB).
- **Startup: 936 / 960 KB** (raised from 900, because the tile atlas now counts toward startup).

### Tests
- **Unit:**
  - `warmWithRetry`: backoff, per-id settle, recovery on the 3rd attempt, permanent failure.
  - `IntroController` suspend/resume: no timers while hidden, a refusal after returning ends once, and the
    no-video path stays armed.
- **e2e:**
  - § 7g: progress, a portrait failing twice then loading, the tiles failing → named fallback + Try again
    → recovered, and cold vs warm timing.
  - § 7h: text credit silent with no SFX, menu once, music after, reveal cancelled by input, reduced
    motion.
  - § 7i: backgrounding during the card and during a real video (paused 7 s past the start timeout, then
    resumed to the end).
  - § 7j: rotation during the credit.
  - The existing 7a–7e (missing, ended, rapid Skip + mute, 404, refused play(), stall, mobile tap) still
    run.
- **pwa:**
  - Offline startup decodes everything from the offline cache → "Ready.".
  - Offline with missing art → the named fallback + Try again, and start still enabled.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: 343 tests (+3), lint, assets, budgets (code 310/320 KB, startup 936/960 KB) |
| `npm run e2e` | pass. § 7g: portrait loaded on attempt 3, tiles → named fallback → Try again → Ready; cold ready 1.5 s (incl. backoff), warm reload 266 ms. § 7h–7j as listed. **Found and fixed:** at 844×390 the credit video took its own 16:9 height (475 px) and ran off screen; it now letterboxes in every orientation |
| `npm run qa` / `npm run a11y` | 0 failures, 1 documented comfort warning / 0 failures (the menu is scanned after the reveal settles; mid-fade elements are transparent) |
| `npm run pwa` | pass: offline startup → "Ready."; offline with missing art → named fallback + Try again, start enabled; the video is still never cached |
| `npm run audio` / `npm run story:e2e` | pass / pass |
| `npm run matches` / `npm run smoke` | pass / pass |

### Known issues
- The intro video `assets/video/inspiresoftwareintro.mp4` is still **missing**. The text card stands in.
  The video path is exercised with a generated WebM in e2e.
- Only Chromium; no real devices. Warm/cold timings come from the dev server, not a phone on a real
  network.

## Achievements stage: 100 achievements (2026-11-17)

### Completed
- **Catalog** (`src/app/achievements/catalog.ts`): exactly **100**, in 8 categories.

  | Learning | Draw | Block | Partnership | Tactical | Milestones | Story | Exploration |
  | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | 10 | 14 | 12 | 14 | 16 | 12 | 14 | 8 |

  - Each entry: stable id, title, description, category, condition (counter + target, or `all`),
    how to earn, badge (glyph + tier) and spoiler flag.
  - All are earned through existing mechanics. No streaks and no new rules. The largest target is
    2,000 points.
  - Every one is documented in `docs/ACHIEVEMENTS.md`, and a test keeps that file in sync with the
    catalog.
- **Tracking outside the engine:** from applied, redacted events through `TableController.subscribe`
  (the core bridge subscribes synchronously and buffers until the lazy chunk loads), the Story `track`
  hooks, and explicit screen/control notes.
  - It uses public information only. The record holds no tile ids, which e2e checks.
  - **What counts:**
    - Solo vs the computer: everything.
    - Story first plays: hand and Story facts.
    - Two players: finished shared matches only.
    - Replays and developer tables: nothing.
    - Skip scene: the case can't earn Every Word.
- **No double counting:** every count is keyed by game, hand, chapter, case or note.
  - A hand resumed after a reload counts its result but no whole-hand tactics.
  - Comebacks and whole-case awards need full observation.
- **Persistence:** a versioned record (`sticks-and-bones.achievements` v1, with migration from a v0
  ids-only shape and quarantine on corruption). A refused save shows the persistent **Not saved**
  banner while the counters stay in memory.
- **Retroactive awards:** once, from Quick Play statistics and Story progress (max, never added),
  marked "from earlier records", with one summary notice. No hand-level claims.
- **UI:** the Achievements page replaces the reserved placeholder.
  - Summary, category and status filters (44 px chips), and cards with accessible SVG badges,
    how-to-earn text and progress bars.
  - Story spoilers are concealed until earned.
  - **Notices are quiet `role="status"` toasts, non-interactive.**
    - **Held while:** a handoff cover, a sheet, a Story scene, the start screen or a hidden page is up,
      and at the table while the player can act.
    - **Yielding:** a notice already showing withdraws if a sheet or cover appears and comes back
      later, so it's never stranded.
    - Reduced motion is honoured.
- **Code:** the achievements chunk loads after the menu is up and has its own budget (35 / 45 KB).
  The core grew about 1.5 KB (312 / 320 KB).

### Defects found while building (fixed)
- Notices first drew under the table HUD (unreadable on a phone) and could be stranded under the
  results sheet. They now wait for a moment the player can't act, draw above the HUD there, and yield
  to sheets and covers.
- A fresh match deals before anyone subscribes, so the first hand would have counted as unobserved.
  The tracker now primes it from the public hand sizes captured at subscription time.

### Tests
- **Unit (achievements, 119):**
  - Catalog integrity: 100 unique ids, titles and conditions, and docs sync.
  - **A deterministic fixture for every one of the 100**, run through the real observers and progress
    functions.
  - Scope rules: resumed hands, old or assisted cases, comebacks, local play, and redacted events
    only.
  - Dedupe: hand, chapter and note keys.
  - Persistence: round trip, v0 migration, corrupt record quarantined, refused write reported.
  - Retroactive awards: exactly the provable set, idempotent.
- **Integration (5, real `GameSession` + `TableController`):**
  - A full solo Block match.
  - A reload mid-match with a restored session: totals equal the match's real hand count.
  - Two-player local: only local facts.
  - Replay / developer table: nothing.
  - Story replays ignored; a refused save is reported and kept in memory.
- **e2e § 8d:**
  - A real Block hand in the browser unlocks live; reloading at the results sheet counts nothing
    again.
  - The page: 100 cards, 6 chapter spoilers concealed, no title leaks, filters, badges labelled, no
    sideways scroll at 390.
  - A refused save shows the Not saved banner.
  - A notice is held under the two-player handoff cover and shown after leaving it.
- **qa:** the Achievements page on all 8 viewports.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: 462 tests (+119), lint, assets, budgets (code 312/320 KB, achievements lazy 35/45 KB, startup 938/960 KB) |
| `npm run e2e` | pass after one fix: the menu-stage check still expected the Achievements placeholder; it now checks the real page (100 cards). § 8d: a real Block hand → 6 tiles, 3 unlocked; reload counted nothing again; 6 chapter spoilers concealed; filters; refused save → Not saved; notice held under the handoff cover |
| `npm run qa` / `npm run a11y` | 0 failures, 1 documented comfort warning (Achievements page on all 8 viewports) / 0 failures |
| `npm run pwa` | pass (the achievements chunk is in the shell group, so the page works offline) |
| `npm run audio` / `npm run story:e2e` | pass / pass |
| `npm run matches` / `npm run smoke` | pass / pass |

### Known limitations
- **Not played to completion in the browser:**
  - **Story:** the Story achievements are proven by fixtures and the integration path
    (`track.chapterComplete`), not by a 90-minute playthrough in this stage.
  - **Rare tactical situations** (capicúa, closing a number, a tranque won with more tiles, …): proven
    by fixtures on real event shapes, not by a seeded live match.
- **Hand-level history isn't in the existing records,** so nothing hand-level is retroactive.
- **One device, no accounts:** achievements are per browser profile, and erasing data removes them.
- Only Chromium; no real devices.

## One-speaker dialogue stage (2026-11-17)

### Completed
- **One visible character: the current speaker** (`src/ui/story-player.ts` DomStage `#present`).
  - **Roberto:** his own lines and his reaction beats (expression cues).
  - **A cast member** (Vale, Luz, Marisol, Rafa): their lines, once their sheet has decoded.
  - **Nobody:** narration (Roberto's "narration" lines included), captions, and speakers without a
    portrait (Worker, …). Those show the backdrop and the name tag only.
  - Listeners, dimming, duplicate portraits and "listener primed on resume" are removed.
- **Larger, from measured visible bounds:** the crops exclude transparent padding (Roberto's
  275×363 dialogue crop; the cast frames' head-top-to-baseline crops).
  - With one figure the width is no longer shared. The layout target rose to 58–66 dvh, so the
    art's own **1.6× resolution cap** is now what limits size on most screens (no blur).

  | Viewport (emulated, DPR 2) | Roberto before → after | Cast before → after |
  | --- | --- | --- |
  | 390×844 | 268 → 290 px | 220 → 318–325 px |
  | 844×390 | 206 (about 160 visible) → 228 px, fully visible | 180 → 228 px, fully visible |
  | 768×1024 | 290 → 290 px (cap) | 325 → 318–325 px (cap) |
  | 1366×768 | 290 → 290 px (cap) | 325 → 318–325 px (cap) |

  At DPR 1 the caps double, so desktops draw up to about 580 px.
- **Responsive framing:**
  - **Portrait phones, tablets, desktops:** the speaker is centred and stands on the dialogue panel
    with only the lowest 22 % behind it.
  - **Short landscape:** the speaker stands **beside** the panel at full scene height (left), with the
    panel on the right. The same layout applies to every beat.
  - Faces and hats stay clear of the panel and the scene bar, and nothing reaches the controls
    (story e2e § G).
- **Stable position:** the figure stands on the panel's **reserved** height (a CSS min-height measured
  to fit typical lines: phones 96–124 px, wider 61–97 px), not on each line's height.
  - So the same speaker never moves between lines (§ K: identical box).
  - A long line overlaps more torso; the figure rises only if the panel would reach the face.
- **Speaker change:** the current figure fades out (160 ms), then the next fades in (240 ms). Never two
  at once. Reduced motion (the OS setting or the in-game one) swaps instantly.

### Defects found and fixed while building
- Roberto moved 1–12 px between his own lines whenever a taller panel had appeared since. The running
  maximum is now a fixed reserved panel height.
- In short landscape, standing on the panel hid about 22 % of a 200 px figure. The speaker now stands
  beside it, fully visible.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run story:e2e` | pass. § G now checks one figure: at most one on stage, none for captions and narration, Roberto only while he speaks, face clear of the panel and the scene bar, nothing into the controls, ≤ 1.6× upscale (10 moments × portrait/landscape). New § K: Rafa → Roberto is never two figures; fade out, then in, after 184 ms; reduced motion swaps instantly; Roberto's box identical on his next line |
| `npm run check` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run e2e` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run qa` / `npm run a11y` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run perf:story` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |

### Known limitations
- **Phones are limited by the art's resolution:** at DPR 3 most phones get about 194 px (Roberto) and
  216 px (cast). Larger crisp figures need higher-resolution character art.
- **Desktop and tablet at DPR 2:** the figures are at their cap (290 / 325 px) in a large scene.
- **Expressions:** cast expression labels are still missing, so the cast stay on frame `e1`.
- Only Chromium; no real devices.

## Verified expressions stage (2026-11-17)

### Completed
- **Inspected every sprite:**
  - All 32 cast cells (Vale, Luz, Marisol, Rafa).
  - Roberto's runtime atlas and every other Roberto sheet: the larger atlas and its copy, the slam and
    placing strips, the host reference and the silhouette sheet.
  - Each cell was cropped and looked at; the generated cell order was not trusted.
- **Recorded:**
  - Frame rectangles, crop offsets and verified meanings: `docs/ASSETS.md` "Expression verification",
    and `src/assets/cast.json` (`meaning`; `npm run assets:cast` regenerated it, with byte-identical
    WebPs).
  - Identity findings:
    - Roberto's portrait atlas, its large variant and the gesture strips share one outfit and likeness.
    - The host reference is a different render and stays reference-only.
    - Each cast sheet keeps one outfit across all eight frames.
- **The "e1 only" restriction is replaced** by verified mappings (`src/story/expressions.ts`):
  - **17 semantic expressions:** teasing, concern, firmness, vulnerability, affection, menace, fear,
    amusement, surprise, suspicion, pride, wistful, thinking, explaining, delight, charm, neutral.
  - **Per-character frame maps** with a neutral fallback where the art lacks an expression:
    - Roberto: concern, vulnerability and wistful use his contemplative frame; menace and fear use his
      calm one.
    - Cast: e1.
  - **311 of 358 spoken lines tagged by stable dialogue id** (`<scene>#<n>`), each chosen from the line
    and the script's stage directions. A test pins every id to its speaker and opening text.
    - Untagged cast lines are neutral.
    - Untagged Roberto lines keep the stage directions' mood.
- **Stable scale and anchors:**
  - Every cast frame uses one crop (the highest head on the sheet to the shared baseline, the same
    offsets in every cell), so an expression change only changes the face.
  - Roberto keeps one `bustBox`.
  - The swap is instant within the box: no dissolve, no second face.
  - A speaker change still fades the old figure out completely before the next fades in.
  - Nothing is random; no outfit changes.

### Verified scenes (390×844)
- **Vale:** menace on "I've read enough about your old profession…" (e6); fear on "It repeats things…"
  (e7); public charm (e2).
- **Marisol:** pained on "They suspended me…" (e5); warm on "I'm offering to stay." (e6); laughing on the
  printer-toner line (e8).
- **Rafa:** laughing on "See? Relaxing helps." (e2); downcast on "I knew enough to ask more questions…"
  (e6).
- **Luz:** concern on the dreams line (e5); knowing smile on "You expecting to move in?" (e8).
- **Roberto:** contemplative on "I was scared." (no grin); fists-up on "Fuck THAT, we playing
  DOMINOES!".

### Tests
- **`src/story/expressions.test.ts` (5):**
  - Every tagged id is pinned to its speaker and opening text.
  - Runtime numbering matches the script, including outcome inserts (unique).
  - Every expression resolves to a verified frame or e1.
  - Each cast member uses at least 6 distinct frames.
  - Representative beats get the intended faces.
- **`src/assets/env.test.ts`:** verified meanings recorded; every frame's crop has identical size and
  offsets.
- **story e2e § K:** Rafa e1 → e3 and Roberto smirk → laughing each keep an identical box, and the
  expressions are applied.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run assets:cast` | ✓ all four sheets; WebPs byte-identical; `cast.json` meanings updated |
| `npm run check` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run story:e2e` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run e2e` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run qa` / `npm run a11y` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run perf:story` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |

### Known limitations
- **Readings are this build's, not the owner's:** the meanings come from visual inspection here. The
  owner may correct any reading in one place (`FRAMES` in `src/story/expressions.ts`).
- **Roberto's art has no somber, frightened or hostile frame:** those lines use his contemplative or
  calm frame.
- **The cast's speaking lines never directly follow each other**, so a cast expression change always
  happens while the figure is faded out. The in-place swap is exercised by the § K test.

## Dialogue controls stage: one action, Continue (2026-11-18)

### Completed
- **Removed from dialogue:** Aa and Transcript, with their focus stops, the transcript dialog, its
  Tab-trap and Escape handling, the click handlers, the controls row and its reserved grid track.
  The unused `cinematicControlsHtml` and caption-panel helpers are gone too.
- **The dialogue panel holds the speaker name, the line, and ONE action: Continue.** It is one
  persistent element (only the body changes per beat), so focus stays on Continue across lines and
  reloads.
  - Continue sits below the text on portrait phones and short landscape, and beside it elsewhere.
  - The line is announced (`aria-live="polite"` on the body).
- **Input:**
  - The first activation completes a revealing line; the next advances exactly one beat (SceneDirector).
  - Taps closer than 180 ms are ignored, and key auto-repeat is ignored.
  - Enter and Space on Continue are its own click (the global key handler skips buttons), so one press
    is one activation.
  - The table owns all input during a hand (unchanged).
- **Navigation outside the panel:** ← Case file, ‹ Back, Skip and the position counter are in the
  story bar.
- **Settings:** a "Story text" fieldset with size (Standard / Large / Larger) and "Show each line at
  once" (instant text), in the menu Settings and the in-game pause sheet.
  - The settings record goes v2 → v3 (migration tested). A text size previously saved with the Story
    record is carried over once.
  - Reduced motion still means instant text and no entrance animation.
- **Long lines stay readable:**
  - Short landscape stacks Continue under the text, widens the panel (figure column 32–34 %) and
    trims the dialogue size slightly.
  - The bar packs onto two rows on phones.
  - The panel may use all the height below the bar (recomputed when the bar wraps, through a
    ResizeObserver that is disconnected on dispose).
  - As a last resort, at 130 % text on the smallest screens, only the text scrolls (focusable) and
    Continue stays on screen.
  - Measured: the longest spoken line (229 characters) and the longest caption at 100 % and 130 % on
    390×844, 360×640, 667×375, 844×390 and 1366×768. All 30 cases: no page scroll, Continue on
    screen.
- **Achievements:**
  - `ex-transcript` (open a transcript) became impossible. It is retired, never reissued, and
    replaced by `ex-story-text` ("Easy on the Eyes": change the Story text size or instant text in
    Settings).
  - The catalog stays at exactly 100. A record holding the old unlock drops it on load.

### Defects found while building (fixed)
- The hand and end cards cleared the dialogue slot, which now held the persistent Continue button.
  They now hide the panel instead.
- Continue missed focus when a scene opened, because the panel started hidden.
- The dialogue height cap was computed before the bar wrapped (54 px too generous on 360×640). It is
  now recomputed on bar resize.
- story e2e § I compared the saved hand read before the reload with the restored one, so a fast AI
  reply in between made it flaky. It now reads what was saved at the reload.

### Tests
- **story e2e § L:**
  - The panel's only button is Continue; Aa, Transcript and the controls row are gone; Back and Skip
    are in the bar.
  - A 6-tap burst on a revealing line moved 0 beats.
  - Enter and Space advance one beat each; key repeat advances nothing.
  - Reload keeps the line with Continue focused.
  - Rotation 844×390 → 667×375 → 390×844 keeps Continue on screen and focused.
  - The longest line at 130 % with instant text from Settings is readable on 667×375 (its text
    scrolls, focusable).
- **story e2e § G:** Continue on screen in every staged moment; the figure never below the panel.
- **a11y:** the panel's only control is Continue, and the line is announced.
- **qa:** the old transcript screen is replaced by `story-long` (the longest line at 130 % on all 8
  viewports).
- **Unit:** settings v2 → v3 migration, round trip and invalid values.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run story:e2e` | pass (§ G, I, K, L) |
| `npm run check` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run e2e` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run qa` / `npm run a11y` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |
| `npm run perf:story` / `npm run pwa` / `npm run audio` | not run at this commit; the combined run at the QA checkpoint (2026-11-18, below) passed on code that includes this stage |

### Known limitations
- **Transcript conflict:** the script document's production notes (`docs/STORY_SCRIPT.md`) list a
  transcript among things to retain. This stage removed it from dialogue as instructed, and nothing
  replaces it. The script itself (dialogue) is unchanged. Owner decision: confirm, or ask for a
  transcript outside the dialogue panel.
- **Last-resort scrolling:** at the largest text on the smallest screens, the longest lines scroll
  inside the panel. That is readable but needs a scroll.
- Only Chromium; no real devices.

## Resort backdrop correction (2026-11-18)

Owner direction: the resort scenes use the approved **corporate** resort art instead of the leisure resort.

**What changed:**
- **Art (inspected first):** `environments/Sleek Puerto Rican Executive Resort Terrace.png` (`env.executive-terrace`)
  shows a glass-fronted lobby, a flat canopy, a hotel tower and a stone plaza, with the sea beyond. Corporate.
  `Puerto Rico Resort Patio by the Sea.png` (umbrellas, loungers) stays in `assets/art/` untouched, but is
  retired: manifest note, no derivative, no URL, not bundled.
- **Chapter 3:** its establishing shot, every dialogue beat and its partnership hand use the terrace.
- **Chapter 7:** the executive confrontation and its hand use the terrace too.
- **Hand backdrops:**
  - `STAGING.handEnv` now drives the table's backdrop, through `setEnvBackdrop` (`src/assets/env.ts`) on the
    story table host.
  - Previously every story hand showed the menu's patio.
  - Rotation re-picks each element's own place (`data-env-id`), so it can no longer swap the terrace for the patio.
- **Unchanged:** the patio (Chapters 1–2, the epilogue, Quick Play), alley, promenade, jungle and cave.
  Chapter 6's rest-area hand keeps the patio.
- **Focal point:** x = 0.27 (the lobby and tower).
  - Landscape is positioned at 27% 50%.
  - The portrait 3:4 crop is re-derived (x = 98, 96 KB).
  - The full-frame WebP is byte-identical.
- **Preload and offline:** `SCENE_IMAGES` and `check-dist`'s chapter map now name the terrace for Chapter 3.
  - `check-dist` refuses any `resort-patio` file.
  - The service worker already prunes every file a new build doesn't list.
  - `npm run pwa` now proves it by planting an old `resort-patio` file in the story cache before an update.
- **Script:** the script's own location line for Chapter 3 is unchanged (the script is authoritative). Only
  the art changed.

**Inspected:**
- Chapter 3 (opening, mid-scene, hand, after the hand) and Chapter 7 (opening, hand) at 390×844 and 844×390.
- The hands again after rotating mid-hand.
- Offline Chapter 3 after the whole-story download.
- No request for `resort-patio` anywhere.

**Tests added:**
- story § G: Chapters 3 and 7 must be the terrace.
- story § M: both hands are over the terrace in portrait, in landscape and after rotating back, with no
  patio behind them and no `resort-patio` request.
- pwa: offline Chapter 3 shows the terrace, and the update prunes old resort art.
- check-dist: the retired-file guard.

Budgets: story images 1,410 / 1,600 KB, largest chapter (Ch. 3) 848 / 1,000 KB, startup 940 / 960 KB. All
results are in the QA checkpoint table below (one run covers both).

## QA checkpoint: Story presentation, resort backgrounds, regressions (2026-11-18)

QA of the last four checkpoints (single-speaker sprites, verified expressions, Continue-only dialogue,
corporate resort backgrounds), plus regressions.

**New: `npm run story:sweep`** (`scripts/story-sweep.ts`) walks every Story beat in the real UI and checks
each one.
- **Coverage:** 1,485 beats.
  - 701 at 390×844: all 9 scenes plus every win / loss / tie route.
  - 112 at each of 360×800, 390×844, 667×375, 844×390, 768×1024, 1024×768 and 1366×768: Chapters 3 and 7.
- **Script fidelity:** verbatim script text and captions; the tagged expression and the verified cast frame.
- **Staging:** at most one figure (the speaker), in a settled box identical every time that speaker appears;
  the corporate terrace for Chapters 3 and 7.
- **Dialogue controls:** Continue as the only action, on screen and focused; one beat per Continue; no
  overflow.

**Defects found and fixed:**
1. **Stale focus stop:** the dialogue text kept `tabindex=0` on short lines (found by `npm run a11y`). It had
   been measured mid-reveal while still free to grow. Now it is a focus stop only when held at its max-height
   and really scrolling.
2. **Safe area:** the panel's height limit ignored a bottom safe-area inset. It now subtracts the stage's real
   bottom padding, which includes `env(safe-area-inset-bottom)`; layout is identical without an inset.
3. **Corporate hands:** the Chapter 3 and 7 hands weren't on the corporate terrace, and rotation reverted
   backdrops to the patio (resort section above).
4. **Two test races, not app defects:**
   - pwa "scene up": the dialogue panel is permanent markup now, so it waits for the line's position.
   - story § I: the restored AI may legitimately answer before the read, so it now checks the hand number,
     the player's tiles and the public log as a prefix (a re-deal or lost move still fails).
- **Sweep timing (not a defect):** the sweep's first run measured a 1–2 px box difference mid-entrance (the
  designed 240 ms rise). Settled boxes are identical, and the sweep now waits for figure transitions to finish.

**Already covered and re-run here:**
- **story:e2e:**
  - rapid input: 25 taps, 6-tap bursts, key repeat;
  - scene cancellation: 6 rapid case-file round trips, one live director;
  - rotation mid-scene; refresh mid-dialogue, mid-hand, on results and on the end card;
  - missing images (drawn fallback), background during the entrance, reduced motion;
  - one-speaker fades; the longest line at 130 % text on 667×375.
- **pwa:** offline per chapter and the whole story; update mid-match, mid-dialogue and mid-hand; storage
  refusing the update-time write; repair.
- **audio:** background/foreground, no ghost cues after beat, skip, card, scene or reset.
- **perf:story:** 8 chapter visits with no growth in nodes, listeners, timers, workers, audio sources or media.
- **e2e:** Quick Play and pass-and-play privacy.
- **matches:** fair AI and scoring in full matches of every arrangement.
- **Unit tests:** saves, settings migrations, 100 achievements, expression anchors.

### Commands run and results (Chromium, this checkpoint's code)

| Command | Result |
| --- | --- |
| `npm run check` | pass: typecheck, lint, 468 unit tests, assets verified, build and budgets (code 314 / 320 KB, startup 940 / 960 KB, total 14,683 / 15,400 KB) |
| `npm run story:sweep` | pass: 1,485 beats (above) |
| `npm run story:e2e` | pass: § A–M, including the new § M (corporate hands) |
| `npm run pwa` | pass, after the test-race fix: offline Chapter 3 on the terrace; old resort art pruned on update |
| `npm run a11y` | pass, after the focus-stop fix |
| `npm run e2e` | pass: full games (solo, AI partnership, two humans), pass-and-play privacy covers, save/resume, 400 rapid taps (≤ 1 table / track / dialog) |
| `npm run qa` | pass: 0 failures over 8 viewports (including `story-cast` and `story-long` on the terrace and in the jungle); atlas bleed clean at DPR 1/2/3; 150 % / 200 % text; 1 comfort warning kept on purpose (667×375 longest-chain end slots 62×40) |
| `npm run perf:story` | pass (D: nodes 303→303, listeners 58→58, timers, workers and media flat) |
| `npm run audio` | pass |
| `npm run matches` | pass: every arrangement completed full matches |
| `npm run smoke` | pass: subpath load, offline-ready, one hand vs the computer, offline restart, clean console |

### Known limitations
- **Chromium emulation only.** Firefox, WebKit/iOS Safari, Android Chrome, real safe-area insets, real
  screen readers and listening on real speakers were **not tested**.
- **Figure size is limited by the art's resolution.** On DPR-2 tablets and desktops the figures sit at their
  ≤ 1.6× cap, so they look modest in a large scene.
- **Transcript conflict:** still open for the owner (see the dialogue controls stage).
- **Expression readings are this build's,** by visual inspection, for the owner to confirm.

## Hardening pass (2026-11-18)

I checked each reported finding against the code before changing it. All seven were real and are fixed,
each with a focused regression.

1. **Dialogue reveal race** (`src/story/director.ts`)
   - **Confirmed:** reveal timers only checked the scene token. Finishing line A early, advancing to B, then
     A's timer firing ended B's reveal, so the next tap skipped B's reveal.
   - **Fix:** each beat's reveal has its own handle and sequence number. Early finish, advance, Back, Skip,
     `settle()`, `cancel()` and `exit()` retire it. The prepare deadline is also cleared once images are ready.
   - **Regression:** `director.test.ts` "reveal timers belong to their own beat". It was run against the old
     director and failed, and passes now.
2. **AI worker** (`src/ai/runner.ts`, `src/app/session.ts`)
   - **Confirmed:** no `messageerror` handler and no timeout (a silent worker stalled the AI turn forever).
     Answers were not validated. A `postMessage` throw made the session run the full policy, Hard included, on
     the main thread. `dispose()` left promises unsettled.
   - **Fix:** every request settles once, with a validated legal answer or the cheap observation-only fallback
     (Hard degrades to the one-ply Normal heuristic). Fallbacks cover error, `messageerror`, malformed or
     illegal answers, `postMessage` failure and a 6 s timeout.
   - **Guards:** hung or crashed workers are replaced at most twice. Late or duplicate answers are dropped.
     Dispose rejects. The session ignores rejections for stale turns, and the `{epoch, seq, seat}` guards are
     unchanged.
   - **Regression:** `runner.test.ts` (7, fake worker and clock) and `session.test.ts` (+2).
3. **Audio and media** (`src/audio/manager.ts`, `src/audio/webaudio.ts`, `src/main.ts`)
   - **Confirmed:** any sample or bed failure (404, offline or 5xx) was "broken" for the session. A music
     element error added the track to `#broken` for good, and its media error was never reset.
   - **Fix:** failures are classified as absent (404/410, or no URL), broken (won't decode) or transient
     (offline, network error, temporary status).
   - **Recovery:** after a gesture or the `online` event, bounded: 3 attempts per track and per file, at least
     4 s between passes.
   - **Scope:** only the current scene's music and bed are re-applied. Mute, one-track exclusivity, cue
     cancellation and the silent init and credits are preserved. No SFX or cue is ever replayed.
   - **Regression:** `manager.test.ts` (+5), faults § G and § I, audio § H (now asserting absent vs transient).
4. **Loading and navigation** (`src/assets/warm.ts`, `src/ui/lazy.ts`, `src/main.ts`, `src/ui/story-ui.ts`,
   `src/ui/story-player.ts`, `src/ui/achievements-bridge.ts`)
   - **Confirmed:** a stalled image held its slot forever. Completion was not once-only, and a late completion
     could resolve a newer attempt. Failed Story, script and achievements loads left a blank screen or a stuck
     "Loading…", and their rejected promises were cached. A late Story chunk could remount over the menu.
   - **Images:** 15 s deadlines with once-only completion, per-attempt numbers, and an explicit `retryWarm`.
   - **Failed loads:** Retry / Back panels. Rejected loads are forgotten.
     - Chromium caches a failed dynamic import for the page's lifetime, so when a second attempt also fails,
       Retry reloads the app and returns once to the same screen.
   - **Navigation:** a navigation token stops abandoned screens from remounting, and the loading state has a
     Back button.
   - **Regression:** `warm.test.ts` (+3), `lazy.test.ts` (3), faults § A–E.
5. **Persistence** (`src/app/write-health.ts`, `src/main.ts`)
   - **Confirmed:** one boolean covered every record, so a later successful match save hid a failed Story or
     achievements write. Settings and statistics writes were unchecked, the first match save was unchecked,
     and nothing was retried.
   - **Fix:** per-record health for save, settings, stats, story and achievements, with retries of the latest
     value. Retries run on Try again, on another record's success, before an update and on hide.
   - **Alert:** it names what is unsaved, clears only when resolved, and reserves its own height so it never
     covers Continue or the table. (The faults suite found the old alert covering Continue.)
   - **Unchanged:** the update-time "Not now / Update anyway" choice and once-only progression.
   - **Regression:** `write-health.test.ts` (6) and faults § F.
6. **Scene consistency** (`src/story/staging.ts`, `src/ui/table.ts`, `src/assets/env.ts`, `src/main.ts`)
   - **Confirmed:** Chapter 3 is the corporate terrace (last checkpoint). But story tables other than
     Chapters 3 and 7 still defaulted to the patio, Chapter 6's rest-area hand showed the patio, and the
     rotation handler defaulted to the patio.
   - **Fix:** every chapter's `handEnv` is explicit and is passed to its table as-is. Chapter 6's is `null`,
     a drawn rest area with no photo.
   - **Rotation:** the handler re-picks only elements that name their place.
   - **Bug found and fixed:** a removed `--env-image` inherited the menu's patio, so it is now set to `none`.
   - **Regression:** `staging.test.ts` (+4: explicit, preloaded, offline-mapped, both derivatives, no retired
     art) and faults § H (all seven tables in the browser).
7. **Missing content**
   - **Evidence:** the list was always empty. It now shows six approved evidence beats (`src/story/evidence.ts`)
     as their on-screen captions, verbatim (the script's production notes are stripped by the existing,
     tested caption list).
     - Items appear only once the saved case position reaches them, so nothing is spoiled, and replays add
       nothing.
     - The list is derived from the existing Story record, so there is no new save field and no version bump.
     - Regression: `evidence.test.ts` (6).
   - **Media:** no intro video, music or foley has been supplied. `origin/main` has nothing new and the
     working tree has no new media, so the honest fallbacks stay (the exact list is under "Next stage").

**Also fixed (test races, not app defects):**
- story:route read the first line during `leaving-hand`, when the hidden panel still held the last pre-hand
  line.
- a11y checked the start button's focus before initialization had enabled it.

**Budget:** code 330 KB (was 320), measured 322 KB. The +8 KB is resilience code that has to live in the core
bundle (see `docs/PERFORMANCE.md`). Every other budget is unchanged; startup measured 948 / 960 KB (the code
growth carries into it; an earlier version of this note said 940 KB, which was the previous stage's figure),
story chunk 123 / 130 KB.

### Commands run and results (Chromium, this checkpoint's code)

| Command | Result |
| --- | --- |
| `npm run check` | pass: typecheck, lint, **507 unit tests** (was 468), assets verified, build and budgets |
| `npm run faults` (new) | pass: § A–I |
| `npm run story:e2e` | pass: § A–M |
| `npm run story:sweep` | pass: 1,485 beats (all scenes and routes at 390×844; Chapters 3 and 7 at 7 viewports) |
| `npm run story:route` | pass: all 21 chapter routes (7 × win/loss/tie) showed their own insert first; a full case through to the epilogue with completion recorded for all 9 scenes |
| `npm run e2e` | pass: Quick Play and pass-and-play privacy (5 two-human arrangements through the cover with 0 flashes; hidden tab, rotation and pause re-cover); 400 rapid taps |
| `npm run qa` | pass: 0 failures over 8 viewports (360×800 to 1920×1080); the 667×375 end-slot comfort warning is kept |
| `npm run a11y` | pass (after the test-race fix) |
| `npm run pwa` | pass: offline, update mid-match / mid-dialogue / mid-hand, storage refusing the update-time write, repair, whole-story download |
| `npm run perf:story` | pass: 8 chapter visits; nodes, listeners, timers, workers and media flat |
| `npm run audio` | pass (§ H now distinguishes absent from transient) |
| `npm run matches` | pass: every arrangement completed full matches (fair AI, scoring) |
| `npm run smoke` | pass: subpath, offline-ready, one hand vs the computer, offline restart |

**Branch / commit:** `claude/inspiring-bardeen-4yfmu5` at `b6a0035`. Not merged or deployed.

**Inspected:** the case-file Evidence list, the "Not saved" alert during a scene (Continue stays clear at all
four sizes) and the Retry / Back panel at 390×844, 667×375, 768×1024 and 1366×768. The Chapter 6 drawn table
was also checked.

### Known limitations
- **Chromium emulation only.** Firefox, WebKit / iOS Safari, Android Chrome, real safe-area insets, real
  screen readers and real network drops were not tested.
- **Audio by ear:** recovery was verified by state and request counts, never by ear. Nothing has been
  auditioned.
- **Retry needs a reload when a chunk keeps failing:** a reload is the only way to retry a chunk Chromium has
  cached as failed. The player returns once to the same screen after the start tap.
- **Owner decisions still open:** the expression readings and the transcript decision.

## Owner audio stage (2026-11-18)

The owner's 13 new root-level uploads on `main` were brought in. The merge only added those files, so no
newer work was touched. Each file was then moved byte-identically into `assets/audio/originals/` (verified
with `sha256sum`), where it is preserved and never bundled.

**Reproducible derivatives** (`npm run audio:owner`, `scripts/build-owner-audio.py`). Every runtime file is
built only from those originals.
- **Manifest:** `src/assets/owner-audio.json` records every original and every derivative.
  - Originals: bytes, SHA-256, decoded-PCM hash, EBU R128 loudness / LRA / true peak, and their role
    (used / alternative / duplicate).
  - Derivatives: the source hash, the exact edits and boundaries, and the measured result.
- **Reproducibility:** `npm run audio:owner:check` rebuilds into a temp dir and found every output
  byte-identical.
- **Verification:** `npm run assets:verify` checks originals unchanged, derivative hashes, the source links
  and that the music manifest agrees.

**Slap / dropped domino clips.**
- **Trailing silence removed:** 5.50, 6.24 and 4.90 s (you estimated about 5.6, 6.3 and 5.1).
  - Boundaries were detected per clip: attack at −60 dB re peak minus 2 ms, end at the last 5 ms window
    ≥ −72 dB re peak plus 10 ms.
  - Natural decay is kept about 15 dB below a −60 dBFS cut.
  - Fades are 1 ms in and 6 ms out, so the attacks are untouched.
- **Format:** mono, peak −3 dBFS. The slaps stay at 48 kHz (their crack is 2–3 % of the energy above 12 kHz);
  the drop uses 24 kHz.
- **Wiring:** `slam` = both slap takes; `shuffle` (the deal) = the drop. Their stand-ins were retired from the
  CC0 bank and `docs/SOUND_SOURCES.md` was regenerated. Pickup, place, slide and draw keep their stand-ins.

**Scene tracks.** Each was chosen by measurement against `docs/MUSIC_BRIEFS.md`.
- **Chapter 4:** "Promenade After Dark", the main take. It has a bare opening and is 2.5 dB quieter than the
  Alt.
- **Chapter 6:** "The Lit Threshold (Alt)", up to the cut to the rest area (a new `music-off` state cue,
  replayed on resume). It breathes: LRA 7.9 against 15, 24 jumps against 100, less sub-60 Hz energy.
- **Format:** both are stream copies with the audio proven bit-identical and the cover art removed (1.9 MB).
- **Alternatives:** kept as originals and not bundled.
- **Mix:** Chapter 4 keeps its track through the hand at a lower level, never restarting it. Chapter 6's hand
  at the rest area has no music.

**Result cues** (typed `ResultCue`, `AudioManager.resultCue`).
- **`result-win`:** 1.95 s from "Round Win (Puerto Rico Vibe)", 2 beats into its final hit, which decays
  naturally in 0.81 s.
- **`result-other`:** 1.78 s from "Round Other (Musical Shrug)", its two-chord shrug, with the decay capped
  at 1 s.
- **Level:** −18 LUFS, ≤ −1 dBTP measured on the encoded file.
- **Duplicate:** "Round Win Stinger (Alt)(1)" decodes identically to "(Alt)" and is catalogued as a duplicate.
  The three other win takes are preserved alternatives.
- **No case-complete music** was supplied, and none was made.
- **When it plays:** once, when the results sheet opens for a hand that resolved live (never on a restored
  sheet), from the player's side.
- **How it plays:** on the music bus, ducking the one track to 25 % for about 2 s. It is never synthesized
  and never queued, it is stopped by reset, hide or leaving the table, and it is silent during init, credits,
  menus and dialogue.

**Kept:** typed track ids (`TRACK_IDS`: menu, gameplay, promenade, threshold); one music source at a time;
mute and levels; cue cancellation; the silent init and credits; and bounded recovery for transient failures,
which covers the new tracks and cues too.

**Budgets, raised deliberately** (`docs/PERFORMANCE.md`):
- music 13,500 KB (was 8,000), measured 12,757 KB;
- total 21,000 KB (was 15,400), measured 20,147 KB.

The other budgets hold: code 325 / 330 KB, startup 951 / 960 KB, sfx 576 / 720 KB. The music manifest's
`notes` prose is stripped from the bundle (tested). The optional offline audio download is now 15.1 MB
(disclosed by the Settings line).

**Corrected:** the hardening pass's note claimed startup 940 KB; the measured figure was 948 KB.

**Branch / commit:** `claude/inspiring-bardeen-4yfmu5` at `7fe3e79` (after the merge of `main`, `c57b076`). Not
merged into `main` or deployed.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run audio:owner` / `npm run audio:owner:check` | built; reproduced byte-identically |
| `npm run check` | pass: typecheck, lint, **518 unit tests** (new: `sounds.test.ts`, owner beds and result cues in `manager.test.ts`, notes stripping), assets verified (13 originals untouched, 7 derivatives), build and budgets |
| `npm run audio` | pass. § B: the deal plays the owner's drop. § D: Chapter 6 knocks over "threshold", one element. § H: a 404 is absent and an abort is transient. New § K: the owner samples decode in Chromium; a real Chapter 4 hand plays "promenade" and its result plays exactly one cue on the music bus; a reload on the results sheet replays nothing |
| `npm run e2e` | pass |
| `npm run story:e2e` | pass |
| `npm run faults` | pass (§ G/I media recovery) |
| `npm run pwa` | pass (the optional audio group grows to 11 files / 15.1 MB, disclosed) |
| `npm run perf:story` | pass |
| `npm run smoke` | pass |

### Known limitations
- **Nothing was auditioned by ear.** The cuts, trims, track choices and levels are measured, not heard. A
  listening pass is still needed before anything is marked `final`.
- **No case-complete or chapter-card music**, and no edited loops or separate endings for the two beds (they
  play through and restart).
- **Tile foley is partial:** only the slam and the deal are real recordings.
- **Chromium only:** decoding of the 48 kHz MP3 cues was not tested on WebKit / Safari.

## Startup polish stage: the INSPIRE studio credit (2026-11-18)

The existing initialization and intro controllers were extended (`src/app/intro.ts`, `src/ui/intro-screen.ts`);
no new manager was added.

**The video.**
- **Source:** `public/assets/video/inspiresoftwareintro.mp4` from `officialinspire/Inspire-card-parlor`, branch
  `main`, verified commit `cdc789bad27a01e546135d26c0fc3278b4519635`.
- **Fetch:** fetched by git at exactly that commit (no LFS) and copied to `assets/video/inspiresoftwareintro.mp4`.
- **Verified:**
  - git blob `66ff2ca8b4344840cd6170dd4ed63a573251d486` (re-hashed locally);
  - 278,774 bytes, SHA-256 `8a6ce01d…cbcb88`;
  - a clean full decode with ffmpeg;
  - H.264 High 1080×720 at 30 fps, 5.83 s, with AAC-LC 44.1 kHz stereo (5.87 s, −21 LUFS, peak −6.1 dBFS);
  - `moov` before `mdat` (fast start);
  - black at the head (0.33 s) and from 5.33 s.
- **Recorded:** in `INTRO_VIDEO` (`src/assets/audio-manifest.ts`). `npm run assets:verify` checks the bytes, the
  hash and the fast-start layout. The "video missing" entry was removed from `MISSING_ASSETS`.
- **Served locally:** the video is bundled under a hashed, base-path-safe URL, never a runtime external URL. It has
  its own budget (400 KB, measured 272 KB) instead of counting as music, and is not cached offline yet (next stage).

**Polish of the existing flow** (initialization → Touch/Click/Enter to Start → skippable credit → fade through
black → menu reveal).
- **Skip guard:** Skip and Mute arm only after the starting input is released (pointerup or keyup) and at least
  400 ms have passed, or after 1.5 s at most.
  - While guarded they are `aria-disabled`, and auto-repeating Enter/Space never activate anything.
  - A key held since the prompt was still loading starts nothing.
  - A keyboard-generated click waits for its key's release.
  - **Found by the new test:** a repeating Enter could activate the start button and arm Skip while still held.
    It is fixed.
- **No credit / menu overlap:** Skip and timeouts fade the soundtrack (380 ms, or 120 ms with reduced motion)
  with the picture's fade, then release the media. The menu, and its music, wait for that release, and a stuck
  fade is cut off by a timer.
- **Refused playback:** a refused play() with sound is retried once muted; the credit plays muted, Mute reads
  "Unmute", and the saved mute is unchanged. A pause's AbortError during backgrounding no longer ends the credit.
- **Kept:** one gesture unlocks audio and plays no sound of its own; duplicate starts are impossible; the
  start / stall / overall timeouts remain; it pauses in the background and resumes on return; mute and reduced
  motion are respected; essentials load through the bounded loader with truthful progress and Try again; the
  video buffers only once the essentials are in; the text credit remains the fallback if the file is missing;
  the layout letterboxes at any orientation.

**Tests.**
- **Unit:** `intro.test.ts` 10 → 16: the muted retry, a double refusal, fade-then-release ordering, a stuck fade
  cut off, immediate release on end / error / cancel, and AbortError while backgrounded.
- **Browser:** e2e § 7 keeps its fixture routes (ok, 404, hang, refused, missing → the text credit, background,
  rotation, mobile tap). The new § 7k uses the real video:
  - it decodes and plays locally at 1080×720 / 5.87 s;
  - the start press released over Skip, plus a quick second tap, does nothing;
  - Skip fades out → black → menu once, with at most one media source;
  - Enter held from loading starts nothing, and held Enter after ready can't skip;
  - with sound refused it plays muted and the music returns;
  - played out at 844×390 with reduced motion and the player's mute: menu once, no reveal.
- **Other suites:** suites that only pass through startup use the text credit (`__sbIntroVideo = null`, dev
  only); the others wait for the armed Skip; smoke plays the real credit in the production build.

**Inspected:** the start prompt, the credit (letterboxed, controls clear) and the reveal at 390×844, 667×375 and
1366×768.

**Branch / commit:** `claude/inspiring-bardeen-4yfmu5` at `5bc2288`. Not merged or deployed.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: typecheck, lint, **524 unit tests**, assets verified (intro video bytes / hash / fast start), build and budgets (code 327 / 330, video 272 / 400, total 20,418 / 21,000 KB) |
| `npm run e2e` | pass, including § 7k (real video) |
| `npm run a11y` | pass |
| `npm run qa` | pass: 0 failures, 1 kept comfort warning |
| `npm run pwa` | pass: offline reload starts from cache and reaches the menu (the credit isn't cached yet; its error path enters the menu), 0 page errors |
| `npm run smoke` | pass: the production build plays the real credit through to the menu |
| `npm run faults` | pass |
| `npm run story:e2e` | pass |
| `npm run audio` | pass |
| `npm run matches` | pass |
| `npm run perf:story` | pass |
| `npm run story:route` | pass |

### Known limitations
- **Offline:** the credit is not cached yet (next stage); offline it plays only if the HTTP cache still holds it. *(Resolved by the full offline storage stage.)*
- **Codec support:** H.264/AAC playback was exercised in this Chromium build only. Safari, iOS, Android and
  Firefox were not tested, though they generally support H.264 MP4.
- **Volume on iOS:** iOS ignores `volume`, so the soundtrack fade there ends with the release, at the end of the
  picture fade, instead of ramping.

## Full offline storage stage (2026-11-18)

**Owner decision:** full offline storage is authorized. It replaces the old policy (music and ambience only in
an optional download; the intro video never cached). `AGENTS.md`, `docs/PWA.md`, `docs/AUDIO.md`,
`docs/PERFORMANCE.md` and `docs/RELEASE_HANDOFF.md` were updated to match.

### Completed

- **The pack (`vite.config.ts`, `sticks-pwa`):** every shipped runtime file is listed with bytes and SHA-256,
  computed in `writeBundle` from the files as written (Vite's own post plugins still rewrite chunks after
  `generateBundle`, which made the earlier sizes slightly wrong for two chunks). Four groups: shell (HTML, every
  JS chunk incl. lazy Story/achievements, CSS, fonts, manifest, all icons, font licences), core (Quick Play art
  in both orientations, UI/table sounds, result cues), story (backdrops in both orientations, cast sheets,
  story sounds), media (music, ambience, intro video). The build fails on an unlisted file, a non-icon PNG or
  a byte-identical duplicate. **81 files, 20,892,477 B.**
- **Service worker (`src/pwa/sw.js`, rewritten):** whole-game job (2 at a time, stall timeout, 2 tries per
  file, quota stops it); adopts identical copies already held (incl. the retired `audio:v1`); stores only
  complete, checksum-verified `200`s with MIME from the extension; re-hashes every file, then writes the
  `verified` marker; prunes old entries and retired caches **only after** verification; offline fallback to
  an older build's copy of the same image/sound/video; cache-first with single-range 206, 416 `bytes */len`,
  200 for multi/malformed ranges, `HEAD`; app-only repair (stale caches, re-hash, replace, download).
- **Page (`src/app/pwa.ts`, `main.ts`, `menu.ts`):** the download starts 1.5 s after the menu (or the
  post-update return), online only; Data Saver waits for the player; storage estimate checked first;
  `persist()` only on the player's tap; Retry; automatic retries with backoff (max 3 per visit); stall
  detection (worker stopped); a page adopts the outcome of a run started before a reload (this was a real bug
  found by the tests: the line stayed at "Checking… 81 of 81"). One honest status line (ready / saving /
  checking / stopped / waiting / Data Saver / quota / missing / corrupt / evicted / old media kept /
  unavailable), progress bar, storage line (our bytes, free estimate, persisted or not), Download/Retry
  button, Install button (`beforeinstallprompt`) or install note. `sticks-and-bones.offline` is v2
  (`{ verifiedBuild }`, v1 migrates) — used only to report eviction honestly.
- **Checks/budgets (`scripts/check-dist.mjs`):** re-hashes `dist/` against `build.json`, requires the video,
  both orientations, cast, ambience, cues, SFX, Story chunk and fonts in the pack, rejects source masters and
  duplicates; new **offline pack** gate 21,000 KB (20,404 measured); service worker 48 KB (43); total
  21,100 KB (20,446). `sw.js` no longer counts as page code/startup (it never was): code 316 / 330,
  startup 942 / 960.
- **Tests:** `src/app/pwa.test.ts` rewritten (wording, button, outcomes, Quick Play readiness, record
  migration). `scripts/pwa.ts` rewritten: 13 scenarios on production builds A/B/C under `/STICKS_-_BONES/`
  (see `docs/PWA.md` "Evidence"), incl. a **cold offline launch by relaunching the browser profile** (the
  studio video plays from the cache), ranges/MIME, interrupted install and whole-game downloads (cut
  transfers and a stopped worker; resume fetches nothing already saved), quota ×3, corruption (stored and in
  transit), eviction (all / one group), upgrade retention A → C, Data Saver, unavailable storage, updates
  mid-match / mid-case, repair / erase isolation. `PWA_ONLY=…` runs a subset. `scripts/smoke.ts` now waits
  for "Full game ready offline".

**Merged in from the branch (owner's commit `1109a2d`):** campaign artwork in `marketing/source/` (not
shipped) and social-sharing metadata in `index.html` with `public/social/sticks-and-bones-og-v1.jpg`. That
image ships but is not a runtime dependency (only link-preview crawlers fetch it), so it is explicitly exempt
from the offline pack (`NOT_RUNTIME`) and from the image gates; `check-dist` caps it at 300 KB. After the
merge: code 318 / 330 KB (the meta tags), startup 944 / 960, offline pack 20,405 / 21,000, total 20,619 /
21,100 KB.

**Branch / commits:** `claude/inspiring-bardeen-4yfmu5` at `3f74bca` (stage), then the merge of `1109a2d` and
the follow-up. Not merged to main or deployed.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: typecheck, lint, **529 unit tests**, assets verified, build + budgets (offline pack 20,404 / 21,000 KB) |
| `npm run pwa` | pass: all 13 scenarios; pack 81 files / 20,893,193 B read back and matched (bytes, SHA-256, MIME) |
| `npm run smoke` | pass: subpath, **Full game ready offline**, a full hand, offline restart, clean console |
| after merging `1109a2d` | `npm run check` pass (529 tests), `npm run smoke` pass, `npm run pwa` pass (13 scenarios; pack 20,895,118 B). §3 now compares the set of re-fetched files: the startup loader may request the missing atlas alongside the download (a flaky count, not a resume defect) |
| `npm run e2e` | pass |
| `npm run a11y` | pass: 0 failures |
| `npm run qa` | pass: 0 failures, 1 kept comfort warning (667×375 end slots 62×40) |
| `npm run faults` | pass |
| `npm run story:e2e` | pass |

Not re-run this stage (no Story presentation, rules or AI change): `story:sweep`, `story:route`, `matches`,
`audio`, `perf:story`.

### Known limitations

- **Only Chromium** (headless desktop) was exercised. Safari/iOS (per-origin limits, 7-day eviction for
  non-installed sites, no install prompt), Firefox (`persist()` prompt, no install) and real devices are
  untested; see `docs/PWA.md`.
- The download runs while a page is open; a browser may stop it in the background — it resumes on the next
  visit (tested by stopping the worker).
- The cheap status check trusts stored checksum headers; silent disk corruption after verification is found
  by **Repair** (deep re-hash), not on every launch.
- The free-space figure is the browser's estimate for the whole origin (shared with other INSPIRE apps).

## Full-game audit through the real UI (2026-11-19)

Audit of the whole game as a player meets it — the approved script, the audio and effects map, robustness,
and the full offline pack — with focused fixes and regressions. Chromium only (the only browser here); no
audio output device, so listening was not possible.

### Defects found and fixed

1. **Celebratory result cues after serious hands.** The win/other stinger played after every story hand,
   including Chapter 5 and 6's deliberately music-free hands (the jungle; the rest area after the
   encounter) and Chapter 7's public confrontation with Vale. Now a profile property
   (`SceneProfile.resultCue`, `src/audio/profiles.ts`): withheld after Chapters 5–7 (also in replays);
   Chapters 1–4 and the tables keep it. Unit test (all seven chapters) + browser checks in
   `npm run offline:tour` and `story:e2e` § N.
2. **Roberto laughing at Vale's domino.** In Story the table's host figure is Roberto — the player's own
   character — but its moods were Quick Play's (where Cousin is the AI opponent): when Vale went out,
   Roberto was drawn laughing, and the results sheet showed his gloat. Moods now follow the host's side
   (`src/ui/host-mood.ts`): Story — delighted for his team, thoughtful when it loses, surprised by a block;
   Quick Play unchanged except that Cousin is surprised (not laughing) when the player's AI partner goes
   out in solo Partnership. Unit tests + a per-hand `data-mood` check across all seven story hands offline.
3. **A sound that never played.** `slide` (three card-slide stand-ins, 65 KB) shipped and was stored
   offline, but nothing triggered it; the `tap` id was dead too. Retired through the builder; a test now
   fails if a shipped sample has no caller or a sound id has none.
4. **Dead air in the beyond-knock.** Its chain padded 1 s for an echo tail that the 1.40 s fade-out then
   silenced: 1.2 s of digital zeros. Padding removed — audio bit-identical over the sound (max difference
   0.0), 48 KB smaller; every other SFX and bed rebuilt byte-identical.

### Verified (and how)

- **Script and routes:** `story:route` plays the whole case in the UI (every scene, the insert matching
  each real result, notebook end cards, Case complete) and opens all 21 chapter × win/loss/tie routes;
  `story:sweep` walks every beat (verbatim text, tagged expression, one speaker, Continue-only, corporate
  terrace for Chapters 3 and 7). The Chapter 6 hand stays at the drawn modern rest area.
- **Audio map** (`docs/AUDIO.md` "The complete map"): in the production build, offline, every scene's
  playing music and looping bed were sampled at its first line and in its hand and matched its profile;
  knocks on the audio clock 0.62 / 0.62 s with the answer +1.15 s (Prologue on a fresh case, Chapter 6).
- **Robustness:** rapid Continue / Skip, Back, reload mid-dialogue and mid-hand, risky-moment reloads,
  rotation, backgrounding, mute, missing media and refused saves are covered by `story:e2e`, `audio`,
  `faults`, `e2e`; **chapter replay** was untested and is now `story:e2e` § N (a double tap opens one run
  from beat 1; story position, completed chapters, stats and achievements byte-identical afterwards).
  Taps during a scene's ~550 ms entrance are ignored by design (never queued) — noted, not changed.
- **Offline cold launch** (`npm run offline:tour`, new): after the whole-game download the browser
  relaunches offline with the server down; the intro plays out from the cache (5.9 s), menu music, a
  Quick Play hand (tile sounds, impact effects, a result cue), the whole case with seven hands, both knock
  motifs, offline resume of a story hand and a match (identical), achievements (24 of 100) across a
  reload, every scene at 844×390, 360×800, 768×1024 and 1366×768 over its own backdrop, rotation
  mid-line, a desktop Chapter 7 hand — **0 app requests reached the network, 0 page errors**.
- **Measured audition** (`npm run audio:report`, new): 38 runtime files — loudness, true peak (none
  clipping), dead air, cut-off tails, bed seams as played (wrap steps within each bed's own variation),
  motif knocks peak-matched (0.0 dB spread). The owner's trimmed slam/drop clips: 0–1 ms lead, faded
  tails, no cut-off.

**Branch / commits:** `claude/inspiring-bardeen-4yfmu5` — checkpoint `970a39b`, then the follow-up with
these notes. Not merged or deployed.

### Commands run and results (Chromium)

| Command | Result |
| --- | --- |
| `npm run check` | pass: typecheck, lint, **534 passed unit tests** (new: per-chapter result-cue policy, host moods by side, sample-to-caller mapping), assets verified, build + budgets (sfx 466 / 720 KB, offline pack 20,296 / 21,000 KB, total 20,509 / 21,100 KB, code 318 / 330) |
| `npm run audio:report` (new) | pass: 38 files measured (not heard) |
| `npm run audio` | pass |
| `npm run e2e` | pass |
| `npm run faults` | pass |
| `npm run story:e2e` | pass, incl. the new § N (chapter replay) |
| `npm run story:sweep` | pass |
| `npm run story:route` | pass: whole case + all 21 chapter routes |
| `npm run offline:tour` (new) | pass: whole case offline on the production build; Roberto's moods win→delighted, loss→thinking on all seven hands; 0 network requests, 0 page errors |
| `npm run smoke` | pass |
| `npm run pwa` | pass (13 scenarios; pack 20,782,609 B after retiring the slide sounds) |
| `npm run matches` | pass (run at the start of this stage; nothing since touches rules or AI) |

Not re-run: `qa` / `a11y` (no layout change; the results sheet gained only a `data-mood` attribute), `perf`.

### Not verified (honestly)

- **Listening:** no audio output here. Track transitions, loop seams, levels, the trimmed clips and the
  knocks' character were measured, **not heard**. The owner's listening pass remains open.
- **Browsers and devices:** Firefox, WebKit/Safari, and real phones/tablets were not available; phone,
  tablet and desktop were emulated viewports in Chromium.
- **Human pacing:** bot timing only; the 90–110 minute target still needs real playtests.

## Next stage

The detailed list is in `docs/STORY_BUILD_STATUS.md`:
- **the owner's listening pass** (transitions, seams, levels, trimmed clips, knocks), using `npm run audio:report`
  as the measured reference;
- real-device checks of full offline storage and the whole game (iOS Safari install/eviction, Android Chrome,
  Firefox), e.g. by repeating `npm run offline:tour`'s route by hand;
- Finish Hand with AI assistance, and skip with recap;
- version alignment (package vs release notes);
- release reconciliation and the handoff document.

Done since the last list: the resilience items (update-time save retry, bounded music recovery, AI worker
timeouts / `messageerror` / cancellation), cast expressions, and the Evidence list.

Still waiting on the owner:
- **Analytics:** the analytics contract, or read access to `officialinspire/SPIRITBALL`.
- **Merge:** enabling Pages and authorising the merge.
- **Music:**
  - the case-complete cue (and the optional chapter-card cue); edited loops / endings for the Chapter 4 and 6
    beds (`docs/MUSIC_BRIEFS.md`); the night bed, the cave bed and the round cues are delivered and wired;
  - recorded foley for picking up, placing, sliding and drawing a tile (the slam and the deal are delivered);
  - a listening pass on the selected sounds, bed seams, the two scene tracks and the result-cue cuts.
- **Voices and portraits:** the contractor speaker's recording (if it should be voiced); portraits for
  Worker, Representative and the contractor speaker.
- **Confirmations:** the expression readings, and the transcript decision.
- **Playtesting:** real devices, Firefox / WebKit, and representative first-time playtesters.


## Social sharing artwork and Pages publication (2026-11-18)

Owner requested all three approved campaign images in the repository and a live Pages link with the
game banner in its social preview. This request authorizes Pages enablement and publication.

- Preserved the wide, square Instagram and portrait Story PNG masters in `marketing/source/`.
- Added `public/social/sticks-and-bones-og-v1.jpg`: 1200 × 630, 175,379 bytes, exported from the wide
  master. Only this small derivative ships; campaign masters are not loaded or cached by the game.
- Added static canonical, Open Graph and Twitter `summary_large_image` tags to `index.html`, including
  absolute HTTPS image/page URLs, dimensions, MIME type, descriptive alternative text and story title.
- Verified built HTML metadata and byte-identical JPEG copying into `dist/social/`.
- Fresh checks: typecheck and lint pass; 524 tests in 44 files pass with `--maxWorkers=1`; asset
  verification passes; production build and all budgets pass (startup 955 / 960 KB; total 20593 / 21000 KB).
- Fresh local browser execution remains unavailable in this environment (Chromium socket restriction).
  The existing deployment workflow runs its own complete check and production browser smoke before publication.
- Pages was disabled when inspected. Publication is being completed using the existing deploy workflow;
  do not infer deployment success from this entry alone. The final response records the observed result.

## Viewport-bound menus (2026-11-18)

- Added section selectors and previous/next buttons to setup, rules, Settings, Statistics,
  Achievements, the Story case file and the in-game pause menu. The home menu paginates when saved
  games, notices or update controls take up the available space.
- Pages fit using the measured viewport. Setup inputs stay mounted, so changing pages or rotating the
  device retains the game, opponents, names, seat and score. Deal and pause actions stay in view.
- Achievement filters and Story replay, notebook and evidence entries use the same paginator.
- Added a production browser smoke sweep across eight viewport sizes, including 320 × 568 and
  568 × 320, and checks for preserved setup choices after rotating. Individual cards that exceed the
  viewport at extreme text sizes retain an accessible reading area.
- The code and startup byte limits were adjusted for the shared pager and responsive menu styles.

## Stage 1 — integration (2026-11-19)

Release plan: `docs/RELEASE_PLAN.md` (new; contract and end-of-stage checklist; stages 2–4 await the owner's
scope). Review branch `claude/stage-1-release-integration`, cut from `main` at `f89914d`.

**Integrated** `claude/inspiring-bardeen-4yfmu5` (full offline storage, intro-video caching, Story result-cue
policy, Roberto's corrected reactions, the audit tooling) onto `main`'s viewport-bound menus, setup values and
saved-data recovery notices. Four conflicts, resolved semantically:
- `src/ui/menu.ts`: `main`'s paginated Settings keep their "Offline play" and "Storage" pages, which now hold
  the whole-game download (progress, Download/Retry, install) and the storage line, Repair and Erase.
- `src/ui/table.ts`: `main`'s pagination imports plus the host-mood module.
- `scripts/smoke.ts`: `main`'s menu-viewport sweep with the "Full game ready offline" expectation.
- `scripts/pwa.ts`: the branch's 13 offline scenarios with `main`'s `showMenuItem` step before every
  paginated menu control (applied in `offline-tour` and `story:e2e` § N too).

**Integration regression fixed:** `pwa`'s `openSettings` waited for one `.offline-panel`; pagination renders two.

**Commands run on the merge (Chromium, local):**

| Command | Result |
| --- | --- |
| `npm run check` | pass: typecheck, lint, 534 unit tests, assets verified, build + budgets |
| `npm run smoke` | pass (menu-viewport sweep + "Full game ready offline") |
| `npm run pwa` | first run failed (harness: two `.offline-panel` pages); after the fix: **pass**, 13 scenarios |
| `npm run offline:tour` | pass: whole case offline on the production build, 0 network requests, 0 page errors |
| `npm run e2e` | pass |
| `npm run qa` | pass: 0 failures, 1 known comfort warning (667×375 end slots 62×40) |
| `npm run a11y` | pass: 0 failures |
| `npm run story:e2e` | pass (incl. § N replay through the paginated chapter list) |
| `npm run story:sweep` | pass |
| `npm run story:route` | pass |
| `npm run faults` | pass |
| `npm run audio` | pass |
| `npm run matches` | pass: all arrangements completed full matches |
| CI (`ci.yml`) on the branch | green for `6de297c` and `d95cad9` |

Unavailable here: Firefox/WebKit and real devices; audio listening (no output device).

**Release (end-of-stage contract):** PR #4 merged into `main` as `8d6493f` (merge commit; `main` had not moved
from `f89914d`). CI green on the branch and on `main`. "Deploy to GitHub Pages" (run 44451111469) succeeded.
Live https://officialinspire.github.io/STICKS_-_BONES/: `<html data-build>` = `8d6493f9e100`; start screen
"Ready." → menu; service worker scope `/STICKS_-_BONES/`; the whole-game download verified live ("✓ Full game
ready offline (19.8 MB on this device)."); 0 page errors. Checked with Chromium through this environment's
proxy; no other browser or real device was used.

## Stage 2 — Story assistance, transcript, recap, first-hand guidance (2026-11-19)

Release plan Stage 2 (`docs/RELEASE_PLAN.md`); branch `claude/stage-2-story-assist` from `main` `d7c0d6f`.

### Completed
- **Finish hand with AI** (Story pause sheet only): `GameSession.assist(seat)` hands the player's seat to the
  existing observation-only AI. It runs through the session's own token-checked loop (`{epoch, seq, seat}`)
  and `applyCommand`; `canAct` refuses manual moves meanwhile, so nothing interleaves. "Take over" (table or
  pause sheet), pause, leaving and reload make any decision in flight stale; a reload keeps the
  "assisted" label (`hand.assisted`), never the assistant. The real result advances the case once; the results
  sheet says "Finished with AI assistance". Achievements: from the assistant's first move the table counts
  nothing; the chapter completes but never as a win. Analytics: not instrumented (the contract allows only
  `skip_scene` as an assist kind; no new event name invented).
- **Story record v3** (`src/story/progress.ts`): `outcomes` per scene and `assisted` scenes; v2 migrates
  (the current scene's outcome kept; earlier ones unknown, never guessed).
- **Transcript** (case file page, existing pagination): reached beats only, verbatim lines, player captions,
  each hand's actual result and its insert, assisted hands marked (`src/story/transcript.ts`).
- **Recap after Skip:** dismissible, on the deal/end card: only the approved Evidence excerpts inside the
  skipped range (the end card already shows the notebook entry). Focus returns to the card's action.
- **First-hand table tips** (Settings v4 `tableTips`, on for new players, migrated settings off): one
  step-aware line in the hand header (tile; both ends; draw/pass; partner in Partnership) with a 44 px ✕;
  turned off quietly after a completed hand (no exploration achievement, nothing in replays).
- **Short-landscape open ends:** targets grow to ≥ 44 px (`qa`'s long-standing comfort warning is gone).
- No waits added; the seven chapters stay single hands; Quick Play and two-player unchanged apart from the
  tips (and the corrected Partnership mood from Stage 1).

### Defects found by the new tests and fixed before release
- The automatic tips-off went through `settings.set`, awarding "explore Settings" — even in a replay (`story:e2e`
  § N and § O). It now uses a quiet path.
- The tip first sat in the controls column and overlapped neighbouring panels at 360×800 and 667×375 (`qa`).
  Moved into the hand header.
- With the new Table tips switch, the "Table talk" settings group was taller than one menu page at 568×320 (3 px
  over in Settings, 53 px in the pause sheet; `smoke`). The switch now has its own group, so pagination places it
  on its own page (`1996e8f`).
- Large text (130 %) on a 320×568 phone pushed the hand below the fold (pre-existing). The table now scrolls instead
  of hiding it (`story:e2e` § P checks reach by scrolling).

### Owner uploads on `main` (unblocked)
`main` gained four uploads at the repository root (`745b198`), which `assets:verify` rejects, so CI and the Pages
deploy failed on `main`. They were moved byte-identically (`git mv`) under `assets/art/` and catalogued as untouched
variants with bytes, SHA-256, dimensions and alpha (`b61bddb`): the cave-entrance rest area, two supporting
portraits and a blank evidence card. Their runtime use is Stage 3.

### Commands run and results (Chromium)

First pass on `e29eb5f` (the branch with `main` merged); `check`, `smoke`, `qa`, `e2e`, `a11y` and `audio` were
rerun on `1996e8f` (the catalogue and the settings fix).

| Command | Result |
| --- | --- |
| `npm run check` | pass (546 unit tests in 46 files; assets:verify with the four uploads catalogued; every budget) |
| `npm run qa` | pass: 0 failures, 0 comfort warnings (both passes) |
| `npm run e2e` | pass (both passes) |
| `npm run a11y` | pass: 0 failures (both passes) |
| `npm run story:e2e` | pass (§ O assisted win/loss/tie, take over, reload, leave; § P transcript, recap, reach) |
| `npm run story:sweep` | pass |
| `npm run story:route` | pass (the whole case through the UI; 21 routes) |
| `npm run faults` | pass |
| `npm run matches` | pass (Block and Partnership two-human matches, all arrangements) |
| `npm run smoke` | **fail** on the first pass (Table talk group overflow at 568×320, above) → pass after the fix |
| `npm run pwa` | pass (offline pack 20,798,062 B) |
| `npm run offline:tour` | pass |
| `npm run audio` | pass (on `1996e8f`; Stage 2 changes no audio) |

Not available here: Firefox/WebKit, real devices, audio listening.

### Release
PR #6 merged into `main` as `86df38a` (merge commit). CI green on the branch (`d9ed9ef`) and on `main`.
"Deploy to GitHub Pages" (run 44474606924) succeeded. Live: `<html data-build>` = `86df38a33be4`; "Ready." →
menu; service worker scope `/STICKS_-_BONES/`; 0 page errors (Chromium through this environment's proxy).


## Stage 3 — owner art, evidence cards, credits (2026-11-19)

Release plan Stage 3 (`docs/RELEASE_PLAN.md`); branch `claude/stage-3-assets-credits` on top of Stage 2.

### Upload audit (first)
- **Images:** the four uploads of 2026-11-18 (`745b198`) were the only new files. All four are kept byte-identical
  under `assets/art/` with bytes, SHA-256, dimensions and alpha (`b61bddb`). Reused approved work: the derivative
  builder, focal table, portrait crops, sample globs, menu pagination, wordmark and AudioManager. Nothing was
  re-encoded in place.
- **Audio:** none. `assets/audio/originals/` holds the same 13 uploads as before. There is **no case-complete music or
  foley** to integrate.

### Completed
- **Chapter 6 rest area:** `env.rest-area` → `rest-area.webp` (q83) + `rest-area-portrait.webp` via
  `assets:derive`. The cut to the entrance rest area and the hand use it; the hand is never on the ancient platform
  (`staging.test`, `story:e2e` § G, `faults` § H). The rest-area grade is now a translucent daylight wash.
- **Evidence inspection cards:** the case file's Evidence page shows reached items only, one card each, over
  `evidence-card.webp`. The exact approved caption is code-rendered on the card's paper (measured insets), using
  the existing pagination.
- **Title reprise and credits:** on the epilogue's end card, "Title and credits" shows the existing wordmark rising
  in, then paginated credits, then returns to the Case file. Every name and licence is tested against its source
  record (sound manifest, music manifest and artist tags, OFL files). The reveal is CSS only; any tap or key
  finishes it, and it is instant under reduced motion. It writes nothing, and notices wait for the Case file.
- **Case-complete audio:** `AudioManager.caseComplete()` (music-bus cue after the scene music fades, plus SFX-bus
  foley; once; cancelled on any scene, profile or visibility change or reset). Explicit loop points apply only when
  marked auditioned. Builder path in `build-owner-audio.py` (conservative trims, natural tails, gain only lowered to
  ≤ −1 dBTP). With no files supplied, nothing changes and nothing is synthesized.
- **Unchanged:** Chapters 5–7 result-cue policy, the authored knock timings, the Story save format, the offline
  pack mechanism (new files are listed and verified automatically) and app-only repair.
- **Budgets:** Chapter 6 1,150 KB (was 1,000) and total 21,250 KB (was 21,100), both for the owner's art at the
  smallest passing encode (`docs/PERFORMANCE.md`); no other limit moved.

### Defects found by the new tests and fixed
- Evidence cards at 568×320: the longest excerpt overflowed one menu page (`story:e2e` § Q). Short landscape now
  uses a wider card.
- Credits: the reveal-finishing tap and Escape only listened on the inner panel (§ Q). They are now
  document-level and removed on leaving.
- An achievement notice popped over the reprise (§ Q fails without the fix). Notices now wait for the Case file.

### Commands run and results (Chromium)

All on `fccc846` (identical tree after merging `main` `86df38a`).

| Command | Result |
| --- | --- |
| `npm run assets:derive` | pass: the rest area (q83, mean error 5.91; crop 5.94) and the card (q80, 2.62); every existing derivative rebuilt byte-identically |
| `python3 scripts/build-owner-audio.py --check` | pass: every owner-audio derivative reproduced byte-identically; the new ending-cue path verified on synthetic files only (no upload) |
| `npm run check` (incl. `assets:verify`) | pass: 556 unit tests in 48 files; all budgets (two raised, measured, above) |
| `npm run smoke` | pass |
| `npm run audio` | pass |
| `npm run audio:report` | pass: 38 files measured (not listened to) |
| `npm run story:e2e` | pass, including new § Q (evidence cards, reprise, credits, cue fallback) and § G/H (Chapter 6 on the rest area) |
| `npm run story:sweep` | pass |
| `npm run story:route` | pass |
| `npm run qa` | pass: 0 failures, 0 comfort warnings |
| `npm run a11y` | pass: 0 failures |
| `npm run faults` | pass (§ H: Chapter 6's hand on `env.rest-area`, never the cave) |
| `npm run e2e` | pass |
| `npm run matches` | pass |
| `npm run pwa` | pass: offline pack 21,469,239 B, byte ranges and app-only repair |
| `npm run offline:tour` | pass: the whole case offline after a cold relaunch, including Chapter 6 |

Not available here: Firefox/WebKit, real devices, a listening pass (nothing is marked auditioned).

### Release
PR #7 merged into `main` as `418be75` (merge commit). CI green on the branch and on `main`. "Deploy to GitHub
Pages" (run 44480530409) succeeded. Live: `<html data-build>` = `418be7559d86`; "Ready." → menu; service worker scope
`/STICKS_-_BONES/`; 0 page errors; the offline pack lists the rest-area images and the evidence card (Chromium
through this environment's proxy).

### Missing uploads (listed separately)
- **Case-complete music** (`docs/MUSIC_BRIEFS.md`: 6–10 s, warm, settled) and **case-complete foley**: wired and
  waiting; nothing fabricated.
- Still missing from earlier lists: the optional chapter-card cue; recorded domino foley for pick-up, place, slide
  and draw; the contractor speaker recording (caption-only by design until supplied); a listening pass for every
  measured sound, seam and loop.
- Supplied but intentionally unused: the worker and representative portraits (optional; the script plays both as
  text and off-camera voices).

## Stage 4 — release workflow, three engines, human gates, analytics status (2026-11-19)

Release plan Stage 4 (`docs/RELEASE_PLAN.md`); branch `claude/stage-4-release-workflow` from `main` `467c8ef`.

### Completed
- **Release workflow:** `npm run release` (all engines; `--engines`, `--suites`, `--resume`, `--rerun`) and the
  **Release suites** GitHub workflow (manual; one job per engine, with a virtual sound card). It runs `check` and
  `audio:report` once, then `smoke`, `release:sweep`, `e2e`, `qa`, `a11y`, `story:e2e`, `story:route`,
  `story:sweep`, `faults`, `audio`, `matches`, `pwa` and `offline:tour` per engine, and writes
  `test-results/release/report.{md,json}` with the exact browser builds, Playwright, Node, OS, each result's commit
  and every check an engine could not perform.
- **Every suite engine-aware** (`scripts/lib/engine.ts`, `SB_BROWSER`). Gaps are recorded with `unsupported()`, never
  counted as passes: DevTools-only emulation (safe areas, quota override, stopping workers, installability, WebKit's
  browser text size); WebKit's broken offline emulation during navigation (the origin is made unreachable instead);
  layout-shift and long-task entries where missing (reported unmeasured, not 0); WebKit's reports of same-origin
  requests cancelled by navigation and of failed service-worker loads (only those exact, stackless messages).
- **`release:sweep`** (new): every mode (Draw, Block, Partnership vs the computer, two players, Story) × 5 viewports
  (320×568, 390×844, 568×320, 768×1024, 1366×768; touch on phones/tablets) × 100/130 % text, with a real move,
  rotation and background/resume in each of the 50 cells, on the production build from the Pages subpath.
- **Human gates:** `docs/RELEASE_CHECKLIST.md` — real-device checklist (4 devices × 11 checks), listening checklist,
  three-player timing sheet with reading and hand time separated (from the `story:<scene>:<phase>` measures). No
  results are filled in: none exist.
- **Analytics:** still disabled. Attaching `officialinspire/SPIRITBALL` was refused by the session permission
  policy; nothing was inferred. De-duplication tests now cover repeated assists; a test proves dialogue, captions,
  hands, stock, RNG state, seeds and personal fields never pass the sanitizer.
- **Docs reconciled:** 1.0.0-rc.3 (package, README, release notes, changelog, handoff, QA, story status, AGENTS).

### Defects found by running Firefox and WebKit, fixed
| Engine | Defect | Fix | Regression test |
| --- | --- | --- | --- |
| Firefox | Download / Retry never started: `downloadAll` awaited `navigator.storage.persist()`, which Firefox keeps pending until its prompt is answered | persistence is requested on the tap but not awaited | `pwa` step 7 models an unanswered prompt in every engine (fails without the fix in Chromium too) |
| Firefox | console error while music streamed: the worker intercepted media range requests it couldn't answer and Firefox reported the element's normal cancellation as a failed load | uncached range requests left to the browser while online; a previous build's copy still counts as held | `release:sweep` (range-serving server) in Firefox; `pwa` step 12 in Firefox |
| Firefox | opening a table left focus nowhere; Tab resumed past the legal tiles and left the page | the table heading takes focus when focus was lost | `a11y` keyboard section in Firefox |
| WebKit | 133 px of sideways scroll after rotating back to portrait in Story (a figure's SVG image box) | `.story-stage { overflow-x: clip }` | `story:e2e` § F in WebKit |
| WebKit | "Take over" rebuilt on every assisted move (a tap could miss) | controls re-render only the part that changed | `story:e2e` § O in WebKit |
| Firefox | the board re-render moved out of the resize callback (an attempt at WebKit's ResizeObserver message, below) replaced the end-slot button keyboard focus had just moved to, so Enter did nothing | the deferred render restores focus to the same end | `a11y` keyboard section in Firefox (fails without) |

Harness defects fixed on the way (not app bugs): the story Continue tap that only completes a reveal; Firefox's
1/60-px float noise in one geometry check; a selection race in `e2e`; reloads that cancelled the dev server's module
requests (WebKit then failed the next document's imports; e2e reloads now settle first, except the held-atlas test
in Chromium and Firefox, whose image cache is shared across contexts); an instance-level `navigator.storage` fake that WebKit
drops (now on the prototype); a missing audio output device (headless Firefox can't start an AudioContext without
one; a PulseAudio null sink is now part of the workflow).

### Commands run and results

Final run: `npm run release -- --resume --rerun check,smoke,release:sweep,e2e,qa,a11y` on `e73ca18`, resuming earlier
results; the full table with each result's commit and every unsupported check is `docs/RELEASE_RUN.md` (a copy of
`test-results/release/report.md`). Machine: Playwright 1.63.0, Node 22.23.4, Linux x64; **Chromium 153.0.8010.12,
Firefox 155.0, WebKit 26.6** (headless, emulated viewports/touch/text; not devices).

| | `check` | `audio:report` | smoke | release:sweep | e2e | qa | a11y | story:e2e | story:route | story:sweep | faults | audio | matches | pwa | offline:tour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (once) | pass | pass | | | | | | | | | | | | | |
| Chromium | | | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Firefox | | | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| WebKit | | | pass | pass | **fail** | pass | pass | pass | pass | pass | pass | pass | pass | **fail** | **fail** |

**38 of 41 pass.** Commits: `check`, every Firefox and WebKit suite except Firefox `story:e2e` (`222977d`), and Chromium
smoke/release:sweep/e2e/qa/a11y ran on `e73ca18`; Chromium story:e2e…offline:tour and `audio:report` on `8941289`.
The only app change between those commits is the end-slot focus restore (exercised by every rerun table suite);
everything else is test harness. The three WebKit failures are the open items below. `check` on `e73ca18`: 556 unit
tests in 48 files, `assets:verify`, the production build within every byte budget.

### Owner uploads on `main` during the stage (unblocked, not wired)
`13bfd0a` added three "Sticks & Bones Epilogue Resolution" MP3s (artist tag officialinspire) at the repository root,
which `assets:verify` rejects. They were moved byte-identically to `assets/audio/originals/` and catalogued by
`scripts/build-owner-audio.py` as **case-complete candidates** (bytes, SHA-256, decoded-audio hash, loudness):
"Edited Take 1" 8.5 s (inside the 6–10 s brief), "Take 2" 75.3 s, the original 97.2 s. None is built or served yet:
choosing one is a listening decision, and wiring it changes the reprise (and `story:e2e` § Q's missing-file check),
so it belongs to the next audio stage (add it to `ENDINGS`). `check` and `smoke` pass with the catalogue; the runtime
build is unchanged.

### Open (not fixed in this stage)
- **WebKit `offline:tour`:** in WebKit (Playwright 26.6 on Linux), offline after a cold relaunch, the table music did
  not start in the Chapter 3 and Chapter 7 hands (Chapters 1–2 fine; Chromium and Firefox fine everywhere). The same
  happens with `main`'s original service worker (Chapter 7), so it predates this stage. Media logging showed
  `play()` rejected with AbortError and a `stalled` element; a retry and longer sampling did not change the outcome,
  so neither was kept. Needs a check on real Safari (iOS and macOS) before it can be called an engine artifact or an
  app defect.
- **WebKit `pwa`:** "ResizeObserver loop completed with undelivered notifications" during the update step. Deferring
  the board re-render to the next frame did not remove it (its source is another observer); the deferral is kept
  because it is now exercised in all three engines. A benign, spec-defined notice, but reported, not filtered.
- **WebKit `e2e`:** one page error, "Importing a module script failed", remains in WebKit on the dev server (hundreds
  of individual modules; reloads now wait for them, which removed the others). Every other e2e check passes in
  WebKit, and WebKit's production-build suites (`smoke`, `release:sweep`, `pwa`) pass, but the error is unexplained
  and is reported, not filtered.
- Real devices, listening and pacing: no human results exist (`docs/RELEASE_CHECKLIST.md`). The build stays a
  release candidate.

## Mobile playtest fixes — Draw reachable on long hands; rolling credits (2026-11-21)

The owner played on a phone and reported two things: (1) in portrait, after drawing many tiles the hand grew and
the Draw button became hidden/blocked; (2) the credits should roll like film credits instead of paging.

### Completed
- **Draw button covered (defect).** `.board-wrap` had `min-height: 150px` on the element while its `.play` grid row
  was `minmax(0, 1fr)`; once the hand switched to two rows (≥ 640 px tall) the row shrank below 150 px and the board
  overflowed onto the controls, covering Draw. The minimum now lives on the row (`minmax(var(--board-min, 150px),
  1fr)`; 96 px on portrait screens ≤ 700 px tall, 72 px ≤ 600 px), `.board-wrap` has `min-height: 0`, and
  `#layoutHandRows` falls back to one scrolling row when two rows would make the table taller than the screen.
- **Rolling credits.** `src/ui/credits.ts` now renders the wordmark, "Case complete." and every credit from
  `src/story/credits.ts` on one reel that scrolls up at about 38 px/s (Web Animations, linear). A tap on the reel or
  Space pauses/resumes; "Skip credits" (own header row) or Escape leaves; at the end "Back to the case file" appears
  focused. Reduced motion: a still, scrollable list with the Back button in its own row. Still presentation-only:
  writes nothing, achievements notices stay held while it is up, the case-complete cue is unchanged.
- Dev fixture `draw-hand` (14-tile hand, nothing fits the open 6s, 10 in the boneyard) and a "Long draw" dev button.

### Tests
- `e2e` § 4b (new): at 390×664, 375×667, 360×640 and 320×568, Draw is hit-tested (`elementFromPoint` at its centre)
  and tapped after every draw, at least 4 draws (hand up to 18). **Fails before the fix** (Draw covered at 390×664
  after the hand went to two rows), passes after.
- `story:e2e` § Q rewritten for the reel: the reel moves, Back is not visible until the end, a tap pauses (position
  stable) and resumes, Back appears focused within 10 s (dev quick roll), every credit line present; reduced
  motion: no movement, the last line scrolls into view, no line passes under Skip; Escape leaves with the save and
  achievements unchanged.
- The first full `e2e` run caught a regression from the row minimum: at 320×568 the first-hand tip pushed "Hide tips"
  18 px below the screen. Fixed by the 72 px floor ≤ 600 px tall. The same run reported one "main thread blocked
  553 ms" in `draw2-ai-easy-390`; it did not recur on the re-run.

### Commands run and results (Chromium)
| Command | Result |
| --- | --- |
| `npm run check` | pass (byte budgets within limits) |
| `npm run e2e` | first run 2 failures (above); after the fix: pass |
| `npm run qa` | pass; re-run after the 72 px floor: pass (0 failures, 0 comfort warnings) |
| `npm run a11y` | pass; re-run after the 72 px floor: pass (0 failures) |
| `npm run story:e2e` | pass |
| `npm run smoke` | pass |

Not run for this change: Firefox/WebKit suites and `npm run release` (the Stage 4 open WebKit items are unchanged).
Real devices remain untested by these sessions; the owner's phone report is the only device evidence.
