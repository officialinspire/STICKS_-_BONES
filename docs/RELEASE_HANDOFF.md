# Release handoff: STICKS & BONES 1.0.0 release candidate

- **Branch:** `claude/inspiring-bardeen-4yfmu5` (not merged).
- **Site status: NOT DEPLOYED.** No deployment has been run or observed. Only
  call the site live after the deploy workflow below succeeds and the URL loads.

## 1. What ships

### Modes and rules

- One rules preset, published and frozen: **`cousins-house-rules@1`** ("Cousin's House Rules v1").

| Mode | Seats | Stock | Target (default / allowed) | Opponents |
| --- | --- | --- | --- | --- |
| Draw (`draw2`) | 2 | 14-tile boneyard, draw until playable | 100 / 100, 200 | Computer (Easy/Normal/Hard) or a second human |
| Block (`block2`) | 2 | 14 set aside, pass when stuck | 100 / 100, 200 | Computer or a second human |
| Partnership (`partnership4`) | 4, partners across, counterclockwise | none | 200 / 100, 200 | Three computers, or a second human across (partner) / right / left (opponent) |

- The rules and their sources are in `docs/RULES.md`. The in-game **How to play**
  is built from it, and a test checks the two against each other. Excluded
  bonuses (capicú, chuchazo, forced-pass bonus, forced redeal) are listed in-game.

### Assets

| Kind | Status |
| --- | --- |
| Character (Cousin portrait atlas, slam strip), backdrop (neighborhood patio), tabletop (weathered), tile faces (atlas built from the owner's tile sprite), effects sheet | **Owner-supplied approved art.** Served as same-size WebP derivatives; the originals in `assets/art/` are byte-identical and verified. |
| PWA icons | Generated from the approved portrait; maskable safe area measured |
| Music | **Two approved tracks:** "Patio Dominoes (Take 2)" (menu) and "Domino Table (Subtle Vibe)" (play). They restart after their composed ending; **loop points need the owner's audition** (`dev/audio-audition.html`). |
| Sound effects and patio ambience | **Placeholder:** synthesized in code and labelled "(placeholder)" in Settings. Not final audio. |
| Voice | None. Cousin's lines are subtitles. |
| Studio intro video (`assets/video/inspiresoftwareintro.mp4`) | **Not supplied.** A short typeset text credit ("INSPIRE / presents"), skippable, then the menu. |
| Other characters and opponents | Not supplied. Seat badges are used instead. |

Everything else that renders only when art is missing (vector tile faces,
gradients, a monogram) is an error fallback, never shown as final art.

## 2. Verification (all run on this machine, Chromium 1.63 via Playwright)

| Command | Result |
| --- | --- |
| `npm run check` (typecheck, lint, tests, asset verify, build + byte budget) | **pass**: 250 tests in 27 files; budget: code 204 KB, images 1,417 KB, startup 724 KB, total 9,067 KB |
| `npm run e2e` | **pass**: all stage acceptance checks, including the 400-tap rapid-action burst |
| `npm run matches` | **pass**: **complete matches in all 8 arrangements**, each with a clean console and analytics events correctly labelled (8 hands draw vs computer incl. a mid-match reload + resume; 20 block; 10 partnership vs computers; 4 / 18 hands two-human draw / block; 12 / 16 / 13 hands partnership across / right / left) |
| `npm run pwa` | **pass**: offline cache **1,672,882 B** (7 shell files 216.4 KB + 6 images 1,417.2 KB) |
| `npm run qa` | **pass**: 0 failures (6 viewports × 9 screens) |
| `npm run a11y` | **pass**: 0 failures, axe clean |
| `npm run smoke` | **pass**: subpath, offline-ready, a full hand, offline restart, clean console |
| GitHub Actions CI | **success**, run 2 on `da30779` (see §5) |

What `npm run pwa` covered:
- subpath first visit;
- offline hand vs the computer;
- interrupted downloads with fallbacks, then repair;
- quota at 700 KB and 40 KB;
- update A → B mid-match;
- repair and erase leaving another app's data intact.

## 3. Remaining issues (owner decisions or inputs)

1. **Analytics is disabled.** No INSPIRE contract was supplied: key/project,
   consent, event mapping, launch-ID/promo parameters. A code search shows an
   implementation in `officialinspire/SPIRITBALL` (`js/analytics.js`), which
   this session could not open. See `docs/ANALYTICS.md`. Live verification is
   pending.
2. **Placeholder audio:** sound effects and ambience are synthesized stand-ins.
   There's no voice.
3. **Music loop points** haven't been auditioned.
4. **The intro video** hasn't been supplied.
5. **Browser coverage:** only Chromium was tested. Firefox, WebKit/Safari and
   real phones and tablets are still to do (`docs/QA.md` lists them,
   `docs/PLAYTEST.md` is the manual pass).
6. **Known platform limits:** iOS has no install prompt and keeps separate
   storage for home-screen apps; Firefox desktop doesn't install; private modes
   may disable offline (`docs/PWA.md`).
7. **Hand tiles** are 40×80 / 38×76 on the smallest screens: above the 32-px
   floor, under the 44-px comfortable size.

## 4. Deploying to GitHub Pages (owner steps)

The site will be at **https://officialinspire.github.io/STICKS_-_BONES/**. The
build uses relative paths, so no base-path setting is needed.

1. **Enable Pages with Actions:** GitHub → Settings → Pages → Build and
   deployment → Source: **GitHub Actions**. This needs admin rights on the repo.
2. **Merge the branch into `main`**: open a pull request from
   `claude/inspiring-bardeen-4yfmu5`, or merge locally:

   ```bash
   git checkout main
   ```
   ```bash
   git merge --no-ff claude/inspiring-bardeen-4yfmu5
   ```
   ```bash
   git push origin main
   ```
3. **Deploy:** the push to `main` runs **Deploy to GitHub Pages**
   (`.github/workflows/deploy-pages.yml`). It runs the full check, the browser
   smoke test, then uploads `dist/` and deploys. It can also be started by hand:
   Actions → Deploy to GitHub Pages → Run workflow.
4. **Confirm the deploy:**
   - the workflow shows a green **deploy** job with the page URL;
   - open the URL: the start screen loads and `<html data-build>` equals the
     first 12 characters of the deployed commit;
   - after the menu appears, "✓ Quick Play is ready offline" shows within a minute.
5. Run the manual checklist in `docs/PLAYTEST.md` on a phone and a desktop.

**Rolling back:** re-run the deploy workflow on an earlier `main` commit. Players
then see **Update available**, and their saves and settings are kept.

## 5. CI on this branch

`.github/workflows/ci.yml` runs on every push and pull request:
- `npm ci`;
- typecheck, lint, unit and engine tests;
- asset verify and build;
- Playwright Chromium install, then `npm run smoke`.

**Observed result:** run 2 on `da30779` —
https://github.com/officialinspire/STICKS_-_BONES/actions/runs/43944065875 —
**success**. Every step passed, including the browser smoke on the Pages subpath.

The **deploy workflow has never run**, so nothing is live.
