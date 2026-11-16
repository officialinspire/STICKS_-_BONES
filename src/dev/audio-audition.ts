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
