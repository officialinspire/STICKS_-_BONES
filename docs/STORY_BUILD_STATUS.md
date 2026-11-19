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
| **Audio stage: scene soundtrack and tactile sound** | Audit: two approved music tracks kept; every synthesized SFX and the synthesized bed replaced by selected local CC0 samples (synth now only a decoding/missing-file fallback) | ✅ |
| | Licences verified per pack (Kenney `License.txt` in each zip; BigSoundBank per-sound CC0), source / creator / edits / sha256 per file, `docs/SOUND_SOURCES.md` generated; `assets:verify` enforces CC0 + hashes; Freesound not used | ✅ |
| | Decoded-buffer SFX with matched variants, no back-to-back repeats, restrained gain/rate variation, bounded voices, quiet defaults; UI select / confirm / back / invalid; tile pickup / place / slap / shuffle / draw; pass knock | ✅ (tile sounds are **stand-ins**, not final) |
| | Five ambience beds on their own bus (patio, promenade surf, jungle, cave water, corporate terrace), gentle cross-fades, ≤ 2 beds ever | ✅ (seams machine-measured; **not auditioned by ear**) |
| | Per-scene profiles: one track or none per scene and hand; no constant ominous music | ✅ |
| | Exact motif: three matched knocks 0.62 s apart + the answer from beyond 1.15 s later; the prologue's split beats; soft and single variants; scheduled on the audio clock | ✅ (sample-exact in Chromium) |
| | Fake speaker and trail voice caption-only (no impersonation), so the motif can't be confused with it | ✅ |
| | No ghost sounds: cancel on beat / skip / card / scene / profile / reset / background; refused cues never queued; resume restores mix state but never replays the knock | ✅ |
| | Captions never duck music (no speech recordings exist) | ✅ |
| | Intro: touch-to-start → video (Skip) → black → menu retained; no SFX or music during init/intro | ✅ The INSPIRE video is in (startup polish stage, 2026-11-18): guarded Skip, a muted retry when sound is refused, the soundtrack fades before the menu. Offline caching of the video is the next stage |
| | Original music briefs: night-investigation bed, cave suspense bed, four stingers (`docs/MUSIC_BRIEFS.md`); no music generated | ✅ (briefs; music **missing**) |
| **Integration stage: assets, loading, offline, analytics** | Re-audit: nothing new supplied on `main`; remaining final assets listed explicitly (`docs/ASSETS.md`), none relabelled as final | ✅ |
| | Cast portraits (Vale, Luz, Marisol, Rafa) in dialogue: cleaned repacked derivatives (specks removed, colour fringes repaired, baselines/centres aligned), identity checked, scene assignments tested; all eight frames with meanings verified by inspection | ✅ |
| | Portrait 3:4 crops for all seven environments (six since the resort correction) from one focal table; chosen by viewport, re-picked on rotation; next chapter prefetched (bounded queue), decoded before reveal | ✅ |
| | Measured startup, chapter entry, decode cost, tap latency and memory; 8 repeated chapter visits: no growth in nodes, listeners, timers, workers, audio sources, media (`npm run perf:story`) | ✅ |
| | Budgets revisited: core vs on-demand Story images, per-chapter limit; startup/code limits unchanged (manifest prose stripped from the bundle) | ✅ |
| | Offline groups: shell + core at install; story per chapter or by explicit download (3.2 MB, progress, retry); optional audio (9.1 MB, disclosed, removable, byte ranges); quota/interruption/missing media/unavailable storage handled | ✅ |
| | Accurate readiness lines (Quick Play / n of 9 scenes / whole story / audio) and a per-scene note on the case file | ✅ |
| | Repair re-downloads only this app's caches plus the groups the player chose; both save slots kept | ✅ |
| | Update mid-case: Update now on the case file, scene bar and story table; stable state written and checked; honest failed-save choice; no hand visible; returns once to the same line or hand | ✅ |
| | Story analytics events separate from Quick Play (encounter start on first move, chapter/case completion, resume, assist), deduplicated, enum-only | ✅ (adapter still **disabled**; contract not inspected) |
| **Character framing stage** | Larger dialogue characters sized from visible bounds, resolution-capped (≤ 1.6×), upper-body Cousin crop, head-matched scale | ✅ |
| | One-speaker staging: only the current speaker is on stage (none for narration and captions); centred, standing on the panel (beside it in short landscape); speaker changes fade out, then in; same speaker never moves; compact cast portraits at story tables | ✅ |
| | Cousin's portrait derivative cleaned (specks/fringes); story stage no longer drawn under the table (fixed + regression check) | ✅ |
| | Checked at 390×844, 844×390, 768×1024, 1366×768 (and QA's 8 viewports); faces clear of panel and bar; reduced motion | ✅ (emulation only) |
| | Expressions in dialogue: verified frame meanings for all five characters, 311 lines tagged by stable id (`src/story/expressions.ts`), neutral fallback, same box for every expression | ✅ |
| **Resort backdrop correction** | Chapter 3 (establishing shot, dialogue, partnership hand) and Chapter 7's confrontation and hand use the approved corporate `env.executive-terrace` (inspected; focal x = 0.27, portrait crop re-derived). The leisure `env.resort-patio` is retired (original kept, not bundled, pruned from caches on update). Script text unchanged | ✅ |
| **QA checkpoint (2026-11-18)** | `npm run story:sweep`: 1,485 beats (all scenes and outcome routes at 390×844; Chapters 3 and 7 at seven viewports) with verbatim text, tagged expressions, verified frames, one settled figure, Continue only, one beat per tap, corporate terrace. Fixed a stale text focus stop and the panel limit's safe-area inset | ✅ (Chromium emulation) |
| | Owner listening pass: SFX choices, bed seams (`/dev/audio-audition.html`), levels on headphones and speakers; mark `auditioned` / `final` | ☐ |
| | Commissioned music (night bed, cave bed, stingers) and recorded domino foley | Partly ✅ (owner audio stage): Chapter 4 / 6 beds, round win / other cues, slam and deal foley wired. ☐ case-complete cue, ☐ foley for pickup / place / slide / draw, ☐ listening pass |
| **Owner audio stage (2026-11-18)** | 13 uploads merged from `main`, originals untouched in `assets/audio/originals/`; reproducible derivatives with source hashes and measurements (`npm run audio:owner`, `audio:owner:check`); three foley clips trimmed per clip; scene tracks chosen by measurement and stream-copied; result cues cut from the final cadences; a duplicate recognised; budgets raised deliberately | ✅ (measured, **not auditioned**) |
| | Finish Hand with AI assistance, skip with recap (Stage 2); optional table banter in safe gaps | ✅ assist + recap (Stage 2) · ☐ banter |
| | Resilience: update-time save retry, music recovery, AI worker timeouts | ✅ Done in the hardening pass (below) |
| **Hardening pass (2026-11-18)** | Dialogue reveal timers belong to their own beat (an early-finished line can't end the next line's reveal; Back, Skip, settle, cancel and exit retire it) | ✅ |
| | AI worker: validated answers, observation-only cheap fallback on error, messageerror, malformed answer, postMessage failure or timeout; bounded restarts; late duplicates dropped; dispose settles | ✅ |
| | Media: absent vs broken vs transient failures; bounded recovery after a gesture or reconnection (current scene only, never replays cues or SFX) | ✅ (Chromium; **not auditioned by ear**) |
| | Loading: image deadlines and once-only completion; Story, script and achievement chunk failures show Retry / Back (Retry reloads into the same screen if the browser keeps refusing); a late chunk never remounts an abandoned screen | ✅ |
| | Saves: per-record write health (one success never hides another failure), retries of the latest value, alert reserves its room | ✅ |
| | Every story hand's backdrop explicit (Ch. 6 drawn rest area); no patio defaults, including rotation | ✅ |
| | Evidence list: verbatim on-screen captions of six approved evidence beats, shown only once reached (no spoilers, no new save field) | ✅ |
| | Version alignment (package vs release notes) | ☐ |
| | Representative human playtest timing (target 90–110 min, under 120) | ☐ |
| **Full-game audit (2026-11-19)** | The whole case through the real UI on the production build, **offline after a cold relaunch** (`npm run offline:tour`): intro, every scene, seven hands, inserts, end cards, Case complete, resume, achievements, four screen sizes, rotation; 0 network requests | ✅ (Chromium) |
| | Audio map deliberate and enforced: every shipped sample has a caller (the unused slide stand-ins retired); every scene's music and bed sampled against its profile in the live build | ✅ |
| | No celebratory result cue after the serious hands (Chapters 5, 6, 7), including replays; toasts never over Story | ✅ |
| | Knock motifs on the audio clock offline: 0.62 s apart, the answer 1.15 s after the third; the pass knock is a different recording | ✅ |
| | Roberto's table moods follow his side in Story (never laughing at Vale's domino) | ✅ |
| | Chapter replay through the case file (one run on a double tap; nothing persisted changes) | ✅ |
| | Measured audio audit (`npm run audio:report`): loudness, peaks, dead air, cut-off tails, seams; the beyond-knock's 1.2 s of dead air removed (audio bit-identical) | ✅ measured, **not heard** |

