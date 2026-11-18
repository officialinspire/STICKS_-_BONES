/**
 * npm run perf [label] — measure the PRODUCTION build (run `npm run build` first)
 * served by `vite preview`, in Chromium, on an emulated "fast 4G" link
 * (9 Mbps down, 150 ms RTT) and 4× CPU slowdown:
 *
 *   - bytes and requests by phase: start screen, menu, 6 s idle on the menu
 *     (background warm-up), first table;
 *   - time from navigation to start screen, from the start gesture to the menu,
 *     and from "Deal the tiles" to a table with atlas faces;
 *   - image decode work from a DevTools trace (total and largest single decode);
 *   - long main-thread tasks during play, and input→next-paint latency for
 *     tile selection and placement (Event Timing API).
 *
 * Output: test-results/perf/<label>.json. Numbers vary run to run; compare
 * medians of several runs (PERF_RUNS, default 3), never a single sample.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
type Page = import('playwright').Page;

const root = fileURLToPath(new URL('..', import.meta.url));
/** PERF_ROOT: measure another checkout's dist (e.g. a worktree of the previous commit) with this same script. */
const siteRoot = process.env.PERF_ROOT ?? root;
const label = process.argv[2] ?? 'current';
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const outDir = join(root, 'test-results/perf');
mkdirSync(outDir, { recursive: true });

const server = await preview({ root: siteRoot, logLevel: 'error', preview: { port: 5197, strictPort: true } });
const BASE = 'http://localhost:5197/';
const browser = await chromium.launch();

const RES = `(() => performance.getEntriesByType('resource').map((e) => ({ name: e.name.split('/').pop().split('?')[0], bytes: e.transferSize || e.encodedBodySize, type: e.initiatorType, start: Math.round(e.startTime), end: Math.round(e.responseEnd) })))()`;
type Res = { name: string; bytes: number; type: string; start: number; end: number };
const threadNameAll = (c: { name?: string; ph?: string; tid?: number; pid?: number; args?: { name?: string } }[]) =>
  new Map(c.filter((e) => e.ph === 'M' && e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args?.name ?? '?']));
const sum = (r: Res[]) => r.reduce((s, e) => s + e.bytes, 0);
const kinds = (r: Res[]) => {
  const k = (n: string) => (/\.(png|webp|avif|jpe?g)$/.test(n) ? 'images' : /\.(mp3|ogg|m4a|webm|mp4)$/.test(n) ? 'media' : /\.(js|css|html)$/.test(n) || !n.includes('.') ? 'code' : 'other');
  const o: Record<string, number> = {};
  for (const e of r) o[k(e.name)] = Math.round(((o[k(e.name)] ?? 0) + e.bytes / 1024) * 10) / 10;
  return o;
};

