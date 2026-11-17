#!/usr/bin/env python3
"""Writes docs/SOUND_SOURCES.md from src/assets/sound-manifest.json (run by scripts/build-audio.py;
also runnable alone). Never edit SOUND_SOURCES.md by hand: change the build and regenerate."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = json.load(open(os.path.join(ROOT, 'src/assets/sound-manifest.json')))
packs = {}
for e in m['sfx'] + m['ambience']:
    packs.setdefault((e['pack'], e['creator'], e['license'], e['source']), []).append(e['id'])
L = ['# Sound sources and credits', '',
     '_Generated from `src/assets/sound-manifest.json` by `scripts/sound-credits.py`. Do not edit by hand._', '',
     'Every runtime sound effect and ambience bed is a **derivative** of a public CC0 1.0 recording. The',
     'originals are untouched and are not in the repository; the edits made are recorded per file below.',
     'CC0 needs no attribution; it is given anyway. Licences were read from each pack\'s own licence text',
     '(Kenney: `License.txt` inside the zip; BigSoundBank: each sound\'s page, "Free and royalty-free / CC0").',
     'Freesound was **not** used: its terms vary per sound and per API use, and nothing was assumed.', '',
     '**Nothing here is final.** `final: false` on every entry. Tile sounds are casino-chip/card stand-ins',
     'until a real double-six set is recorded; bed seams are machine-measured, not yet auditioned by ear.', '',
     '## Packs and recordings', '', '| Source | Creator | Licence | Used for |', '| --- | --- | --- | --- |']
for (pack, creator, lic, src), ids in packs.items():
    L.append(f'| [{pack}]({src}) | {creator} | {lic} | {", ".join(f"`{i}`" for i in ids)} |')
L += ['', '## Sound effects', '', '| id | Purpose | Source file | Edits | Bytes |', '| --- | --- | --- | --- | --- |']
for e in m['sfx']:
    L.append(f'| `{e["id"]}` | {e["purpose"]} | {e["sourceFile"]} | {e["edits"]} | {e["bytes"]:,} |')
L += ['', '## Ambience beds', '', '| id | Purpose | Source file | Edits | LUFS | Seam (spectral pct / wrap-step pct) | Auditioned |', '| --- | --- | --- | --- | --- | --- | --- |']
for e in m['ambience']:
    L.append(f'| `{e["id"]}` | {e["purpose"]} | {e["sourceFile"]} | {e["edits"]} | {e["lufs"]} | {e["seamPercentile"]} / {e.get("wrapStepPercentile", "—")} | {"yes" if e["auditioned"] else "**no**"} |')
L += ['', '## Not supplied (no stand-in is used)', '',
      '| Sound | Why it is missing | What the game does |', '| --- | --- | --- |',
      '| The contractor speaker\'s recorded voice and repeating cough (Chapter 6) | A voice recording would have to be authored or performed; impersonating one is out of bounds | Caption only (the script\'s own lines) |',
      '| The voice from the empty trail (Chapter 5) | Same | Caption only |',
      '| Night-investigation bed, cave suspense bed, case/round stingers | Original music to be commissioned: `docs/MUSIC_BRIEFS.md` | Silence plus the scene\'s ambience bed |',
      '| Recorded domino foley (real tiles on wood) | Not available as CC0 | Kenney casino chips/cards as stand-ins |', '']
open(os.path.join(ROOT, 'docs/SOUND_SOURCES.md'), 'w').write('\n'.join(L))
print('wrote docs/SOUND_SOURCES.md')
