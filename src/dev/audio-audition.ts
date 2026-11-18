/**
 * DEVELOPER-ONLY loop audition (npm run dev → /dev/audio-audition.html; not in
 * the production build). Plays each music track's seams so a PERSON can judge
 * them: the restart used at runtime (ending → breath → start) and each
 * unverified loop candidate (a few seconds before `end`, then jump to `start`).
 * Approving a candidate means editing `auditioned: true` in
 * src/assets/audio-manifest.ts — analysis alone never marks a loop verified.
 */
import { MUSIC, type MusicTrack } from '../assets/audio-manifest';
import { musicUrl } from '../assets/media-urls';

const LEAD = 4;
let current: HTMLAudioElement | null = null;
let timer = 0;

function stop(): void {
  clearTimeout(timer);
  current?.pause();
  current = null;
}

function playSeam(t: MusicTrack, from: number, to: number, gapSec = 0): void {
  stop();
  const url = musicUrl(t.id);
  if (!url) return;
  const a = new Audio(url);
  current = a;
  a.currentTime = Math.max(0, from - LEAD);
  void a.play().catch(() => {});
  timer = window.setTimeout(() => {
    a.pause();
    timer = window.setTimeout(() => {
      if (current !== a) return;
      a.currentTime = to;
      void a.play().catch(() => {});
      timer = window.setTimeout(stop, LEAD * 1000);
    }, gapSec * 1000);
  }, LEAD * 1000);
}

const root = document.getElementById('audition')!;
root.innerHTML = `
  <style>body{font:15px system-ui;background:#2b1a10;color:#f6ead2;margin:16px;max-width:760px}button{min-height:40px;margin:4px 6px 4px 0}section{background:#3a2414;padding:12px;border-radius:10px;margin:12px 0}small{opacity:.8}</style>
  <h1>Music loop audition</h1>
  <p>Runtime plays each track through its composed ending and restarts after a short breath. Loop candidates below were found by analysis only and are <strong>not verified</strong>. Listen, then set <code>auditioned: true</code> in <code>src/assets/audio-manifest.ts</code> only if a seam is truly seamless.</p>
  ${MUSIC.map(
    (t) => `<section data-track="${t.id}"><h2>${t.title}</h2>
      <p><small>${t.durationSec}s · ${t.integratedLufs} LUFS (runtime gain ${t.gainDb} dB) · ending: ${t.ending} · ${musicUrl(t.id) ? 'file present' : '<strong>file missing</strong>'}</small></p>
      <button data-seam="restart" data-id="${t.id}">Play runtime restart seam (end → ${t.loop.gapSec}s breath → start)</button>
      ${t.loop.candidates
        .map((c, i) => `<div><button data-seam="cand" data-id="${t.id}" data-i="${i}">Candidate ${i + 1}: ${c.end}s → ${c.start}s</button> <small>similarity ${c.similarity}, seam at ${c.seamPercentile}th percentile, auditioned: ${c.auditioned}</small></div>`)
        .join('')}
    </section>`,
  ).join('')}
  <button data-seam="stop">Stop</button>`;
root.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-seam]');
  if (!b) return;
  if (b.dataset.seam === 'stop') return stop();
  const t = MUSIC.find((m) => m.id === b.dataset.id)!;
  if (b.dataset.seam === 'restart') playSeam(t, t.durationSec, 0, t.loop.gapSec);
  else {
    const c = t.loop.candidates[Number(b.dataset.i)]!;
    playSeam(t, c.end, c.start);
  }
});

// ---- Ambience bed seams, the knock motif and SFX variants (dev-only; the game itself plays them through
// the AudioManager). Approving a bed seam means setting `auditioned: true` for it in
// scripts/build-audio.py's output (src/assets/sound-manifest.json) — by ear, never by analysis alone.
import sounds from '../assets/sound-manifest.json';
import { loopBounds, seamJump } from '../audio/loop';
import { bedUrl, MOTIF, sampleUrl, VARIANTS, type BedId } from '../audio/sounds';

