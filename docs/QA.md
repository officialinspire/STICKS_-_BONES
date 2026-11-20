# QA: rendered screens, input and accessibility

Three scripts run against the **real app** in Chromium. Unit tests cannot see
layout, so these are the evidence for it:

| Command | What it checks | Output |
| --- | --- | --- |
| `npm run qa` | 6 viewports × 9 screens: page scroll, controls off screen or clipped, touch targets, clipped text, region overlap, Cousin's portrait clipping and upscaling, tile/pip size, hand fit, open-end reachability; plus atlas bleeding at DPR 1/2/3 | `test-results/qa/` (screenshots, one contact sheet per screen, `report.json`) |
| `npm run a11y` | axe-core on every screen and dialog; keyboard-only play; focus traps and restoration; screen-reader hand privacy; non-colour legal cues; reduced motion; safe areas; orientation changes | `test-results/a11y/report.json` plus screenshots |
| `npm run e2e` | Full games and stage acceptance (solo, AI partnership, two humans, reset, save/resume, rapid actions…) | `test-results/e2e/` |
| `npm run faults` | Fault injection in the real app: Story / script / achievements chunk failures (Retry / Back, Retry reloads into the same screen if the browser keeps refusing), leaving during a slow load (no remount), a stalled backdrop (scene still presents, queue keeps moving), one record refusing to save (alert per record, Try again), offline / 404 ambience and offline music (bounded recovery, absent never retried), every story table's backdrop | `test-results/faults/` |
| `npm run story:sweep` | Every Story beat in the real UI (all 9 scenes, every win / loss / tie route at 390×844; Chapters 3 and 7 at the seven QA viewports): verbatim text, the tagged expression and verified cast frame, one figure in a settled stable box, Continue as the only action (on screen and focused; the text is a focus stop only when it really scrolls), one beat per Continue, the corporate terrace in Chapters 3 and 7, no overflow | `test-results/story-sweep/report.json` |
| `npm run offline:tour` | The production build after the whole-game download, relaunched OFFLINE with the server down: the intro played out from the cache, menu music, a Quick Play hand, the whole case through the UI (every scene's music and bed sampled against its profile, every insert, result cues only after Chapters 1–4), both knock motifs on the audio clock, offline resume of a story hand and a match, achievements across a reload, every scene at phone-landscape / small-phone / tablet / desktop, rotation mid-line, 0 app requests to the network. Run `npm run build` first | `test-results/offline-tour/` |
| `npm run audio:report` | Measured audition of all runtime audio (no speakers needed): loudness, true peak, dead air, cut-off tails, bed loop seams as played, motif knock matching. Measurements only — not listening | `test-results/audio-report/` |

## Viewports and screens

**Viewports:**
- 360×800 and 390×844 (phones);
- 844×390 (phone on its side);
- 768×1024 and 1024×768 (tablet, both orientations);
- 1366×768 (laptop).

All are captured at DPR 2, with touch enabled below 1100 px.

**Screens:**
- startup, menu, setup;
- **longest chain**: the 27-tile `max-board` fixture with a double that fits both ends;
- **largest hand**: the 21-tile `max-hand` fixture;
- **partnership table**: four seats, human turn, a tile selected;
- **handoff cover**: two humans;
- **pause**;
- **results**: four hands with pip arithmetic.

## Limits

| Check | Limit |
| --- | --- |
| Page scroll on the table and home menu | none (setup/rules/stats may scroll) |
| Touch targets | **≥ 32 px floor** (fail), **44 px comfortable** (reported) |
| Pip diameter on screen | ≥ 3 CSS px (measured minimum 4.6 px) |
| Cousin upscaling (CSS px × DPR per source px) | ≤ 1.6 (measured maximum 1.24) |
| Open ends | topmost element at their centre, on screen |
| Regions (HUD, Cousin, bubble, seats, board, actions, tools, hand) | no overlap |

## Faults found and fixed (first pass: 62 failures → 0)

**High impact**

- **Phone landscape (844×390) was unplayable.**
  - The page scrolled, Pause was off the top and the hand covered the board.
  - The scripted round could not be finished by tapping.
  - Fix: a short-landscape layout. On the left, info and Draw/Pass; on the
    right, the board and hand; the view tools share the turn-banner row.
  - The board now fits its box's height as well as its width: the 27-tile chain
    and both open ends show without scrolling, and pips stay ≥ 4.5 px.
  - Manual zoom still overrides the fit.
- **Landscape menu:** every button was below the fold. Fix: a two-column menu.
- **Open-end targets were 24–27 px tall on phones.** Fix: an invisible hit area
  that extends ≥ 10 px around each end. The ghost tile keeps its exact footprint.
- **The results sheet opened scrolled to the bottom**, because focus on "Next
  hand" scrolled it. The title and Cousin were hidden. Fix: focus without
  scrolling, and sticky sheet actions.
- **The audio manager could play two music tracks at once.** A second scene
  change during the 0.45 s fade-out cancelled the timer that pauses the old
  track. Found by the new rapid-action e2e. Fixed, with unit tests that fail on
  the old code.
- **Tab could leave modal sheets and the privacy cover** and reach the browser's
  UI. Fix: wrap first ↔ last (`src/ui/focus-trap.ts`).

**Medium and low**

- A 7-tile hand didn't fit a 360-px phone without scrolling. The hand tile is now
  40 px wide there, 44 px from 381 to 899 px, and 38 px in short landscape.
- 13 px of page scroll under the handoff cover at 1024×768 and 1366×768: the
  side column was too tall. Cousin's full figure now scales with the window
  height, and the page can't scroll under the table at all.
- Home menu: 6–18 px of page scroll at 360×800.
- Controls raised to 44 px: secondary buttons, Back, the zoom/sort/end tools,
  settings summaries, range inputs and radio/checkbox rows.
- Radios and checkboxes had no visible focus ring.
- The destructive confirm button was below 4.5:1 contrast.
- The statistics table scrolled but was not keyboard-focusable.
- The table had no `h1`.

**Deliberately unchanged**

- Hand tiles are 40×80 at 360 px and 38×76 in short landscape. That's under the
  44-px comfortable size but above the 32-px floor; it's the price of fitting a
  7-tile hand without scrolling.
- Cousin's figure ends at mid-thigh. That's the art's own framing, not clipping:
  the overlap check confirms the bubble never covers it.

## Accessibility results (`npm run a11y`)

- **axe-core (WCAG 2.1/2.2 A/AA + best practice): 0 violations** on 12 screens
  and dialogs:
  - start, menu, setup, rules, statistics, settings;
  - table with ends shown, pause, confirm, results;
  - handoff cover, reveal step.
- **Keyboard only:**
  - start → menu → setup (every form stop shows a focus ring) → deal;
  - select a legal tile, then Enter moves focus to the open end, then Enter
    places the tile.
- **Focus traps:**
  - pause, confirm, results and the cover keep Tab and Shift+Tab inside;
  - Escape closes pause (focus returns to Pause) and confirm (focus returns to
    Pause);
  - Escape cannot dismiss results;
  - after Reveal, focus returns to the table.
- **Screen-reader privacy:**
  - In two-human mode, the accessibility tree was snapshotted 12 times, under
    the cover and during each revealed turn, and 8 live-region messages were
    captured. None named a tile from the other player's hand.
  - Against the computer, 12 snapshots across both sides' turns never named a
    computer tile.
- **Non-colour legal cues** (checked under `filter: grayscale(1)`):
  - legal tiles carry a ✓ badge and "playable" in their name;
  - others carry neither;
  - open ends show ▼ and a full name.
- **Reduced motion:** both the device preference and the in-app setting were
  tested. Over 6 turns: 0 running animations, 0 effects, 0 slam frames.
- **Safe areas:** emulated with DevTools `Emulation.setSafeAreaInsetsOverride`:
  47/34 px portrait insets and 47/47/21 px landscape insets. No control sat
  inside an inset on the menu or the table.
- **Orientation:** a tile was selected, then the window rotated 390×844 →
  844×390 → 390×844 → 1024×768 → 768×1024. There was no page scroll, both ends
  stayed reachable and the engine state was unchanged. With two humans, rotating
  covers the hand.

## Browsers

Since Stage 4 every browser suite runs in **Chromium, Firefox and WebKit** (`SB_BROWSER`, `scripts/lib/engine.ts`);
the exact builds and results of the latest run are in `docs/BUILD_STATUS.md` → "Stage 4 — release workflow". These are
Playwright's headless engines under emulation. WebKit here is not Safari on iOS, and none of this is a real device.

## Release workflow (Stage 4)

- **Run it:** `npm run release` (all engines; `--engines firefox`, `--suites smoke,e2e`, `--resume` to rerun only
  what did not pass), or GitHub → Actions → **Release suites** → Run workflow (one job per engine; artifacts
  `release-<engine>`).
- **What it runs:** `check` and `audio:report` once; then per engine `smoke`, `release:sweep`, `e2e`, `qa`, `a11y`,
  `story:e2e`, `story:route`, `story:sweep`, `faults`, `audio`, `matches`, `pwa`, `offline:tour`. Together they cover
  every mode, full Story routes (all 21 chapter outcomes), save and update failures, cold offline starts, audio,
  layout and accessibility, at portrait / short landscape / tablet / desktop sizes, large text, rotation and
  background/resume.
- **Report:** `test-results/release/report.md` and `report.json`: commit, Playwright, Node, OS, the browser builds
  (from the launched browsers), each suite's result and time, and the checks an engine's harness could not perform.
- **Adapting, never weakening:** where Playwright cannot do something in an engine, the suite calls `unsupported()`
  and the report lists it; it is never counted as a pass. Current entries: DevTools-only emulation in Firefox and
  WebKit (safe-area insets, storage quota override, stopping service workers, installability, and WebKit's browser
  text size); WebKit's broken offline emulation during navigation (the origin is made unreachable instead, so the app
  still has no network); layout-shift and long-task entries where the engine lacks them (reported as unmeasured,
  never as 0); and WebKit's report of same-origin requests cancelled by a navigation, allowed only for exactly that
  message on our own origin.
