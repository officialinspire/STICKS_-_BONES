/**
 * npm run perf:story — measure the PRODUCTION build (run `npm run build` first) served by `vite preview`,
 * in Chromium on an emulated phone link (9 Mbps, 150 ms RTT) with 4× CPU slowdown:
 *
 *  A. Startup in portrait (390×844 @3x) and landscape (1366×768 @1x): requests and bytes to the start
 *     screen and to the menu (+6 s idle). Gates: no PNG source, no story backdrop, cast sheet, ambience
 *     bed or table/story SFX; the gameplay track not fetched; the patio served as the viewport's variant.
 *  B. Story chapter entry: time from Continue to the revealed scene (decode before reveal), bytes for
 *     the chapter, image decode work from a DevTools trace, and the next chapter prefetched afterwards.
 *  C. Responsiveness: Event Timing for story Next taps (an INP proxy) under 4× CPU.
 *  D. Leaks: eight chapter visits (open → advance → back to the case file). After each, a forced GC
 *     and CDP metrics (DOM nodes, JS listeners, heap) plus instrumented counts (live timers, workers,
 *     sounding/scheduled buffer sources, media elements, decoded images retained by the warmer).
 *     Gate: nothing grows between visit 2 and visit 8 beyond a small tolerance.
 *
 * Output: test-results/perf/story.json. Limits are the MEASURED values recorded in docs/PERFORMANCE.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
type Page = import('playwright').Page;
type CDP = Awaited<ReturnType<import('playwright').BrowserContext['newCDPSession']>>;

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'test-results/perf');
mkdirSync(outDir, { recursive: true });
const server = await preview({ root, logLevel: 'error', preview: { port: 5198, strictPort: true } });
const BASE = 'http://localhost:5198/';
const browser = await chromium.launch();
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

/** Measured limits (docs/PERFORMANCE.md § Story). Change only with a new measurement and a reason. */
const LIMITS = {
  // Essential bytes to the menu; the build-time startup budget is 900 KB (scripts/check-dist.mjs).
  startupMenuKB: { portrait: 900, landscape: 900 },
  startupRequests: 40,
  chapterEntryMs: 4500,
  nextTapMs: 200,
  leakNodes: 60,
  leakListeners: 12,
  leakHeapMB: 3,
};

const INIT = `
  window.__ev = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => __ev.push({ n: e.name, d: e.duration, t: e.startTime }))).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  // Live timers: created and not yet fired/cleared (intervals count until cleared).
  window.__timers = new Map();
  const st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, ci = window.clearInterval;
  window.setTimeout = function (fn, ms, ...a) { const id = st(function () { __timers.delete(id); return typeof fn === 'function' ? fn.apply(this, arguments) : undefined; }, ms, ...a); __timers.set(id, 't'); return id; };
  window.clearTimeout = (id) => { __timers.delete(id); return ct(id); };
  window.setInterval = function (fn, ms, ...a) { const id = si(fn, ms, ...a); __timers.set(id, 'i'); return id; };
  window.clearInterval = (id) => { __timers.delete(id); return ci(id); };
  // Workers alive.
  window.__workers = 0;
  const W = window.Worker;
  if (W) window.Worker = class extends W { constructor(...a) { super(...a); __workers++; } terminate() { __workers--; return super.terminate(); } };
  // Buffer sources scheduled or sounding (looping beds count until stopped).
  window.__sources = 0;
  const P = AudioBufferSourceNode.prototype, s0 = P.start, t0 = P.stop;
  P.start = function (...a) { __sources++; let done = false; const end = () => { if (!done) { done = true; __sources--; } }; this.addEventListener('ended', end); this.__end = end; return s0.apply(this, a); };
  P.stop = function (...a) { return t0.apply(this, a); };
`;
const RES = `(() => performance.getEntriesByType('resource').map((e) => ({ name: e.name.split('/').pop().split('?')[0], bytes: e.encodedBodySize || e.transferSize, start: Math.round(e.startTime), end: Math.round(e.responseEnd) })))()`;
type Res = { name: string; bytes: number; start: number; end: number };
// Bytes per distinct URL (a memory-cache hit or a service-worker answer repeats a URL; transferSize reads 0
// for SW responses, so the body size is used, once per URL).
const uniq = (r: Res[]) => [...new Map(r.map((e) => [e.name, e])).values()];
const kb = (r: Res[]) => Math.round(uniq(r).reduce((s, e) => s + e.bytes, 0) / 1024);

