# Changelog

Details per stage are in [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) and
[docs/STORY_BUILD_STATUS.md](docs/STORY_BUILD_STATUS.md). Release notes for players:
[RELEASE_NOTES.md](RELEASE_NOTES.md).

## Unreleased — 2026-11-21 (after mobile playtesting)

### Changed
- Epilogue credits are a film-style rolling reel (the wordmark, "Case complete." and every credit roll up the
  screen; tap or Space pauses; Skip credits / Escape leaves; "Back to the case file" appears at the end). Reduced
  motion shows the same credits as a still, scrollable list.

### Fixed
- Phone portrait: after drawing many tiles the hand grew into two rows and the board covered the Draw button
  (at 640–700 px tall screens). The board's minimum height now sits on its grid row (smaller on short portrait
  screens), and the hand falls back to one scrolling row when two rows would not fit.

## 1.0.0-rc.3 — 2026-11-19 (release candidate; live)

### Added
- Full offline storage (whole-game pack with per-file SHA-256, byte ranges, resumable download, app-only repair).
- Story: Finish hand with AI, reached-only transcript, recap after Skip, first-hand table tips (Stage 2).
- Chapter 6 rest-area art, evidence inspection cards, epilogue title reprise and credits, case-complete cue support
  (silent until supplied) (Stage 3).
- Release workflow (Stage 4): `npm run release`, `release:sweep`, the **Release suites** GitHub workflow, Chromium /
  Firefox / WebKit for every browser suite, explicit unsupported-check reporting, `docs/RELEASE_CHECKLIST.md`.

### Fixed (found by running Firefox and WebKit)
- Firefox: Download / Retry waited on `navigator.storage.persist()`, whose prompt keeps the promise pending.
- Firefox: the service worker intercepted media range requests it could not answer from its cache; Firefox logged
  the element's normal cancellation as a failed load. Those requests are now left to the browser while online.
- Firefox: opening a table left focus nowhere, so Tab resumed past the legal tiles and left the page; the table's
  heading now takes focus.
- WebKit: a figure's SVG image kept 133 px of sideways scroll after rotating to portrait; the Story stage clips.
- WebKit: "Take over" was rebuilt on every assisted move; table controls now re-render only parts that changed.

### Known limitations
- Emulated engines only: no real devices, no listening pass, no human pacing data (target 90–110 minutes; the
  model estimates 36–48). Analytics disabled (contract unreadable). Missing media: see the handoff.

## 1.0.0-rc.2 — 2026-11-17 (release candidate; not deployed at the time)

### Added
- **Story: NO REST FOR COUSIN.** Prologue, seven chapters with one hand each (three Draw, two Block, two
  Partnership, the frozen presets, fair AI), the verbatim outcome insert for every win, loss or blocked tie,
  shared continuations, notebook entries and the epilogue. Every result advances the story. Includes case
  file, chapter replay, transcript, text size, skip and the cinematic SceneDirector.
- **Cast portraits** for Vale, Luz, Marisol and Rafa: cleaned, baseline-aligned derivatives of the owner's
  sheets, showing frame `e1` (expression labels are not supplied yet).
- **Scene soundtrack** through the one audio manager: CC0 UI/table sounds and ambience beds, per-scene
  profiles, the exact three-knocks-plus-answer motif, caption-only speaker voice, no late sounds after
  navigation.
- **Offline groups:** Quick Play at install; story scenes as they're played, or the whole story by explicit
  download (3.2 MB, progress, retry); optional offline music and ambience (9.1 MB, disclosed, removable).
- **Update in the middle of the case:** the state is written and checked first, and the player is told
  honestly if it fails. The player returns once to the same line or hand.
- Portrait 3:4 crops of all seven environments; next-chapter prefetch; bounded decoded-image memory.
- Story analytics events in the (still disabled) adapter, separate from Quick Play.
- Tools: `story:e2e`, `story:route`, `audio`, `perf:story`, `assets:cast`; QA now covers 8 viewports.

### Changed
- Player captions omit the script's implementation notes (an explicit, tested list; the script data is
  verbatim). The three writer's-note brackets became silent beats.
- Narrow short landscape (667×375): a one-row header, view tools on their own row, a short-screen tile floor
  of 22 px. The whole longest chain and both open ends now fit.
- Scene ambience is on by default; budgets split core vs on-demand Story images.

### Known limitations
- Chromium only (no Firefox/WebKit/real devices here). Human pacing unverified; the reading-time model
  estimates about 36–48 minutes against the 90–110-minute target.
- Missing media: intro video, expression labels, speaker recording, commissioned music, recorded domino foley,
  portraits for minor speakers. Analytics disabled (contract not supplied or inspected).

## 1.0.0-rc.1 — 2026-11-16

Quick Play release candidate: three modes, fair AI (Easy/Normal/Hard), two players on one device with privacy
covers, saves and statistics, installable PWA with offline play, CI and the Pages workflow. See the 1.0.0
release-candidate section of [RELEASE_NOTES.md](RELEASE_NOTES.md).