- **Machine requirements:** Playwright 1.63.0 with its Chromium, Firefox and WebKit builds; `ffmpeg` and `numpy` for
  `audio:report`; an **audio output device** (a PulseAudio null sink is enough). Headless Firefox cannot start an
  AudioContext without one, which made every audio check fail before the sink was added.

## Real-device tests still needed (none of these happened)

The short version to run is `docs/RELEASE_CHECKLIST.md` (devices, listening, pacing).

- **iPhone (Safari, notch + home indicator):**
  - portrait and landscape safe areas;
  - `100dvh` with the URL bar collapsing/expanding;
  - audio unlock on first tap;
  - rotation mid-turn with two humans;
  - VoiceOver: hand privacy under the cover and live-region wording.
- **Small Android phone (Chrome, 360-px wide, gesture navigation):**
  - touch accuracy on 40×80 hand tiles and the enlarged open ends;
  - TalkBack.
- **Android tablet and iPad:** both orientations, split-screen/slide-over widths,
  keyboard + trackpad on iPad.
- **Firefox desktop and Safari desktop:**
  - layout parity (`display: contents`, sticky sheet actions, `dialog`);
  - focus rings;
  - the WebP derivatives.
- **Low-end Android:** first-load timing on a real 3G/4G network, decode cost of
  the WebP art, and thermal behaviour during a long match.
