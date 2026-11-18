#!/usr/bin/env python3
"""
npm run audio:build — local sound bank (SFX + ambience beds) from verified CC0 sources.

Run:  python3 scripts/build-audio.py <sources dir>
The sources dir holds the downloaded originals, untouched:
  kenney-interface/   Kenney "Interface Sounds" 1.0 (OpenGameArt mirror, kenney_interfaceSounds.zip)
  kenney-casino/      Kenney "Casino Audio" 1.1 (OpenGameArt mirror, kenney_casino-audio.zip)
  bsb/                BigSoundBank (Joseph Sardin) files named <id>.<ext>
Every source is CC0 1.0 (checked on the pack's License.txt / each sound's own page).
Requires ffmpeg and numpy.

Outputs (new files; the originals are never modified or committed):
  assets/audio/sfx/*.wav         short one-shots: mono 24 kHz PCM16, trimmed, 3 ms fade-in,
                                 tail fade-out, peak-normalised to −3 dBFS (runtime keeps
                                 quiet defaults through the sfx bus).
  assets/audio/ambience/*.mp3    beds: a chosen window, tail cross-faded into the head so the
                                 loop has no hard seam, loudness-normalised to −30 LUFS.
  src/assets/sound-manifest.json source URL, creator, license, edits, bytes, sha256,
                                 measured loudness and (beds) a seam-smoothness score.
Loop seams are MEASURED here, not auditioned: a person still has to listen
(dev/audio-audition.html) before any seam is called approved.
"""
import hashlib, json, os, subprocess, sys
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/sounds'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX_DIR = os.path.join(ROOT, 'assets/audio/sfx')
AMB_DIR = os.path.join(ROOT, 'assets/audio/ambience')
os.makedirs(SFX_DIR, exist_ok=True)
os.makedirs(AMB_DIR, exist_ok=True)

KENNEY_UI = dict(pack='Kenney — Interface Sounds 1.0', creator='Kenney (Kenney Vleugels)', license='CC0 1.0', source='https://opengameart.org/content/interface-sounds', download='https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip')
KENNEY_CASINO = dict(pack='Kenney — Casino Audio 1.1', creator='Kenney (Kenney Vleugels)', license='CC0 1.0', source='https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips', download='https://opengameart.org/sites/default/files/kenney_casino-audio.zip')
def BSB(i, title, slug):
    return dict(pack=f'BigSoundBank #{i} “{title}”', creator='Joseph Sardin (BigSoundBank)', license='CC0 1.0 (“Free and royalty-free”)', source=f'https://bigsoundbank.com/{slug}-s{i}.html')

