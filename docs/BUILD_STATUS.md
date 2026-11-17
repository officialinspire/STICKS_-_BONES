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

## Next stage

**Stage 13: Story chapter play.** The detailed list is in `docs/STORY_BUILD_STATUS.md`:
- one guarded hand per chapter, with outcome inserts, notebook/evidence progression,
  chapter replay and the epilogue;
- the interrupted resilience items: update-time save retry, music recovery, AI worker
  timeouts;
- version alignment.

Still waiting on the owner:
- the analytics contract;
- enabling Pages and authorising the merge;
- the intro video;
- cast expression labels;
- the sound bank;
- real-device and Firefox/WebKit playtests.