- **Screen readers on desktop:** NVDA + Firefox and JAWS + Chrome, for the dialog
  traps and the results arithmetic reading order.

## Release quality pass (1.0.0-rc.2, 2026-11-17)

**Viewports now captured** (`npm run qa`, Chromium device emulation at DPR 3 with touch below 1100 px):
360×800, 390×844, **667×375 (new)**, 844×390, 768×1024, 1024×768, 1366×768 and **1920×1080 (new)**.
That's 13 screens each: startup, menu, setup, case file, story scene, **a cast line (Vale's portrait,
new)**, **the longest line at 130 % text (story-long)**, longest chain, largest hand, partnership, handoff, pause and results.
Text scaling at 150% and 200% is checked too.

**Faults found by the new viewports and fixed:**

| Viewport | Fault | Fix |
| --- | --- | --- |
| 667×375 | The score header wrapped into two rows, and the view tools covered the turn banner | A narrow short-landscape layout: Pause shows its icon (same accessible name), scores and match line share one row, and the view tools get their own top-right row |
| 667×375 | On the longest chain, one open end was hidden behind the player's tiles: the 26-px tile floor couldn't fit the chain | On screens ≤ 400 px tall the fit may go down to 22 px (pips ≈ 4.2 px; QA floor 3 px). The whole chain and both ends now show |
| 667×375 | My first fix truncated text ("Pl…", "Partnership · to 200 · …") | Names and the match line now wrap to two short lines and are never cut (QA's clipped-text check caught it) |

**Comfort warning kept on purpose:** at 667×375 on the longest chain, the two end slots are 64×41 px. That's
above the 32-px floor but under the 44-px comfortable target, the cost of fitting the whole chain on that
screen. Zoom (+) enlarges them.

**Browsers:** only Chromium exists in this environment. **Firefox and WebKit were not run.** Installing
browsers isn't allowed here. Every viewport above is **emulation**, not an actual iPhone, Android phone or
tablet.

### Real-device and browser checks still needed

| Check | Why emulation isn't enough |
| --- | --- |
| iOS Safari (iPhone SE, a notched iPhone) and an iPad | Real safe areas, browser bars collapsing, WebKit audio unlock, MP3 decoding and loop priming, home-screen storage |
| Android Chrome (a small and a large phone) | Real touch latency, the install prompt, memory pressure with story images, background audio suspension |
| Firefox desktop | A different layout and audio engine |
| A screen reader on a real device (VoiceOver, TalkBack) | Live-region pacing, rotor/landmark navigation, privacy of concealed hands |
| Headphones and speakers | Levels, knock motif clarity, bed seams (nothing has been listened to) |

## QA checkpoint (2026-11-18): Story presentation sweep

- **New `npm run story:sweep`:** 1,485 beats checked.
  - 701 beats at 390×844: the whole Story and all three outcome routes.
  - 112 beats at each of the seven viewports (360×800 to 1366×768): Chapters 3 and 7.
- **Defects found and fixed:**

| Found by | Defect | Fix |
| --- | --- | --- |
| `npm run a11y` | The dialogue text kept a stale `tabindex=0` (an extra focus stop) on short lines. It had been measured mid-reveal, while the text briefly overhung a body that was still free to grow | The text is a focus stop only when the body is held at its max-height and really scrolls. The sweep checks this on every beat |
| Review | The panel's height limit subtracted a fixed 26 px, ignoring a bottom safe-area inset (home indicator) | It subtracts the stage's real bottom padding, which includes `env(safe-area-inset-bottom)`. Same result when there is no inset |
| Resort correction | Story hands always showed the neighbourhood patio, so the Chapter 3 and 7 hands weren't on the corporate terrace, and rotation forced every backdrop back to the patio | A per-scene `handEnv` on the table host; rotation re-picks each element's own place (story § M) |
| `npm run pwa` | Test race: the dialogue panel is now permanent markup, so "scene up" passed before the first line was placed | It waits for the line's position |
| `npm run story:e2e` | Test race (§ I): a reload during the AI's turn compared the whole hand, but the restored AI may legitimately answer before the read | It compares the hand number, the player's tiles and the public log as a prefix (a re-deal or lost move still fails) |

- **Emulation only:** safe-area insets can't be emulated in Chromium here; the inset fix is by construction.
