# Agent / contributor notes

Read this file, `docs/BUILD_STATUS.md`, `docs/RULES.md`, `docs/ENGINE.md`, `docs/AI.md`, `docs/SHARED_DEVICE.md`, `docs/PRESENTATION.md`, `docs/AUDIO.md`, `docs/SAVES.md`, `docs/ASSETS.md`, `docs/QA.md` and `docs/PERFORMANCE.md`
before you change anything.

## Ground rules

- **Engine purity:** `src/engine/` is pure TypeScript. No DOM, timers, I/O,
  logging, `Math.random`, `Date.now`, and no imports from `ui`, `assets`, `audio`
  or `ai`. ESLint enforces this. All engine state is plain JSON-serializable data.
- **Determinism:** randomness only comes through `src/engine/rng.ts`
  (`SHUFFLE_CONTRACT = 'sfc32-fy/1'`). Changing its output means bumping the
  contract and updating the golden-vector test on purpose.
- **Rules are data:** behaviour comes from `src/engine/rules/presets.ts`. Never
  branch on mode ids for rules. Never change a published preset version. Add a new one.
- **Canonical values:** tile values come from tile ids (`t64` = 6|4). Never infer
  rules or values from artwork.
- **Secrets:** hands, stock, seeds and RNG state must never appear in URLs, logs,
  analytics, DOM labels/attributes for hidden tiles, or pass-and-play handoff screens.
- **Fair AI:** policies receive only `AiObservation` (`src/ai/observation.ts`, built from a SeatView).
  AI randomness uses its own seeded stream, never the shuffle RNG. AI moves go through `applyCommand`;
  async decisions must carry and check the session's `{epoch, seq, seat}` token (see `docs/AI.md`).
- **State changes only through `applyCommand`.** UI callbacks never edit MatchState.
- **Source art is immutable:** never edit, re-encode, rename or overwrite files in
  `assets/art/`. Derivatives are new files with their own manifest entries.
  `npm run assets:verify` must pass.
- **Runtime images are derivatives:** `urls.ts` serves the WebP files from `npm run assets:derive`
  (same dimensions as the source, recorded in `src/assets/derivatives.json`). Rebuild them after
  `atlas:build` or any source change. Never bundle a PNG original; keep `npm run build` inside its
  byte budget (`docs/PERFORMANCE.md`). Load images through `src/assets/warm.ts`, not ad-hoc `new Image()`.
- **Base-path safety:** reference assets through `src/assets/urls.ts`
  (`new URL(literal, import.meta.url)`). No root-absolute URLs.
- **Fallbacks:** tiles must always render valid vector pips, even when art is missing.
- **Tile art:** faces come from `tile.atlas`, looked up by id from its JSON. Regenerate with
  `npm run atlas:build`, never by hand. The SVG fallback must keep the same geometry
  (`src/render/pips.ts`).
- **UI renders from `TableController.view()` only** (one revealed human's SeatView or a
  concealed public table). No hand in the DOM, labels, live regions or animations unless the
  controller is in `human-turn` for that human; opponent tiles never before the results sheet.
  Only the TableController may subscribe to the session's raw events.
- **Presentation never drives the game:** animations, effects, banter and host frames react to events
  after they are applied, are never awaited, honour reduced motion, stay `pointer-events: none` and
  below end targets/HUD. Character art renders through `src/render/stage.ts` boxes only.
- **Local records are versioned envelopes** (`src/app/storage.ts`). Bump the version and add a migration
  for any shape change; never save presentation state; a restore must not re-score or replay an AI move.
- **Scope:** no campaign, economy, shops, quests, online multiplayer or required backend.

## Before you finish a stage

Run `npm run check`, plus `npm run e2e` for UI changes and `npm run qa` / `npm run a11y` for layout,
input or accessibility changes. Update `docs/BUILD_STATUS.md` with the work you completed,
the commands you ran and their results, known issues and the next stage. A
feature only counts as complete when it has been exercised, not just compiled.
