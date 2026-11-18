/**
 * npm run audio — the scene soundtrack in a real browser (dev server, Chromium, real Web Audio
 * with decoded buffers). Every AudioBufferSourceNode start/stop is recorded, so "no ghost sound"
 * is checked on the audio clock, not guessed from timers.
 *
 *  A. Touch-to-start → intro → menu: nothing sounds before the gesture or during the intro; the
 *     start tap never plays a UI sound; every short sample decodes; at most one music track.
 *  B. UI and tile sounds: menu buttons play select/confirm/back samples; a legal tile plays a pickup.
 *  C. Prologue: "three measured knocks" = three matched knocks evenly spaced; the next beat cancels
 *     unstarted knocks; the fourth knock plays alone on its own beat; the cave bed loops.
 *  D. Chapter 6: the exact motif (three + a later answer) plays in full when the player waits.
 *  E. Rapid advance through knock beats: no knock starts after the player has moved on.
 *  F. Resume a saved scene on a knock beat: the knock is NOT replayed.
 *  G. Mute and silent levels: no voices at all. Backgrounding drops the bed; foregrounding restores it.
 *  H. Missing / broken files: beds go silent, SFX fall back to the synth placeholder, no errors.
 *  I. Rapid scene changes: ≤ 1 music element and ≤ 2 beds (one fading) at every sample.
 *  J. Bed loops: decoded length, loop bounds and the wrap jump measured with the browser's own decoder.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sounds from '../src/assets/sound-manifest.json' with { type: 'json' };
import { MOTIF } from '../src/audio/motif.ts';
import { insertLines, segments } from '../src/story/chapters.ts';
import type { Scene } from '../src/story/parse.ts';
import scriptJson from '../src/story/script.json' with { type: 'json' };

type Page = import('playwright').Page;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/audio');
mkdirSync(out, { recursive: true });
const script = scriptJson as unknown as { scenes: Scene[] };
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

const server = await createServer({ root, logLevel: 'error', server: { port: 5189, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5189/';
const browser = await chromium.launch();

/** Records every buffer source on the audio clock, and every voice the backend is asked for. */
const INIT = `
window.__name = (f) => f; window.__sbStoryFast = true; window.__sbIntroVideo = null; // the credit is tested in e2e § 7
window.__nodes = [];
const P = AudioBufferSourceNode.prototype, s0 = P.start, t0 = P.stop;
P.start = function (when = 0, ...a) {
  const c = this.context;
  this.__rec = { startAt: when || c.currentTime, createdAt: c.currentTime, dur: this.buffer ? this.buffer.duration : 0, len: this.buffer ? this.buffer.length : 0, loop: this.loop, stopAt: null, sample: this.__sample || null };
  window.__nodes.push(this.__rec);
  return s0.call(this, when, ...a);
};
P.stop = function (when = 0) {
  if (this.__rec && this.__rec.stopAt === null) this.__rec.stopAt = when || this.context.currentTime;
  return t0.call(this, when);
};
`;

interface Voice {
  sample: string | null;
  delay: number;
  gain: number;
  rate: number;
  scene: string;
  ctxTime: number;
}
async function newPage(o: { block?: RegExp } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  page.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && !(o.block && /Failed to load resource|net::ERR_FAILED/.test(m.text())) && errors.push(m.text()));
  if (o.block) await page.route(o.block, (r: { abort(): Promise<void> }) => r.abort());
  return { page, errors, ctx };
}
/** Wrap the backend once the app has booted: log each voice with the scene and audio-clock time. */
async function instrument(page: Page) {
  await page.waitForFunction('window.__sbAudio');
  await page.evaluate(`(() => {
    const A = window.__sbAudio; if (A.__wrapped) return; A.__wrapped = true;
    window.__voices = [];
    const orig = A.backend.playSfx.bind(A.backend);
    A.backend.playSfx = (v) => { window.__voices.push({ ...v, scene: A.audio.scene, ctxTime: window.__ctxTime() }); return orig(v); };
  })()`);
}
const voices = (page: Page) => page.evaluate('window.__voices || []') as Promise<Voice[]>;
const nodes = (page: Page) => page.evaluate('window.__nodes') as Promise<{ startAt: number; createdAt: number; dur: number; len: number; loop: boolean; stopAt: number | null }[]>;
const ctxTime = (page: Page) => page.evaluate('window.__ctxTime()') as Promise<number>;
const audioState = (page: Page) =>
  page.evaluate(`(() => { const A = window.__sbAudio; return { scene: A.audio.scene, profile: A.audio.profile, playing: A.audio.playing, music: A.backend.playingCount(), bed: A.backend.bedState(), pending: A.audio.pendingCueVoices(), stats: { ...A.audio.stats }, bstats: { ...A.backend.stats, bedLoops: undefined }, buffers: A.backend.bufferStates(), unlocked: A.audio.unlocked }; })()`) as Promise<{
    scene: string;
    profile: string | null;
    playing: string | null;
    music: number;
    bed: { bed: string | null; fadingOut: string | null; wanted: string | null };
    pending: number;
    stats: Record<string, number>;
    bstats: Record<string, number>;
    buffers: Record<string, string>;
    unlocked: boolean;
  }>;