let ctx: AudioContext | null = null;
let live: AudioBufferSourceNode[] = [];
const cache = new Map<string, AudioBuffer>();
async function buf(url: string): Promise<AudioBuffer> {
  ctx ??= new AudioContext();
  const hit = cache.get(url);
  if (hit) return hit;
  const b = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
  cache.set(url, b);
  return b;
}
function stopAll(): void {
  for (const s of live) {
    try {
      s.stop();
    } catch {
      /* stopped */
    }
  }
  live = [];
}
function play(b: AudioBuffer, at = 0, gain = 1, opts: { loop?: [number, number]; offset?: number; stopAfter?: number } = {}): void {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = b;
  const g = c.createGain();
  g.gain.value = gain;
  s.connect(g).connect(c.destination);
  if (opts.loop) {
    s.loop = true;
    [s.loopStart, s.loopEnd] = opts.loop;
  }
  s.start(c.currentTime + at, opts.offset ?? 0);
  if (opts.stopAfter) s.stop(c.currentTime + at + opts.stopAfter);
  live.push(s);
}

const sec = document.createElement('div');
sec.innerHTML = `
  <h1>Ambience bed seams</h1>
  <p>Each button plays the last 6 s of the bed and lets it wrap into its start exactly as the game loops it
  (decoder priming trimmed). Listen on headphones <em>and</em> speakers for a click, a level jump or a doubled voice in the
  3 s cross-fade. Measured values are shown; none is approved until a person sets <code>auditioned: true</code>.</p>
  ${sounds.ambience.map((a) => `<section><h2>${a.id}</h2><p><small>${a.purpose} · ${a.durationSec}s · ${a.lufs} LUFS · spectral seam percentile ${a.seamPercentile} · auditioned: ${a.auditioned}</small></p>
    <button data-bed="${a.id}">Play seam</button> <small class="bed-measure" data-for="${a.id}"></small></section>`).join('')}
  <h1>Knock motif</h1>
  <section><p>Three matched knocks every ${MOTIF.interval}s, then the answer from beyond after ${MOTIF.answerGap}s. It must never resemble the fake speaker (a voice recording, not supplied — caption only).</p>
    <button data-motif="full">Three + the answer</button><button data-motif="soft">Soft (taps / domino box)</button><button data-motif="one">One quiet knock</button></section>
  <h1>SFX variants</h1>
  <section>${Object.entries(VARIANTS).map(([id, list]) => `<div><strong>${id}</strong> ${list.map((v) => `<button data-sfx="${v}">${v}</button>`).join('')}</div>`).join('')}</section>
  <button data-seam="stop">Stop</button>`;
root.append(sec);
sec.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  stopAll();
  void (async () => {
    if (b.dataset.bed) {
      const url = bedUrl(b.dataset.bed as BedId);
      if (!url) return;
      const ab = await buf(url);
      const ch = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i));
      const lb = loopBounds(ch, Math.floor(ab.sampleRate * 0.2));
      const [ls, le] = [lb.start / ab.sampleRate, lb.end / ab.sampleRate];
      const m = sec.querySelector<HTMLElement>(`.bed-measure[data-for="${b.dataset.bed}"]`);
      if (m) m.textContent = `decoded ${ab.length} samples @ ${ab.sampleRate} Hz; loop ${lb.start}–${lb.end}; wrap jump ${seamJump(ch, lb).toFixed(2)}× a typical step`;
      play(ab, 0, 1, { loop: [ls, le], offset: Math.max(ls, le - 6), stopAfter: 12 });
    } else if (b.dataset.motif) {
      const soft = b.dataset.motif === 'soft';
      if (b.dataset.motif === 'one') return play(await buf(sampleUrl(MOTIF.knocks[0])!), 0, 0.5);
      const knocks = await Promise.all(MOTIF.knocks.map((k) => buf(sampleUrl(k)!)));
      knocks.forEach((k, i) => play(k, i * MOTIF.interval, soft ? 0.5 : 0.85));
      play(await buf(sampleUrl(MOTIF.beyond)!), 2 * MOTIF.interval + MOTIF.answerGap, soft ? 0.55 : 0.8);
    } else if (b.dataset.sfx) {
      const url = sampleUrl(b.dataset.sfx);
      if (url) play(await buf(url));
    }
  })();
});