async function run(i: number) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
  const page: Page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (9e6 / 8) | 0, uploadThroughput: (2e6 / 8) | 0 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(`
    window.__lt = []; window.__ev = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => __lt.push({ d: e.duration, t: e.startTime }))).observe({ type: 'longtask', buffered: true }); } catch {}
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => __ev.push({ n: e.name, d: e.duration, t: e.startTime }))).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  `);
  const chunks: { name?: string; ph?: string; dur?: number; ts?: number; tid?: number; pid?: number; args?: { name?: string; data?: { url?: string }; imageType?: string } }[] = [];
  cdp.on('Tracing.dataCollected', (d: { value: typeof chunks }) => chunks.push(...d.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForSelector('.start-button', { timeout: 120_000 });
  const tStart = Date.now() - t0;
  await page.waitForLoadState('load');
  const resStart = (await page.evaluate(RES)) as Res[];
  const t1 = Date.now();
  await page.click('.start-button');
  // The studio credit (5.8 s): skipped as soon as Skip is armed, like a returning player, so tMenu measures the app.
  await page.locator('[data-skip="armed"] [data-act="intro-skip"]').click({ timeout: 3000 }).catch(() => undefined);
  await page.waitForSelector('[data-go="setup"]', { timeout: 120_000 });
  const tMenu = Date.now() - t1;
  const resMenu = (await page.evaluate(RES)) as Res[];
  await page.waitForTimeout(6000);
  const resIdle = (await page.evaluate(RES)) as Res[];
  await page.click('[data-go="setup"]');
  const dealAt = (await page.evaluate('performance.now()')) as number;
  const t2 = Date.now();
  await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
  // Wait until the human can act with atlas faces showing (or SVG if the atlas never arrives).
  await page.waitForFunction(() => document.querySelector('.hand-tile .face-atlas') !== null, null, { timeout: 120_000 }).catch(() => null);
  const tTable = Date.now() - t2;
  const resTable = (await page.evaluate(RES)) as Res[];
  // Long-task entries arrive asynchronously: keep only tasks that START after this mark.
  await page.evaluate('window.__playStart = performance.now(); __lt.length = 0; __ev.length = 0');
  // A few real interactions: select a legal tile, place it (or draw/pass).
  for (let k = 0; k < 4; k++) {
    await page.waitForFunction(() => document.querySelector('.hand-tile.is-legal, [data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled]), dialog.results[open]'), null, { timeout: 60_000 }).catch(() => null);
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click().catch(() => null);
      await page.locator('.end-slot.is-legal').first().click({ timeout: 3000 }).catch(() => null);
    } else {
      await page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])').first().click({ timeout: 3000 }).catch(() => null);
    }
    await page.waitForTimeout(1500);
  }
  // Wait (bounded) for the table art itself, then read when each key image finished arriving.
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /tabletop/.test(e.name) && (e as PerformanceResourceTiming).responseEnd > 0), null, { timeout: 60_000 }).catch(() => null);
  const resEnd = (await page.evaluate(RES)) as Res[];
  const endOf = (re: RegExp) => Math.max(-1, ...resEnd.filter((r) => re.test(r.name) && r.bytes > 0).map((r) => r.end));
  const art = { patioMs: endOf(/patio-[^d]|neighborhood-patio/), portraitMs: endOf(/portrait/), tileAtlasMs: endOf(/double-six-atlas/), tableAfterDealMs: Math.round(endOf(/tabletop/) - dealAt), totalKB: Math.round(sum(resEnd) / 1024) };
  const lt = (await page.evaluate('__lt.filter((l) => l.t >= __playStart)')) as { d: number }[];
  const ev = (await page.evaluate('__ev.filter((e) => e.t >= __playStart)')) as { n: string; d: number }[];
  const done = new Promise<void>((r) => cdp.once('Tracing.tracingComplete', () => r()));
  await cdp.send('Tracing.end');
  await done;
  // 'ImageDecodeTask' ⊃ 'Decode LazyPixelRef' ⊃ 'Decode Image' are nested: count only the innermost real decodes.
  const decodes = chunks.filter((e) => e.ph === 'X' && e.name === 'Decode Image');
  const rasterTasksMs = chunks.filter((e) => e.ph === 'X' && e.name === 'ImageDecodeTask').reduce((s, e) => s + (e.dur ?? 0) / 1000, 0);
  const decodeMs = decodes.reduce((s, e) => s + (e.dur ?? 0) / 1000, 0);
  // Which threads decoded: the renderer main thread blocks input; raster/compositor workers do not.
  const threadName = new Map(chunks.filter((e) => e.ph === 'M' && e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args?.name ?? '?']));
  const byThread: Record<string, number> = {};
  for (const e of decodes) {
    const n = (threadName.get(`${e.pid}:${e.tid}`) ?? 'unknown').replace(/\d+$/, '');
    byThread[n] = +((byThread[n] ?? 0) + (e.dur ?? 0) / 1000).toFixed(1);
  }
  if (process.env.PERF_DUMP_LONG) {
    // Attribute main-thread tasks > 50 ms: the heaviest nested events inside each.
    const mainTid = [...threadNameAll(chunks)].find(([, n]) => n === 'CrRendererMain')?.[0];
    const onMain = chunks.filter((e) => e.ph === 'X' && `${e.pid}:${e.tid}` === mainTid);
    const playStartTs = chunks.find((e) => e.name === 'TimeStamp' || false)?.ts ?? 0;
    const longs = onMain.filter((e) => e.name === 'RunTask' && (e.dur ?? 0) > 50_000 && (e.ts ?? 0) >= playStartTs);
    const attrib = longs.map((t) => ({
      ms: Math.round((t.dur ?? 0) / 1000),
      inside: onMain
        .filter((e) => e !== t && (e.ts ?? 0) >= (t.ts ?? 0) && (e.ts ?? 0) + (e.dur ?? 0) <= (t.ts ?? 0) + (t.dur ?? 0) && (e.dur ?? 0) > 5000)
        .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
        .slice(0, 8)
        .map((e) => `${e.name} ${Math.round((e.dur ?? 0) / 1000)}ms ${JSON.stringify(e.args ?? {}).slice(0, 100)}`),
    }));
    writeFileSync(join(outDir, `long-${label}-${i}.json`), JSON.stringify(attrib, null, 1));
  }
  if (process.env.PERF_DUMP_DECODES) writeFileSync(join(outDir, `decodes-${label}.json`), JSON.stringify(decodes.slice(0, 400)));
  const mainDecodeMs = Object.entries(byThread).filter(([n]) => /CrRendererMain/.test(n)).reduce((s, [, v]) => s + v, 0);
  const maxDecode = Math.max(0, ...decodes.map((e) => (e.dur ?? 0) / 1000));
  await ctx.close();
  const pointer = ev.filter((e) => /pointerup|click|pointerdown/.test(e.n)).map((e) => e.d);
  return {
    run: i,
    ms: { toStartScreen: tStart, startToMenu: tMenu, dealToTable: tTable },
    bytes: { startScreen: sum(resStart), menu: sum(resMenu), afterIdle: sum(resIdle), table: sum(resTable) },
    requests: { startScreen: resStart.length, menu: resMenu.length, afterIdle: resIdle.length, table: resTable.length },
    art,
    decode: { count: decodes.length, totalMs: +decodeMs.toFixed(1), maxMs: +maxDecode.toFixed(1), mainThreadMs: +mainDecodeMs.toFixed(1), byThread, rasterTasksMs: +rasterTasksMs.toFixed(1) },
    bytesByKind: kinds(resEnd),
    play: { longTasks: lt.length, longestTaskMs: Math.round(Math.max(0, ...lt.map((l) => l.d))), slowInputs: pointer.length, worstInputMs: Math.round(Math.max(0, ...pointer)) },
    resources: resTable.map((r) => `${r.name} ${(r.bytes / 1024).toFixed(0)}KB @${r.start}-${r.end}ms`),
  };
}

