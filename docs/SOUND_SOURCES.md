# Sound sources and credits

_Generated from `src/assets/sound-manifest.json` and `src/assets/owner-audio.json` by `scripts/sound-credits.py`. Do not edit by hand._

Two kinds of runtime audio, both **derivatives** with their edits recorded per file:
- the owner's own uploads (artist "officialinspire"): originals kept untouched in `assets/audio/originals/`
  (`scripts/build-owner-audio.py`; see "Owner recordings and music" below);
- public CC0 1.0 recordings (originals not in the repository; `scripts/build-audio.py`).
CC0 needs no attribution; it is given anyway. Licences were read from each pack's own licence text
(Kenney: `License.txt` inside the zip; BigSoundBank: each sound's page, "Free and royalty-free / CC0").
Freesound was **not** used: its terms vary per sound and per API use, and nothing was assumed.

**Nothing here is final.** `final: false` on every entry. The slam and the shuffle/deal are the owner's
recordings of real dominoes; the other tile sounds are still casino-chip/card stand-ins. Bed seams and the
cue cuts are machine-measured, not yet auditioned by ear.

## Packs and recordings

| Source | Creator | Licence | Used for |
| --- | --- | --- | --- |
| [Kenney — Interface Sounds 1.0](https://opengameart.org/content/interface-sounds) | Kenney (Kenney Vleugels) | CC0 1.0 | `ui-select-1`, `ui-select-2`, `ui-back-1`, `ui-back-2`, `ui-confirm-1`, `ui-confirm-2`, `ui-invalid-1` |
| [Kenney — Casino Audio 1.1](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) | Kenney (Kenney Vleugels) | CC0 1.0 | `tile-pickup-1`, `tile-pickup-2`, `tile-pickup-3`, `tile-place-1`, `tile-place-2`, `tile-place-3`, `tile-draw-1`, `tile-draw-2` |
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
| `tile-draw-1` | draw from the boneyard (stand-in: chips) | chips-handle-4.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 17,188 |
| `tile-draw-2` | draw from the boneyard (stand-in: chips) | chips-handle-5.ogg | trim 0s +0.40s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 19,278 |
| `pass-knock-1` | pass knock on the table | 0374.ogg | trim 0.035s +0.30s; lowpass=f=4000; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 14,110 |
| `pass-knock-2` | pass knock on the table | 0374.ogg | trim 4.06s +0.30s; lowpass=f=4000; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 14,478 |
| `motif-knock-1` | motif knock (1–3) | 0095.ogg | trim 0.155s +0.50s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 24,366 |
| `motif-knock-2` | motif knock (1–3) | 0095.ogg | trim 2.21s +0.50s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 24,078 |
| `motif-knock-3` | motif knock (1–3) | 0095.ogg | trim 9.54s +0.50s; no EQ; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 24,462 |
| `motif-knock-beyond` | the fourth knock, answering from beyond | 0095.ogg | trim 0.155s +1.40s; lowpass=f=1100,aecho=0.6:0.5:90|170:0.35|0.22; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16 | 75,742 |
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

## Owner recordings and music

| id | Kind | Source (original, untouched) | Edits | Bytes | Loudness |
| --- | --- | --- | --- | --- | --- |
| `tile-slam-owner-1` | sfx | `Clear Crisp Slap as Domino Is Slammed onto Table Take 1.mp3` (sha256 `25f553c3e23c…`) | start 0.4226s (attack −2 ms), end 0.5850s (last 5 ms RMS ≥ −72 dB re peak, +10 ms); 1 ms fade-in, 6 ms cosine fade-out; mono sum; -2.38 dB to −3 dBFS peak; 48 kHz PCM16 (2.66 % of energy above 12 kHz) | 15,634 | peak -3.0 dBFS, TP -3.0 dBTP |
| `tile-slam-owner-2` | sfx | `Crisp Slap as Domino Is Slammed onto Table.mp3` (sha256 `289bb262b9a2…`) | start 0.4225s (attack −2 ms), end 0.5250s (last 5 ms RMS ≥ −72 dB re peak, +10 ms); 1 ms fade-in, 6 ms cosine fade-out; mono sum; -3.10 dB to −3 dBFS peak; 48 kHz PCM16 (2.15 % of energy above 12 kHz) | 9,886 | peak -3.0 dBFS, TP -2.9 dBTP |
| `tile-drop-owner-1` | sfx | `Few Dominos Being Dropped onto Table Take 1.mp3` (sha256 `0b249bcb163b…`) | start 0.4246s (attack −2 ms), end 1.1100s (last 5 ms RMS ≥ −72 dB re peak, +10 ms); 1 ms fade-in, 6 ms cosine fade-out; mono sum; +6.41 dB to −3 dBFS peak; 24 kHz PCM16 (0.27 % of energy above 12 kHz) | 32,944 | -25.4 LUFS, TP -3.0 dBTP |
| `promenade` | music | `Promenade After Dark.mp3` (sha256 `7c5f42cd0881…`) | stream copy of the MPEG audio (no re-encode); cover art and tags removed; bit-exact muxing; decoded audio identical to the original | 2,842,752 | -18.0 LUFS, TP -0.4 dBTP |
| `threshold` | music | `The Lit Threshold (Alt).mp3` (sha256 `845c23ca38d5…`) | stream copy of the MPEG audio (no re-encode); cover art and tags removed; bit-exact muxing; decoded audio identical to the original | 2,620,032 | -15.3 LUFS, TP -0.8 dBTP |
| `result-win` | cues | `Round Win (Puerto Rico Vibe).mp3` (sha256 `e64fdd9e2abb…`) | source 57.350–59.300s: the most accented onset 2.0 beats (beat 0.565s) before the final hit at 58.491s, decay 0.81s (natural end 59.30s, capped at 1 s) with a 0.35s cosine fade-out; 10 ms pre-roll, 5 ms fade-in; -2.40 dB static gain (−18 LUFS target, ≤ −1 dBTP measured on the encoded file); 48 kHz stereo MP3 192 kbps | 48,384 | -18.3 LUFS, TP -4.6 dBTP |
| `result-other` | cues | `Round Other (Musical Shrug).mp3` (sha256 `7fa40adda930…`) | source 58.139–59.917s: the most accented onset 2.48 beats (beat 0.309s) before the final hit at 58.917s, decay 1.00s (natural end 61.10s, capped at 1 s) with a 0.35s cosine fade-out; 10 ms pre-roll, 5 ms fade-in; +2.90 dB static gain (−18 LUFS target, ≤ −1 dBTP measured on the encoded file); 48 kHz stereo MP3 192 kbps | 44,352 | -18.2 LUFS, TP -2.7 dBTP |

Uploads kept as originals but not bundled:

- `Promenade After Dark (Alt).mp3`: alternative for `promenade`
- `The Lit Threshold.mp3`: alternative for `threshold`
- `Round Win (Tropical Vibe).mp3`: alternative for `result-win`
- `Round Win Stinger.mp3`: alternative for `result-win`
- `Round Win Stinger (Alt).mp3`: alternative for `result-win`
- `Round Win Stinger (Alt)(1).mp3`: duplicate for `result-win` (decoded audio identical to `Round Win Stinger (Alt).mp3`)

## Not supplied (no stand-in is used)

| Sound | Why it is missing | What the game does |
| --- | --- | --- |
| The contractor speaker's recorded voice and repeating cough (Chapter 6) | A voice recording would have to be authored or performed; impersonating one is out of bounds | Caption only (the script's own lines) |
| The voice from the empty trail (Chapter 5) | Same | Caption only |
| Case-complete music (and the optional chapter-card cue) | Not supplied: `docs/MUSIC_BRIEFS.md` | The end card is silent apart from the bed; nothing is fabricated |
| Recorded foley for placing, picking up, sliding and drawing tiles | Only the slam and a multi-tile drop were recorded | Kenney casino chips/cards as stand-ins for those actions |
