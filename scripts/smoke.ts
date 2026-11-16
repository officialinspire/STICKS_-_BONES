/**
 * npm run smoke — essential browser smoke test of the PRODUCTION build (run
 * `npm run build` first), served from a GitHub-Pages-style subpath. Used by CI.
 *
 *  - The start screen loads from /STICKS_-_BONES/ with a clean console.
 *  - The manifest resolves inside the subpath; the service worker reaches
 *    "Ready to play offline".
 *  - A game vs the computer is dealt and played through one complete hand.
 *  - Offline (server down + browser offline), the app restarts from cache.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
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

try {
  await page.goto(`${ORIGIN}${APP}`);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const j = (await (await fetch(link.href)).json()) as { start_url: string; scope: string };
    return { start: new URL(j.start_url, link.href).pathname, scope: new URL(j.scope, link.href).pathname };
  });
  check(manifest.start === APP && manifest.scope === APP, `manifest outside the subpath: ${JSON.stringify(manifest)}`);
  await enterMenu();
  await page.waitForFunction(() => /Ready to play offline/.test(document.querySelector('[data-region="offline-status"]')?.textContent ?? ''), null, { timeout: 90_000 }).catch(() => failures.push('offline status never became ready'));
  await page.click('[data-go="setup"]');
  await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
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
console.log('Smoke passed: subpath load, offline-ready, one full hand vs the computer, offline restart, clean console.');
process.exit(0);