# (output id, source file, origin, start s, duration s, purpose, extra ffmpeg filter)
SFX = [
    ('ui-select-1', 'kenney-interface/x/Audio/select_001.ogg', KENNEY_UI, 0, None, 'soft select', ''),
    ('ui-select-2', 'kenney-interface/x/Audio/select_002.ogg', KENNEY_UI, 0, None, 'soft select', ''),
    ('ui-back-1', 'kenney-interface/x/Audio/back_001.ogg', KENNEY_UI, 0, None, 'back', ''),
    ('ui-back-2', 'kenney-interface/x/Audio/back_002.ogg', KENNEY_UI, 0, None, 'back', ''),
    ('ui-confirm-1', 'kenney-interface/x/Audio/confirmation_001.ogg', KENNEY_UI, 0, None, 'confirm', ''),
    ('ui-confirm-2', 'kenney-interface/x/Audio/confirmation_002.ogg', KENNEY_UI, 0, None, 'confirm', ''),
    ('ui-invalid-1', 'kenney-interface/x/Audio/bong_001.ogg', KENNEY_UI, 0, None, 'restrained invalid action', 'lowpass=f=2400'),
    ('tile-pickup-1', 'kenney-casino/x/Audio/chips-handle-1.ogg', KENNEY_CASINO, 0, 0.35, 'tile pickup (stand-in: chips)', ''),
    ('tile-pickup-2', 'kenney-casino/x/Audio/chips-handle-2.ogg', KENNEY_CASINO, 0, 0.35, 'tile pickup (stand-in: chips)', ''),
    ('tile-pickup-3', 'kenney-casino/x/Audio/chips-handle-3.ogg', KENNEY_CASINO, 0, 0.35, 'tile pickup (stand-in: chips)', ''),
    ('tile-place-1', 'kenney-casino/x/Audio/chip-lay-1.ogg', KENNEY_CASINO, 0, 0.4, 'tile placement (stand-in: chip lay)', ''),
    ('tile-place-2', 'kenney-casino/x/Audio/chip-lay-2.ogg', KENNEY_CASINO, 0, 0.4, 'tile placement (stand-in: chip lay)', ''),
    ('tile-place-3', 'kenney-casino/x/Audio/chip-lay-3.ogg', KENNEY_CASINO, 0, 0.4, 'tile placement (stand-in: chip lay)', ''),
    ('tile-slide-1', 'kenney-casino/x/Audio/card-slide-1.ogg', KENNEY_CASINO, 0, 0.45, 'tile slide (stand-in: card slide)', ''),
    ('tile-slide-2', 'kenney-casino/x/Audio/card-slide-2.ogg', KENNEY_CASINO, 0, 0.45, 'tile slide (stand-in: card slide)', ''),
    ('tile-slide-3', 'kenney-casino/x/Audio/card-slide-3.ogg', KENNEY_CASINO, 0, 0.45, 'tile slide (stand-in: card slide)', ''),
    # tile-slap-1/2 and tile-shuffle-1 (chips-collide stand-ins) were retired: the owner's own recordings of a
    # domino slapped onto a table and of dominoes dropped onto it replace them (scripts/build-owner-audio.py).
    ('tile-draw-1', 'kenney-casino/x/Audio/chips-handle-4.ogg', KENNEY_CASINO, 0, 0.4, 'draw from the boneyard (stand-in: chips)', ''),
    ('tile-draw-2', 'kenney-casino/x/Audio/chips-handle-5.ogg', KENNEY_CASINO, 0, 0.4, 'draw from the boneyard (stand-in: chips)', ''),
    ('pass-knock-1', 'bsb/0374.ogg', BSB('0374', 'Knock on a light door', 'knock-on-a-light-door'), 0.035, 0.30, 'pass knock on the table', 'lowpass=f=4000'),
    ('pass-knock-2', 'bsb/0374.ogg', BSB('0374', 'Knock on a light door', 'knock-on-a-light-door'), 4.06, 0.30, 'pass knock on the table', 'lowpass=f=4000'),
    # Authored supernatural motif: three measured knocks + a fourth answering "from beyond". Sliced from one
    # recording so the three match; the fourth is the same hit, filtered and given a short tail (distance).
    ('motif-knock-1', 'bsb/0095.ogg', BSB('0095', 'Door Knock', 'door-knock'), 0.155, 0.50, 'motif knock (1–3)', ''),
    ('motif-knock-2', 'bsb/0095.ogg', BSB('0095', 'Door Knock', 'door-knock'), 2.210, 0.50, 'motif knock (1–3)', ''),
    ('motif-knock-3', 'bsb/0095.ogg', BSB('0095', 'Door Knock', 'door-knock'), 9.540, 0.50, 'motif knock (1–3)', ''),
    ('motif-knock-beyond', 'bsb/0095.ogg', BSB('0095', 'Door Knock', 'door-knock'), 0.155, 1.40, 'the fourth knock, answering from beyond', 'apad=pad_dur=1,lowpass=f=1100,aecho=0.6:0.5:90|170:0.35|0.22'),
    ('water-drop-1', 'bsb/1386.flac', BSB('1386', 'Drops of Water #3', 'drops-of-water-3'), 0.14, 0.45, 'cave drop accent', ''),
    ('water-drop-2', 'bsb/1386.flac', BSB('1386', 'Drops of Water #3', 'drops-of-water-3'), 4.49, 0.45, 'cave drop accent', ''),
    ('glass-1', 'bsb/1204.flac', BSB('1204', 'Glass, Placed on Table', 'glass-placed-on-table'), 0.19, 0.6, 'terrace glassware detail', ''),
]

