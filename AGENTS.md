# Agent / contributor notes

Read this file, `docs/BUILD_STATUS.md`, `docs/RULES.md`, `docs/ENGINE.md`, `docs/AI.md`, `docs/SHARED_DEVICE.md`, `docs/PRESENTATION.md`, `docs/AUDIO.md`, `docs/SAVES.md`, `docs/ASSETS.md`, `docs/QA.md`, `docs/PERFORMANCE.md`, `docs/PWA.md`, `docs/ANALYTICS.md`, `docs/RELEASE_HANDOFF.md`, `docs/STORY_SCRIPT.md`, `docs/STORY_BUILD_STATUS.md`, `docs/ACHIEVEMENTS.md`, `docs/DESIGN.md` and `docs/RELEASE_PLAN.md` (the release contract and stage checklist)
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
  (same dimensions as the source, recorded in `src/assets/derivatives.json`), the environments' 3:4
  portrait crops (`PORTRAIT_URLS`, centred on `src/assets/focal.ts`), and the cast sheets from
  `npm run assets:cast` (cleaned, baseline-aligned repacks; their frames come from `src/assets/cast.json`,
  never the source rects). Cast and Roberto expression frames are verified by inspection (`docs/ASSETS.md`
  "Expression verification") and reach dialogue only through `src/story/expressions.ts`: tagged by
  stable line id, with a neutral fallback. Never random, and never a guessed frame. Rebuild derivatives after `atlas:build` or any source change. Never bundle a PNG original; keep `npm run build` inside its
  byte budget (`docs/PERFORMANCE.md`). Load images through `src/assets/warm.ts`, not ad-hoc `new Image()`.
- **PWA isolation and full offline storage:** the service worker (`src/pwa/sw.js`) is scoped to the app
  directory and may only open/delete `inspire:sticks-and-bones:*` caches; never `unregister()` or
  `skipWaiting()` without the player's "Update now". The owner has authorized **full offline storage**
  (replacing the old optional-audio / no-video policy): every shipped runtime file — shell, lazy chunks,
  fonts, both background orientations, characters, tiles, effects, every chapter, music, SFX, ambience,
  result cues and the intro video — is listed by the build with its bytes and SHA-256 (`dist/build.json`;
  the build fails on an unlisted file) and saved by the whole-game download, which starts only after the
  menu is up, while online (Data Saver waits for the player), 2 files at a time, resumable, with progress,
  Retry and storage estimates. Store only complete, checksum-verified 200 responses with the right MIME
  type; serve byte ranges (200/206/416) from the cache. Say "Full game ready offline" only after every
  file was re-hashed and the verified marker written. Keep older builds' media/art usable until the new
  pack is verified; prune only then. Never ship or cache PNG source sheets, source masters or duplicate
  uploads. Report quota, eviction, corruption and unavailable storage honestly. Updates write the stable
  state first, say so honestly if the write fails, and return once. Local data keys are
  `sticks-and-bones.*`; repair is app-only and must not touch them. Run `npm run pwa` for any PWA or
  caching change.
- **Analytics:** only through `src/app/analytics.ts` (per-event allowlist, sanitised errors, de-duplicated
  from applied engine events, never from renders). It stays disabled until the owner supplies the contract
  (`docs/ANALYTICS.md`): never invent keys, project ids, event names, consent behaviour or attribution
  parameters, and never let query parameters affect rules or seeds.
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
- **Scope:** the owner has approved one short story, **NO REST FOR COUSIN** (`docs/STORY_SCRIPT.md`, v0.2):
  the human plays Roberto "Cousin" through a prologue, seven chapters (seven completed hands: three
  Draw, two Block, two Partnership), outcome inserts and an epilogue, about 90–110 minutes. Every win,
  loss or blocked tie advances the story. Quick Play and two-human pass-and-play stay fully playable.
  Still out of scope: economy, shops, combat, online multiplayer, or any required backend.
- **The script is authoritative:** never shorten, rewrite or paraphrase its dialogue. Story text reaches
  the app only through `npm run story:build` (verbatim blocks, round-trip tested). Story state lives
  outside the pure engine; story hands use the frozen presets unchanged (no scripted tiles, no unfair
  AI); unfinished Story routes are labelled as such.
- **Achievements are tracked outside the engine** (`docs/ACHIEVEMENTS.md`).
  - They use only applied events from `TableController.subscribe`, the Story `track` hooks and explicit
    notes; never hidden hands, the session's raw events or the RNG.
  - Replays and developer tables count nothing; two-player games count only finished shared matches.
  - Every count is keyed so it can't apply twice. New achievements go in the catalog with a test
    fixture, and `docs/ACHIEVEMENTS.md` must list them.
- **Design tokens:** colours come from `src/ui/tokens.ts` / `docs/DESIGN.md` and only in their approved,
  contrast-tested pairings. Fonts are the self-hosted OFL subsets in `src/assets/fonts/`.

## Before you finish a stage

Run `npm run check`, plus `npm run e2e` for UI changes and `npm run qa` / `npm run a11y` for layout,
input or accessibility changes, `npm run story:e2e` / `npm run story:sweep` for Story presentation changes,
`npm run faults` for loading, media, storage or navigation changes, and `npm run matches` / `npm run smoke`
before a release. CI
(`.github/workflows/ci.yml`) runs check + smoke on every push. Update `docs/BUILD_STATUS.md` with the work you completed,
the commands you ran and their results, known issues and the next stage. A
feature only counts as complete when it has been exercised, not just compiled.