async function newPage(vp: { width: number; height: number; dpr: number }) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, hasTouch: vp.dpr > 1 });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (9e6 / 8) | 0, uploadThroughput: (2e6 / 8) | 0 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  return { page, cdp, ctx, errors };
}
async function metrics(page: Page, cdp: CDP) {
  await cdp.send('HeapProfiler.collectGarbage');
  const m = Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((x) => [x.name, x.value]));
  const app = (await page.evaluate(`({ timers: __timers.size, intervals: [...__timers.values()].filter((v) => v === 'i').length, workers: __workers, sources: __sources, media: document.querySelectorAll('audio, video').length, imgs: document.images.length, stages: document.querySelectorAll('.story-stage').length, dialogs: document.querySelectorAll('dialog[open]').length })`)) as Record<string, number>;
  return { nodes: m.Nodes!, listeners: m.JSEventListeners!, heapMB: +(m.JSHeapUsedSize! / 1048576).toFixed(2), ...app };
}
async function seed(page: Page, sceneId: string, index = 0) {
  await page.evaluate(([s, i]: readonly [string, number]) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: s, part: 'pre', index: i, outcome: null, completed: ['prologue'], textScale: 1, startedAt: 1, hand: null } })), [sceneId, index] as const);
}
// Waits return booleans / void, never element handles: a held handle pins its detached subtree through
// DevTools' global handles and shows up as a fake DOM leak (found with a heap snapshot).
const revealed = (page: Page) => page.waitForFunction(() => Boolean(document.querySelector('.st-curtain:not(.is-closed)') && document.querySelector('.dialogue-panel')), null, { timeout: 60_000 }).then((h: { dispose(): Promise<void> }) => h.dispose());