# Beds: (id, file, origin, window start, window length, purpose, filter, stereo?)
BEDS = [
    ('amb-patio', 'bsb/2969.flac', BSB('2969', 'Outside Talks #2', 'outside-talks-2'), 20, 42, 'Neighborhood patio: social, distant voices', 'highpass=f=90', True),
    ('amb-promenade', 'bsb/1046.flac', BSB('1046', 'Small Waves Facing the Ocean', 'small-waves-facing-the-ocean'), 30, 44, 'Promenade: open space and surf', 'highpass=f=40', True),
    ('amb-jungle', 'bsb/2749.flac', BSB('2749', 'Forest #4', 'forest-4'), 60, 40, 'Jungle camp: close, humid (no generic roaring loop)', 'highpass=f=120', True),
    ('amb-cave', 'bsb/2136.flac', BSB('2136', 'Cave #2', 'cave-2'), 10, 42, 'Cave: water and room for silence', 'highpass=f=40', True),
    ('amb-terrace', 'bsb/3542.flac', BSB('3542', 'Small Restaurant Conversations', 'small-restaurant-conversations'), 30, 40, 'Corporate terrace: polished, slightly uncomfortable room', 'highpass=f=110,treble=g=-3', True),
]

def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)

def load(path, sr, ch=1):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch)

