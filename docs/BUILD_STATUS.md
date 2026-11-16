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

## Next stage — Stage 8: Versioned saves, statistics, help and results arithmetic

Versioned match/settings saves with validation and graceful recovery, restore
without double scoring or stale moves, local statistics (completed, wins/losses,
abandoned kept separate), a rules/help screen grounded in RULES.md, and pip
arithmetic on the results sheet.
