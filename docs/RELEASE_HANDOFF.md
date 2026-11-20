# Release handoff: STICKS & BONES 1.0.0-rc.3 (release candidate)

- **Live:** https://officialinspire.github.io/STICKS_-_BONES/ — deployed from `main` by **Deploy to GitHub Pages**
  (`.github/workflows/deploy-pages.yml`). The page reports its build as `<html data-build>` (the first 12
  characters of the deployed commit). The exact `main` SHA and the verified deployment of each release are recorded
  in `docs/RELEASE_PLAN.md` and `docs/BUILD_STATUS.md`.
- **Status: release candidate, not stable.** Every automated gate is run in Chromium, Firefox and WebKit, but a
  stable 1.0.0 also needs evidence that only people can produce (§3): real devices, a listening pass and three
  first-time playthroughs. Emulated browsers are not devices.

## 1. What ships

- **Quick Play:** Draw, Block and Partnership under the frozen preset `cousins-house-rules@1`, against a fair
  computer (Easy/Normal/Hard, observation-only, its own seeded randomness) or two people on one device (privacy
  cover between turns; Partnership seating across / right / left). Rules: `docs/RULES.md`.
- **Story — NO REST FOR COUSIN** (approved script v0.2, verbatim): prologue, seven chapters with one hand each
  (three Draw, two Block, two Partnership), every win/loss/blocked-tie insert, epilogue with the title reprise and
  credits. Case file: chapters, replay, notebook, evidence cards, reached-only transcript, Finish hand with AI.
- **Installable PWA, fully offline** after one online visit: the whole game (about 20.5 MB) is saved, verified file
  by file (SHA-256), and served offline with byte ranges; app-only repair; honest quota and eviction reporting.
- **Accessibility:** keyboard play, screen-reader-safe hands, reduced motion, large text, safe areas, 44-px targets.
- **Achievements** (local only) and **analytics** (adapter present, **disabled**: §3).

Assets and audio provenance: `docs/ASSETS.md`, `docs/AUDIO.md`, `docs/SOUND_SOURCES.md`. Missing media is listed in
`docs/STORY_BUILD_STATUS.md` → "Missing inputs".

## 2. Verification

The repeatable release workflow is **`npm run release`** (locally) or the **Release suites** GitHub workflow
(Actions → Release suites → Run workflow). It runs `check` and `audio:report` once, then every browser suite in
each engine and writes `test-results/release/report.md` with the exact browser builds and every check an engine
could not perform (`docs/QA.md` → "Release workflow"). The latest observed run, with its numbers, is in
`docs/BUILD_STATUS.md` → "Stage 4 — release workflow".

Gates that need people are in **`docs/RELEASE_CHECKLIST.md`**: the real-device checklist, the listening checklist
and the three-player timing sheet (reading and hand time measured separately).

## 3. Before a stable 1.0.0 (owner decisions or inputs)

1. **Real devices** — iPhone/Safari, Android/Chrome, a tablet and a desktop through `docs/RELEASE_CHECKLIST.md` §1.
   Not done: no device has been used.
2. **Listening pass** — `docs/RELEASE_CHECKLIST.md` §2. Not done: nothing is marked auditioned or final.
3. **Pacing** — three first-time players through the timing sheet. Not done. The reading-time model predicts about
   36–48 minutes against the 90–110-minute target; the story is not to be stretched to meet it.
4. **Analytics** — disabled. The INSPIRE contract (`officialinspire/SPIRITBALL`) could not be read by these
   sessions (attach refused by the session permission policy); no key, consent API or event mapping was supplied.
   See `docs/ANALYTICS.md` for the five inputs.
5. **Missing media** — the case-complete cue is wired but silent: three candidate recordings were uploaded on
   2026-11-19 ("Epilogue Resolution", catalogued untouched; "Edited Take 1" is 8.5 s) and one needs choosing by ear;
   case-complete foley is still missing; the optional chapter-card cue,
   recorded domino foley for pick-up/place/slide/draw, the contractor speaker recording (caption-only by design).
6. **Known platform limits** — iOS has no install prompt and keeps separate storage for home-screen apps; Firefox
   desktop does not install PWAs; private modes may disable offline storage; Firefox asks before keeping storage
   persistently (the download no longer waits for that answer).

## 4. Deploying and rolling back

1. Merge to `main` (pull request). The push runs CI (`ci.yml`: check + smoke) and **Deploy to GitHub Pages**, which
   runs the full check and smoke on the Pages subpath, then deploys `dist/`.
2. Confirm: the deploy job is green; the live page's `<html data-build>` equals the first 12 characters of the
   `main` commit; start → menu works; "✓ Full game ready offline (… MB on this device)." appears after the menu.
3. **Rolling back:** re-run the deploy workflow on an earlier `main` commit. Players see **Update available**; their
   saves and settings are kept.