const dstate = (page: Page) => page.evaluate(`window.__sbStory ? JSON.stringify({ state: __sbStory.director.state, index: __sbStory.director.index, scene: __sbStory.sceneId }) : 'null'`).then((s: unknown) => JSON.parse(s as string) as { state: string; index: number; scene: string } | null);
async function waitFor(fn: () => Promise<boolean>, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}
const waitState = (page: Page, want: string, ms = 8000) => waitFor(async () => (await dstate(page))?.state === want, ms);
async function toMenu(page: Page) {
  await page.goto(BASE);
  await instrument(page);
  await page.click('.start-button');
  await page.waitForSelector('[data-act="story"]', { timeout: 15000 });
}
async function seed(page: Page, p: Record<string, unknown>) {
  await page.evaluate((data: unknown) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data })), { outcome: null, completed: [], textScale: 1, startedAt: 1, hand: null, ...p });
}
function locate(id: string, at: string): { part: 'pre' | 'post'; index: number } {
  const seg = segments(script.scenes.find((s) => s.id === id)!);
  const pre = seg.pre.findIndex((b) => b.raw.startsWith(at));
  if (pre >= 0) return { part: 'pre', index: pre };
  const post = [...insertLines(seg.inserts.win!), ...seg.post].findIndex((b) => b.raw.startsWith(at));
  if (post < 0) throw new Error(`anchor not found: ${id} ${at}`);
  return { part: 'post', index: post };
}
/** Open the case file at a seeded beat (from the menu) and wait until it is presenting. */
async function openAt(page: Page, id: string, at: string, offset = 0) {
  const { part, index } = locate(id, at);
  await seed(page, { sceneId: id, part, index: index + offset, outcome: part === 'post' ? 'win' : null });
  await page.click('[data-act="story"]');
  await page.waitForSelector('.story-shell');
  await page.click('[data-act="story-continue"]');
  check(await waitState(page, 'presenting'), `${id}: never reached presenting`);
}
/** Next, through any reveal, onto the following beat. */
async function next(page: Page) {
  const before = (await dstate(page))?.index ?? -1;
  for (let i = 0; i < 4; i++) {
    await page.click('[data-act="story-next"]');
    if ((await dstate(page))?.index !== before) return;
    await page.waitForTimeout(30);
  }
}
async function backToMenu(page: Page) {
  await page.goto(BASE);
  await instrument(page);
  await page.click('.start-button');
  await page.waitForSelector('[data-act="story"]', { timeout: 15000 });
}
const motifSamples = new Set<string>([...MOTIF.knocks, MOTIF.beyond]);

/** Expose the backend's audio clock to the page probes (dev only). */
async function clock(page: Page) {
  await page.evaluate(`window.__ctxTime = () => { const c = window.__sbAudio.backend.context; return c ? c.currentTime : 0; }`);
}

