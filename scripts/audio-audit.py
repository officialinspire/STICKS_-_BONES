#!/usr/bin/env python3
"""
Audio audit (needs ffmpeg + numpy):  python3 scripts/audio-audit.py assets/audio/music/*.mp3

Reports duration, leading/trailing silence, head/tail loudness (1 s windows),
and loop-seam evidence. The seam check compares the spectral change across a
candidate join with the track's own frame-to-frame change: a percentile above
~90 means the join is likely audible. This is ANALYSIS, not audition — loop
points stay unverified in src/assets/audio-manifest.ts until a person listens
(dev page: /dev/audio-audition.html).
"""
import subprocess, sys, numpy as np, json
SR = 11025
def load(f):
    raw = subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)
def frames(x, n=2048, hop=512):
    idx = np.arange(0, len(x)-n, hop)
    w = np.hanning(n)
    return np.stack([x[i:i+n]*w for i in idx]), idx
def db(v): return 20*np.log10(max(v,1e-9))
out = {}
for f in sys.argv[1:]:
    x = load(f)
    dur = len(x)/SR
    a = np.abs(x)
    thr = 10**(-50/20)
    nz = np.where(a > thr)[0]
    lead, trail = nz[0]/SR, (len(x)-nz[-1])/SR
    rms = lambda s,e: db(np.sqrt(np.mean(x[int(s*SR):int(e*SR)]**2)))
    env = [round(rms(t, t+1),1) for t in np.arange(max(0,dur-12), dur-1, 1)]
    head = [round(rms(t, t+1),1) for t in range(0, 6)]
    F, idx = frames(x)
    S = np.abs(np.fft.rfft(F, axis=1))[:, :400]
    L = np.log1p(S)
    flux = np.sqrt(np.sum(np.diff(L, axis=0).clip(0)**2, axis=1))
    # loop search: window of W frames (~4.6s); compare candidate start (first 45%) vs end (last 45%)
    hop_s = 512/SR; W = int(4.6/hop_s)
    def feat(i): 
        v = L[i:i+W].mean(axis=0); return v/np.linalg.norm(v)
    starts = range(int(2/hop_s), int(len(L)*0.45), 8)
    ends = range(int(len(L)*0.55), len(L)-W-int(8/hop_s), 8)
    fs = {i: feat(i) for i in starts}; fe = {j: feat(j) for j in ends}
    best = (-1, 0, 0)
    for i in starts:
        for j in ends:
            c = float(fs[i] @ fe[j])
            if c > best[0]: best = (c, i, j)
    c, i, j = best
    # seam = jump from frame j (end point) to frame i (start point): spectral flux across the join vs typical flux
    seam = np.sqrt(np.sum((L[i] - L[j-1]).clip(0)**2))
    pct = float((flux < seam).mean()*100)
    # direct file loop (end → start)
    direct = np.sqrt(np.sum((L[2] - L[-3]).clip(0)**2)); dpct = float((flux < direct).mean()*100)
    out[f] = dict(duration=round(dur,2), lead_silence=round(lead,3), trail_silence=round(trail,3), head_db=head, tail_db=env,
                  best_loop=dict(start=round(i*hop_s,2), end=round(j*hop_s,2), similarity=round(c,4), seam_flux_percentile=round(pct,1)),
                  direct_loop_seam_percentile=round(dpct,1))
print(json.dumps(out, indent=1, default=float))
