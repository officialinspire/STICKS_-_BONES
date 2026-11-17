# Sound sources and credits

_Generated from `src/assets/sound-manifest.json` by `scripts/sound-credits.py`. Do not edit by hand._

Every runtime sound effect and ambience bed is a **derivative** of a public CC0 1.0 recording. The
originals are untouched and are not in the repository; the edits made are recorded per file below.
CC0 needs no attribution; it is given anyway. Licences were read from each pack's own licence text
(Kenney: `License.txt` inside the zip; BigSoundBank: each sound's page, "Free and royalty-free / CC0").
Freesound was **not** used: its terms vary per sound and per API use, and nothing was assumed.

**Nothing here is final.** `final: false` on every entry. Tile sounds are casino-chip/card stand-ins
until a real double-six set is recorded; bed seams are machine-measured, not yet auditioned by ear.

## Packs and recordings

| Source | Creator | Licence | Used for |
| --- | --- | --- | --- |
| [Kenney — Interface Sounds 1.0](https://opengameart.org/content/interface-sounds) | Kenney (Kenney Vleugels) | CC0 1.0 | `ui-select-1`, `ui-select-2`, `ui-back-1`, `ui-back-2`, `ui-confirm-1`, `ui-confirm-2`, `ui-invalid-1` |
| [Kenney — Casino Audio 1.1](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) | Kenney (Kenney Vleugels) | CC0 1.0 | `tile-pickup-1`, `tile-pickup-2`, `tile-pickup-3`, `tile-place-1`, `tile-place-2`, `tile-place-3`, `tile-slide-1`, `tile-slide-2`, `tile-slide-3`, `tile-slap-1`, `tile-slap-2`, `tile-shuffle-1`, `tile-draw-1`, `tile-draw-2` |
| [BigSoundBank #0374 “Knock on a light door”](https://bigsoundbank.com/knock-on-a-light-door-s0374.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `pass-knock-1`, `pass-knock-2` |
| [BigSoundBank #0095 “Door Knock”](https://bigsoundbank.com/door-knock-s0095.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `motif-knock-1`, `motif-knock-2`, `motif-knock-3`, `motif-knock-beyond` |
| [BigSoundBank #1386 “Drops of Water #3”](https://bigsoundbank.com/drops-of-water-3-s1386.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `water-drop-1`, `water-drop-2` |
| [BigSoundBank #1204 “Glass, Placed on Table”](https://bigsoundbank.com/glass-placed-on-table-s1204.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `glass-1` |
| [BigSoundBank #2969 “Outside Talks #2”](https://bigsoundbank.com/outside-talks-2-s2969.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `amb-patio` |
| [BigSoundBank #1046 “Small Waves Facing the Ocean”](https://bigsoundbank.com/small-waves-facing-the-ocean-s1046.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `amb-promenade` |
| [BigSoundBank #2749 “Forest #4”](https://bigsoundbank.com/forest-4-s2749.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `amb-jungle` |
| [BigSoundBank #2136 “Cave #2”](https://bigsoundbank.com/cave-2-s2136.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `amb-cave` |
| [BigSoundBank #3542 “Small Restaurant Conversations”](https://bigsoundbank.com/small-restaurant-conversations-s3542.html) | Joseph Sardin (BigSoundBank) | CC0 1.0 (“Free and royalty-free”) | `amb-terrace` |

## Sound effects

| id | Purpose | Source file | Edits | Bytes |
| --- | --- | --- | --- | --- |
| `ui-select-1` | soft select | select_001.ogg | trim 0s +0.04s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 2,018 |
| `ui-select-2` | soft select | select_002.ogg | trim 0s +0.04s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 2,018 |
| `ui-back-1` | back | back_001.ogg | trim 0s +0.06s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 3,006 |
| `ui-back-2` | back | back_002.ogg | trim 0s +0.07s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 3,292 |
| `ui-confirm-1` | confirm | confirmation_001.ogg | trim 0s +0.29s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 13,990 |
| `ui-confirm-2` | confirm | confirmation_002.ogg | trim 0s +0.54s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 25,950 |
| `ui-invalid-1` | restrained invalid action | bong_001.ogg | trim 0s +0.12s; lowpass=f=2400; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 5,836 |
| `tile-pickup-1` | tile pickup (stand-in: chips) | chips-handle-1.ogg | trim 0s +0.35s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 16,878 |
| `tile-pickup-2` | tile pickup (stand-in: chips) | chips-handle-2.ogg | trim 0s +0.35s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 16,570 |
| `tile-pickup-3` | tile pickup (stand-in: chips) | chips-handle-3.ogg | trim 0s +0.35s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 10,980 |
| `tile-place-1` | tile placement (stand-in: chip lay) | chip-lay-1.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 8,220 |
| `tile-place-2` | tile placement (stand-in: chip lay) | chip-lay-2.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 10,978 |
| `tile-place-3` | tile placement (stand-in: chip lay) | chip-lay-3.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 12,826 |
| `tile-slide-1` | tile slide (stand-in: card slide) | card-slide-1.ogg | trim 0s +0.45s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 21,678 |
| `tile-slide-2` | tile slide (stand-in: card slide) | card-slide-2.ogg | trim 0s +0.45s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 21,678 |
| `tile-slide-3` | tile slide (stand-in: card slide) | card-slide-3.ogg | trim 0s +0.45s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 21,678 |
| `tile-slap-1` | emphatic slap (stand-in: chips collide) | chips-collide-1.ogg | trim 0s +0.50s; bass=g=4:f=180; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 12,360 |
| `tile-slap-2` | emphatic slap (stand-in: chips collide) | chips-collide-2.ogg | trim 0s +0.50s; bass=g=4:f=180; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 10,978 |
| `tile-shuffle-1` | shuffle (stand-in: chips) | chips-collide-3.ogg | trim 0s +1.20s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 12,360 |
| `tile-draw-1` | draw from the boneyard (stand-in: chips) | chips-handle-4.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 17,188 |
| `tile-draw-2` | draw from the boneyard (stand-in: chips) | chips-handle-5.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 19,278 |
| `pass-knock-1` | pass knock on the table | 0374.ogg | trim 0.035s +0.30s; lowpass=f=4000; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 14,110 |
| `pass-knock-2` | pass knock on the table | 0374.ogg | trim 4.06s +0.30s; lowpass=f=4000; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 14,478 |
| `motif-knock-1` | motif knock (1–3) | 0095.ogg | trim 0.155s +0.50s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 24,366 |
| `motif-knock-2` | motif knock (1–3) | 0095.ogg | trim 2.21s +0.50s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 24,078 |
| `motif-knock-3` | motif knock (1–3) | 0095.ogg | trim 9.54s +0.50s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 24,462 |
| `motif-knock-beyond` | the fourth knock, answering from beyond | 0095.ogg | trim 0.155s +1.40s; apad=pad_dur=1,lowpass=f=1100,aecho=0.6:0.5:90|170:0.35|0.22; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 123,742 |
| `water-drop-1` | cave drop accent | 1386.flac | trim 0.14s +0.45s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 21,692 |
| `water-drop-2` | cave drop accent | 1386.flac | trim 4.49s +0.45s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 21,692 |
| `glass-1` | terrace glassware detail | 1204.flac | trim 0.19s +0.60s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 28,892 |

## Ambience beds

| id | Purpose | Source file | Edits | LUFS | Seam (spectral pct / wrap-step pct) | Auditioned |
| --- | --- | --- | --- | --- | --- | --- |
| `amb-patio` | Neighborhood patio: social, distant voices | 2969.flac | window 20s–62s; highpass=f=90; 3 s equal-power tail→head cross-fade loop (exact length 42 s); one static gain to −30 LUFS (peak ≤ −6 dBFS); stereo MP3 | -30.4 | 33.2 / 97.5 | **no** |
| `amb-promenade` | Promenade: open space and surf | 1046.flac | window 30s–74s; highpass=f=40; 3 s equal-power tail→head cross-fade loop (exact length 44 s); one static gain to −30 LUFS (peak ≤ −6 dBFS); stereo MP3 | -30.3 | 76.0 / 79.8 | **no** |
| `amb-jungle` | Jungle camp: close, humid (no generic roaring loop) | 2749.flac | window 60s–100s; highpass=f=120; 3 s equal-power tail→head cross-fade loop (exact length 40 s); one static gain to −30 LUFS (peak ≤ −6 dBFS); stereo MP3 | -30.2 | 34.2 / 60.5 | **no** |
| `amb-cave` | Cave: water and room for silence | 2136.flac | window 10s–52s; highpass=f=40; 3 s equal-power tail→head cross-fade loop (exact length 42 s); one static gain to −30 LUFS (peak ≤ −6 dBFS); stereo MP3 | -36.2 | 88.8 / 89.8 | **no** |
| `amb-terrace` | Corporate terrace: polished, slightly uncomfortable room | 3542.flac | window 30s–70s; highpass=f=110,treble=g=-3; 3 s equal-power tail→head cross-fade loop (exact length 40 s); one static gain to −30 LUFS (peak ≤ −6 dBFS); stereo MP3 | -30.7 | 48.5 / 73.6 | **no** |

## Not supplied (no stand-in is used)

| Sound | Why it is missing | What the game does |
| --- | --- | --- |
| The contractor speaker's recorded voice and repeating cough (Chapter 6) | A voice recording would have to be authored or performed; impersonating one is out of bounds | Caption only (the script's own lines) |
| The voice from the empty trail (Chapter 5) | Same | Caption only |
| Night-investigation bed, cave suspense bed, case/round stingers | Original music to be commissioned: `docs/MUSIC_BRIEFS.md` | Silence plus the scene's ambience bed |
| Recorded domino foley (real tiles on wood) | Not available as CC0 | Kenney casino chips/cards as stand-ins |
