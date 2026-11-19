# Release plan

Four release stages, each shipped to `main` and GitHub Pages on its own. Every stage follows the contract
and ends with the same checklist. Status is updated in this file and in `docs/BUILD_STATUS.md` at the end of
each stage, with the commands actually run and their actual results.

## Release contract (applies to every stage)

1. **Small, scoped edits.** Change only what the stage needs; no drive-by rewrites. Resolve merges
   semantically — never replace a whole file with one branch's version.
2. **Reuse existing systems.** Extend the session/controller, the audio manager, the PWA controller, the
   menu pagination (`menu-pages`), the story director and the test suites instead of adding parallel ones.
3. **Immutable source assets.** Never edit, rename, re-encode or overwrite files in `assets/art/` or
   `assets/audio/originals/`; derivatives are rebuilt by their scripts and verified (`npm run assets:verify`).
4. **No fabricated verification.** Report only checks that ran, with their real results. A check that could
   not run (no browser, no audio output, no device) is recorded as **not run** with the reason. Never claim a
   deployment before it is observed live.
5. **Meaningful regression coverage.** Every defect fixed gets a focused test that fails without the fix
   (unit or real-browser), added to an existing suite where one fits.
6. **Preserve the product.** The approved script verbatim, seven chapters with one hand each, every
   win/loss/tie outcome, fair AI, versioned saves, Quick Play and two-player pass-and-play.

## End of every stage (checklist)

- [ ] Status and results updated here and in `docs/BUILD_STATUS.md`.
- [ ] AGENTS-required checks run: `check`, `e2e`, `qa`, `a11y`, `story:e2e`, `story:sweep`, `story:route`,
      `faults`, `audio`, `pwa`, `offline:tour`, `matches`, `smoke` (each recorded as pass / fail / not run).
- [ ] Review branch pushed (no force-push).
- [ ] CI (`.github/workflows/ci.yml`) green on the branch.
- [ ] Merged into the **latest** `main` (re-merge and re-check if `main` moved).
- [ ] Pages deployment (`deploy-pages.yml`, "Deploy to GitHub Pages") succeeded for the merge commit.
- [ ] Deployed `<html data-build>` equals the first 12 characters of the deployed `main` SHA.
- [ ] Live startup verified on the deployed URL (start screen → menu).
- [ ] If blocked: the pushed work stays on its branch and the exact blocker is reported. Failing code is
      never published.

## Stages

### Stage 1 — Integrate outstanding work into `main` (2026-11-19)

Scope: on a clean review branch from current `main`, integrate `claude/inspiring-bardeen-4yfmu5`.
- Keep `main`'s viewport-bound menu pagination, setup values and saved-data recovery notices.
- Keep the branch's full offline storage (whole-game pack, intro-video caching, verification, ranges),
  the Story result-cue policy (none after Chapters 5–7) and Roberto's corrected table reactions.

Status: see `docs/BUILD_STATUS.md` → "Stage 1 — integration".

- [x] Review branch `claude/stage-1-release-integration` from `main` (f89914d); branch merged with
      semantic conflict resolution (4 files); one harness regression fixed (`pwa` pagination locator).
- [x] Status and results updated (`docs/BUILD_STATUS.md` → "Stage 1 — integration").
- [x] All 13 AGENTS-required checks run locally: all pass (after one harness fix in `pwa`).
- [x] Review branch pushed; CI green on every commit (`6de297c`, `d95cad9`, `2de17c1`).
- [x] Merged into the latest `main` via PR #4 → `8d6493f` (merge commit, no force-push); CI green on `main`.
- [x] Pages deployment "Deploy to GitHub Pages" run 44451111469: success.
- [x] Live https://officialinspire.github.io/STICKS_-_BONES/ reports `data-build` `8d6493f9e100` (= `main`).
- [x] Live startup: "Ready." → start → menu; service worker scoped to the subpath; "✓ Full game ready offline
      (19.8 MB on this device)."; 0 page errors (Chromium via this environment's proxy).

