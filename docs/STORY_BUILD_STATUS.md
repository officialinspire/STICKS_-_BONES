# STORY BUILD STATUS: NO REST FOR COUSIN

Tracks the story build against the owner-approved script (`docs/STORY_SCRIPT.md`,
v0.2, committed to `main` by the owner as 242ee60). The general project log stays in
`docs/BUILD_STATUS.md`.

## Approved scope

- **Story:** the human plays **Roberto "Cousin"** through a prologue, **seven chapters
  with seven completed hands**, outcome inserts and an epilogue.
  - Hands: three Draw, two Block, two Partnership, using the frozen
    `cousins-house-rules@1` presets. No scripted tiles, no unfair AI.
  - **Every win, loss or blocked tie advances the story.** No mandatory retries and no
    score-target matches.
  - Target **90–110 minutes**. A representative playtest under **two hours** is required
    before release.
- **Quick Play** (vs Cousin) and **two-human pass-and-play** stay fully functional.
- **Out of scope:** economy, shops, combat, online multiplayer, or any required backend.
- **The script is authoritative.** Prologue, chapters, outcome inserts, epilogue,
  characterisation and continuity rules are used verbatim. Nothing is shortened or
  rewritten without the owner's request. Text reaches the app only through
  `npm run story:build`, which is round-trip tested.
- **Unchanged architecture:** pure engine, frozen versioned rules, fair AI, canonical
  tile values, shared-device privacy, immutable source art, app-specific offline
  caches. `AGENTS.md` was updated to record the story authorisation.

## Branch and commit

- **Implementation branch:** `claude/inspiring-bardeen-4yfmu5`. It holds the whole
  application; `main` holds the source assets, the approved script and the cast upload.
- **This stage:** the owner's `main` (242ee60 script, cb4ac97 cast atlases) was **merged
  into the branch** as ce427bc, so nothing on `main` was overwritten. The Stage 12
  commit follows; its hash is in `git log`.
- **Not merged to `main` or deployed.** The owner hasn't authorised it.

## Stage checklist

| Stage | Item | Status |
| --- | --- | --- |
| **Earlier request (interrupted before any change)** | 1. Save failures shown persistently | **Partly done here:** autosave and Story progress now surface a refused write as a persistent "Not saved" banner and never claim "saved". **Not done:** retry / proceed-without-saving during an app update. |
| | 2. Bounded music recovery after a gesture or reconnection | **Not done** |
| | 3. AI worker resilience (error, messageerror, timeout, cancellation) | **Not done** |
| | 4. PWA base-path build warning | **Rechecked and resolved:** the `new URL('../', import.meta.url)` resolver is deliberately runtime-resolved; marked `/* @vite-ignore */` with the reason, and the build no longer warns. The production-subpath behaviour is checked by `npm run smoke` and `npm run pwa`. |
| | 5. Contradictory status docs and version labels | **Partly done:** this file plus the Stage 12 entries. **Still open:** package version 0.1.0 vs "1.0.0 release candidate" in `RELEASE_NOTES.md` / `RELEASE_HANDOFF.md` (see Next stage). |
| **Stage 12: visual identity and responsive interface** | Design tokens with verified contrast (`src/ui/tokens.ts`, `docs/DESIGN.md`) | ✅ |
| | Wordmark: vector master, monochrome, compact, accessible text; domino ampersand | ✅ |
| | Fonts: Bricolage Grotesque + DM Sans, OFL verified and shipped, Spanish subset, metric fallbacks, tabular scores | ✅ |
| | Destinations: Story / Quick Play / Two Players / How to Play / Settings (+ Statistics) | ✅ |
| | Story case file: New Case / Continue Case, chapter selection, notebook + evidence panels | ✅ (shell); chapter replay labelled "next stage" |
| | Components: dialogue and caption panels, speaker labels, chapter cards, evidence panel, notebook entries, cinematic controls; pause/results/confirm/cover re-skinned | ✅ |
| | Prologue playable from the verbatim script (captions for the knocks, transcript, text size, skip, back, keyboard) | ✅ |
| | Portrait, short landscape, tablet and desktop layouts | ✅ (6 viewports × 11 screens) |
| | Hand targets ≥ 44 px without overlap | ✅ via gap-split hit areas |
| | Cast atlases catalogued (Vale, Luz, Marisol, Rafa) | ✅ (variants; not yet runtime) |
| **Stage 13: chapter play + cinematic presentation** | Story hand sessions: one guarded hand per chapter (frozen presets, fair AI, named seats), every win/loss/tie advances | ✅ |
| | Verbatim outcome insert matching the hand, common continuation, notebook entry, end card, next scene; epilogue "Case complete" | ✅ |
| | Progress v2 (migrates v1): scene/part/beat/outcome plus the in-progress hand from the deal onward; completion written once with the outcome | ✅ |
| | Chapter replay from the case file (memory-only; never changes case progress) | ✅ |
| | SceneDirector: explicit states, cancellable tokens, settle(), single-step input, configurable and reduced-motion timings (`docs/CINEMATICS.md`) | ✅ |
| | Staging for every moment in the brief, anchored to the script's exact stage directions; Chapter 6 hand never on the ancient platform | ✅ |
| | Five chapter backdrops as on-demand WebP derivatives (decode before reveal; drawn fallback) | ✅ |
| | Story audio cue hooks on the central AudioManager (knock live; others reserved); story tables without banter | ✅ |
| **Next** | Cast portraits in dialogue (needs expression labels → derivatives) | ☐ |
| | Story audio: night/cave beds, case-complete cue, real SFX (reserved hooks exist) | ☐ |
| | Finish Hand with AI assistance, skip with recap, optional table banter in safe gaps | ☐ |
| | Interrupted resilience items: update-time save retry, music recovery, AI worker timeouts | ☐ |
| | Version alignment (package vs release notes) | ☐ |
| | Representative human playtest timing (target 90–110 min, under 120) | ☐ |

