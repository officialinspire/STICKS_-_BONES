# Startup, intro and audio

## Startup flow (`src/ui/intro-screen.ts`, `src/app/intro.ts`, `src/assets/warm.ts`)

```
initialization ──ready──► start prompt ──tap / click / Enter──► studio credit ──► fade through black ──► menu reveal
 (progress, retries)                                            the INSPIRE video (local); a text card if it's missing
                                                                Skip · Esc (once armed) · ended · error · timeouts · play() refused (muted retry)
```

- **Initialization:** loads what the first menu and the first table need, before the start prompt is
  enabled.
  - **What:** the fonts (FontFace API), then the menu backdrop, Cousin's portrait and the tile atlas.
  - **How:** the images go through the app's one bounded loader (`warm`, 2 at a time), fetched AND
    decoded, with `warmWithRetry`: 3 attempts, 400 / 800 ms backoff.
  - **Progress is truthful:** "Loading… n of 4". A failure names the item ("Couldn't load the domino
    tiles. Drawn stand-ins will be used, so you can still play.") and offers **Try again**, which
    retries only what failed.
  - **No artificial delay:** the prompt enables the moment everything has settled (a warm start is
    immediate). On a very slow network it enables after 8 s anyway and says "Still loading… You can
    start now".
  - Later scenes stay lazy: Story art per chapter, gameplay music when a table opens.
- **Start gesture:** a touch, click or key press (Enter is shown). It unlocks audio (the AudioContext
  is created inside the gesture) and plays **no sound of its own**.
  - Double clicks can't start twice.
  - An auto-repeating key never starts anything: a key held down since the prompt was still loading
    starts nothing; the player releases and presses again.
- **Intro video:** the INSPIRE studio credit, `assets/video/inspiresoftwareintro.mp4`.
  - **Provenance:** copied byte-for-byte from `officialinspire/Inspire-card-parlor` at `cdc789b`
    (`public/assets/video/inspiresoftwareintro.mp4`).
    - Verified there: git blob `66ff2ca8…`, 278,774 bytes, SHA-256 `8a6ce01d…`, and a clean full decode.
    - Recorded in `INTRO_VIDEO` (`src/assets/audio-manifest.ts`) and checked by `npm run assets:verify`,
      which also confirms the MP4 index comes before the media (fast start).
  - **The file:** H.264 High 1080×720 at 30 fps, 5.83 s, with AAC-LC stereo at −21 LUFS.
    - It opens on black (0.33 s) and ends on black (from 5.33 s), so the fade through black is seamless.
  - **Served locally:** it is bundled from the repository under a hashed, base-path-safe URL. There is
    never a runtime external URL.
  - It's buffered (`preload="auto"`) only once initialization has finished, so it never competes with
    the essentials.
  - It plays inline (`playsinline`) with an accessible **Skip intro** button (focused, Esc also
    skips) and a **Mute** toggle (persisted).
  - **Skip guard:** Skip and Mute arm only after the starting input is released (the tap's pointerup or
    the key's keyup) and at least 400 ms have passed, or after 1.5 s at most.
    - So the start gesture's own trailing click, or a held or repeating Enter, can never skip the credit
      by accident.
    - While guarded they carry `aria-disabled="true"`, and the stage has `data-skip="guarded"` /
      `"armed"`.
    - Repeated Enter/Space never activate anything.
  - **Volume:** it plays at the menu-music level (master × music) and respects the saved mute.
  - **Refused sound:** if the browser refuses playback with sound, it is retried **muted** once and plays
    on. The Mute button then reads "Unmute" (unmuting is a gesture). The player's saved mute is not
    changed. Only a second refusal ends the credit.
  - **Skip fades the soundtrack:** the audio fades out over 380 ms (120 ms under reduced motion) with the
    picture's fade to black. The menu, and its music, start only once the media is released. A stuck fade
    is cut off by a timer.
  - It is saved offline in the whole-game download and streamed from the cache with byte ranges
    (`docs/PWA.md`); `npm run pwa` plays it in a cold offline launch.
- **Fallback credit (no video):** a short typeset card, "INSPIRE / presents", in the game's fonts on
  black.
  - It holds 1.6 s, is skippable the same way, and has no logo art or imitation video.
  - It's static under reduced motion.
- **One guarded transition:** `IntroController.finish(reason)` handles Skip, ended, error, a start
  timeout (6 s), a stall timeout (5 s), an overall cap (duration + 3 s, max 45 s), play() refusal and a
  missing file. The first one wins.
  - Later signals are ignored and listeners and timers are removed.
  - The video is released (`src` removed): straight away after a natural end, an error, a refusal or a
    cancel; after the soundtrack fade on Skip or a timeout.
  - `onFinish` receives a promise that settles on release, and the menu waits for it.
  - So the credit's audio can never overlap menu music, and the menu is entered exactly once.
- **Backgrounding:** hiding the app mid-credit calls `suspend()`, which pauses the video and clears
  every timer, so nothing can time out and no menu can open while hidden. Returning calls `resume()`,
  which plays on with fresh timers (a refused play() is retried muted, then ends the credit once). The
  AbortError that a pause gives a pending play() is not treated as a refusal. The text card holds the
  same way.
- **Menu reveal:** the menu mounts under black, then the black lifts, so the decoded backdrop appears
  first.
  - Then the title (120 ms), the menu panel (320 ms), Cousin (520 ms) and the footer rise or fade in.
  - Any pointer or key input finishes the reveal at once, and the controls are clickable throughout.
  - Reduced motion (the OS setting or the in-game one) skips it.
  - Menu music starts only here, after the credit finished or was skipped.
- **Startup audio preload:** only the metadata of the menu track, after initialization.

## Audio manager (`src/audio/manager.ts`, `src/audio/webaudio.ts`)

One manager plays everything: music, SFX, ambience beds and story cues. There is no second
playback path (the dev audition page is a developer tool outside the build).

**Scenes are exclusive:**

| Scene | Music | SFX | Ambience bed |
| --- | --- | --- | --- |
| init | — | off | — |
| intro | — (the video has its own sound) | **off** | — |
| menu | menu track | on | — |
| story | the profile's track (often none) | on | the profile's bed |
| gameplay | gameplay track (story: the profile's hand track) | on | patio (story: the profile's bed) |
| paused | gameplay track, ducked to 35% | off | — |
| results | gameplay track, ducked to 70%; a result cue ducks it to 25% of that for ~2 s | on | the table bed at 60% |

**Story profiles** (`src/audio/profiles.ts`): each story scene names one track (or none) and
one bed, for its dialogue and for its hand.

| Scene | Dialogue | Hand |
| --- | --- | --- |
| Prologue (dream) | no music · cave bed, very low | — |
| 1 Patio | patio track at 45% · patio bed | table track · patio bed |
| 2 Alley + phone call | no music · patio bed, low | table track · patio bed |
| 3 Resort | no music · dining-room murmur | table track, low |
| 4 Promenade | **"Promenade After Dark"** at 50% · surf at 75% (swells on "Let the surf hold the silence") | the same track at 35% (never restarted) · surf |
| 5 Jungle | **no music** · close forest bed | no music |
| 6 Cave | **"The Lit Threshold (Alt)"** at 40% · cave water bed at 75%, until "Cut to the entrance rest area" (`music-off`) | no music (the rest area) · cave bed, lower |
| 7 Terrace | no music · restaurant murmur (polished, uncomfortable) | table track, thin |
| Epilogue | patio track at 40% · patio bed; it fades away on "The water goes still." | table track |

There is no constant ominous music anywhere. The owner's two scene beds play only where the briefs put them
(`docs/MUSIC_BRIEFS.md`); the other supernatural moments run on ambience and silence. `music-off` is a
state cue like `ambience-off`: it holds for the rest of the scene (through the hand) and is replayed when a
saved scene resumes after it.

**One music source:**

- A track change fades the old track out (0.45 s) and pauses it **before** the next
  starts (0.9 s fade-in). There's no crossfade overlap.
- Paused and results duck the current track instead of starting another.

**Ambience beds** run on their own bus. A bed change cross-fades gently (2.4 s); at most two beds
exist at once (one fading out), and a bed whose decode finishes after the scene moved on never
starts. Beds are fetched per scene on demand, decoded once and looped on the buffer source.

**Guards:**

- Each scene or profile change bumps a token. Fade timers, play() promises and restarts carry
  their token and are dropped if it moved (`stats.staleDropped`).
- `reset()` (restart or leaving a table) cancels pending work, cue voices and SFX.

**Unlock:** nothing plays, and no AudioContext exists, until the first gesture. A
later gesture re-unlocks if the browser suspended audio and the scene still wants music.

**Levels:**

- master, music, sfx, voice and ambience (0–100), plus **mute**, all persisted with
  settings. Scene ambience is **on by default** now that the beds are real recordings
  (it was off while it was a synthesized placeholder); the toggle is in Settings.
- Mute and levels are authoritative: resume, focus, scene changes, profiles and cues never
  change them. Muting during the intro carries into the menu.
- Tracks get loudness-normalisation gain towards −20 LUFS (Patio −2.7 dB,
  Domino Table −0.6 dB, from measured integrated loudness). Beds sit at −30 LUFS.
- **No ducking for captions:** silent subtitle changes never touch the music. There are no
  authored speech recordings, so nothing ducks for speech (the voice bus is kept for them).

**SFX** (`src/audio/sounds.ts`): short samples are fetched and **decoded once** after the first
gesture (30 files, ~550 KB). Each sound has matched variants; the manager never plays the same
file twice in a row and adds restrained variation (UI ±0.8 dB / ±1 %, tiles ±1.5 dB / ±3 %).
Quiet defaults: UI sounds at 0.35–0.5 of the SFX bus. Per-sound instance limits and a global
cap of 6; extra sounds are dropped, not queued. If a sample is still decoding, missing or broken,
the synthesized placeholder plays instead (one voice per sound, so counts stay exact).

| Sound | Where | Samples |
| --- | --- | --- |
| select / confirm / back | any menu, sheet or story control (one delegated listener; story advance, table moves and intro controls are silent) | Kenney Interface |
| invalid | tapping a tile that cannot be played (the status line explains) | Kenney `bong`, low-passed |
| pickup | selecting a playable tile | Kenney chips (stand-in) |
| place / slap | a tile placed; Cousin's doubles and the domino are slapped | Kenney chips (stand-in) |
| shuffle | a fresh deal (never on a restored game) | Kenney chips (stand-in) |
| draw | drawing from the boneyard | Kenney chips (stand-in) |
| pass knock | a pass | BigSoundBank door knock, dry |

**Story cues** (`StoryCue`): raised by the SceneDirector from exact stage directions
(`src/story/staging.ts`), scheduled **on the audio clock**:

| Cue | Stage direction | Sound |
| --- | --- | --- |
| `knock-three` | Prologue: "Three measured knocks." | three matched knocks, 0.62 s apart |
| `knock-beyond` | Prologue: "A fourth knock comes from beyond the light." | the answer alone (same hit, filtered, with distance) |
| `knock-motif` | Ch. 6: "Three knocks. A fourth answers from beyond the platform." | three knocks, then the answer 1.15 s after the third |
| `knock-motif-soft` | Ch. 4 taps beneath the bench; Epilogue knocks in the domino box | the same motif, lighter |
| `knock-one` | Epilogue gate; Ch. 6 "One quiet knock, no answer demanded." | one quiet knock |
| `water`, `dinner` | water gathering; the interrupted dinner | a drop / a glass |
| `surf` | "Let the surf hold the silence." | the promenade bed swells for that beat |
| `ambience-off` | "The water goes still." | the bed fades for the rest of the scene |
| `speaker`, `whisper` | the contractor speaker and its repeating cough; the voice on the trail | **caption only** |

The motif is exact and repeatable: the same three knocks from one recording at the same spacing,
never varied, and a clearly later answer from beyond. It cannot be confused with the fake speaker,
which is a voice (not supplied, never impersonated) and is shown only as captions.

**No ghost sounds:** every cue voice not yet finished is cancelled (stopped before its start
time, or released over 30 ms) on the next beat, a skip, the hand or end card, a scene or profile
change, reset and backgrounding. A second cue in the same beat replaces the first. A refused cue
(locked, muted, intro) is never queued for later. **Resuming** a saved scene restores staging and
mix-state cues (`STATE_CUES`, e.g. the bed going quiet) but never replays the knock of the beat
you land on.

**Missing, broken and temporarily failing files** (hardening pass): failures are told apart.

| Kind | How it's recognised | What happens |
| --- | --- | --- |
| **Absent** | No URL at build time, or HTTP 404/410 (a music element's "unsupported source" is checked with a HEAD request) | Never fetched again. A bed stays silent; an SFX uses its placeholder |
| **Broken** | The file arrives but won't decode (or a media decode error) | Never fetched again |
| **Transient** | Offline, a network error, an aborted load, or another HTTP status (5xx, 408, 429…) | Silence for now (an SFX uses its placeholder), then recovery |

- **Recovery:** `AudioManager.recover()` runs after a user gesture (the app's existing gesture hook) and on
  the window's `online` event.
  - It resets a failed music element (re-points it at its file and reloads, clearing the media error).
  - It re-fetches samples and beds that failed transiently.
- **Bounds:**
  - A track is recovered at most 3 times (`MAX_RECOVERIES`); after that it stays quiet for the session.
  - A sample or bed file is fetched at most 3 times (`MAX_FETCH_ATTEMPTS`).
  - Passes are at least 4 s apart, so a burst of gestures is one pass.
- **Current scene only:** recovery re-applies the CURRENT scene's music and bed through the normal path, so
  mute, levels, one-track exclusivity and the silent initialization and credits all still apply.
  - Only the bed wanted now starts once it decodes; a superseded bed never starts late.
  - No sound effect or story cue is queued or replayed.
- **Tests:**
  - `src/audio/manager.test.ts`, "bounded media recovery".
  - `npm run faults` § G: an offline bed recovers on reconnection; a 404 bed is never re-fetched.
  - `npm run faults` § I: offline menu music recovers, and only one track plays.

**Focus and visibility:**

- Hidden tab or `pagehide`: music pauses, SFX and cue voices are cut, the bed stops and the
  context is suspended.
- Back in focus, **only the current scene** resumes (its track and bed).

**Offline (full offline storage, owner-authorized):** the table/UI SFX and the two result cues are saved
with Quick Play's core files at install; story sounds, all music, the five ambience beds and the studio
intro video are saved by the whole-game download that starts after the menu is up (`docs/PWA.md`). The
worker serves `<audio>`/`<video>` byte ranges from the cache (206/416), so music and the credit play offline;
`HEAD` checks used by the failure classifier are answered from the cache too. Before the download finishes,
a missing file offline is a transient failure (silence now, recovery later), exactly as before.

**Haptics** (`src/audio/haptics.ts`): feature-detected `navigator.vibrate`. There's a
setting, shown only where supported, for short cues on place, knock and domino.
Haptics only follow public events.

**Voice:** no recorded voice exists. Cousin speaks through the bubble subtitle,
the live region and his expressions. The voice level is kept for when recordings
arrive.

## Owner uploads (owner audio stage, 2026-11-18)

Thirteen files uploaded to `main` were merged without touching any newer work and moved, **byte-identical**,
into `assets/audio/originals/`. Nothing globs that folder, so originals are never bundled.
`npm run audio:owner` (`scripts/build-owner-audio.py`) builds every runtime file from them, and
`npm run audio:owner:check` rebuilds in a temp dir and proves the outputs byte-identical. Every original and
derivative is in `src/assets/owner-audio.json`: bytes, SHA-256, decoded-PCM hash, loudness (EBU R128 I / LRA /
true peak), edits and boundaries, with each derivative's source hash. `npm run assets:verify` checks all of it.

**Slam and dropped dominoes (three clips).**
- **Tails:** each upload held about 0.42 s of digital silence before the attack and 5–6 s of silence after
  the decay.
- **Boundaries, detected per clip:**
  - start at the first sample ≥ −60 dB re the clip's peak, minus 2 ms, with a 1 ms fade-in (the attack
    is untouched);
  - end at the last 5 ms window ≥ −72 dB re peak, plus 10 ms, with a 6 ms cosine fade-out.

| Clip | Kept | Trailing silence removed |
| --- | --- | --- |
| Clear Crisp Slap… Take 1 | 0.162 s | 5.50 s |
| Crisp Slap… | 0.103 s | 6.24 s |
| Few Dominos Dropped… Take 1 | 0.685 s | 4.90 s |

  The ends sit about 15 dB below a −60 dBFS cut, which keeps the natural decay.
- **Format:** mono, peak −3 dBFS like the CC0 bank.
  - Sample rate by measurement: the slaps keep 48 kHz (2–3 % of their energy is above 12 kHz, which is
    their crack); the drop uses 24 kHz (0.27 %).
- **Wiring:** `slam` uses both slap takes (alternating, never the same twice in a row); `shuffle` (the deal) uses
  the drop. Their chips-collide stand-ins (`tile-slap-1/2`, `tile-shuffle-1`) were retired from the CC0 bank
  so they are no longer decoded with every table. Pickup, place, slide and draw keep their stand-ins (no
  replacements were supplied).

**Scene music (two of four variants).** Each pair was measured against its brief:
- **Promenade After Dark: main take for Chapter 4.**
  - Its opening is bare (−23 to −27 LUFS short-term for 15 s, then ≈ −18), it has a sparse regular pulse,
    and it is 2.5 dB quieter than the Alt.
  - The Alt reaches full level within 15 s and is denser.
- **The Lit Threshold: Alt take for Chapter 6.**
  - It breathes, with phrases receding into near-silence: LRA 7.9 LU, 24 two-second jumps above 6 dB, and
    24 % of its energy below 60 Hz.
  - The main take holds a dense full-band wall for two minutes: LRA 15, 100 jumps, 33 % below 60 Hz.
  - The brief asks for silence between phrases and forbids sudden jumps and booms.
- **Format:** both are stream copies, with cover art and tags removed (1.9 MB saved in all) and the decoded
  audio proven identical. The runtime gain brings them to −20 LUFS. Loops are not assumed: they play through
  and restart after a breath.
- **Preserved, not bundled:** the other two takes stay in the originals.

**Round result cues.** The recordings are 62–67 s pieces; each cue is the piece's final cadence.
- **How the cut is chosen:**
  1. The final hit is the strongest onset among the last 0.6 s of onsets before the closing level falls away.
  2. The start is the most accented onset 2–4 whole beats earlier (beat period from onset autocorrelation),
     or else the most accented onset that gives 1.5–2.5 s.
  3. The final chord keeps its natural decay for at most 1 s, then a cosine fade.
- **Level:** one static gain to −18 LUFS, lowered if needed so the encoded file is ≤ −1 dBTP. Encoded as
  48 kHz stereo MP3 at 192 kbps.
- **`result-win`**, from "Round Win (Puerto Rico Vibe)": 57.35–59.30 s (1.95 s). Two beats of 0.565 s into a
  final hit that decays naturally in 0.81 s, which is the brief's "ends on a ringing chord".
- **`result-other`**, from "Round Other (Musical Shrug)": 58.14–59.92 s (1.78 s). The shrug's two chords;
  the decay is capped at 1 s.
- **Not used, kept as originals:** "Round Win (Tropical Vibe)" and "Round Win Stinger" decay for 3–4.5 s,
  and "Round Win Stinger (Alt)" for 1.3 s. "Round Win Stinger (Alt)(1)" differs by a few metadata bytes but
  decodes identically to "(Alt)", so it is catalogued as a **duplicate**.
- **No case-complete music** was supplied, and none is fabricated.

**Case-complete cue and foley (Stage 3, ready for files that have not been supplied):**
- **When:** once, at the epilogue's title reprise ("Title and credits" on its end card), through
  `AudioManager.caseComplete()`; no second playback system.
- **What plays:** `case-complete` on the music bus and `case-complete-foley` on the SFX bus, from
  `assets/audio/cues/` (the sample globs). The scene's patio track fades out first (the `music-off` path), and the cue
  starts after that fade on the audio clock: never two music sources at once.
- **Never synthesized, never queued, never stale:** a second call replaces the first; leaving (scene or profile
  change, backgrounding, reset) stops it, so nothing follows the player to the case file.
- **Missing files (today):** `caseComplete()` changes nothing — the patio track and bed carry on — and counts
  `caseCompleteMissing` (`story:e2e` § Q checks it). No stand-in.
- **Building them:** add the uploads to `ENDINGS` in `scripts/build-owner-audio.py`. Conservative trims only: lead
  near-silence before the first onset (−50 dB re peak, 20 ms pre-roll); the natural tail kept to −60 dB re peak
  plus 200 ms, with the only fade inside that margin; gain only ever lowered so the encoded file is ≤ −1 dBTP (no
  clipping). Verified on synthetic files in this stage (lead trimmed to 20 ms before the onset; a 0 dBTP source
  lowered 1.00 dB to −1.2 dBTP); `--check` still rebuilds every existing derivative byte-identically.
- **Loop points:** explicit data only (`ENDINGS` → `owner-audio.json` `cues[].loop` → `CUE_LOOPS` in
  `src/audio/case-complete.ts`, kept equal by a test). The Web Audio backend loops a buffer only between points a
  person has marked `auditioned: true` after listening; otherwise the cue plays once through its tail.

**How a result cue plays** (`AudioManager.resultCue`):
- **When:** once, when the results sheet opens for a hand that resolved live at that table. A results sheet
  restored after a reload never replays it.
- **Which:** `win` when the player's team (solo, Story, partners) won the hand, or, with two people on
  opposite sides, when anyone won. A blocked tie or a loss plays `other`.
- **How:**
  - It is music: it plays on the music bus (music level and mute apply) and ducks the current track to
    25 % for about 2 s instead of adding a second song.
  - It is a decoded buffer that is never synthesized: if it isn't decoded, missing or failed, nothing
    plays. It is never queued.
  - One plays at a time. Reset, backgrounding or leaving the table stop it, and it is refused during
    init, the credits, menus and Story dialogue.
- **Recovery:** a transient fetch failure is retried by the same bounded recovery as every sample; an absent
  cue is silence.

**Budgets (deliberate):** music 13,500 KB (was 8,000), measured 12,757 KB; total 21,000 KB (was 15,400),
measured 20,147 KB. Startup is unchanged in kind: no music or cue loads at startup. Offline, they are in the
whole-game download (full offline storage stage), which starts only after the menu is up.

## The complete map (full-game audit, 2026-11-19)

Every shipped sound and effect has exactly one deliberate job. `src/audio/sounds.test.ts` fails if a sample
ships that nothing maps, or a sound id has no caller; `npm run offline:tour` checks the map in the
production build, offline, by watching what the browser is asked to play.

**Music (one track at a time; fades out before the next fades in):**

| Track | Plays | Measured (`npm run audio:report`) |
| --- | --- | --- |
| Patio Dominoes (Take 2) | menu; Chapter 1 and Epilogue dialogue | −17.3 LUFS, −0.3 dBTP, 155.8 s |
| Domino Table (Subtle Vibe) | Quick Play / two-player tables; story hands of Chapters 1, 2, 3, 7 | −19.4 LUFS, −0.9 dBTP |
| Promenade After Dark | Chapter 4 dialogue and its hand (one track, lowered, never restarted) | −18.0 LUFS, −0.4 dBTP |
| The Lit Threshold (Alt) | Chapter 6 until "Cut to the entrance rest area" (`music-off`, held through the hand) | −15.3 LUFS, −0.8 dBTP |
| — none — | Prologue, Chapters 2, 3, 5, 7 dialogue; Chapter 5 and 6 hands | |

**Ambience beds (own bus; 2.4 s cross-fade; at most two at once):** patio (menu tables, Chapters 1, 2,
Epilogue), terrace murmur (Chapters 3, 7), surf (Chapter 4), jungle (Chapter 5), cave water (Prologue, Chapter
6). Loop seams measured as played (encoder padding trimmed): sample jump across the wrap 0.3–1.1× a typical
step; level change across the wrap at the 1st–77th percentile of each bed's own 100 ms variation.

**Table and UI sounds:** select / back / confirm (any button, by role; table moves and Story controls are
silent), invalid, pickup (choosing a tile), place (landing), slam (the owner's two takes: Cousin's doubles and
the hand-ending tile), shuffle (the owner's multi-tile drop, on the deal), draw, knock (a pass on the table —
`pass-knock-*`, a light door knock, low-passed: a different recording from the supernatural motif).

**Story cues (exact stage directions, `src/story/staging.ts`; scheduled on the audio clock; the next beat
cancels anything not yet started; a resumed beat never replays):**

| Cue | Samples | Beats |
| --- | --- | --- |
| `knock-three` | motif-knock-1, -2, -3, 0.62 s apart | Prologue, first beat |
| `knock-beyond` | motif-knock-beyond (filtered, echoed: distance) | Prologue, "A fourth knock comes from beyond" |
| `knock-motif` | the three + the fourth 1.15 s after the third | Chapter 6, "Three knocks. A fourth answers…" |
| `knock-motif-soft` | the same, softer | Chapter 4, "Three light taps beneath the bench"; Epilogue, "No one stands outside…" |
| `knock-one` | motif-knock-1, soft | Chapter 6, "The lifted water lowers"; Epilogue, "A knock at the gate" |
| `water` | water-drop-1 / -2 | Chapters 4, 5, 6 water beats |
| `dinner` | glass-1 | Epilogue, the interrupted dinner |
| `surf`, `music-off`, `ambience-off` | state cues | Chapter 4 swell; Chapter 6 rest area; Epilogue "The water goes still." |

The three motif knocks are slices of one recording, peak-matched (spread 0.0 dB); the fourth is the same hit
filtered and echoed. Offline in the production build: 0.62 / 0.62 s, answer +1.15 s (audio clock).

**Result cues (music bus, ducking the track):** `result-win` / `result-other` after a hand at Quick Play and
two-player tables and after the lighter story hands (Chapters 1–4). **Withheld after Chapters 5, 6 and 7**
(`SceneProfile.resultCue`): the jungle and rest-area hands are deliberately music-free, and Chapter 7's hand is
the public confrontation with Vale — no flourish into serious dialogue (`docs/STORY_SCRIPT.md` §5). Leaving the
table (Continue the case) stops a cue still sounding. Achievement toasts never show over a Story scene.

**Visual effects (`src/ui/effects.ts`, skipped under reduced motion):** `impact-burst` on each placed tile;
`star-gold` on the hand-ending domino; `ripple` on a passing seat. `dust-puff` and `confetti` are in the
approved sheet but deliberately unused (no confetti anywhere, including the serious chapters).

**Measured, not heard.** This environment has no audio output. `npm run audio:report` decodes all 38 runtime
files and measures loudness, true peak, dead air, cut-off tails and loop seams (the owner's trimmed slam/drop
clips: 0–1 ms lead, a faded tail, no cut-off). It found and this stage fixed: the beyond-knock's 1.2 s of
digital silence (its padding did nothing — audio bit-identical, 48 KB smaller) and the three unused slide
stand-ins. **Nobody has listened** to the track transitions, seams, levels or the trimmed clips in this build:
an owner listening pass remains open.

## What is real and what is placeholder

| Audio | Source | Status |
| --- | --- | --- |
| Menu/results music | `assets/audio/music/Patio Dominoes (Take 2).mp3` (owner upload, artist "officialinspire") | **final, approved** |
| Gameplay music | `assets/audio/music/Domino Table (Subtle Vibe).mp3` (owner upload) | **final, approved** |
| UI sounds | Kenney Interface Sounds (CC0), `assets/audio/sfx/ui-*.wav` | selected samples, **not final** (awaiting the owner's listen) |
| Slam and shuffle/deal | **Owner recordings** of a real domino slapped onto a table (two takes) and of several dropped onto it; trimmed derivatives (`scripts/build-owner-audio.py`) | selected, measured, **not auditioned** |
| Other tile sounds (pickup, place, draw) | Kenney Casino Audio chips/cards (CC0) | **stand-ins** until real dominoes are recorded for those actions (the three card-slide stand-ins were retired on 2026-11-19: nothing played them) |
| Pass knock, story knocks, drops, glass | BigSoundBank (CC0) | selected samples, **not final** |
| Ambience beds (patio, promenade, jungle, cave, terrace) | BigSoundBank field recordings (CC0), looped | selected, seams **machine-measured, not auditioned** |
| Synthesized SFX (`src/audio/synth.ts`) | code | **fallback only** (decoding / missing file) |
| Chapter 4 and 6 scene beds | **Owner uploads** "Promenade After Dark" and "The Lit Threshold (Alt)" (stream-copied, audio bit-identical) | selected by measurement, **not auditioned** |
| Round result cues (`result-win`, `result-other`) | **Owner uploads** "Round Win (Puerto Rico Vibe)" and "Round Other (Musical Shrug)", final cadence extracted (1.95 s / 1.78 s) | measured, **not auditioned** |
| Case-complete music and foley, chapter-card cue | — | **missing** (not supplied; nothing fabricated). The reprise is wired to play them through `AudioManager.caseComplete()` once built; until then the patio track and bed carry on |
| Contractor speaker voice and cough; trail voice | — | **missing**: caption only, never impersonated |
| Studio intro | `assets/video/inspiresoftwareintro.mp4` (owner's INSPIRE credit, copied from the verified source commit) | **final**; the 1.6 s typeset credit is only its fallback |

Sources, creators, licences and every edit: `docs/SOUND_SOURCES.md` (generated from
`src/assets/sound-manifest.json`; `npm run assets:verify` checks each file's bytes and sha256,
and that every licence is CC0 1.0). kenney.nl refused this environment (HTTP 403), so the Kenney
packs came from Kenney's own OpenGameArt uploads, with the licence read from the `License.txt`
inside each zip. Freesound was not used. Rebuild with
`python3 scripts/build-audio.py <sources dir>` (the originals stay outside the repository).

## Loop points: analysed, not assumed

**Music.** Both tracks are complete songs with composed endings.

**Measurements** (`scripts/audio-audit.py`, ffmpeg + numpy):

| | Patio Dominoes (menu) | Domino Table (gameplay) |
| --- | --- | --- |
| Length | 155.8 s | 179.8 s |
| Format | 48 kHz stereo | 48 kHz stereo |
| Loudness | −17.3 LUFS, LRA 1.1 | −19.4 LUFS, LRA 6.6 |
| Ending | hard stop, then 2.6 s of silence | ~8 s fade-out, then 2.2 s of silence |
| Direct end→start seam | 99.9th percentile of the track's own spectral change | 92nd percentile |
| Best internal candidate | 115.3 s → 54.8 s, similarity 0.996, seam at the 94th percentile | 119.5 s → 45.5 s, similarity 0.997, seam at the 79th percentile |

A seam at a high percentile is likely audible; none of these joins is proven
seamless.

**Runtime policy:** **restart after the composed ending** (gaps of 0.8 s and 0.6 s).
It sounds like the song starting again and doesn't depend on any loop point.

**Ambience beds** are built as loops of an exact length: the head is an equal-power cross-fade
of the window's start with the 3 s just past its end, so the wrap is continuous by construction.
A static gain sets −30 LUFS (a time-varying normaliser would break the seam). The first build
used an ffmpeg graph that silently dropped the cross-fade (beds came out 3 s short with a hard
wrap; the browser suite caught it), so it is now done in numpy. Measured on the **decoded** MP3:

| Bed | Length | Spectral change at the wrap (pct of ordinary points) | Wrap sample step (pct of the bed's steps) | Browser wrap jump (× mean step) |
| --- | --- | --- | --- | --- |
| patio | 42.0 s | 33 | 97.5 | 4.7 |
| promenade | 44.0 s | 76 | 79.8 | 1.9 |
| jungle | 40.0 s | 34 | 60.5 | 1.3 |
| cave | 42.0 s | 89 | 89.8 | 2.3 |
| terrace | 40.0 s | 49 | 73.6 | 1.7 |

No wrap is an outlier, so none should click. **But measurements are not an audition:** the cave
seam has the most spectral change and the patio's 3 s cross-fade blends two moments of distant
talk (listen for a doubled voice). Chromium decodes the MP3s gaplessly (decoded length = authored
length); for decoders that add priming, `src/audio/loop.ts` trims edge silence before looping.

**Candidates and beds** are stored with `auditioned: false`. The owner can listen on the
dev page **`/dev/audio-audition.html`**: the music restart seams and candidates, each bed's
wrap exactly as the game loops it, the knock motif, and every SFX variant. Only a person's
approval (recorded in the manifest) should change a policy or mark anything final.

## Verification

- `src/audio/manager.test.ts` (29): unlock gating; no overlap on scene switches;
  rapid scene changes and stale play() drops; ducking; a silent intro with no SFX;
  restart after ending; rejection, missing and broken files; mute persistence;
  background/foreground; SFX caps and reset; ambience following settings and scene;
  variants never repeating, gain/rate bounds; silent play (master 0, SFX 0, muted);
  the exact motif (spacing, matched, repeatable); the prologue split; caption-only cues;
  cancellation on beat / scene / profile / reset / hidden; rapid advance; a second cue in a beat;
  refused cues never queued; profile tracks and beds; surf swell and ambience-off; captions never
  duck; levels untouched by profiles and cues; bed restore after background and pause.
- `src/audio/loop.test.ts` (3): priming/padding trimmed, untouched files kept, bounded scan.
- `src/app/intro.test.ts` (8): Skip vs late ended/error/timer; natural end; missing
  file; play() refusal; error then Skip; start and stall timeouts; stall recovery;
  everything racing at once. The video is released once and no listeners remain.
- `npm run audio` (real Chromium, real Web Audio, every buffer source recorded on the audio clock):
  start → intro → menu silent and SFX-free; all samples decode; UI, shuffle, pickup and slap
  samples; prologue knocks and cancellation; the chapter-6 motif sample-exact; rapid advance with
  zero ghost starts; resume without replay; mute / SFX 0 / background / foreground; blocked files;
  rapid scene changes (≤ 1 music, ≤ 2 beds); bed loops measured with the browser's decoder.
- `npm run e2e` section 7, using a generated WebM credit:
  - no-video start, video played out, and double-click start + mute + double Skip + Escape;
  - 404, play() refusal and a hanging download;
  - mobile tap start, background/foreground and reload;
  - gameplay → results → rematch → pause → restart, with reset during sounds.
  - Throughout: at most **one** media source playing at any sampled moment, the
    menu mounted **once**, and **no unhandled promise rejections**.
- **Not possible here:** listening. This environment has no audio output, so headphone and
  speaker checks, loudness by ear and seam auditions are **not done**. They're the owner's next step.