def lufs(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    vals = [l for l in out.splitlines() if l.strip().startswith('I:')]
    return float(vals[-1].split()[1]) if vals else None

def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def seam_metrics(path):
    """Measured on the DECODED MP3 (ffmpeg honours the LAME gapless header, as Chromium does).
    percentile: spectral change across the wrap vs the same measure at 400 ordinary points (lower = smoother);
    jump: percentile of the wrap's sample step among all of the bed's steps (a click would sit at ~100)."""
    x = load(path, 44100, 2)
    m = x.mean(axis=1)
    n = 2048
    def spec(seg):
        return np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    def change(sig, i):
        return float(np.sum((spec(sig[i - n // 2:i + n // 2]) - spec(sig[i - n:i])) ** 2))
    pts = np.linspace(2 * n, len(m) - 2 * n, 400).astype(int)
    ordinary = np.array([change(m, i) for i in pts])
    wrapped = np.concatenate([m[-2 * n:], m[:2 * n]])
    seam = change(wrapped, 2 * n)
    steps = np.max(np.abs(np.diff(x, axis=0)), axis=1)
    jump = float(np.mean(steps < float(np.max(np.abs(x[0] - x[-1])))) * 100)  # percentile of the wrap step among all steps
    return float(np.mean(ordinary < seam) * 100), jump, len(x) / 44100

manifest = {'generator': 'scripts/build-audio.py', 'policy': 'CC0 sources only; originals untouched; seams measured, not auditioned', 'sfx': [], 'ambience': []}
for oid, f, origin, start, dur, purpose, filt in SFX:
    src = os.path.join(SRC, f)
    out = os.path.join(SFX_DIR, f'{oid}.wav')
    d = dur or float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout)
    chain = ','.join(x for x in [filt, f'afade=t=in:d=0.003,afade=t=out:st={max(0.0, d - min(0.08, d / 3)):.3f}:d={min(0.08, d / 3):.3f}', 'loudnorm=I=-20:TP=-3:LRA=7:linear=true'] if x)
    ff('-ss', str(start), '-t', str(d), '-i', src, '-af', chain, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', out)
    manifest['sfx'].append({'id': oid, 'file': os.path.relpath(out, ROOT), 'purpose': purpose, **origin, 'sourceFile': os.path.basename(f), 'edits': f'trim {start}s +{d:.2f}s; {filt or "no EQ"}; 3 ms fade-in, tail fade-out; loudness-normalised (peak ≤ −3 dBFS); mono 24 kHz PCM16', 'bytes': os.path.getsize(out), 'sha256': sha(out), 'lufs': lufs(out), 'final': False})
    print('sfx', oid, os.path.getsize(out))

for oid, f, origin, start, length, purpose, filt, stereo in BEDS:
    src = os.path.join(SRC, f)
    tmp = os.path.join('/tmp', f'{oid}.wav')
    out = os.path.join(AMB_DIR, f'{oid}.mp3')
    xf = 3.0
    nch = 2 if stereo else 1
    # Window [start, start+length+xf] → loop of exactly `length` s: the first xf seconds become an
    # equal-power cross-fade of the window's head (fading in) with the samples just past `length`
    # (fading out). The last loop sample is x[N-1] and the wrap lands on ≈ x[N], so the seam is
    # continuous by construction. (Done in numpy: the earlier ffmpeg graph silently dropped the fade.)
    ff('-ss', str(start), '-t', str(length + xf + 0.5), '-i', src, '-af', filt, '-ac', str(nch), '-ar', '44100', tmp + '.a.wav')
    x = load(tmp + '.a.wav', 44100, nch)
    N, X = int(length * 44100), int(xf * 44100)
    assert len(x) >= N + X, (oid, len(x), N + X)
    t = np.linspace(0, np.pi / 2, X, dtype=np.float64)[:, None]
    loop = x[:N].astype(np.float64).copy()
    loop[:X] = x[:X] * np.sin(t) + x[N:N + X] * np.cos(t)
    # One static gain to −30 LUFS (a time-varying normaliser would break the seam), peak kept ≤ −6 dBFS.
    loop.astype(np.float32).tofile(tmp + '.raw')
    ff('-f', 'f32le', '-ar', '44100', '-ac', str(nch), '-i', tmp + '.raw', tmp + '.u.wav')
    gain_db = min(-30 - lufs(tmp + '.u.wav'), -6 - 20 * np.log10(max(1e-9, float(np.max(np.abs(loop))))))
    ff('-i', tmp + '.u.wav', '-af', f'volume={gain_db:.3f}dB', '-c:a', 'pcm_s16le', tmp)
    ff('-i', tmp, '-c:a', 'libmp3lame', '-b:a', '80k' if stereo else '56k', '-write_xing', '1', out)
    score, jump, decoded = seam_metrics(out)
    manifest['ambience'].append({'id': oid, 'file': os.path.relpath(out, ROOT), 'purpose': purpose, **origin, 'sourceFile': os.path.basename(f), 'edits': f'window {start}s–{start + length}s; {filt}; {xf:.0f} s equal-power tail→head cross-fade loop (exact length {length} s); one static gain to −30 LUFS (peak ≤ −6 dBFS); {"stereo" if stereo else "mono"} MP3', 'durationSec': length, 'bytes': os.path.getsize(out), 'sha256': sha(out), 'lufs': lufs(out), 'seamPercentile': round(score, 1), 'wrapStepPercentile': round(jump, 1), 'decodedSec': round(decoded, 3), 'auditioned': False, 'final': False})
    print('bed', oid, os.path.getsize(out), 'seam percentile', round(score, 1), 'wrap jump', round(jump, 2), 'decoded', round(decoded, 3))
    for p in (tmp, tmp + '.a.wav', tmp + '.raw', tmp + '.u.wav'):
        os.remove(p)

json.dump(manifest, open(os.path.join(ROOT, 'src/assets/sound-manifest.json'), 'w'), indent=1, ensure_ascii=False)
subprocess.run([sys.executable, os.path.join(ROOT, 'scripts/sound-credits.py')], check=True)
open(os.path.join(ROOT, 'src/assets/sound-manifest.json'), 'a').write('\n')
