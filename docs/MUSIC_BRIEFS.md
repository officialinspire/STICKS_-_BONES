# Music briefs: missing cues for NO REST FOR COUSIN

These are copy-ready briefs for **original** music, to be commissioned or composed.
They name instruments, moods and constraints, not other artists: do not imitate,
quote or "sound like" any existing artist or recording.

No music has been generated or faked. Until each piece is delivered and approved, the
game uses the two approved tracks ("Patio Dominoes (Take 2)", "Domino Table (Subtle
Vibe)") where they fit, and **silence plus the scene's ambience bed** where they don't.
Silence is the intended fallback, not a defect.

## Delivery specs (all cues)

- **Format:** 48 kHz / 24-bit WAV master, plus a 44.1 kHz stereo MP3 at 192 kbps or more
  for the build.
- **Loudness:**
  - beds: integrated −20 to −23 LUFS, true peak ≤ −1 dBTP, quiet enough to sit under
    dialogue captions and the ambience bus;
  - stingers: about −18 LUFS.
- **Loops:**
  - Deliver an **edited loop** whose end flows into its start (no reverb tail cut off),
    with the loop points in the file name or a note.
  - Also deliver an ending version.
  - Loops will be **auditioned by ear** before they're accepted (`dev/audio-audition.html`).
- **No vocals or spoken words.** The story's knocks and the fake speaker are separate
  sound effects; music must never contain knocks or a repeating voice-like figure, so
  they're never confused.
- **Licensing:** the composer grants the owner (INSPIRE) a perpetual, worldwide licence
  to use and distribute the work in STICKS & BONES on the web and as an installable app,
  including modification, looping and trimming. Credit text supplied by the composer.

---

## 1. Night-investigation bed: "Promenade After Dark"

- **Used in:** Chapter 4 (moonlit promenade, Day 1 night), and optionally under Chapter 2's
  phone call at a lower level.
- **Length:** a 75–100 s loop plus a 20 s ending.
- **Tempo / feel:** about 76–84 BPM, unhurried, with space between phrases. The surf bed
  sits underneath, so leave the low-mids open.
- **Instrumentation:**
  - nylon-string guitar (fingerpicked, sparse);
  - soft brushed cajón or a muted hand drum on a slow pulse;
  - a sustained low pad or bowed bass note;
  - an occasional muted cuatro figure, used sparingly (rhythmic punctuation, not a
    melody showcase).
- **Mood:** late-night conversation by the water: warm, curious, a little uneasy, never
  "spooky". Two people talking quietly while something unexplained is just out of
  frame.
- **Arc:** the opening 30 s are the barest. A gentle lift around the middle (one added
  harmony line) settles back without a big climax.
- **Avoid:**
  - horror stings, risers or braams;
  - constant tremolo strings;
  - anything that reads as a party.

## 2. Cave suspense bed: "The Lit Threshold"

- **Used in:** Chapter 6 (secret cave waterfall platform), from the modern walkway scenes
  up to the "Cut to the entrance rest area" beat. Optionally under the prologue's dream
  at a very low level.
- **Length:** a 90–120 s loop plus a 25 s ending that resolves softly (to be used when
  "the lifted water lowers").
- **Tempo / feel:** effectively unpulsed: slow-moving harmony, with long notes swelling
  and receding like breath.
- **Instrumentation:**
  - a low drone (bowed or synth) that leaves room for real water;
  - glassy, sparse high tones (bowed metal, soft harmonics);
  - a single warm motif (3–4 notes) on a mellow instrument such as vibraphone, nylon
    guitar harmonics or a soft horn. It suggests the **warm line of light**: hopeful, not
    threatening.
- **Mood:** awe and unease together; something is asking, not attacking. Leave **silence
  between phrases**: the cave's water and the authored knocks must be heard.
- **Constraints:**
  - nothing rhythmic that could be mistaken for knocking;
  - no low-frequency booms;
  - no sudden dynamic jumps (the knocks are captioned and must stay the loudest sudden
    events).
- **Avoid:**
  - "tribal" drums;
  - pseudo-indigenous flutes or chants;
  - imitation ceremonial music.

  The site and presence are fictional and must not be scored with borrowed sacred or
  cultural signifiers.

## 3. Short cues (stingers)

| Cue | Length | Brief |
| --- | --- | --- |
| **Round won** (`round-win`) | 1.5–2.5 s | A bright, short guitar-and-percussion flourish. A friendly table moment, not a fanfare. Ends on a ringing chord with a natural decay of at most 1 s. |
| **Round lost / blocked tie** (`round-other`) | 1.5–2.5 s | A wry, warm two-chord shrug (guitar or muted keys). Must not sound like failure music: every result advances the story. |
| **Case complete** (`case-complete`) | 6–10 s | Warm, settled resolution for the epilogue's end card. It may quote the cave motif's 3–4 notes, now resolved. Soft and confident, not triumphant. Ends cleanly. |
| **Chapter card** (`chapter-card`, optional) | 1–1.5 s | A single soft guitar arpeggio or plucked-string figure under the chapter title card. Must work under the scene's ambience bed. |

## How they will be wired

The central `AudioManager` plays at most one music track at a time. It fades out and
stops the old track before starting the next, and story profiles name which track (if
any) each scene uses (`src/audio/profiles.ts`).

When these cues are delivered:
1. Add them to `src/assets/audio-manifest.ts` with measured loudness and hashes.
2. Set the matching profile entries.
3. Audition the loop seams by ear.
4. Record the audition in the manifest (`auditioned: true`).
