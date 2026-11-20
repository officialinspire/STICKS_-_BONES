/**
 * npm run release:sweep — every mode across the device matrix, on the PRODUCTION build served from the GitHub Pages
 * subpath (run `npm run build` first), in the engine chosen by SB_BROWSER (scripts/lib/engine.ts).
 *
 * Matrix: 5 viewports (small and standard phone portrait, short phone landscape, tablet portrait, desktop; touch on
 * phones and tablets; every cell is also ROTATED, so each landscape/portrait counterpart is exercised too) × text 100 % and 130 % (the page's root font size, as a browser's text
 * setting scales it) × 5 modes (Draw, Block and Partnership vs the computer; two players on one device; Story).
 *
 * In each cell: the mode starts; its primary control (a legal tile or Draw/Pass at the table, Continue in Story) is
 * on screen or brought on screen by scrolling; one real move is made (a tile placed, or a line advanced); then
 * ROTATION (width and height swapped) and BACKGROUND/RESUME (visibilitychange hidden → visible, emulated) must keep
 * the same state (the hand's tile count, or the Story position), with no horizontal overflow and no page or console
 * errors anywhere. Emulation only: this is not a real-device test.
 */
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showMenuItem } from './lib/menu-navigation';
import { engine, ENGINE, launchOptions } from './lib/engine';

type Page = import('playwright').Page;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const out = fileURLToPath(new URL(`../test-results/release-sweep/${ENGINE}/`, import.meta.url));
mkdirSync(out, { recursive: true });
if (!existsSync(join(dist, 'index.html'))) {
  console.error('release:sweep: dist/ is missing — run npm run build first');
  process.exit(1);
}
const APP = '/STICKS_-_BONES/';
const PORT = 5207;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  let rel = url.pathname.startsWith(APP) ? decodeURIComponent(url.pathname.slice(APP.length)) : null;
  if (rel === '' || rel?.endsWith('/')) rel = `${rel}index.html`;
  const file = rel === null ? null : normalize(join(dist, rel));
  if (!file || !file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return void res.end();
  }
  // Byte ranges, as GitHub Pages serves them: WebKit's media stack requires 206 responses for audio and video.
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (m) {
    const start = m[1] ? Number(m[1]) : size - Number(m[2]);
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (!(start >= 0 && start <= end && start < size)) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return void res.end();
    }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) });
    return void createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size) });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(PORT, r));

const VIEWPORTS = [
  { name: 'phone-small-portrait', width: 320, height: 568, touch: true },
  { name: 'phone-portrait', width: 390, height: 844, touch: true },
  { name: 'phone-short-landscape', width: 568, height: 320, touch: true },
  { name: 'tablet-portrait', width: 768, height: 1024, touch: true },
  { name: 'desktop', width: 1366, height: 768, touch: false },
] as const;
const MODES = [
  { name: 'draw-vs-ai', mode: 'draw2', opponent: 'ai' },
  { name: 'block-vs-ai', mode: 'block2', opponent: 'ai' },
  { name: 'partnership-vs-ai', mode: 'partnership4', opponent: 'ai' },
  { name: 'two-players', mode: 'draw2', opponent: 'local' },
  { name: 'story', mode: null, opponent: null },
] as const;

const failures: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);
const browser = await engine.launch(launchOptions());
const cells: string[] = [];