const report: Record<string, unknown> = { limits: LIMITS };
try {
  // ---- A. startup --------------------------------------------------------------------------------------
  for (const [name, vp] of [['portrait', { width: 390, height: 844, dpr: 3 }], ['landscape', { width: 1366, height: 768, dpr: 1 }]] as const) {
    const { page, ctx, errors } = await newPage(vp);
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'commit' });
    await page.locator('.start-button').first().waitFor({ timeout: 120_000 });
    const tStart = Date.now() - t0;
    await page.waitForLoadState('load');
    const atStart = (await page.evaluate(RES)) as Res[];
    const t1 = Date.now();
    await page.click('.start-button');
    await page.locator('[data-act="story"]').first().waitFor({ timeout: 120_000 });
    const tMenu = Date.now() - t1;
    // Gate: what it takes to reach the menu. Then 6 s of idle for the deliberate background warm-up (reported).
    const arrive = ((await page.evaluate(RES)) as Res[]).filter((r) => !/\.mp3$/.test(r.name));
    await page.waitForTimeout(6000);
    const atMenu = (await page.evaluate(RES)) as Res[];
    const names = atMenu.map((r) => r.name);
    const bad = names.filter((n) => /\.png$/.test(n) && !/icon/.test(n) || /^(back-alley|resort-patio|moonlit|jungle|cave|executive|cast-|amb-)/.test(n) || /^(tile-|motif-|water-|glass-|pass-knock)/.test(n) || /domino-table-subtle/.test(n));
    check(bad.length === 0, `A ${name}: story/source/deferred media fetched at startup: ${bad.join(', ')}`);
    const patio = names.filter((n) => /^neighborhood-patio/.test(n));
    check(name === 'portrait' ? patio.every((n) => /portrait/.test(n)) : patio.every((n) => !/portrait/.test(n)), `A ${name}: wrong patio variant ${patio.join(', ')}`);
    // Music streams (the menu track plays after the gesture); count it separately from startup bytes.
    const music = atMenu.filter((r) => /\.mp3$/.test(r.name));
    const nonMusic = atMenu.filter((r) => !/\.mp3$/.test(r.name));
    // Essential = what the first screens need (code, fonts, manifest, the viewport's patio variant and Cousin's
    // portrait — src/assets/warm.ts essentialAssets). Everything else is the deliberate background warm-up.
    const essential = arrive.filter((r) => /\.(js|css|html|woff2|webmanifest)$/.test(r.name) || !r.name.includes('.') || /^(neighborhood-patio|cousin-portrait-atlas)/.test(r.name));
    check(kb(essential) <= LIMITS.startupMenuKB[name], `A ${name}: ${kb(essential)} KB essential to reach the menu (limit ${LIMITS.startupMenuKB[name]})`);
    check(uniq(arrive).length <= LIMITS.startupRequests, `A ${name}: ${arrive.length} requests to reach the menu`);
    const imgs = nonMusic.filter((r) => /\.(webp|png)$/.test(r.name)).map((r) => `${r.name.replace(/-[\w-]{8}\./, '.')} ${Math.round(r.bytes / 1024)}`);
    report[`startup-${name}`] = { startScreenMs: tStart, menuMs: tMenu, startKB: kb(atStart), startRequests: atStart.length, essentialKB: kb(essential), arriveKB: kb(arrive), arriveRequests: arrive.length, idleWarmKB: kb(nonMusic) - kb(arrive), musicStreamedKB: kb(music), images: imgs };
    notes.push(`A ${name}: start screen ${tStart} ms (${kb(atStart)} KB, ${atStart.length} req) · menu +${tMenu} ms: essential ${kb(essential)} KB (code, fonts, patio variant, portrait); ${kb(arrive)} KB in ${uniq(arrive).length} files had arrived including background warm-up · then 6 s idle: background warm-up +${kb(nonMusic) - kb(arrive)} KB (table art, offline core files) · menu music streamed ${kb(music)} KB · images: ${imgs.join(', ')}`);
    check(errors.length === 0, `A ${name}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- B/C/D. story ------------------------------------------------------------------------------------
  {
    const { page, cdp, ctx, errors } = await newPage({ width: 390, height: 844, dpr: 3 });
    await page.goto(BASE);
    await page.click('.start-button');
    await page.locator('[data-act="story"]').first().waitFor({ timeout: 120_000 });
    await seed(page, 'chapter-1', 0);
    const chunks: { name?: string; ph?: string; dur?: number }[] = [];
    cdp.on('Tracing.dataCollected', (d: { value: typeof chunks }) => chunks.push(...d.value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
    const before = ((await page.evaluate(RES)) as Res[]).length;
    await page.click('[data-act="story"]');
    await page.locator('.story-shell').first().waitFor({ timeout: 60_000 });
    const t = Date.now();
    await page.click('[data-act="story-continue"]');
    await revealed(page);
    const entryMs = Date.now() - t;
    check(entryMs <= LIMITS.chapterEntryMs, `B: chapter entry ${entryMs} ms (limit ${LIMITS.chapterEntryMs})`);
    await page.waitForTimeout(5000); // the next chapter prefetches once this one is presenting
    const story = ((await page.evaluate(RES)) as Res[]).slice(before);
    const done = new Promise<void>((r) => cdp.once('Tracing.tracingComplete', () => r()));
    await cdp.send('Tracing.end');
    await done;
    const decodes = chunks.filter((e) => e.ph === 'X' && e.name === 'Decode Image');
    const decodeMs = decodes.reduce((s, e) => s + (e.dur ?? 0) / 1000, 0);
    const maxDecode = Math.max(0, ...decodes.map((e) => (e.dur ?? 0) / 1000));
    const storyImgs = story.filter((r) => /\.webp$/.test(r.name)).map((r) => r.name.replace(/-[\w-]{8}\./, '.'));
    check(storyImgs.some((n) => /^back-alley-portrait/.test(n)), `B: the next chapter (Chapter 2) backdrop was not prefetched: ${storyImgs.join(', ')}`);
    check(!storyImgs.some((n) => /^(resort|moonlit|jungle|executive)/.test(n)), `B: chapters beyond the next were fetched: ${storyImgs.join(', ')}`);
    report.chapterEntry = { entryMs, storyKB: kb(story), storyRequests: story.length, images: storyImgs, decodeMs: +decodeMs.toFixed(1), maxDecodeMs: +maxDecode.toFixed(1), decodes: decodes.length };
    notes.push(`B: Chapter 1 entry ${entryMs} ms (decoded before reveal) · Story layer + chapter + next-chapter prefetch ${kb(story)} KB in ${story.length} requests · images ${storyImgs.join(', ')} · image decode ${decodeMs.toFixed(0)} ms total, largest ${maxDecode.toFixed(0)} ms (${decodes.length} decodes)`);

    // C. Next taps.
    await page.evaluate('window.__tapStart = performance.now(); __ev.length = 0');
    for (let i = 0; i < 12; i++) {
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(350);
    }
    const ev = (await page.evaluate("__ev.filter((e) => e.t >= __tapStart && /pointer|click|key/.test(e.n))")) as { n: string; d: number }[];
    const worst = Math.max(0, ...ev.map((e) => e.d));
    check(worst <= LIMITS.nextTapMs, `C: slowest story tap ${worst} ms (limit ${LIMITS.nextTapMs})`);
    report.taps = { count: 12, slowEvents: ev.length, worstMs: worst };
    notes.push(`C: 12 Next taps under 4× CPU — ${ev.length} event(s) over 16 ms, worst ${worst} ms`);

    // D. Repeated chapter visits.
    const visits = ['chapter-1', 'chapter-2', 'chapter-4', 'chapter-6', 'chapter-1', 'chapter-5', 'chapter-7', 'chapter-1'];
    const series: Record<string, number>[] = [];
    for (const [i, sc] of visits.entries()) {
      // From a scene (first visit) or already on the case file (every later visit ends there).
      if (await page.locator('[data-act="story-file"]').count()) await page.click('[data-act="story-file"]');
      await page.locator('.story-shell [data-act="story-continue"]').first().waitFor({ timeout: 60_000 });
      await seed(page, sc, 2);
      await page.click('[data-act="story-continue"]');
      await revealed(page);
      const at = await page.evaluate(() => document.querySelector('.story-stage')?.getAttribute('data-scene'));
      check(at === sc, `D: visit ${i + 1} opened ${at}, expected ${sc}`);
      for (let k = 0; k < 5; k++) {
        await page.click('[data-act="story-next"]');
        await page.waitForTimeout(250);
      }
      await page.click('[data-act="story-file"]');
      await page.locator('.story-shell [data-act="story-continue"]').first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(3000); // let fades, bed cross-fades and prefetches settle
      series.push({ visit: i + 1, ...(await metrics(page, cdp)) });
    }
    const a = series[1]!;
    const z = series.at(-1)!;
    const grow = (k: string) => (z[k] ?? 0) - (a[k] ?? 0);
    check(grow('nodes') <= LIMITS.leakNodes, `D: DOM nodes grew by ${grow('nodes')} between visit 2 and 8`);
    check(grow('listeners') <= LIMITS.leakListeners, `D: JS event listeners grew by ${grow('listeners')}`);
    check(grow('heapMB') <= LIMITS.leakHeapMB, `D: heap grew by ${grow('heapMB').toFixed(2)} MB`);
    for (const k of ['timers', 'intervals', 'workers', 'sources', 'media', 'imgs', 'stages', 'dialogs']) check(grow(k) <= 0, `D: ${k} grew from ${a[k]} to ${z[k]}`);
    check(z.workers! <= 1, `D: ${z.workers} AI workers alive on the case file`);
    report.leaks = series;
    notes.push(`D: 8 chapter visits — visit 2 → 8: nodes ${a.nodes}→${z.nodes}, listeners ${a.listeners}→${z.listeners}, heap ${a.heapMB}→${z.heapMB} MB, live timers ${a.timers}→${z.timers}, intervals ${a.intervals}→${z.intervals}, workers ${a.workers}→${z.workers}, audio sources ${a.sources}→${z.sources}, media ${a.media}→${z.media}, <img> ${a.imgs}→${z.imgs}`);
    check(errors.length === 0, `B–D: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}

writeFileSync(join(outDir, 'story.json'), JSON.stringify({ ...report, notes, failures }, null, 1));
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\nperf:story: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nperf:story: all checks passed');
