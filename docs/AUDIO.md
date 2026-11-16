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

**Scenes are exclusive:**

| Scene | Music | SFX | Ambience |
| --- | --- | --- | --- |
| init | — | off | off |
| intro | — (the video has its own sound) | **off** | off |
| menu | menu track | on | off |
| gameplay | gameplay track | on | on if enabled |
| paused | gameplay track, ducked to 35% | off | off |
| results | gameplay track, ducked to 70% | on | on if enabled |

**One music source:**

- A track change fades the old track out (0.45 s) and pauses it **before** the next
  starts (0.9 s fade-in). There's no crossfade overlap.
- Paused and results duck the current track instead of starting another.

**Guards:**

- Each scene change bumps a token. Fade timers, play() promises and restarts carry
  their token and are dropped if it moved (`stats.staleDropped`).
- `reset()` (restart or leaving a table) cancels pending work and cuts SFX.

**Unlock:** nothing plays, and no AudioContext exists, until the first gesture. A
later gesture re-unlocks if the browser suspended audio.

**Levels:**

- master, music, sfx, voice and ambience (0–100), plus **mute**, all persisted with
  settings.
- Mute is never undone by resume, focus or scene changes. Muting during the intro
  carries into the menu.
- Tracks get loudness-normalisation gain towards −20 LUFS (Patio −2.7 dB,
  Domino Table −0.6 dB, from measured integrated loudness).

**SFX limits:** per-sound instance limits (place 3, knock 2, draw 2, slam 1, tap 2)
and a global cap of 6. Extra sounds are dropped, not queued.

**Missing or broken files:** a play() refusal or file error leaves the scene silent,
without retrying a broken file. Absent files resolve to no URL at build time.

**Focus and visibility:**

- Hidden tab or `pagehide`: music pauses, SFX are cut, ambience stops and the
  context is suspended.
- Back in focus, **only the current scene** resumes.

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
| SFX: place, knock, draw, slam, tap | synthesized in code (`src/audio/synth.ts`) | **placeholder** — replace with approved files |
| Patio ambience | synthesized low-passed noise bed, off by default | **placeholder** |
| Studio intro | `assets/video/inspiresoftwareintro.mp4` | **not supplied yet** |
| Voice | — | none; subtitles only |

No unlicensed or stock audio is used anywhere.

## Loop points: analysed, not assumed

Both tracks are complete songs with composed endings.

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

**Candidates** are stored with `auditioned: false`. The owner can listen on the
dev page **`/dev/audio-audition.html`**, which plays the runtime restart seam and
each candidate's join. Only a person's approval (editing the manifest) should
change the policy. The placeholder ambience loop is seamless by construction (its
tail is crossfaded into its head), which a unit test checks.

## Verification

- `src/audio/manager.test.ts` (11): unlock gating; no overlap on scene switches;
  rapid scene changes and stale play() drops; ducking; a silent intro with no SFX;
  restart after ending, dropped if the scene changed; rejection, missing and broken
  files; mute persistence; background/foreground resuming only the current scene;
  SFX caps and reset; ambience following settings and scene.
- `src/app/intro.test.ts` (8): Skip vs late ended/error/timer; natural end; missing
  file; play() refusal; error then Skip; start and stall timeouts; stall recovery;
  everything racing at once. The video is released once and no listeners remain.
- `src/audio/synth.test.ts`: the ambience loop is continuous and within peak limits.
- `npm run e2e` section 7, using a generated WebM credit:
  - no-video start, video played out, and double-click start + mute + double Skip + Escape;
  - 404, play() refusal and a hanging download;
  - mobile tap start, background/foreground and reload;
  - gameplay → results → rematch → pause → restart, with reset during sounds.
  - Throughout: at most **one** media source playing at any sampled moment, the
    menu mounted **once**, and **no unhandled promise rejections**.
