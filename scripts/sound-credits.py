#!/usr/bin/env python3
"""Writes docs/SOUND_SOURCES.md from src/assets/sound-manifest.json (run by scripts/build-audio.py;
also runnable alone). Never edit SOUND_SOURCES.md by hand: change the build and regenerate."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = json.load(open(os.path.join(ROOT, 'src/assets/sound-manifest.json')))
owner = json.load(open(os.path.join(ROOT, 'src/assets/owner-audio.json')))
packs = {}
for e in m['sfx'] + m['ambience']:
    packs.setdefault((e['pack'], e['creator'], e['license'], e['source']), []).append(e['id'])
L = ['# Sound sources and credits', '',
     '_Generated from `src/assets/sound-manifest.json` and `src/assets/owner-audio.json` by `scripts/sound-credits.py`. Do not edit by hand._', '',
     'Two kinds of runtime audio, both **derivatives** with their edits recorded per file:',
     '- the owner\'s own uploads (artist "officialinspire"): originals kept untouched in `assets/audio/originals/`',
     '  (`scripts/build-owner-audio.py`; see "Owner recordings and music" below);',
     '- public CC0 1.0 recordings (originals not in the repository; `scripts/build-audio.py`).',
     'CC0 needs no attribution; it is given anyway. Licences were read from each pack\'s own licence text',
     '(Kenney: `License.txt` inside the zip; BigSoundBank: each sound\'s page, "Free and royalty-free / CC0").',
     'Freesound was **not** used: its terms vary per sound and per API use, and nothing was assumed.', '',
     '**Nothing here is final.** `final: false` on every entry. The slam and the shuffle/deal are the owner\'s',
     'recordings of real dominoes; the other tile sounds are still casino-chip/card stand-ins. Bed seams and the',
     'cue cuts are machine-measured, not yet auditioned by ear.', '',
     '## Packs and recordings', '', '| Source | Creator | Licence | Used for |', '| --- | --- | --- | --- |']
for (pack, creator, lic, src), ids in packs.items():
    L.append(f'| [{pack}]({src}) | {creator} | {lic} | {", ".join(f"`{i}`" for i in ids)} |')
L += ['', '## Sound effects', '', '| id | Purpose | Source file | Edits | Bytes |', '| --- | --- | --- | --- | --- |']
for e in m['sfx']:
    L.append(f'| `{e["id"]}` | {e["purpose"]} | {e["sourceFile"]} | {e["edits"]} | {e["bytes"]:,} |')
L += ['', '## Ambience beds', '', '| id | Purpose | Source file | Edits | LUFS | Seam (spectral pct / wrap-step pct) | Auditioned |', '| --- | --- | --- | --- | --- | --- | --- |']
for e in m['ambience']:
    L.append(f'| `{e["id"]}` | {e["purpose"]} | {e["sourceFile"]} | {e["edits"]} | {e["lufs"]} | {e["seamPercentile"]} / {e.get("wrapStepPercentile", "—")} | {"yes" if e["auditioned"] else "**no**"} |')
L += ['', '## Owner recordings and music', '', '| id | Kind | Source (original, untouched) | Edits | Bytes | Loudness |', '| --- | --- | --- | --- | --- | --- |']
for kind in ('sfx', 'music', 'cues'):
    for e in owner[kind]:
        lufs = f'{e["integratedLufs"]} LUFS' if e.get('integratedLufs') is not None else f'peak {e["samplePeakDbfs"]} dBFS'
        L.append(f'| `{e["id"]}` | {kind} | `{e["source"].split("/")[-1]}` (sha256 `{e["sourceSha256"][:12]}…`) | {e["edits"]} | {e["bytes"]:,} | {lufs}, TP {e["truePeakDbtp"]} dBTP |')
L += ['', 'Uploads kept as originals but not bundled:', '']
for o in owner['originals']:
    if o['role'] in ('alternative', 'duplicate'):
        L.append(f'- `{o["file"].split("/")[-1]}`: {o["role"]} for `{o["for"]}`' + (f' (decoded audio identical to `{o["duplicateOf"].split("/")[-1]}`)' if o.get('duplicateOf') else ''))
L += ['', '## Not supplied (no stand-in is used)', '',
      '| Sound | Why it is missing | What the game does |', '| --- | --- | --- |',
      '| The contractor speaker\'s recorded voice and repeating cough (Chapter 6) | A voice recording would have to be authored or performed; impersonating one is out of bounds | Caption only (the script\'s own lines) |',
      '| The voice from the empty trail (Chapter 5) | Same | Caption only |',
      '| Case-complete music (and the optional chapter-card cue) | Not supplied: `docs/MUSIC_BRIEFS.md` | The end card is silent apart from the bed; nothing is fabricated |',
      '| Recorded foley for placing, picking up, sliding and drawing tiles | Only the slam and a multi-tile drop were recorded | Kenney casino chips/cards as stand-ins for those actions |', '']
open(os.path.join(ROOT, 'docs/SOUND_SOURCES.md'), 'w').write('\n'.join(L))
print('wrote docs/SOUND_SOURCES.md')
