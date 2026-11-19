# Release gates that need people: real devices, listening, pacing

The automated release workflow (`npm run release`, or the **Release suites** GitHub workflow) runs headless
Chromium, Firefox and WebKit under **emulation**. That is not a real-device test, not a listening test and not a
playtest. The game stays a **release candidate** until this page is filled in with real results.

Rules: write down only what actually happened, on the device you name. Leave a box empty rather than guess.
Nobody may fill in results on someone else's behalf. **Never lengthen the story, add waits or slow the text to
reach a time target**; if runs are short, that is the finding.

Record for every session: date, tester initials (no other personal data), device model, OS version, browser and
version, and the build (`<html data-build>` on the live site, or the commit SHA).

## 1. Real-device checklist (about 20 minutes per device)

Minimum set: one iPhone (Safari), one Android phone (Chrome), one tablet, one desktop (any browser).

| # | Check | iPhone | Android | Tablet | Desktop |
| --- | --- | --- | --- | --- | --- |
| 1 | Live site loads; start tap → studio credit → menu; no sound before the tap | | | | |
| 2 | Quick Play: one hand in each of Draw, Block and Partnership | | | | |
| 3 | Two players on one device: the cover hides each hand (also after rotating and after switching apps) | | | | |
| 4 | Story: Continue, Skip, one hand, the end card; resume after closing the browser | | | | |
| 5 | Rotate portrait ↔ landscape at the table and in Story: nothing lost, every control reachable | | | | |
| 6 | Large text (the device's own text-size setting at its largest): menus, table, Story readable and reachable | | | | |
| 7 | Background ~1 minute (home screen / other app) during a hand and during a Story line, then return: same state, sound resumes once | | | | |
| 8 | "Full game ready offline", then airplane mode, close and reopen: Story chapter and a Quick Play hand work | | | | |
| 9 | Install to the home screen / desktop; launch from the icon | | | | |
| 10 | Screen reader (VoiceOver / TalkBack / NVDA): menu, a turn at the table, a Story line | | | | |
| 11 | Notch / home indicator: no control under it (phones) | | | | |

## 2. Listening checklist (headphones and a phone speaker)

Nothing in the build is marked auditioned or final until a person signs a row here (`docs/AUDIO.md`).

| # | Listen for | Headphones | Phone speaker | Verdict / notes |
| --- | --- | --- | --- | --- |
| 1 | Menu and table music: level, the restart after each song's ending (no loop points are used) | | | |
| 2 | Chapter 4 and 6 scene music: level under dialogue; Chapter 6 fades at the cut to the rest area | | | |
| 3 | Ambience beds (patio, promenade, jungle, cave, terrace): seams while looping, level | | | |
| 4 | Tile sounds (pick-up, place, slam, deal, pass knock): natural, not clipped, not too loud | | | |
| 5 | Result cues: Chapters 1–4 play them; Chapters 5–7 stay silent by design | | | |
| 6 | Story knocks: three, a pause, the answer; clear but not startling | | | |
| 7 | Mute, volume sliders, backgrounding: nothing sounds when it shouldn't | | | |

## 3. Pacing: three first-time players

Target: median full run **90–110 minutes**, every run **under 120 minutes** (`docs/STORY_SCRIPT.md`). The
reading-time model in `docs/PLAYTEST.md` predicts 36–48 minutes, so this is an open question for the owner, not
something to tune.

How to measure: the game writes `story:<scene>:pre`, `story:<scene>:hand` and `story:<scene>:post` performance
measures (`docs/PLAYTEST.md` has the one-line console command). Copy them **after each chapter** because a reload
clears them, and keep a stopwatch as a backup. Reading = `pre` + `post`; hand = `hand`. Note pauses, Skips, "Finish
hand with AI" and anything that confused the player.

Player: P__ · device / browser / build: ______________________ · date: ________

| Scene | Reading before (min) | Hand (min) | Reading after (min) | Result | Skipped? AI finished? | Notes |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Prologue | | — | | — | | |
| Chapter 1 | | | | | | |
| Chapter 2 | | | | | | |
| Chapter 3 | | | | | | |
| Chapter 4 | | | | | | |
| Chapter 5 | | | | | | |
| Chapter 6 | | | | | | |
| Chapter 7 | | | | | | |
| Epilogue | | — | | — | | |
| **Totals** | reading: | hands: | | | | full run: |

Use one sheet per player (copy the table three times). Pass: three sheets complete, median 90–110 minutes, every
run under 120. Until then pacing is **unverified**.