const runs: Awaited<ReturnType<typeof run>>[] = [];
for (let i = 0; i < RUNS; i++) runs.push(await run(i));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const pick = (f: (r: (typeof runs)[number]) => number) => median(runs.map(f));
const summary = {
  label,
  runs: RUNS,
  conditions: '390×844 @3x, 9 Mbps / 150 ms RTT, 4× CPU slowdown, Chromium (vite preview of dist)',
  median: {
    toStartScreenMs: pick((r) => r.ms.toStartScreen),
    startToMenuMs: pick((r) => r.ms.startToMenu),
    dealToTableMs: pick((r) => r.ms.dealToTable),
    startScreenKB: Math.round(pick((r) => r.bytes.startScreen) / 1024),
    menuKB: Math.round(pick((r) => r.bytes.menu) / 1024),
    afterIdleKB: Math.round(pick((r) => r.bytes.afterIdle) / 1024),
    tableKB: Math.round(pick((r) => r.bytes.table) / 1024),
    menuBackdropReadyMs: pick((r) => r.art.patioMs),
    portraitReadyMs: pick((r) => r.art.portraitMs),
    tableArtAfterDealMs: pick((r) => r.art.tableAfterDealMs),
    sessionTotalKB: pick((r) => r.art.totalKB),
    decodeTotalMs: pick((r) => r.decode.totalMs),
    decodeMaxMs: pick((r) => r.decode.maxMs),
    decodeMainThreadMs: pick((r) => r.decode.mainThreadMs),
    decodeCount: pick((r) => r.decode.count),
    imageDecodeTasksMs: pick((r) => r.decode.rasterTasksMs),
    sessionImagesKB: Math.round(pick((r) => r.bytesByKind.images ?? 0)),
    sessionMediaKB: Math.round(pick((r) => r.bytesByKind.media ?? 0)),
    sessionCodeKB: Math.round(pick((r) => r.bytesByKind.code ?? 0)),
    longestTaskMs: pick((r) => r.play.longestTaskMs),
    worstInputMs: pick((r) => r.play.worstInputMs),
  },
  runsDetail: runs,
};
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary.median, null, 1));

await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
process.exit(0);
