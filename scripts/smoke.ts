/**
 * npm run smoke — essential browser smoke test of the PRODUCTION build (run
 * `npm run build` first), served from a GitHub-Pages-style subpath. Used by CI.
 *
 *  - The start screen loads from /STICKS_-_BONES/ with a clean console.
 *  - The manifest resolves inside the subpath; the service worker reaches
 *    "Quick Play is ready offline".
 *  - Every menu page fits in portrait, landscape, tablet and desktop viewports.
 *  - A game vs the computer is dealt and played through one complete hand.
 *  - Offline (server down + browser offline), the app restarts from cache.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showMenuItem } from './lib/menu-navigation';

type Page = import('playwright').Page;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) {
  console.error('smoke: dist/ is missing — run npm run build first');
  process.exit(1);
}
const APP = '/STICKS_-_BONES/';
const PORT = 5192;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let down = false;
const server = createServer((req, res) => {
  if (down) return void req.socket.destroy();
  const url = new URL(req.url ?? '/', ORIGIN);
  let rel = url.pathname.startsWith(APP) ? decodeURIComponent(url.pathname.slice(APP.length)) : null;
  if (rel === '' || rel?.endsWith('/')) rel = `${rel}index.html`;
  const file = rel === null ? null : normalize(join(dist, rel));
  if (!file || !file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return void res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(PORT, r));

const failures: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page: Page = await ctx.newPage();
const problems: string[] = [];
page.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && !down && problems.push(m.text()));
page.on('pageerror', (e: Error) => problems.push(`pageerror: ${e.message}`));

async function enterMenu() {
  await page.waitForSelector('.start-button', { timeout: 30_000 });
  await page.click('.start-button');
  await page.waitForSelector('[data-go="setup"]', { timeout: 30_000 });
}

async function checkMenu(label: string) {
  const pager = page.locator('menu-pages:visible');
  await pager.waitFor();
  // ResizeObserver and loaded fonts can repartition the content before the next paint.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  let pages = 0;
  const next = pager.locator('[data-page-step="1"]');
  do {
    const layout = await pager.evaluate((menu: HTMLElement) => {
      const view = menu.querySelector<HTMLElement>('.menu-page-view')!;
      const doc = document.documentElement;
      const section = view.querySelector('.menu-page-items:not([data-off-page])');
      return {
        height: view.clientHeight, overflow: Math.max(doc.scrollWidth - innerWidth, doc.scrollHeight - innerHeight, view.scrollWidth - view.clientWidth, view.scrollHeight - view.clientHeight),
        section: menu.querySelector<HTMLSelectElement>('.menu-pages-nav select')?.selectedOptions[0]?.text,
        text: section?.querySelector(':scope > :not([hidden], [data-off-page])')?.textContent?.trim().slice(0, 90),
      };
    });
    const box = await pager.boundingBox();
    check(layout.height >= 44 && layout.overflow <= 1 && !!box && box.y >= 0 && box.y + box.height <= (page.viewportSize()?.height ?? 0) + 1, `${label}, page ${++pages}: ${JSON.stringify(layout)}`);
    if (!(await next.isVisible()) || await next.getAttribute('aria-disabled') === 'true') break;
    await next.evaluate((button: HTMLButtonElement) => button.click());
  } while (pages < 120);
  check(pages < 120, `${label}: pagination never finished`);
}

async function navigate(selector: string) {
  await showMenuItem(page, selector);
  await page.click(selector);
}

async function checkMenuViewports() {
  for (const [width, height] of [[320, 568], [568, 320], [390, 844], [844, 390], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    const size = `${width}×${height}`;
    await checkMenu(`Home ${size}`);
    for (const section of ['setup', 'settings', 'rules', 'stats', 'achievements']) {
      await navigate(`[data-go="${section}"]`);
      await checkMenu(`${section} ${size}`);
      await page.click('[data-act="home"]');
      await page.locator('.home-nav').waitFor();
    }
    await navigate('[data-act="story"]');
    await checkMenu(`Case file ${size}`);
    await page.click('[data-act="story-home"]');
    await page.locator('.home-nav').waitFor();
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await navigate('[data-go="setup-local"]');
  await showMenuItem(page, 'input[name="mode"][value="partnership4"]');
  await page.check('input[name="mode"][value="partnership4"]');
  await showMenuItem(page, 'input[name="name1"]');
  await page.fill('input[name="name1"]', 'Marisol');
  await showMenuItem(page, 'select[name="seating"]');
  await page.selectOption('select[name="seating"]', 'left');
  await page.setViewportSize({ width: 568, height: 320 });
  await showMenuItem(page, 'input[name="name1"]');
  check(await page.inputValue('input[name="name1"]') === 'Marisol', 'player name was lost during rotation');
  check(await page.inputValue('select[name="seating"]') === 'left', 'seating was lost during rotation');
  await page.click('[data-act="home"]');
  await page.locator('.home-nav').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
}

try {
  await page.goto(`${ORIGIN}${APP}`);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const j = (await (await fetch(link.href)).json()) as { start_url: string; scope: string };
    return { start: new URL(j.start_url, link.href).pathname, scope: new URL(j.scope, link.href).pathname };
  });
  check(manifest.start === APP && manifest.scope === APP, `manifest outside the subpath: ${JSON.stringify(manifest)}`);
  await enterMenu();
  await page.waitForFunction(() => /Quick Play is ready offline/.test(document.querySelector('[data-region="offline-status"]')?.textContent ?? ''), null, { timeout: 90_000 }).catch(() => failures.push('offline status never became ready'));
  await checkMenuViewports();
  await navigate('[data-go="setup"]');
  await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
  await page.setViewportSize({ width: 568, height: 320 });
  await page.click('[data-act="pause"]');
  await checkMenu('Pause 568×320');
  await showMenuItem(page, 'input[name="set-instant-text"]');
  await page.check('input[name="set-instant-text"]');
  await page.click('[data-act="pause-resume"]');
  await page.setViewportSize({ width: 390, height: 844 });
  const until = Date.now() + 180_000;
  let finished = false;
  while (Date.now() < until && !finished) {
    finished = await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false);
    if (finished) break;
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click({ timeout: 2000 }).catch(() => undefined);
      await page.locator('.end-slot.is-legal').first().click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    const act = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
    if (await act.count()) await act.first().click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }
  check(finished, 'a hand vs the computer did not finish');
  // Offline restart from the cache.
  down = true;
  await ctx.setOffline(true);
  await page.reload();
  await enterMenu();
  await page.evaluate(() => {
    localStorage.setItem('sticks-and-bones.save', '{"format":"sticks-and-bones/match"');
    localStorage.setItem('sticks-and-bones.settings', 'not valid JSON');
  });
  await page.reload();
  await enterMenu();
  const notice = await page.locator('.home-nav .notice').textContent();
  check(/saved game couldn’t be read/.test(notice ?? '') && /settings couldn’t be read/.test(notice ?? ''), 'home must show both damaged-record notices together');
  check(problems.length === 0, `console not clean: ${problems.slice(0, 3).join(' | ')}`);
} catch (e) {
  failures.push(`exception: ${(e as Error).message}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`SMOKE FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('Smoke passed: subpath load, paged menus across eight viewports, offline-ready, one full hand vs the computer, offline restart, clean console.');
process.exit(0);