Status: **complete** (this status note is itself shipped by a follow-up docs-only merge, verified the same way).

### Stage 2 — Story assistance, transcript, recap, first-hand guidance (2026-11-19)

Scope (owner): optional **Finish hand with AI** in the Story pause sheet (the existing observation-only AI plays
Cousin legally through normal commands; the actual result advances once; labelled; no duplicate scoring or
achievements; pause, cancellation, reload and stale callbacks safe); a **reached-only transcript** with the
actual outcome in verbatim script text; a **recap after Skip** from approved notebook/evidence excerpts within
the skipped segment only; dismissible **first-hand guidance** (tile, end, draw/pass, partner) that never blocks
play; existing pagination, tokens and settings; reachable 320×568 / 568×320 → desktop, large text, keyboard,
reduced motion; larger short-landscape end targets without overlap; no padded playtime, no forced waits, seven
single hands unchanged.

Status: see `docs/BUILD_STATUS.md` → "Stage 2 — Story assistance".

- [x] Review branch `claude/stage-2-story-assist` from `main` (`d7c0d6f`); `main`'s later upload commit
      (`745b198`) merged in, its four root uploads catalogued so `assets:verify` passes again.
- [x] Status and results updated (`docs/BUILD_STATUS.md` → "Stage 2 — Story assistance").
- [x] All 13 AGENTS-required checks run locally: all pass, after one fix found by `smoke` (settings page overflow
      at 568×320) and rerun.
- [x] Review branch pushed; CI green on `d9ed9ef` (run 44472838994).
- [x] Merged into the latest `main` via PR #6 → `86df38a` (merge commit, no force-push); CI green on `main`.
- [x] Pages deployment "Deploy to GitHub Pages" run 44474606924: success.
- [x] Live https://officialinspire.github.io/STICKS_-_BONES/ reports `data-build` `86df38a33be4` (= `main`).
- [x] Live startup: "Ready." → start → menu; service worker scoped to the subpath; 0 page errors (Chromium via
      this environment's proxy).

Status: **complete** (recorded on the Stage 3 branch).

### Stage 3 — Owner art, evidence cards, title reprise and credits, case-complete audio (2026-11-19)

Scope (owner): audit uploads first and reuse approved work; preserve originals; register new assets (provenance,
hashes, dimensions, frame mappings, derivatives) through the existing builders. The supplied modern entrance rest
area for Chapter 6's post-cave dialogue and hand (never the ancient platform); supporting portraits optional;
SPEAKER is a device, not a character. Reached evidence as paginated inspection cards (approved exact text rendered
by code). An epilogue title reprise (existing logo) and paginated credits from verified names/licences, then back to
the Case file; cancellable, reduced-motion friendly, independent of game state. Supplied case-complete music/foley
via AudioManager (conservative trims, natural tails, no clipping, explicit loop points, no overlapping/stale cues);
Chapter 5–7 restrained result audio and the authored knocks preserved; honest fallback for missing media; nothing
marked auditioned without a listening pass. Both image orientations, lazy chunks and all runtime media in the
verified offline pack; byte ranges and app-only repair preserved. No budget raised merely to pass.

Status: see `docs/BUILD_STATUS.md` → "Stage 3 — owner art, evidence cards, credits".

- [x] Review branch `claude/stage-3-assets-credits` on top of Stage 2 (`d9ed9ef`), `main` (`86df38a`) merged in.
- [x] Status and results updated (`docs/BUILD_STATUS.md` → "Stage 3 — owner art, evidence cards, credits").
- [x] All 13 AGENTS-required checks plus `audio:report` and the builders run locally: all pass.
- [ ] Review branch pushed; CI green; merged into the latest `main`; Pages deployment; live `data-build`; startup.

### Stage 4 — not yet defined

The owner has not supplied this stage's scope. It inherits the contract and the checklist above.
