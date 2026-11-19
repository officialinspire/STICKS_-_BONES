#!/usr/bin/env python3
"""
npm run audio:report — a measured "audition" of every runtime audio file, for builds where nobody can listen.

It decodes each shipped clip with ffmpeg (the same MP3/WAV files the game serves) and reports, per file:
  - integrated loudness (LUFS), loudness range and true peak (ffmpeg's EBU R128 meter);
  - leading / trailing near-silence (below -60 dBFS) — a trim that left dead air, or cut into the sound;
  - the first and last sample levels — a hard edge without a fade clicks;
  - for the ambience beds, the loop seam as the game plays it (src/audio/loop.ts: near-silent encoder padding
    trimmed, then the jump across the wrap relative to the bed's typical sample step, and the level change
    between the last and first 250 ms);
  - for the knock motif, onset alignment and level matching of the three measured knocks vs. the "beyond".

It FAILS on: a clipped file (true peak > -0.1 dBTP); dead air in an SFX or cue (digital silence below -90 dBFS:
> 20 ms before the sound, which delays it, or > 250 ms after: harmless after a fade, but waste — the
beyond knock carried 1.2 s until this check; the loudness normaliser's look-ahead leaves up to ~0.2 s); a cut-off tail (last sample above -40 dBFS: a
click where the sound stops); a bed seam jump > 8× the typical step or a > 3 dB level step across the wrap
(100 ms windows, ranked against the bed's own window-to-window changes: fails above the 99th percentile AND
3 dB); the three motif knocks differing by > 1.5 dB peak; or a result cue outside 1.5–2.5 s.
Integrated loudness needs 400 ms, so short clips report their RMS level instead. These are measurements, not listening: docs/AUDIO.md says which files were heard.

Requires ffmpeg and numpy. Writes test-results/audio-report/report.json and report.md.
"""
import json, os, re, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test-results', 'audio-report')
os.makedirs(OUT, exist_ok=True)
DIRS = {'sfx': 'assets/audio/sfx', 'cue': 'assets/audio/cues', 'bed': 'assets/audio/ambience', 'music': 'assets/audio/music'}
SR = 48000


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)


