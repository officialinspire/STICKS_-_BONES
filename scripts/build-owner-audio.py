#!/usr/bin/env python3
"""
npm run audio:owner — runtime derivatives of the OWNER's audio uploads (artist "officialinspire").

Run:  python3 scripts/build-owner-audio.py            (writes derivatives + src/assets/owner-audio.json)
      python3 scripts/build-owner-audio.py --check    (rebuilds in a temp dir; exits 1 if any output differs)
Requires ffmpeg and numpy.

Originals live untouched in assets/audio/originals/ (exactly as uploaded to main; never edited, re-encoded
or bundled). Every output is a NEW file whose manifest entry names its source file and SHA-256, the exact
edits, and measured metadata (boundaries, duration, sample rate, loudness, peaks).

Outputs
  SFX (decoded-buffer one-shots, assets/audio/sfx/*.wav)
    Boundaries are detected per clip, not assumed:
      start = first sample ≥ −60 dB re the clip's peak, minus a 2 ms pre-roll; 1 ms fade-in (the attack is untouched)
      end   = end of the last 5 ms window whose RMS is ≥ −72 dB re peak, plus 10 ms; 6 ms cosine fade-out
    Mono (the clips' channels are summed), peak-normalised to −3 dBFS like the CC0 bank, PCM16. Sample rate by
    measurement: 48 kHz when > 1 % of the clip's energy is above 12 kHz (the slaps' crack), otherwise 24 kHz.
  Scene music (assets/audio/music/*.mp3)
    Stream copy (no re-encode): cover art and tags dropped, bit-exact muxing. The decoded audio is proven
    identical to the original's (PCM SHA-256 recorded for both). Runtime applies the measured gain.
  Result cues (assets/audio/cues/*.mp3, decoded into buffers at runtime)
    The recording's final cadence: the final hit is the strongest onset among the last 0.6 s of onsets before the
    closing level falls away; the cue starts on an onset that makes it 1.5–2.5 s long, preferring the most
    accented one 2–4 whole beats before the final hit (beat period from onset autocorrelation), else the most
    accented in the window; the final chord keeps its
    natural decay for at most 1 s, ending in a cosine fade. 10 ms pre-roll, 5 ms fade-in. One static gain toward
    −18 LUFS integrated, lowered if needed so the ENCODED file is ≤ −1 dBTP. 48 kHz stereo MP3, 192 kbps CBR.
Nothing here is auditioned: measurements only. A person still has to listen before anything is called final.
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = 'assets/audio/originals'
CHECK = '--check' in sys.argv
OUT_ROOT = tempfile.mkdtemp(prefix='owner-audio-') if CHECK else ROOT
BITEXACT = ['-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1']

# Every upload, with its role. Selection reasons are measured (see docs/AUDIO.md "Owner uploads").
ORIGINALS = [
    ('Clear Crisp Slap as Domino Is Slammed onto Table Take 1.mp3', 'sfx-source', 'tile-slam-owner-1'),
    ('Crisp Slap as Domino Is Slammed onto Table.mp3', 'sfx-source', 'tile-slam-owner-2'),
    ('Few Dominos Being Dropped onto Table Take 1.mp3', 'sfx-source', 'tile-drop-owner-1'),
    ('Promenade After Dark.mp3', 'music-source', 'promenade'),
    ('Promenade After Dark (Alt).mp3', 'alternative', 'promenade'),
    ('The Lit Threshold.mp3', 'alternative', 'threshold'),
    ('The Lit Threshold (Alt).mp3', 'music-source', 'threshold'),
    ('Round Win (Puerto Rico Vibe).mp3', 'cue-source', 'result-win'),
    ('Round Win (Tropical Vibe).mp3', 'alternative', 'result-win'),
    ('Round Win Stinger.mp3', 'alternative', 'result-win'),
    ('Round Win Stinger (Alt).mp3', 'alternative', 'result-win'),
    ('Round Win Stinger (Alt)(1).mp3', 'duplicate', 'result-win'),
    ('Round Other (Musical Shrug).mp3', 'cue-source', 'result-other'),
]
SFX = {
    'tile-slam-owner-1': ('Clear Crisp Slap as Domino Is Slammed onto Table Take 1.mp3', 'emphatic slam (owner recording: a real domino slapped onto a table)'),
    'tile-slam-owner-2': ('Crisp Slap as Domino Is Slammed onto Table.mp3', 'emphatic slam (owner recording: a real domino slapped onto a table)'),
    'tile-drop-owner-1': ('Few Dominos Being Dropped onto Table Take 1.mp3', 'shuffle / deal (owner recording: several dominoes dropped onto a table)'),
}
MUSIC = {
    'promenade': ('Promenade After Dark.mp3', 'promenade-after-dark.mp3'),
    'threshold': ('The Lit Threshold (Alt).mp3', 'the-lit-threshold.mp3'),
}
CUES = {
    'result-win': ('Round Win (Puerto Rico Vibe).mp3', 'Round won: a short, friendly flourish ending on a ringing chord'),
    'result-other': ('Round Other (Musical Shrug).mp3', 'Round lost / blocked tie: a warm, wry shrug (every result advances the story)'),
}


def run(*a, **k):
    return subprocess.run(list(a), check=True, capture_output=True, **k)


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def decode(path, sr=None, ch=None):
    args = ['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0']
    if ch: args += ['-ac', str(ch)]
    if sr: args += ['-ar', str(sr)]
    raw = run(*args, '-f', 'f32le', '-').stdout
    info = probe(path)
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch or info['channels']).astype(np.float64), raw


def probe(path):
    j = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path, text=True).stdout)
    a = [s for s in j['streams'] if s['codec_type'] == 'audio'][0]
    return {'sampleRate': int(a['sample_rate']), 'channels': int(a['channels']), 'codec': a['codec_name'], 'bitRateKbps': round(int(j['format'].get('bit_rate', 0)) / 1000), 'coverArt': any(s['codec_type'] == 'video' for s in j['streams'])}


def loudness(path):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    def last(key):
        v = [l for l in err.splitlines() if l.strip().startswith(key)]
        try:
            return float(v[-1].split()[1]) if v else None
        except ValueError:
            return None
    i = last('I:')
    return {'integratedLufs': i if i is not None and i > -70 else None, 'truePeakDbtp': last('Peak:'), 'lraLu': last('LRA:')}


def db(v):
    return float(20 * np.log10(max(float(v), 1e-12)))


def write_wav(x, sr, path):
    raw = os.path.join(tempfile.gettempdir(), 'owner-audio.f32')
    np.ascontiguousarray(x, dtype=np.float32).tofile(raw)
    run('ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', str(x.shape[1]), '-i', raw, *BITEXACT, '-c:a', 'pcm_s16le', path)
    os.remove(raw)


def cosine(n, rising):
    t = np.linspace(0, np.pi / 2, max(n, 1))
    return np.sin(t) if rising else np.cos(t)


def measured(path):
    p = probe(path)
    x, raw = decode(path)
    return {'bytes': os.path.getsize(path), 'sha256': sha(path), 'durationSec': round(len(x) / p['sampleRate'], 4), 'sampleRate': p['sampleRate'], 'channels': p['channels'], 'samplePeakDbfs': round(db(np.max(np.abs(x))), 2), **loudness(path)}


manifest = {
    'generator': 'scripts/build-owner-audio.py',
    'ffmpeg': run('ffmpeg', '-version', text=True).stdout.splitlines()[0],
    'policy': "Owner uploads (artist 'officialinspire'), kept untouched in assets/audio/originals; runtime files are derivatives with source hashes and measured metadata. Measured, not auditioned.",
    'originals': [], 'sfx': [], 'music': [], 'cues': [],
}

# ---- originals: catalogue every upload (bytes, hash, decoded-audio hash, loudness, role) ----------------
pcm_hash = {}
for name, role, target in ORIGINALS:
    path = os.path.join(ROOT, ORIG, name)
    p = probe(path)
    x, raw = decode(path)
    h = hashlib.sha256(raw).hexdigest()
    dup = next((n for n, hh in pcm_hash.items() if hh == h), None)
    pcm_hash[name] = h
    manifest['originals'].append({'file': f'{ORIG}/{name}', 'role': role, 'for': target, 'bytes': os.path.getsize(path), 'sha256': sha(path), 'decodedPcmSha256': h, 'durationSec': round(len(x) / p['sampleRate'], 3), **p, **loudness(path), **({'duplicateOf': f'{ORIG}/{dup}'} if dup else {})})
    if role == 'duplicate' and not dup: sys.exit(f'{name} is marked duplicate but its decoded audio matches nothing')
    print('original', role.ljust(12), name, '(decoded audio identical to ' + dup + ')' if dup else '')

# ---- SFX: per-clip boundaries, tiny anti-click fades, mono, peak −3 dBFS ---------------------------------
for oid, (name, purpose) in SFX.items():
    src = os.path.join(ROOT, ORIG, name)
    st, _ = decode(src)
    sr0 = probe(src)['sampleRate']
    mono = st.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono)) ** 2
    hf = float(spec[np.fft.rfftfreq(len(mono), 1 / sr0) > 12000].sum() / spec.sum())
    sr = 48000 if hf > 0.01 else 24000
    x = decode(src, sr=sr, ch=1)[0][:, 0]
    pk = float(np.max(np.abs(x)))
    first = int(np.argmax(np.abs(x) >= pk * 10 ** (-60 / 20)))
    start = max(0, first - int(0.002 * sr))
    w = int(0.005 * sr)
    n = len(x) // w
    rms = np.sqrt((x[: n * w] ** 2).reshape(n, w).mean(axis=1))
    above = np.where(rms >= pk * 10 ** (-72 / 20))[0]
    end = min(len(x), (int(above[-1]) + 1) * w + int(0.010 * sr))
    y = x[start:end].copy()
    fi, fo = int(0.001 * sr), int(0.006 * sr)
    y[:fi] *= cosine(fi, True)
    y[-fo:] *= cosine(fo, False)
    gain_db = -3 - db(np.max(np.abs(y)))
    y *= 10 ** (gain_db / 20)
    out = os.path.join(OUT_ROOT, 'assets/audio/sfx', f'{oid}.wav')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_wav(y[:, None], sr, out)
    m = measured(out)
    manifest['sfx'].append({'id': oid, 'file': f'assets/audio/sfx/{oid}.wav', 'purpose': purpose, 'source': f'{ORIG}/{name}', 'sourceSha256': sha(src),
                            'boundaries': {'attackSec': round(first / sr, 4), 'startSec': round(start / sr, 4), 'endSec': round(end / sr, 4), 'leadRemovedSec': round(start / sr, 3), 'tailRemovedSec': round((len(x) - end) / sr, 3)},
                            'edits': f'start {start / sr:.4f}s (attack −2 ms), end {end / sr:.4f}s (last 5 ms RMS ≥ −72 dB re peak, +10 ms); 1 ms fade-in, 6 ms cosine fade-out; mono sum; {gain_db:+.2f} dB to −3 dBFS peak; {sr // 1000} kHz PCM16 ({100 * hf:.2f} % of energy above 12 kHz)',
                            'energyAbove12kHzPct': round(100 * hf, 2), **m, 'final': False})
    print('sfx', oid, f'{(end - start) / sr:.3f}s kept, {(len(x) - end) / sr:.2f}s tail removed, {sr} Hz, {m["bytes"]} B')

# ---- scene music: lossless stream copy (no re-encode), decoded audio proven identical ------------------
for tid, (name, outname) in MUSIC.items():
    src = os.path.join(ROOT, ORIG, name)
    out = os.path.join(OUT_ROOT, 'assets/audio/music', outname)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    run('ffmpeg', '-v', 'error', '-y', '-i', src, '-map', '0:a:0', '-c:a', 'copy', *BITEXACT, '-id3v2_version', '0', '-write_xing', '1', out)
    a, b = decode(src)[1], decode(out)[1]
    if hashlib.sha256(a).digest() != hashlib.sha256(b).digest(): sys.exit(f'{outname}: stream copy changed the decoded audio')
    m = measured(out)
    manifest['music'].append({'id': tid, 'file': f'assets/audio/music/{outname}', 'source': f'{ORIG}/{name}', 'sourceSha256': sha(src), 'decodedPcmSha256': hashlib.sha256(b).hexdigest(),
                              'edits': 'stream copy of the MPEG audio (no re-encode); cover art and tags removed; bit-exact muxing; decoded audio identical to the original', **m})
    print('music', tid, outname, m['bytes'], 'B (original', os.path.getsize(src), 'B)', m['integratedLufs'], 'LUFS')

# ---- result cues: the final cadence, 1.5–2.5 s, natural decay ≤ 1 s ------------------------------------
def onsets(mono, sr, hop=256, n=1024):
    fr = np.lib.stride_tricks.sliding_window_view(mono, n)[::hop] * np.hanning(n)
    sp = np.log1p(10 * np.abs(np.fft.rfft(fr, axis=1)))
    fl = np.maximum(0, np.diff(sp, axis=0)).sum(axis=1)
    z = (fl - np.median(fl)) / (np.std(fl) + 1e-9)
    idx = [i for i in range(1, len(z) - 1) if z[i] > 2.0 and z[i] >= z[i - 1] and z[i] > z[i + 1]]
    return np.array([((i + 1) * hop + n // 2) / sr for i in idx]), np.array([z[i] for i in idx]), fl, hop / sr


for cid, (name, purpose) in CUES.items():
    src = os.path.join(ROOT, ORIG, name)
    st = decode(src, sr=48000, ch=2)[0]
    sr = 48000
    mono = st.mean(axis=1)
    w = int(0.05 * sr)
    n = len(mono) // w
    env = 20 * np.log10(np.sqrt((mono[: n * w] ** 2).reshape(n, w).mean(axis=1)) + 1e-12)
    # The music's last sounding moment: the final 50 ms window within 30 dB of the closing phrase's level.
    body = float(np.median(env[int((len(mono) / sr - 15) / 0.05): int((len(mono) / sr - 5) / 0.05)]))
    last_loud = int(np.where(env > body - 30)[0][-1])
    # Onsets in the closing 14 s (24 kHz analysis).
    a = max(0, len(mono) - 14 * sr)
    t_on, z_on, flux, dt = onsets(mono[a::2], sr // 2)
    t_on = t_on + a / sr
    # Where the closing phrase's level ends for good (the last 50 ms window within 6 dB of it).
    decay_from = None
    for i in range(last_loud, 0, -1):
        if env[i] > body - 6:
            decay_from = (i + 1) * 0.05
            break
    # The final hit: the strongest onset among the last 0.6 s of onsets before the decay sets in for good
    # (a swell after the last chord has no onset of its own).
    last_onset = float(t_on[t_on <= decay_from + 0.05].max())
    win = (t_on >= last_onset - 0.6) & (t_on <= last_onset)
    final = float(t_on[win][np.argmax(z_on[win])])
    # Beat period from the onset envelope's autocorrelation (0.3–1.0 s).
    f = flux - flux.mean()
    ac = np.correlate(f, f, 'full')[len(f) - 1:]
    lags = np.arange(len(ac)) * dt
    rng = (lags > 0.3) & (lags < 1.0)
    beat = float(lags[rng][np.argmax(ac[rng])])
    # Natural decay of the final chord, capped at 1 s.
    natural = (last_loud + 1) * 0.05
    end = min(natural, final + 1.0)
    # The cue starts on an onset that makes it 1.5–2.5 s long: the most accented one a whole number of beats (2–4)
    # before the final hit if there is one, otherwise the most accented in the window (recorded in beats).
    cand = (t_on >= end - 2.5) & (t_on <= end - 1.5)
    if not cand.any(): sys.exit(f'{cid}: no onset gives a 1.5–2.5 s cue (final {final:.2f}s, end {end:.2f}s)')
    beats_back = (final - t_on) / beat
    aligned = cand & (np.abs(beats_back - np.round(beats_back)) <= 0.2) & (np.round(beats_back) >= 2) & (np.round(beats_back) <= 4)
    pool = aligned if aligned.any() else cand  # prefer a whole number of beats before the final hit
    s = float(t_on[pool][np.argmax(z_on[pool])])
    k = round((final - s) / beat, 2)
    start = max(0.0, s - 0.010)
    y = st[int(start * sr): int(end * sr)].copy()
    fi = int(0.005 * sr)
    fo = int(min(0.35, max(0.12, end - final - 0.25)) * sr)  # the decay's last part fades out (cosine)
    y[:fi] *= cosine(fi, True)[:, None]
    y[-fo:] *= cosine(fo, False)[:, None]
    tmp = os.path.join(tempfile.gettempdir(), f'{cid}.wav')
    write_wav(y, sr, tmp)
    l = loudness(tmp)
    gain_db = min(-18 - l['integratedLufs'], -1 - l['truePeakDbtp'])
    out = os.path.join(OUT_ROOT, 'assets/audio/cues', f'{cid}.mp3')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # MP3 encoding can overshoot: measure the ENCODED file and lower the gain until it is ≤ −1 dBTP.
    for _ in range(4):
        run('ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f'volume={gain_db:.3f}dB', *BITEXACT, '-id3v2_version', '0', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '48000', out)
        tp = loudness(out)['truePeakDbtp']
        if tp <= -1.0: break
        gain_db -= tp + 1.0 + 0.1
    else:
        sys.exit(f'{cid}: true peak still above −1 dBTP after encoding')
    os.remove(tmp)
    m = measured(out)
    manifest['cues'].append({'id': cid, 'file': f'assets/audio/cues/{cid}.mp3', 'purpose': purpose, 'source': f'{ORIG}/{name}', 'sourceSha256': sha(src),
                             'cut': {'startSec': round(start, 3), 'finalHitSec': round(final, 3), 'endSec': round(end, 3), 'lengthSec': round(end - start, 3), 'leadInBeats': k, 'beatSec': round(beat, 3), 'decaySec': round(end - final, 3), 'naturalDecayEndSec': round(natural, 3), 'fadeOutSec': round(fo / sr, 3)},
                             'edits': f'source {start:.3f}–{end:.3f}s: the most accented onset {k} beats (beat {beat:.3f}s) before the final hit at {final:.3f}s, decay {end - final:.2f}s (natural end {natural:.2f}s, capped at 1 s) with a {fo / sr:.2f}s cosine fade-out; 10 ms pre-roll, 5 ms fade-in; {gain_db:+.2f} dB static gain (−18 LUFS target, ≤ −1 dBTP measured on the encoded file); 48 kHz stereo MP3 192 kbps',
                             **m, 'auditioned': False, 'final': False})
    print('cue', cid, f'{start:.2f}–{end:.2f}s ({end - start:.2f}s, lead-in {k} beats × {beat:.3f}s, final hit {final:.2f}s, decay {end - final:.2f}s)', m['integratedLufs'], 'LUFS', m['bytes'], 'B')

if CHECK:
    diffs = []
    for group in ('sfx', 'music', 'cues'):
        for e in manifest[group]:
            built = sha(os.path.join(OUT_ROOT, e['file']))
            have = os.path.join(ROOT, e['file'])
            if not os.path.exists(have) or sha(have) != built: diffs.append(e['file'])
    shutil.rmtree(OUT_ROOT)
    if diffs:
        print('not reproduced:', *diffs, sep='\n  ')
        sys.exit(1)
    print('reproduced: every derivative rebuilt byte-identically')
    sys.exit(0)

json.dump(manifest, open(os.path.join(ROOT, 'src/assets/owner-audio.json'), 'w'), indent=1, ensure_ascii=False)
open(os.path.join(ROOT, 'src/assets/owner-audio.json'), 'a').write('\n')
print('wrote src/assets/owner-audio.json')