const overflow = (page: Page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, document.body.scrollWidth - innerWidth)) as Promise<number>;
async function reachable(page: Page, sel: string, vp: { width: number; height: number }): Promise<boolean> {
  const l = page.locator(sel).first();
  if (!(await l.count())) return false;
  await l.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
  const b = await l.boundingBox();
  return !!b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1;
}
const hide = (page: Page, h: boolean) => page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get() { return ${h}; } }); Object.defineProperty(document, 'visibilityState', { configurable: true, get() { return ${h ? "'hidden'" : "'visible'"}; } }); document.dispatchEvent(new Event('visibilitychange'));`);
/** The player's turn at the table: clear pass-and-play covers until a legal tile or Draw/Pass is offered. */
async function humanTurn(page: Page, ms = 25_000): Promise<'tile' | 'draw-pass' | null> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    for (const c of ['[data-act="cover-ready"]', '[data-act="cover-reveal"]']) if (await page.locator(c).count()) await page.locator(c).first().click({ timeout: 2000 }).catch(() => undefined);
    if (await page.locator('.hand-tile.is-legal').count()) return 'tile';
    if (await page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])').count()) return 'draw-pass';
    await page.waitForTimeout(120);
  }
  return null;
}
const handCount = (page: Page) => page.locator('.hand-tile').count() as Promise<number>;
const storyPos = (page: Page) => page.locator('.cine-pos').textContent() as Promise<string | null>;

try {
  for (const vp of VIEWPORTS) for (const text of [100, 130]) for (const m of MODES) {
    const cell = `${vp.name} ${vp.width}×${vp.height} · text ${text}% · ${m.name}`;
    if (process.env.SB_SWEEP_ONLY && !cell.includes(process.env.SB_SWEEP_ONLY)) continue; // focus while debugging (never in release runs)
    const t0 = Date.now();
    const failed0 = failures.length;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, reducedMotion: 'reduce' });
    await ctx.addInitScript(`window.__sbIntroVideo = null;${text !== 100 ? ` addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '${text}%'; });` : ''}`);
    const page: Page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    page.on('console', (msg: { type(): string; text(): string }) => msg.type() === 'error' && errors.push(msg.text()));
    try {
      // Story: a case in progress at Chapter 1's third line, saved before the app loads (one load, no reload).
      if (m.mode === null) await ctx.addInitScript(`localStorage.setItem('sticks-and-bones.story', ${JSON.stringify(JSON.stringify({ format: 'sticks-and-bones/story', version: 3, data: { sceneId: 'chapter-1', part: 'pre', index: 2, outcome: null, completed: ['prologue'], textScale: 1, startedAt: 1, hand: null, outcomes: {}, assisted: [] } }))});`);
      await page.goto(`${ORIGIN}${APP}`);
      await page.locator('.start-button:not([disabled])').click({ timeout: 30_000 });
      await page.waitForSelector('[data-go="setup"]', { timeout: 30_000 });
      check((await overflow(page)) <= 1, `${cell}: menu overflows horizontally`);
      if (m.mode === null) {
        await page.click('[data-act="story"]');
        await page.click('[data-act="story-continue"]', { timeout: 20_000 });
        await page.locator('[data-act="story-next"]:not([hidden])').waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => /\d+\s*\/\s*\d+/.test(document.querySelector('.cine-pos')?.textContent ?? ''), null, { timeout: 15_000 });
        check(await reachable(page, '[data-act="story-next"]', vp), `${cell}: Continue is not reachable`);
        const before = await storyPos(page);
        // A tap while a line is still revealing completes it; the next one advances (the director's rule).
        for (let k = 0; k < 3 && (await storyPos(page)) === before; k++) {
          await page.click('[data-act="story-next"]');
          await page.waitForFunction((b: string | null) => (document.querySelector('.cine-pos')?.textContent ?? '') !== b, before, { timeout: 3_000 }).catch(() => undefined);
        }
        const moved = await storyPos(page);
        check(moved !== before, `${cell}: Continue did not advance (${before})`);
        await page.setViewportSize({ width: vp.height, height: vp.width });
        await page.waitForTimeout(400);
        check((await storyPos(page)) === moved, `${cell}: rotation changed the Story position (${moved} → ${await storyPos(page)})`);
        check(await reachable(page, '[data-act="story-next"]', { width: vp.height, height: vp.width }), `${cell}: Continue not reachable after rotation`);
        await hide(page, true);
        await page.waitForTimeout(300);
        await hide(page, false);
        await page.waitForTimeout(300);
        check((await storyPos(page)) === moved, `${cell}: background/resume changed the Story position`);
      } else {
        await page.click('[data-go="setup"]');
        await showMenuItem(page, `input[name="mode"][value="${m.mode}"]`);
        await page.check(`input[name="mode"][value="${m.mode}"]`);
        await showMenuItem(page, `input[name="opponent"][value="${m.opponent}"]`);
        await page.check(`input[name="opponent"][value="${m.opponent}"]`);
        await showMenuItem(page, '.btn-start');
        await page.click('.btn-start');
        await page.waitForSelector('.table-screen', { timeout: 20_000 });
        const turn = await humanTurn(page);
        check(turn !== null, `${cell}: the player's turn never came`);
        if (turn === 'tile') {
          check(await reachable(page, '.hand-tile.is-legal', vp), `${cell}: no legal tile is reachable`);
          const n0 = await handCount(page);
          await page.locator('.hand-tile.is-legal').first().click();
          if (await page.locator('.end-slot.is-legal').count()) {
            check(await reachable(page, '.end-slot.is-legal', vp), `${cell}: the open end is not reachable`);
            await page.locator('.end-slot.is-legal').first().click();
          }
          await page.waitForFunction((n: number) => document.querySelectorAll('.hand-tile').length < n || !!document.querySelector('.privacy-cover:not([hidden])'), n0, { timeout: 10_000 }).catch(() => undefined);
          check((await handCount(page)) < n0 || (await page.locator('.privacy-cover:not([hidden])').count()) > 0, `${cell}: placing a tile did not take it from the hand`);
        } else if (turn === 'draw-pass') check(await reachable(page, '[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])', vp), `${cell}: Draw/Pass is not reachable`);
        // Rotation and background/resume keep the hand (wait for the player's turn so nothing moves meanwhile).
        const again = await humanTurn(page);
        if (again) {
          const n = await handCount(page);
          await page.setViewportSize({ width: vp.height, height: vp.width });
          await page.waitForTimeout(400);
          check((await handCount(page)) === n, `${cell}: rotation changed the hand (${n} → ${await handCount(page)})`);
          check((await overflow(page)) <= 1, `${cell}: rotated table overflows horizontally`);
          check(await reachable(page, '.hand-tile.is-legal, [data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])', { width: vp.height, height: vp.width }), `${cell}: no move reachable after rotation`);
          await hide(page, true);
          await page.waitForTimeout(300);
          await hide(page, false);
          await page.waitForTimeout(300);
          check((await handCount(page)) === n || (await page.locator('.privacy-cover:not([hidden])').count()) > 0, `${cell}: background/resume changed the hand`);
        } else check((await page.locator('dialog.results[open]').count()) > 0, `${cell}: after the move, neither the player's turn nor the results came back`);
      }
      check((await overflow(page)) <= 1, `${cell}: horizontal overflow`);
      if (vp.name === 'phone-small-portrait' || vp.name === 'phone-short-landscape') await page.screenshot({ path: join(out, `${vp.name}-${text}-${m.name}.png`) });
    } catch (e) {
      failures.push(`${cell}: exception ${(e as Error).message.split('\n')[0]}`);
      await page.screenshot({ path: join(out, `FAIL-${vp.name}-${text}-${m.name}.png`) }).catch(() => undefined);
    }
    check(errors.length === 0, `${cell}: page errors ${errors.slice(0, 3).join(' | ')}`);
    cells.push(cell);
    console.log(`  ${failures.length > failed0 ? '✗' : '✓'} ${cell} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ engine: ENGINE, browser: browser.version?.() ?? null, cells, failures }, null, 1));
if (failures.length) {
  console.error(`RELEASE SWEEP FAILED (${ENGINE}, ${failures.length}):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`release:sweep passed (${ENGINE}): ${cells.length} cells — ${VIEWPORTS.length} viewports × 2 text sizes × ${MODES.length} modes; rotation and background/resume in each; emulation, not real devices.`);