## Verification (this stage, Chromium only)

Commit **`a6c8ad8`** on `claude/inspiring-bardeen-4yfmu5`. The exact output is in the
Stage 12 entry of `docs/BUILD_STATUS.md`.

| Check | Result |
| --- | --- |
| `npm run check` | pass, 278 tests in 30 files, all budgets |
| `npm run qa` | 0 failures, 0 comfort warnings (6 viewports × 11 screens, text 150%/200%, CLS 0.0199) |
| `npm run a11y` | 0 failures (axe clean, including the story screens) |
| `npm run e2e` / `npm run matches` | pass / all 8 arrangements completed full matches |
| `npm run pwa` / `npm run smoke` | pass, cache 2,188,958 B / pass |
| GitHub Actions CI | **success**: run 4 on `a6c8ad8` (https://github.com/officialinspire/STICKS_-_BONES/actions/runs/43981221753) |

## Missing inputs

| Input | Needed for |
| --- | --- |
| **Expression labels** for the four cast atlases (which frame is neutral, angry, smiling…) | Portraits in dialogue. Frames are currently named e1–e8 by position. |
| Story sound bank (Kenney UI pack audition, table foley, night/cave beds) per the script's §6 | Replacing the placeholder SFX and adding story ambience |
| INSPIRE intro video `assets/video/inspiresoftwareintro.mp4` | The studio credit (the fallback already works) |
| INSPIRE analytics contract | Analytics (still disabled) |
| Representative first-time playtesters | The 90–110-minute target and the under-two-hours requirement |

## Limitations (environment, not application failures)

- **Browsers:** only the Chromium bundled with Playwright is available here. **Firefox,
  WebKit/Safari and real phones and tablets were not tested.** No such pass is claimed.
- **Safe areas** are emulated through DevTools insets, not real notches.
- **Text scaling** uses Chromium's default-font-size preference via DevTools. That
  matches a player's browser text-size setting, not OS-level font scaling on mobile.

## Next stage

1. **Chapter play:**
   - Story sessions that end after one resolved hand, with state outside the engine,
     guarded against double completion on reload.
   - The matching outcome insert, the notebook entry, evidence flags and chapter
     replay.
   - Through Chapter 7 and the Epilogue.
2. **The interrupted resilience items:**
   - update-time save retry / proceed;
   - bounded music recovery;
   - AI worker timeouts, `messageerror` and cancellation tests.
3. **Version alignment:** pick one label (package, release notes, handoff).
4. **Cast portraits** once their expressions are labelled; the chapter backdrops.
5. **Firefox/WebKit and real-device passes**, and timed playtests.
