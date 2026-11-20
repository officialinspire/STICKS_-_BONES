# Release run (snapshot of test-results/release/report.md) 2026-11-20T01:44:21.476Z

- Commit: `e73ca183717c07fceb2790179d90f5b584da6890`
- Playwright 1.63.0, Node v22.23.4, linux 6.18.44-fc-v726 x64
- Browsers: chromium 153.0.8010.12, firefox 155.0, webkit 26.6
- Headless engines under emulation (viewports, touch, reduced motion, text size). **Not real devices.**

| Engine | Suite | Result | Time | Commit | Checks this engine could not perform (recorded, not passed) |
| --- | --- | --- | ---: | --- | --- |
| none | `check` | pass | 34 s | `e73ca18` | — |
| none | `audio:report` | pass | 20 s | `8941289` | — |
| chromium | `smoke` | pass | 68 s | `e73ca18` | — |
| chromium | `release:sweep` | pass | 492 s | `e73ca18` | — |
| chromium | `e2e` | pass | 540 s | `e73ca18` | — |
| chromium | `qa` | pass | 403 s | `e73ca18` | — |
| chromium | `a11y` | pass | 89 s | `e73ca18` | — |
| chromium | `story:e2e` | pass | 264 s | `8941289` | — |
| chromium | `story:route` | pass | 194 s | `8941289` | — |
| chromium | `story:sweep` | pass | 613 s | `8941289` | — |
| chromium | `faults` | pass | 69 s | `8941289` | — |
| chromium | `audio` | pass | 76 s | `8941289` | — |
| chromium | `matches` | pass | 403 s | `8941289` | — |
| chromium | `pwa` | pass | 246 s | `8941289` | — |
| chromium | `offline:tour` | pass | 461 s | `8941289` | — |
| firefox | `smoke` | pass | 84 s | `e73ca18` | — |
| firefox | `release:sweep` | pass | 590 s | `e73ca18` | — |
| firefox | `e2e` | pass | 626 s | `e73ca18` | main-thread long tasks during play (draw2-ai-easy-390) (firefox does not implement the longtask performance entry); main-thread long tasks during play (block2-ai-normal-1366) (firefox does not implement the longtask performance entry); main-thread long tasks during play (partnership4-ai-hard-390) (firefox does not implement the longtask performance entry); main-thread long tasks during play (partnership4-ai-normal-1366) (firefox does not implement the longtask performance entry); main-thread long tasks during play (block2-dev-both-normal-390) (firefox does not implement the longtask performance entry) |
| firefox | `qa` | pass | 371 s | `e73ca18` | layout shift (CLS) during load and font swap (firefox does not implement the layout-shift performance entry) |
| firefox | `a11y` | pass | 91 s | `e73ca18` | safe-area insets 390×844 (notch / home indicator) (inset emulation is a DevTools (Chromium) feature; real-device checklist item 11); safe-area insets 844×390 (notch / home indicator) (inset emulation is a DevTools (Chromium) feature; real-device checklist item 11) |
| firefox | `story:e2e` | pass | 314 s | `222977d` | — |
| firefox | `story:route` | pass | 212 s | `e73ca18` | — |
| firefox | `story:sweep` | pass | 649 s | `e73ca18` | — |
| firefox | `faults` | pass | 82 s | `e73ca18` | — |
| firefox | `audio` | pass | 86 s | `e73ca18` | — |
| firefox | `matches` | pass | 537 s | `e73ca18` | — |
| firefox | `pwa` | pass | 178 s | `e73ca18` | browser installability report (a DevTools (Chromium) query; install is on the real-device checklist (item 9)); storage quota too small for the pack / for the shell (step 4b) (the quota override is a DevTools (Chromium) feature); whole-game download stopped by the browser mid-way (step 8a) (stopping the service worker on demand is a DevTools (Chromium) feature) |
| firefox | `offline:tour` | pass | 471 s | `e73ca18` | — |
| webkit | `smoke` | pass | 83 s | `e73ca18` | browser-wide offline emulation during the offline restart (Playwright WebKit fails navigations under setOffline; the origin is unreachable instead (no network for the app)) |
| webkit | `release:sweep` | pass | 506 s | `e73ca18` | — |
| webkit | `e2e` | **FAIL** (exit 1) | 1164 s | `e73ca18` | main-thread long tasks during play (draw2-ai-easy-390) (webkit does not implement the longtask performance entry); main-thread long tasks during play (block2-ai-normal-1366) (webkit does not implement the longtask performance entry); main-thread long tasks during play (partnership4-ai-hard-390) (webkit does not implement the longtask performance entry); main-thread long tasks during play (partnership4-ai-normal-1366) (webkit does not implement the longtask performance entry); main-thread long tasks during play (block2-dev-both-normal-390) (webkit does not implement the longtask performance entry); a clean console while a navigation cancels in-flight requests (WebKit reports a cancelled same-origin request as an access-control error (e.g. /src/ai/easy.ts)) |
| webkit | `qa` | pass | 804 s | `e73ca18` | browser default text size 150% (no Playwright control for the browser text size in WebKit (release:sweep covers 130 % root text in every engine)); browser default text size 200% (no Playwright control for the browser text size in WebKit (release:sweep covers 130 % root text in every engine)); layout shift (CLS) during load and font swap (webkit does not implement the layout-shift performance entry) |
| webkit | `a11y` | pass | 95 s | `e73ca18` | safe-area insets 390×844 (notch / home indicator) (inset emulation is a DevTools (Chromium) feature; real-device checklist item 11); safe-area insets 844×390 (notch / home indicator) (inset emulation is a DevTools (Chromium) feature; real-device checklist item 11) |
| webkit | `story:e2e` | pass | 375 s | `e73ca18` | — |
| webkit | `story:route` | pass | 225 s | `e73ca18` | — |
| webkit | `story:sweep` | pass | 628 s | `e73ca18` | — |
| webkit | `faults` | pass | 81 s | `e73ca18` | — |
| webkit | `audio` | pass | 86 s | `e73ca18` | — |
| webkit | `matches` | pass | 1166 s | `e73ca18` | — |
| webkit | `pwa` | **FAIL** (exit 1) | 167 s | `e73ca18` | browser installability report (a DevTools (Chromium) query; install is on the real-device checklist (item 9)); browser-wide offline emulation on the cold relaunch (Playwright WebKit fails navigations under offline emulation; the origin is unreachable instead (no network for the app)); no page errors while loads fail (origin unreachable or a file missing) (WebKit reports a failed service-worker load as a stackless page error (Chromium: a console resource error)); browser-wide offline emulation (steps going offline) (Playwright WebKit fails navigations under offline emulation; the origin is unreachable instead (no network for the app)); storage quota too small for the pack / for the shell (step 4b) (the quota override is a DevTools (Chromium) feature); whole-game download stopped by the browser mid-way (step 8a) (stopping the service worker on demand is a DevTools (Chromium) feature) |
| webkit | `offline:tour` | **FAIL** (exit 1) | 490 s | `e73ca18` | browser-wide offline emulation on the cold relaunch (Playwright WebKit fails navigations under offline emulation; the server is down instead (no network for the app)) |