try {
  // ---- A. start → intro → menu -----------------------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await page.goto(BASE);
    await instrument(page);
    await clock(page);
    const before = await audioState(page);
    check(!before.unlocked && before.music === 0 && (await nodes(page)).length === 0, `A: audio before the gesture (${JSON.stringify(before)})`);
    await page.click('.start-button');
    // Sample the scene while the intro/fallback runs.
    const seen: string[] = [];
    await waitFor(async () => {
      const s = await audioState(page);
      seen.push(s.scene);
      return s.scene === 'menu';
    }, 15000);
    await page.waitForSelector('[data-act="story"]');
    const v = await voices(page);
    check(!v.some((x) => x.scene === 'init' || x.scene === 'intro'), `A: a sound was requested during init/intro: ${JSON.stringify(v.filter((x) => x.scene !== 'menu'))}`);
    check(v.length === 0, `A: the start tap / intro produced voices: ${JSON.stringify(v)}`);
    // At the menu only the UI sounds are decoded; table and story samples wait for their scenes.
    const uiCount = sounds.sfx.filter((x) => x.id.startsWith('ui-')).length;
    const decoded = await waitFor(async () => Object.entries((await audioState(page)).buffers).filter(([k, x]) => k.startsWith('ui-') && x === 'decoded').length >= uiCount, 8000);
    const st = await audioState(page);
    check(decoded, `A: the UI samples did not decode: ${JSON.stringify(st.buffers)}`);
    check(!Object.keys(st.buffers).some((k) => /^(tile-|motif-|water-|glass-|pass-|result-)/.test(k)), `A: table/story samples or result cues fetched at the menu: ${Object.keys(st.buffers).join(',')}`);
    check(st.music <= 1, `A: ${st.music} music elements playing`);
    notes.push(`A: scenes during start ${[...new Set(seen)].join(' → ')}; ${Object.values(st.buffers).filter((x) => x === 'decoded').length} UI samples decoded at the menu (table/story samples deferred); music playing: ${st.playing}; intro video ${(await page.evaluate("document.querySelector('video') ? 'element present' : 'absent (fallback)'"))}`);
    check(errors.length === 0, `A: page errors ${errors.join(' | ')}`);

    // ---- B. UI + tile sounds ---------------------------------------------------------------------------
    await page.click('[data-go="settings"]');
    await page.waitForTimeout(150);
    let vb = await voices(page);
    check(vb.some((x) => /^ui-(select|confirm)-/.test(x.sample ?? '')), `B: Settings button played no UI sample: ${JSON.stringify(vb)}`);
    await page.keyboard.press('Escape');
    await page.goto(BASE);
    await instrument(page);
    await clock(page);
    await page.click('.start-button');
    await page.waitForSelector('[data-go="setup"]');
    await page.click('[data-go="setup"]');
    await page.click('button[type="submit"].btn-start');
    await page.waitForSelector('.hand-tile', { timeout: 15000 });
    await waitFor(async () => (await page.locator('.hand-tile.is-legal').count()) > 0, 15000);
    const legal = page.locator('.hand-tile.is-legal').first();
    if (await legal.count()) await legal.click();
    await page.waitForTimeout(120);
    vb = await voices(page);
    check(vb.some((x) => /^tile-pickup-/.test(x.sample ?? '')), `B: selecting a legal tile played no pickup: ${JSON.stringify(vb.map((x) => x.sample))}`);
    check(vb.some((x) => x.sample === 'tile-drop-owner-1'), `B: the deal did not play the owner's dominoes-dropped recording: ${JSON.stringify(vb.map((x) => x.sample))}`);
    const qp = await audioState(page);
    check(qp.bed.wanted === 'amb-patio', `B: Quick Play bed ${JSON.stringify(qp.bed)}`);
    notes.push(`B: UI ${vb.filter((x) => /^ui-/.test(x.sample ?? '')).map((x) => x.sample).join(', ')}; table ${vb.filter((x) => /^tile-/.test(x.sample ?? '')).map((x) => x.sample).join(', ')}; Quick Play bed ${qp.bed.wanted}`);
    await page.close();
  }

  // ---- C. prologue knocks ------------------------------------------------------------------------------
  {
    const { page, errors } = await newPage();
    // The first direction is beat 0 of the prologue: start a fresh case.
    await page.goto(BASE);
    await instrument(page);
    await clock(page);
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await page.evaluate("localStorage.removeItem('sticks-and-bones.story')");
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await page.click('[data-act="story-new"]');
    if (await page.locator('dialog.confirm[open] [data-act="confirm-yes"]').count()) await page.click('dialog.confirm[open] [data-act="confirm-yes"]');
    check(await waitState(page, 'presenting'), 'C: prologue never presented');
    await page.waitForTimeout(100);
    let v = (await voices(page)).filter((x) => motifSamples.has(x.sample ?? ''));
    check(v.map((x) => x.sample).join() === MOTIF.knocks.join(), `C: "three measured knocks" voices ${JSON.stringify(v.map((x) => x.sample))}`);
    const d = v.map((x) => x.delay);
    check(Math.abs(d[1]! - d[0]! - MOTIF.interval) < 1e-6 && Math.abs(d[2]! - d[1]! - MOTIF.interval) < 1e-6, `C: knock spacing ${d}`);
    const st = await audioState(page);
    check(st.profile === 'prologue' && st.scene === 'story' && st.playing === null, `C: prologue mix ${JSON.stringify({ p: st.profile, s: st.scene, m: st.playing })}`);
    await waitFor(async () => (await audioState(page)).bed.bed === 'amb-cave', 6000);
    check((await audioState(page)).bed.bed === 'amb-cave', `C: cave bed not sounding: ${JSON.stringify((await audioState(page)).bed)}`);
    // Move on at once: knocks 2 and 3 have not started yet and must never start.
    const tLeave = await ctxTime(page);
    await next(page);
    await page.waitForTimeout(1600);
    const ghosts = (await nodes(page)).filter((n) => n.createdAt <= tLeave && n.startAt > tLeave + 0.01 && (n.stopAt === null || n.stopAt > n.startAt) && !n.loop);
    check(ghosts.length === 0, `C: ${ghosts.length} knock(s) started after the player moved on: ${JSON.stringify(ghosts)}`);
    // The fourth knock is its own beat.
    await next(page);
    await page.waitForTimeout(100);
    v = (await voices(page)).filter((x) => motifSamples.has(x.sample ?? ''));
    check(v.at(-1)?.sample === MOTIF.beyond && v.at(-1)?.delay === 0, `C: the fourth knock did not play alone: ${JSON.stringify(v.map((x) => x.sample))}`);
    notes.push(`C: prologue — 3 matched knocks at ${d.map((x) => x.toFixed(2)).join('/')} s; next beat cancelled the unstarted ones (0 ghosts); fourth knock alone on its beat; bed ${(await audioState(page)).bed.bed}`);
    check(errors.length === 0, `C: page errors ${errors.join(' | ')}`);

    // ---- D. chapter 6 motif, waited out ---------------------------------------------------------------
    await backToMenu(page);
    await clock(page);
    await openAt(page, 'chapter-6', '[He nods. Three knocks. A fourth answers from beyond the platform.', -1);
    const n0 = (await nodes(page)).length;
    await next(page);
    await page.waitForTimeout(3200);
    const mv = (await voices(page)).filter((x) => motifSamples.has(x.sample ?? ''));
    check(mv.map((x) => x.sample).join() === [...MOTIF.knocks, MOTIF.beyond].join(), `D: motif voices ${JSON.stringify(mv.map((x) => x.sample))}`);
    const md = mv.map((x) => x.delay);
    check(Math.abs(md[3]! - md[2]! - MOTIF.answerGap) < 1e-6, `D: answer gap ${md}`);
    const started = (await nodes(page)).slice(n0).filter((n) => !n.loop);
    const heard = started.filter((n) => n.stopAt === null || n.stopAt > n.startAt + 0.05);
    check(heard.length >= 4, `D: only ${heard.length} motif sources actually sounded`);
    const rel = heard.slice(0, 4).map((n) => n.startAt - heard[0]!.startAt);
    check(Math.abs(rel[1]! - MOTIF.interval) < 0.002 && Math.abs(rel[3]! - (2 * MOTIF.interval + MOTIF.answerGap)) < 0.002, `D: scheduled start times ${rel}`);
    const s6 = await audioState(page);
    // Before the cut to the rest area the cave suspense bed plays under the knocks (one track, low).
    check(s6.profile === 'chapter-6' && s6.playing === 'threshold' && s6.music <= 1, `D: chapter-6 mix ${JSON.stringify({ p: s6.profile, m: s6.playing, n: s6.music })}`);
    notes.push(`D: chapter 6 — motif on the audio clock at ${rel.map((x) => x.toFixed(3)).join(', ')} s (exact to the sample); music ${s6.playing} (one element); bed ${s6.bed.bed}`);

    // ---- E. rapid advance -------------------------------------------------------------------------------
    await backToMenu(page);
    await clock(page);
    await openAt(page, 'chapter-6', '[He nods. Three knocks. A fourth answers from beyond the platform.', -1);
    await page.click('[data-act="story-next"]');
    await page.click('[data-act="story-next"]');
    for (let i = 0; i < 6; i++) {
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(60);
    }
    const tLast = await ctxTime(page);
    await page.waitForTimeout(3000);
    const ghostsE = (await nodes(page)).filter((n) => n.createdAt <= tLast - 0.001 && n.startAt > tLast + 0.02 && (n.stopAt === null || n.stopAt > n.startAt) && !n.loop);
    check(ghostsE.length === 0, `E: ${ghostsE.length} delayed sound(s) after rapid advance: ${JSON.stringify(ghostsE)}`);
    check((await audioState(page)).pending <= 4, 'E: more than one cue alive');
    notes.push(`E: rapid advance (8 taps) — 0 ghost starts; cancelled cue voices so far ${(await audioState(page)).stats.cuesCancelled}`);

    // ---- F. resume on the knock beat --------------------------------------------------------------------
    await backToMenu(page);
    await clock(page);
    await openAt(page, 'chapter-6', '[He nods. Three knocks. A fourth answers from beyond the platform.');
    await page.waitForTimeout(1500);
    const fv = (await voices(page)).filter((x) => motifSamples.has(x.sample ?? ''));
    check(fv.length === 0, `F: resuming on a knock beat replayed it: ${JSON.stringify(fv)}`);
    notes.push('F: resume on the chapter-6 knock beat — no knock replayed');

    // ---- G. mute / silent / background ------------------------------------------------------------------
    await page.evaluate(`window.__sbAudio.audio.setLevels({ ...window.__sbAudio.audio.levels, muted: true })`);
    await page.click('[data-act="story-back"]');
    await page.waitForTimeout(200);
    const nv = (await voices(page)).length;
    await next(page);
    await page.waitForTimeout(300);
    check((await voices(page)).length === nv, 'G: muted, but the knock beat requested voices');
    await page.evaluate(`window.__sbAudio.audio.setLevels({ ...window.__sbAudio.audio.levels, muted: false, sfx: 0 })`);
    await page.click('[data-act="story-back"]');
    await next(page);
    await page.waitForTimeout(200);
    check((await voices(page)).length === nv, 'G: SFX level 0, but voices were requested');
    await page.evaluate(`window.__sbAudio.audio.setLevels({ ...window.__sbAudio.audio.levels, sfx: 0.8 })`);
    // Background / foreground.
    await page.evaluate(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()`);
    await page.waitForTimeout(150);
    const hid = await audioState(page);
    check(hid.bed.wanted === null && hid.music === 0 && hid.pending === 0, `G: hidden but still sounding ${JSON.stringify(hid.bed)}`);
    await page.evaluate(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); })()`);
    const back = await waitFor(async () => (await audioState(page)).bed.bed === 'amb-cave', 5000);
    check(back, `G: foreground did not restore the cave bed ${JSON.stringify((await audioState(page)).bed)}`);
    notes.push('G: muted and SFX-0 knock beats request no voices; hidden → no bed, no music, no cue; visible → cave bed restored');
    check(errors.length === 0, `C–G: page errors ${errors.join(' | ')}`);
    await page.close();
  }

  // ---- H. missing files ---------------------------------------------------------------------------------
  {
    // Two kinds of failure: aborted requests (offline: transient) and a real 404 (absent: missing).
    const { page, errors } = await newPage({ block: /(amb-cave|ui-select-1)[^/?]*\.(mp3|wav)$/ });
    await page.route(/motif-knock-2[^/?]*\.(mp3|wav)$/, (r: { fulfill(o: { status: number; body: string }): Promise<void> }) => r.fulfill({ status: 404, body: '' }));
    await page.goto(BASE);
    await instrument(page);
    await clock(page);
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await page.waitForTimeout(800);
    await page.evaluate("localStorage.removeItem('sticks-and-bones.story')");
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await page.click('[data-act="story-new"]');
    if (await page.locator('dialog.confirm[open] [data-act="confirm-yes"]').count()) await page.click('dialog.confirm[open] [data-act="confirm-yes"]');
    await waitState(page, 'presenting');
    await page.waitForTimeout(2500);
    const s = await audioState(page);
    check(s.bed.bed === null && s.bed.wanted === 'amb-cave', `H: blocked cave bed: ${JSON.stringify(s.bed)}`);
    check(s.buffers['motif-knock-2'] === 'missing' && (s.bstats.synthFallback ?? 0) >= 1, `H: missing knock did not fall back (${s.buffers['motif-knock-2']}, fallback ${s.bstats.synthFallback})`);
    check(s.buffers['bed:amb-cave'] === 'transient', `H: an aborted bed should be transient (retryable), not ${s.buffers['bed:amb-cave']}`);
    const v = (await voices(page)).filter((x) => motifSamples.has(x.sample ?? ''));
    check(v.length === 3, 'H: the knock count changed when one file was missing');
    check(errors.length === 0, `H: page errors ${errors.join(' | ')}`);
    notes.push(`H: amb-cave / ui-select-1 aborted (transient: retryable) and motif-knock-2 a 404 (absent: never retried) — bed silent (wanted ${s.bed.wanted}), knock 2 via synth placeholder (still 3 knocks), ${s.bstats.transient} transient, ${s.bstats.missing} missing, no page errors`);
    await page.close();
  }

  // ---- I. rapid scene changes ---------------------------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    await clock(page);
    let maxMusic = 0;
    let maxBeds = 0;
    const sample = async () => {
      const s = await audioState(page);
      maxMusic = Math.max(maxMusic, s.music);
      maxBeds = Math.max(maxBeds, (s.bed.bed ? 1 : 0) + (s.bed.fadingOut ? 1 : 0));
    };
    for (const [id, at] of [
      ['chapter-1', '[Cut to'],
      ['chapter-4', '[Let the surf hold the silence.'],
      ['chapter-5', '[A small line of water gathers on a root'],
      ['chapter-7', '[Vale checks his phone.'],
      ['epilogue', '[A knock at the gate.'],
    ] as const) {
      await page.goto(BASE);
      await instrument(page);
      await clock(page);
      await page.click('.start-button');
      await page.waitForSelector('[data-act="story"]');
      try {
        await openAt(page, id, at);
      } catch {
        await openAt(page, id, '[');
      }
      for (let i = 0; i < 6; i++) {
        await sample();
        await page.waitForTimeout(120);
      }
      const s = await audioState(page);
      notes.push(`I: ${id} → profile ${s.profile}, music ${s.playing ?? 'none'}, bed ${s.bed.wanted}`);
      await page.click('[data-act="story-home"], [data-act="story-file"]').catch(() => {});
      await sample();
    }
    check(maxMusic <= 1, `I: ${maxMusic} music elements at once`);
    check(maxBeds <= 2, `I: ${maxBeds} beds at once`);
    check(errors.length === 0, `I: page errors ${errors.join(' | ')}`);
    notes.push(`I: max concurrent music ${maxMusic}, max beds ${maxBeds} (one fading)`);
    await page.close();
  }

  // ---- K. owner recordings: decoded in Chromium; a real story hand's result cue; no replay on reload ----------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    await clock(page);
    // Count result cues at the manager (presentation hook) without changing behaviour.
    await page.evaluate(`(() => { const A = window.__sbAudio.audio; const f = A.resultCue.bind(A); window.__cues = []; A.resultCue = (k) => { const ok = f(k); window.__cues.push({ k, ok, scene: A.scene }); return ok; }; })()`);
    await seed(page, { sceneId: 'chapter-4', part: 'hand', index: 0, completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3'] });
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await page.click('[data-act="story-continue"]');
    await page.waitForSelector('.table-screen', { timeout: 20000 });
    const owned = ['tile-slam-owner-1', 'tile-slam-owner-2', 'tile-drop-owner-1', 'result-win', 'result-other'];
    const decoded = await waitFor(async () => {
      const b = (await audioState(page)).buffers;
      return owned.every((id) => b[id] === 'decoded');
    }, 15000);
    const bufs = (await audioState(page)).buffers;
    check(decoded, `K: owner samples not decoded at the table: ${JSON.stringify(Object.fromEntries(owned.map((id) => [id, bufs[id]])))}`);
    // The case file's menu track fades out first (one source at a time); then the chapter's track plays.
    const promenade = await waitFor(async () => (await audioState(page)).playing === 'promenade', 8000);
    const inHand = await audioState(page);
    check(promenade && inHand.music <= 1, `K: chapter 4's hand should play "promenade" (one track): ${inHand.playing} / ${inHand.music}`);
    // Play the hand out (fast story timing): the results sheet plays exactly one cue of the right kind.
    let done = false;
    const until = Date.now() + 120_000;
    while (!done && Date.now() < until) {
      done = await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false);
      if (done) break;
      const legal = page.locator('.hand-tile.is-legal');
      if (await legal.count()) {
        await legal.first().click({ timeout: 2000 }).catch(() => undefined);
        await page.locator('.end-slot.is-legal').first().click({ timeout: 2000 }).catch(() => undefined);
        continue;
      }
      const act = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
      if (await act.count()) await act.first().click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(60);
    }
    check(done, 'K: the chapter-4 hand did not finish');
    await page.waitForTimeout(400);
    const cues = (await page.evaluate('window.__cues')) as { k: string; ok: boolean; scene: string }[];
    const outcome = (await page.evaluate(`JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data?.outcome ?? null`)) as string | null;
    check(cues.length === 1 && cues[0]!.ok && cues[0]!.scene === 'results' && cues[0]!.k === (outcome === 'win' ? 'win' : 'other'), `K: result cues ${JSON.stringify(cues)} for outcome ${outcome}`);
    const cueVoice = (await voices(page)).find((x) => x.sample === `result-${cues[0]?.k}`) as (Voice & { bus?: string; placeholder?: boolean }) | undefined;
    check(cueVoice?.bus === 'music' && cueVoice?.placeholder === false, `K: the cue was not a music-bus buffer: ${JSON.stringify(cueVoice)}`);
    const atResults = await audioState(page);
    check(atResults.music <= 1, `K: ${atResults.music} music elements under the cue`);
    // Reload with the results sheet showing: the restored sheet never replays the cue.
    await page.reload();
    await instrument(page);
    await clock(page);
    await page.evaluate(`(() => { const A = window.__sbAudio.audio; const f = A.resultCue.bind(A); window.__cues = []; A.resultCue = (k) => { const ok = f(k); window.__cues.push({ k, ok }); return ok; }; })()`);
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]', { timeout: 15000 });
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await page.click('[data-act="story-continue"]');
    await page.waitForTimeout(2500);
    const replayed = (await page.evaluate('window.__cues')) as unknown[];
    check(replayed.length === 0, `K: a cue was replayed after the reload: ${JSON.stringify(replayed)}`);
    check(errors.length === 0, `K: page errors ${errors.join(' | ')}`);
    notes.push(`K: owner slams, drop and both result cues decoded in Chromium; chapter-4 hand played "promenade" (${inHand.music} element); the ${outcome} → "${cues[0]?.k}" cue played once on the music bus at the results sheet; after a reload nothing replayed`);
    await page.close();
  }

  // ---- J. bed loops measured with the browser decoder -------------------------------------------------
  {
    const { page } = await newPage();
    await page.goto(BASE);
    const rows = (await page.evaluate(`(async () => {
      const { bedUrl } = await import('/src/audio/sounds.ts');
      const { loopBounds, seamJump } = await import('/src/audio/loop.ts');
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const out = [];
      for (const id of ['amb-patio', 'amb-promenade', 'amb-jungle', 'amb-cave', 'amb-terrace']) {
        const b = await ctx.decodeAudioData(await (await fetch(bedUrl(id))).arrayBuffer());
        const ch = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));
        const lb = loopBounds(ch, Math.floor(b.sampleRate * 0.2));
        out.push({ id, length: b.length, rate: b.sampleRate, start: lb.start, end: lb.end, jump: seamJump(ch, lb), rawJump: seamJump(ch, { start: 0, end: b.length }) });
      }
      return out;
    })()`)) as { id: string; length: number; rate: number; start: number; end: number; jump: number; rawJump: number }[];
    for (const r of rows) {
      const m = sounds.ambience.find((a) => a.id === r.id)!;
      const want = m.durationSec * 44100;
      check(r.jump < 10, `J: ${r.id} wrap jump ${r.jump.toFixed(2)}× a typical step (audible click risk)`);
      notes.push(`J: ${r.id} decoded ${r.length} samples (authored ${want}; ${r.length - want >= 0 ? '+' : ''}${r.length - want}); loop ${r.start}–${r.end}; wrap jump ${r.jump.toFixed(2)}× (untrimmed ${r.rawJump.toFixed(2)}×); spectral seam percentile ${m.seamPercentile}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

writeFileSync(join(out, 'report.json'), JSON.stringify({ failures, notes }, null, 1));
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\naudio: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\naudio: all checks passed');