## Verification (audio stage, Chromium only)

Commits `87c5285` and the follow-up on `claude/inspiring-bardeen-4yfmu5`. Full detail in the audio
stage entry of `docs/BUILD_STATUS.md` and `docs/AUDIO.md` § Verification.

| Check | Result |
| --- | --- |
| `npm run check` | pass: 313 tests in 34 files, assets:verify (30 SFX + 5 beds, CC0, hashes), all budgets |
| `npm run audio` (new) | pass: silent intro, decoding, UI/tile samples, exact motif on the audio clock, 0 ghost starts, no replay on resume, mute/background, blocked files, ≤ 1 music / ≤ 2 beds, bed loops measured with the browser decoder |
| `npm run story:e2e` / `npm run e2e` | pass / pass |
| `npm run qa` / `npm run a11y` | 0 failures, 0 comfort warnings / 0 failures |
| `npm run pwa` / `npm run smoke` | pass, cache 4,175,553 B / pass |
| Listening (headphones, speakers, seams by ear) | **not done**: no audio output in this environment |

## Missing inputs

| Input | Needed for |
| --- | --- |
| ~~**Expression labels** for the four cast atlases~~ | Done by visual inspection in this build (`docs/ASSETS.md` "Expression verification"). The owner may still correct any reading; the mapping is one data file. |
| Owner's listening approval of the selected sounds and bed seams | Marking any sound `final` / any seam `auditioned` |
| Permission to read `officialinspire/SPIRITBALL` (`js/analytics.js`, `js/attribution.js`), or the analytics contract itself (service + key for this game, consent, event mapping, attribution) | Turning analytics on (the session's attempt to attach SPIRITBALL was refused) |
| Portraits for Worker, Representative, the contractor speaker | Those speakers (name tags today) |
| Recorded domino foley for picking up, placing, sliding and drawing a tile (the slam and the deal are now the owner's recordings) | Replacing the remaining casino-chip stand-ins |
| ~~Night-investigation bed, cave suspense bed, round stingers~~ — delivered (owner audio stage). Still missing: the case-complete cue, the optional chapter-card cue, edited loops / endings for the two beds (`docs/MUSIC_BRIEFS.md`) | Chapter 4 and 6 music, results and case-complete cues |
| The contractor speaker recording (voice + repeating cough), if the owner wants it voiced | Chapter 6 (caption-only until then; never impersonated) |
| ~~INSPIRE intro video `assets/video/inspiresoftwareintro.mp4`~~ — delivered (copied from `officialinspire/Inspire-card-parlor@cdc789b`, verified) | The studio credit |
| INSPIRE analytics contract | Analytics (still disabled) |
| Representative first-time playtesters | The 90–110-minute target and the under-two-hours requirement |

## Limitations (environment, not application failures)

- **Browsers:** only the Chromium bundled with Playwright is available here. **Firefox,
  WebKit/Safari and real phones and tablets were not tested.** No such pass is claimed.
- **Safe areas** are emulated through DevTools insets, not real notches.
- **Text scaling** uses Chromium's default-font-size preference via DevTools. That
  matches a player's browser text-size setting, not OS-level font scaling on mobile.

## Next stage

1. **Owner listening pass** on `/dev/audio-audition.html` (headphones and speakers): approve or
   swap the selected SFX, audition the five bed seams, the owner's trimmed slam/drop clips, the track
   transitions and levels; record `auditioned` / `final` in the manifest (via `scripts/build-audio.py`).
   `npm run audio:report` gives the measurements to compare against.
2. **The interrupted resilience items:**
   - update-time save retry / proceed;
   - bounded music recovery;
   - AI worker timeouts, `messageerror` and cancellation tests.
3. **Version alignment:** pick one label (package, release notes, handoff).
4. **Larger Roberto on DPR 3 phones:** a cleaned derivative of `cousin.atlas.large` (same expressions, more pixels).
5. **Commissioned music and recorded foley** when delivered (wire through the profiles).
6. **Firefox/WebKit and real-device passes**, and timed playtests.
