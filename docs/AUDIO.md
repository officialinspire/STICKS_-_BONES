# Startup, intro and audio

## Startup flow (`src/ui/intro-screen.ts`, `src/app/intro.ts`)

```
start screen ──tap / click / any key──► studio intro (if supplied) ──► fade through black ──► menu
                                         Skip · Esc · ended · error · start/stall/overall timeout · play() refused
```

- **Start gesture:** a touch, click or key press. It unlocks audio (the
  AudioContext is created inside the gesture) and plays **no sound of its own**.
  Double clicks and key repeats can't start twice.
- **Intro video:** the owner's `assets/video/inspiresoftwareintro.mp4` is used
  **if present**. It is **not in the repository yet**, so today the start screen
  fades straight to the menu. The file is picked up by a build-time glob, so
  adding it later needs no code change.
  - The video is buffered (`preload="auto"`) while the start screen waits.
  - It plays inline (`playsinline`) with an accessible **Skip intro** button
    (focused, Esc also skips) and a **Mute** toggle (persisted).
- **One guarded transition:** `IntroController.finish(reason)` handles Skip, ended,
  error, a start timeout (6 s), a stall timeout (5 s), an overall cap (duration +
  3 s, max 45 s), play() refusal and a missing file. The first one wins.
  - Later signals are ignored, listeners and timers are removed, and the video is
    paused and released (`src` removed) before the fade.
  - So the credit's audio can never overlap menu music, and the menu is entered
    exactly once.
- **Startup preloads:** the menu backdrop and portrait, plus only the metadata of
  the menu track. Gameplay music loads when a table opens.

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
| results | gameplay track, ducked to 70% | on | the table bed at 60% |

**Story profiles** (`src/audio/profiles.ts`): each story scene names one track (or none) and
one bed, for its dialogue and for its hand.

| Scene | Dialogue | Hand |
| --- | --- | --- |
| Prologue (dream) | no music · cave bed, very low | — |
| 1 Patio | patio track at 45% · patio bed | table track · patio bed |
| 2 Alley + phone call | no music · patio bed, low | table track · patio bed |
| 3 Resort | no music · dining-room murmur | table track, low |
| 4 Promenade | **no music** · surf (swells on "Let the surf hold the silence") | no music · surf |
| 5 Jungle | **no music** · close forest bed | no music |
| 6 Cave | **no music** · cave water bed | no music · cave bed, lower |
| 7 Terrace | no music · restaurant murmur (polished, uncomfortable) | table track, thin |
| Epilogue | patio track at 40% · patio bed; it fades away on "The water goes still." | table track |

There is no constant ominous music anywhere: the supernatural scenes run on ambience and silence
until the commissioned beds exist (`docs/MUSIC_BRIEFS.md`).

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

**Missing or broken files:** a play() refusal or file error leaves the scene silent,
without retrying a broken file. A missing bed is silence; a missing SFX sample uses the
placeholder. Absent files resolve to no URL at build time.

**Focus and visibility:**

- Hidden tab or `pagehide`: music pauses, SFX and cue voices are cut, the bed stops and the
  context is suspended.
- Back in focus, **only the current scene** resumes (its track and bed).

**Offline:** the short SFX are precached with the images (they're small and make the table feel
right offline). Music, ambience beds and video are never cached.

**Haptics** (`src/audio/haptics.ts`): feature-detected `navigator.vibrate`. There's a
setting, shown only where supported, for short cues on place, knock and domino.
Haptics only follow public events.

**Voice:** no recorded voice exists. Cousin speaks through the bubble subtitle,
the live region and his expressions. The voice level is kept for when recordings
arrive.

## What is real and what is placeholder

| Audio | Source | Status |
| --- | --- | --- |
| Menu/results music | `assets/audio/music/Patio Dominoes (Take 2).mp3` (owner upload, artist "officialinspire") | **final, approved** |
| Gameplay music | `assets/audio/music/Domino Table (Subtle Vibe).mp3` (owner upload) | **final, approved** |
| UI sounds | Kenney Interface Sounds (CC0), `assets/audio/sfx/ui-*.wav` | selected samples, **not final** (awaiting the owner's listen) |
| Tile sounds | Kenney Casino Audio chips/cards (CC0) | **stand-ins** until real dominoes are recorded |
| Pass knock, story knocks, drops, glass | BigSoundBank (CC0) | selected samples, **not final** |
| Ambience beds (patio, promenade, jungle, cave, terrace) | BigSoundBank field recordings (CC0), looped | selected, seams **machine-measured, not auditioned** |
| Synthesized SFX (`src/audio/synth.ts`) | code | **fallback only** (decoding / missing file) |
| Night-investigation bed, cave suspense bed, stingers | — | **missing**: briefs in `docs/MUSIC_BRIEFS.md` |
| Contractor speaker voice and cough; trail voice | — | **missing**: caption only, never impersonated |
| Studio intro | `assets/video/inspiresoftwareintro.mp4` | **not supplied yet** (the fallback fades to the menu) |

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