def r128(path):
    err = subprocess.run(['ffmpeg', '-v', 'info', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    summary = err[err.rfind('Summary:'):]
    num = lambda key: float(re.search(rf'{key}:\s+(-?[\d.]+|-inf)', summary).group(1).replace('-inf', '-120'))
    return {'lufs': num('I'), 'lra': num('LRA'), 'truePeak': num('Peak')}


def db(x):
    return float(20 * np.log10(max(float(x), 1e-9)))


def edges(a, thr=10 ** (-90 / 20)):
    mono = np.abs(a).max(axis=1)
    loud = np.nonzero(mono > thr)[0]
    if not len(loud):
        return 0.0, 0.0
    return loud[0] / SR * 1000, (len(mono) - 1 - loud[-1]) / SR * 1000


def seam(a):
    # As src/audio/loop.ts: trim near-silence (1e-4) at most 0.2 s at each end, then measure the wrap.
    mono = np.abs(a).max(axis=1)
    scan = min(int(SR * 0.2), len(a) // 4)
    s = 0
    while s < scan and mono[s] <= 1e-4:
        s += 1
    if s >= scan:
        s = 0
    e = len(a)
    while e > len(a) - scan and mono[e - 1] <= 1e-4:
        e -= 1
    if e <= len(a) - scan:
        e = len(a)
    body = a[s:e]
    typical = float(np.mean(np.abs(np.diff(body[::7], axis=0)))) or 1e-9
    jump = float(np.max(np.abs(body[0] - body[-1])))
    # Level across the wrap vs. the bed's own variation: 100 ms RMS windows over two passes of the loop; the
    # change at the wrap is ranked among every ordinary window-to-window change.
    w = int(SR * 0.1)
    two = np.concatenate([body, body])
    n = len(two) // w
    lv = np.array([db(np.sqrt(np.mean(two[i * w:(i + 1) * w] ** 2))) for i in range(n)])
    steps = np.abs(np.diff(lv))
    wrap_i = len(body) // w - 1  # the step whose windows straddle the wrap
    wrap = float(steps[wrap_i])
    pct = float(np.mean(steps < wrap) * 100)
    return {'trimHeadMs': s / SR * 1000, 'trimTailMs': (len(a) - e) / SR * 1000, 'jumpRatio': jump / typical, 'wrapStepDb': wrap, 'wrapPercentile': pct}


rows, failures = [], []
for kind, d in DIRS.items():
    for name in sorted(os.listdir(os.path.join(ROOT, d))):
        path = os.path.join(ROOT, d, name)
        a = decode(path)
        m = r128(path)
        lead, trail = edges(a)  # digital silence (< -90 dBFS): dead air
        lead60, trail60 = edges(a, 10 ** (-60 / 20))  # below -60 dBFS: inaudible decay, reported only
        if len(a) < SR * 0.4:
            m['lufs'] = None
        row = {'kind': kind, 'file': f'{d}/{name}', 'seconds': round(len(a) / SR, 3), **{k: (None if v is None else round(v, 1)) for k, v in m.items()}, 'peakDbfs': round(db(np.abs(a).max()), 1), 'rmsDbfs': round(db(np.sqrt(np.mean(a ** 2))), 1), 'tailBelow60Ms': round(trail60), 'leadMs': round(lead), 'trailMs': round(trail), 'firstDb': round(db(np.abs(a[0]).max()), 1), 'lastDb': round(db(np.abs(a[-1]).max()), 1)}
        if kind == 'bed':
            row['seam'] = {k: round(v, 2) for k, v in seam(a).items()}
        rows.append(row)
        f = row['file']
        if m['truePeak'] > -0.1:
            failures.append(f'{f}: true peak {m["truePeak"]} dBTP (clipping risk)')
        if kind in ('sfx', 'cue') and (trail > 250 or lead > 20):
            failures.append(f'{f}: dead air ({lead:.0f} ms before, {trail:.0f} ms after the sound below -90 dBFS)')
        if kind in ('sfx', 'cue') and row['lastDb'] > -40:
            failures.append(f'{f}: cut-off tail (last sample {row["lastDb"]} dBFS): a click where it stops')
        if kind == 'cue' and not 1.5 <= row['seconds'] <= 2.5:
            failures.append(f'{f}: result cue is {row["seconds"]} s (brief: 1.5–2.5 s)')
        if kind == 'bed' and (row['seam']['jumpRatio'] > 8 or (row['seam']['wrapPercentile'] > 99 and row['seam']['wrapStepDb'] > 3)):
            failures.append(f'{f}: loop seam: sample jump ×{row["seam"]["jumpRatio"]}, level step {row["seam"]["wrapStepDb"]} dB at the {row["seam"]["wrapPercentile"]}th percentile')

knocks = [r for r in rows if re.search(r'motif-knock-[123]\.wav$', r['file'])]
beyond = next(r for r in rows if r['file'].endswith('motif-knock-beyond.wav'))
spread = max(r['peakDbfs'] for r in knocks) - min(r['peakDbfs'] for r in knocks)
if spread > 1.5:
    failures.append(f'motif knocks 1–3 differ by {spread:.1f} dB peak (the "three measured knocks" must match)')
motif = {'knockPeaksDbfs': [r['peakDbfs'] for r in knocks], 'knockLeadMs': [r['leadMs'] for r in knocks], 'spreadDb': round(spread, 2), 'beyond': {'peakDbfs': beyond['peakDbfs'], 'seconds': beyond['seconds']}}

json.dump({'rows': rows, 'motif': motif, 'failures': failures}, open(os.path.join(OUT, 'report.json'), 'w'), indent=1)
def seamtxt(sm):
    return f"jump ×{sm['jumpRatio']}, wrap step {sm['wrapStepDb']} dB (p{sm['wrapPercentile']:.0f}), trim {sm['trimHeadMs']:.0f}/{sm['trimTailMs']:.0f} ms"


md = ['| File | s | LUFS (RMS dBFS) | LRA | TP dBTP | dead air before/after ms | decay < -60 dBFS ms | last sample dBFS | seam |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
for r in rows:
    sm = r.get('seam')
    md.append(f"| {r['file'].split('/', 2)[2]} | {r['seconds']} | {r['lufs'] if r['lufs'] is not None else f"({r['rmsDbfs']})"} | {r['lra']} | {r['truePeak']} | {r['leadMs']}/{r['trailMs']} | {r['tailBelow60Ms']} | {r['lastDb']} | {'' if not sm else seamtxt(sm)} |")
open(os.path.join(OUT, 'report.md'), 'w').write('\n'.join(md) + '\n')
print('\n'.join(md))
print(f'\nmotif: {motif}')
if failures:
    print(f'\naudio report FAILED ({len(failures)}):')
    for f in failures:
        print(f'  ✗ {f}')
    sys.exit(1)
print(f'\naudio report passed: {len(rows)} files measured (not listened to). {OUT}')
