# Agent / contributor notes

Read this file, `docs/BUILD_STATUS.md`, `docs/RULES.md`, `docs/ENGINE.md` and `docs/ASSETS.md`
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
- **Fair AI:** AI receives only `seatView(state, seat)`: its own hand and public information.
- **State changes only through `applyCommand`.** UI callbacks never edit MatchState.
- **Source art is immutable:** never edit, re-encode, rename or overwrite files in
  `assets/art/`. Derivatives are new files with their own manifest entries.
  `npm run assets:verify` must pass.
- **Base-path safety:** reference assets through `src/assets/urls.ts`
  (`new URL(literal, import.meta.url)`). No root-absolute URLs.
- **Fallbacks:** tiles must always render valid vector pips, even when art is missing.
- **Tile art:** faces come from `tile.atlas`, looked up by id from its JSON. Regenerate with
  `npm run atlas:build`, never by hand. The SVG fallback must keep the same geometry
  (`src/render/pips.ts`).
- **UI renders from `GameSession.view()` (a SeatView) only.** Opponent tiles must never
  reach the DOM before the results sheet.
- **Scope:** no campaign, economy, shops, quests, online multiplayer or required backend.

## Before you finish a stage

Run `npm run check`, plus `npm run e2e` for UI changes. Update `docs/BUILD_STATUS.md` with the work you completed,
the commands you ran and their results, known issues and the next stage. A
feature only counts as complete when it has been exercised, not just compiled.
