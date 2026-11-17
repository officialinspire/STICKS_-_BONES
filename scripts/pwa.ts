/**
 * npm run pwa — installable-PWA acceptance on real production builds (Chromium).
 *
 * Builds the app twice (A and B, differing only by SB_BUILD_TAG, so every hash
 * and the service-worker build id change) and serves them from a GitHub-Pages
 * style SUBPATH (/STICKS_-_BONES/) next to a fake second INSPIRE app at
 * /other-app/ with its own worker, caches and localStorage. The test server can
 * go "down" (every connection destroyed) and can cut chosen downloads off
 * half-way.
 *
 *  1. Online first visit on the subpath: manifest + icons valid and resolved
 *     inside the subpath, worker scope = subpath, status reaches "Ready to play
 *     offline"; cache names/bytes reported; no PNG source sheet or media cached.
 *  2. Offline reload (server down + browser offline): the app starts from cache
 *     and a game vs the computer completes a hand; music is unavailable → silent.
 *  3. Interrupted downloads: two images cut off mid-transfer → status "partial";
 *     offline play still completes with drawn fallbacks; Repair (online) → ready.
 *  4. Quota failure (DevTools quota override): images don't fit → clear storage
 *     message, game still works; a tiny quota → shell can't install → message.
 *  5. Update from the previous build (A → B) mid-match with two humans: Update
 *     Available in the pause sheet; no hand shown at any time during the update;
 *     after reload the saved match is identical and reopens covered; old shell
 *     cache gone, new one present.
 *  6. Repair and erase: Repair deletes/re-downloads only this app's caches and
 *     keeps saves/settings; Erase removes only this app's localStorage keys and
 *     keeps offline files. Throughout: the other app's worker, caches and
 *     storage are untouched.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

type Page = import('playwright').Page;
type BrowserContext = import('playwright').BrowserContext;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/pwa');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

// ---- two production builds ---------------------------------------------------------
async function buildSite(tag: string, dir: string) {
  process.env.SB_BUILD_TAG = tag;
  await build({ root, logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
}
const SITE_A = join(out, 'site-a');
const SITE_B = join(out, 'site-b');
await buildSite('a', SITE_A);
await buildSite('b', SITE_B);
delete process.env.SB_BUILD_TAG;

// ---- test server: subpath app + another INSPIRE app ---------------------------------
const APP = '/STICKS_-_BONES/';
const PORT = 5194;
const ORIGIN = `http://localhost:${PORT}`;
const state = { site: SITE_A, down: false, cut: new Set<string>(), missing: new Set<string>(), requests: [] as string[] };
const OTHER: Record<string, [string, string]> = {
  '/other-app/': [
    'text/html',
    `<!doctype html><meta charset="utf-8"><title>Other INSPIRE app</title><script>
      navigator.serviceWorker.register('sw.js', { scope: './' });
      caches.open('inspire:other-app:v1').then((c) => c.put('/other-app/data', new Response('other data')));
      caches.open('generic-cache').then((c) => c.put('/other-app/generic', new Response('generic')));
      localStorage.setItem('other-app.save', 'keep-me');
      localStorage.setItem('sticks-and-bones-fan-page', 'not ours either');
    </script><p id="ok">other app</p>`,
  ],
  '/other-app/sw.js': ['text/javascript', `self.addEventListener('install', (e) => e.waitUntil(caches.open('inspire:other-app:shell').then((c) => c.put('/other-app/shell', new Response('shell')))));`],
};
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server: Server = createServer((req, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  state.requests.push(url.pathname);
  if (state.down) return void req.socket.destroy();
  if (OTHER[url.pathname]) {
    res.writeHead(200, { 'content-type': OTHER[url.pathname]![0], 'cache-control': 'no-cache' });
    return void res.end(OTHER[url.pathname]![1]);
  }
  if (!url.pathname.startsWith(APP)) {
    res.writeHead(404);
    return void res.end();
  }
  let rel = decodeURIComponent(url.pathname.slice(APP.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  if ([...state.missing].some((m) => rel.includes(m))) {
    // An optional file that is simply not on the server (404).
    res.writeHead(404);
    return void res.end();
  }
  const file = normalize(join(state.site, rel));
  if (!file.startsWith(state.site) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return void res.end();
  }
  const size = statSync(file).size;
  // GitHub Pages-like caching headers (10 minutes) — the worker must still pick up updates.
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': size, 'cache-control': 'max-age=600' });
  if ([...state.cut].some((c) => rel.includes(c))) {
    // Interrupted download: send half the body, then drop the connection.
    const s = createReadStream(file, { start: 0, end: Math.floor(size / 2) });
    s.on('data', (d) => res.write(d));
    s.on('end', () => req.socket.destroy());
    return;
  }
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const errorsOf = new WeakMap<Page, string[]>();
async function newContext(): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // tsx/esbuild adds __name() around named inner functions of callbacks serialized into the page.
  await ctx.addInitScript('window.__name = (f) => f;');
  const page = await ctx.newPage();
  const errs: string[] = [];
  errorsOf.set(page, errs);
  page.on('pageerror', (e: Error) => errs.push(`page error: ${e.message}`));
  return { ctx, page };
}

const offlineText = (page: Page) => page.locator('[data-region="offline-status"]').first().textContent();
async function enterMenu(page: Page) {
  await page.waitForSelector('.start-button', { timeout: 30_000 });
  await page.click('.start-button');
  const skip = page.locator('[data-act="intro-skip"]');
  if (await skip.count()) await skip.click().catch(() => undefined);
  await page.waitForSelector('[data-go="setup"]');
}
async function waitStatus(page: Page, re: RegExp, timeout = 90_000): Promise<string> {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeout) {
    last = (await offlineText(page).catch(() => '')) ?? '';
    if (re.test(last)) return last;
    await page.waitForTimeout(250);
  }
  return `TIMEOUT (last: ${last})`;
}
/** Our caches: names, entry URLs, total bytes (read through the page's CacheStorage). */
type CacheEntry = { name: string; urls: string[]; bytes: number };
const cacheReport = (page: Page): Promise<CacheEntry[]> =>
  page.evaluate(async () => {
    const out: { name: string; urls: string[]; bytes: number }[] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      let bytes = 0;
      const urls: string[] = [];
      for (const req of await c.keys()) {
        urls.push(new URL(req.url).pathname);
        bytes += (await (await c.match(req))!.blob()).size;
      }
      out.push({ name, urls, bytes });
    }
    return out;
  });
const otherAppIntact = async (page: Page, label: string) => {
  const r = await page.evaluate(async () => ({
    caches: await caches.keys(),
    regs: (await navigator.serviceWorker.getRegistrations()).map((x) => new URL(x.scope).pathname),
    other: localStorage.getItem('other-app.save'),
    fan: localStorage.getItem('sticks-and-bones-fan-page'),
  }));
  check(r.caches.includes('inspire:other-app:v1') && r.caches.includes('inspire:other-app:shell') && r.caches.includes('generic-cache'), `${label}: another app's cache was deleted (${r.caches.join(', ')})`);
  check(r.regs.includes('/other-app/'), `${label}: another app's service worker was unregistered (${r.regs.join(', ')})`);
  check(r.other === 'keep-me' && r.fan === 'not ours either', `${label}: another app's localStorage was touched`);
  return r;
};
async function playHand(page: Page, label: string, budgetMs = 150_000) {
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    if (await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false)) return true;
    for (const sel of ['[data-act="cover-ready"]', '[data-act="cover-reveal"]']) {
      const b = page.locator(sel);
      if (await b.count()) await b.click({ timeout: 2000 }).catch(() => undefined);
    }
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click({ timeout: 2000 }).catch(() => undefined);
      await page.locator('.end-slot.is-legal').first().click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    const act = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
    if (await act.count()) await act.first().click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }
  failures.push(`${label}: hand did not finish`);
  return false;
}
async function newGame(page: Page, opponent: 'ai' | 'local' = 'ai') {
  await page.click('[data-go="setup"]');
  await page.check(`input[name="opponent"][value="${opponent}"]`);
  await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
}
async function goOffline(ctx: BrowserContext, on: boolean) {
  state.down = on;
  await ctx.setOffline(on);
}

const AXE = require.resolve('axe-core/axe.min.js');
async function axe(page: Page, label: string) {
  await page.addScriptTag({ path: AXE });
  const r = (await page.evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })`)) as { violations: { id: string; impact: string; nodes: unknown[] }[] };
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(bad.length === 0, `axe ${label}: ${bad.map((v) => v.id).join(', ')}`);
  notes.push(`axe ${label}: ${bad.length} serious/critical, ${r.violations.length - bad.length} minor`);
}

let cacheBytes = 0;
try {
  // ---- 1. Online first visit on the subpath ----------------------------------------
  const { ctx, page } = await newContext();
  await page.goto(`${ORIGIN}/other-app/`);
  await page.waitForSelector('#ok');
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length > 0 && (await caches.keys()).length >= 2);
  await page.waitForTimeout(500);
  await page.goto(`${ORIGIN}${APP}`);
  const mf = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const res = await fetch(link.href);
    const json = (await res.json()) as { start_url: string; scope: string; id: string; icons: { src: string; sizes: string; purpose: string }[]; display: string };
    const resolve = (u: string) => new URL(u, link.href).pathname;
    const icons = await Promise.all(
      json.icons.map(async (i) => {
        const r = await fetch(new URL(i.src, link.href));
        const bmp = await createImageBitmap(await r.blob());
        return { src: resolve(i.src), ok: r.ok, size: `${bmp.width}x${bmp.height}`, declared: i.sizes, purpose: i.purpose };
      }),
    );
    return { status: res.status, type: res.headers.get('content-type'), start: resolve(json.start_url), scope: resolve(json.scope), id: resolve(json.id), display: json.display, icons };
  });
  check(mf.status === 200 && mf.start === APP && mf.scope === APP && mf.id === APP && mf.display === 'standalone', `manifest does not resolve inside the subpath: ${JSON.stringify(mf)}`);
  check(mf.icons.every((i: { ok: boolean; size: string; declared: string; src: string }) => i.ok && i.size === i.declared && i.src.startsWith(APP)) && mf.icons.some((i: { purpose: string }) => i.purpose === 'maskable'), `manifest icons invalid: ${JSON.stringify(mf.icons)}`);
  notes.push(`manifest on the subpath: start_url/scope/id → ${mf.start}; ${mf.icons.length} icons valid (${mf.icons.filter((i: { purpose: string }) => i.purpose === 'maskable').length} maskable); display ${mf.display}`);
  await enterMenu(page);
  const first = await waitStatus(page, /Quick Play is ready offline/);
  check(/Quick Play is ready offline/.test(first), `first visit: status never became ready — ${first}`);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { scope: r?.scope, controlled: !!navigator.serviceWorker.controller, build: document.documentElement.dataset.build };
  });
  check(reg.scope === `${ORIGIN}${APP}` && reg.controlled, `worker scope/control wrong: ${JSON.stringify(reg)}`);
  const caches1 = await cacheReport(page);
  const ours = caches1.filter((c) => c.name.startsWith('inspire:sticks-and-bones:'));
  cacheBytes = ours.reduce((s, c) => s + c.bytes, 0);
  const urls = ours.flatMap((c) => c.urls);
  check(ours.length === 2 && ours.some((c) => /:shell:/.test(c.name)) && ours.some((c) => /:assets:v1$/.test(c.name)), `unexpected cache names: ${ours.map((c) => c.name).join(', ')}`);
  check(!urls.some((u) => /\/assets\/.*\.png$/.test(u)), `a PNG source sheet was cached: ${urls.filter((u) => u.endsWith('.png')).join(', ')}`);
  check(!urls.some((u) => /\.(mp3|mp4|webm|ogg)$/.test(u)), 'media was cached');
  // Install caches only what Quick Play needs: no story backdrops, cast sheets or story accents.
  check(!urls.some((u) => /\/(back-alley|resort-patio|moonlit|jungle|cave-waterfall|executive|cast-|motif-|water-|glass-)/.test(u)), `install cached Story files: ${urls.filter((u) => /cast-|back-alley|jungle/.test(u)).join(', ')}`);
  check(urls.every((u) => u.startsWith(APP)), 'cached a URL outside the app');
  notes.push(`first visit (online, subpath): worker scope ${new URL(reg.scope!).pathname}, build "${reg.build}", status "${first}"`);
  notes.push(`cache contents: ${ours.map((c) => `${c.name} = ${c.urls.length} files, ${(c.bytes / 1024).toFixed(1)} KB`).join(' · ')} → total ${(cacheBytes / 1024).toFixed(1)} KB (${cacheBytes} B)`);
  writeFileSync(join(out, 'cache-report.json'), JSON.stringify(caches1, null, 1));
  await otherAppIntact(page, 'after first visit');

  // ---- 2. Offline reload: start from cache and finish a hand vs the computer -----------
  await goOffline(ctx, true);
  state.requests = [];
  await page.reload();
  await enterMenu(page);
  await newGame(page, 'ai');
  const done = await playHand(page, 'offline game');
  const offlineFacts = await page.evaluate(() => ({ atlasFaces: document.querySelectorAll('.face-atlas').length, svgFaces: document.querySelectorAll('.board .face-svg').length }));
  await page.screenshot({ path: join(out, 'offline-results.png') });
  check(done, 'offline: a hand vs the computer did not complete');
  // While "down", the only attempts allowed are the browser's own sw.js update checks (they fail harmlessly):
  // every app file must have come from the cache.
  const appRequests = state.requests.filter((r) => !r.endsWith('/sw.js'));
  check(appRequests.length === 0, `offline: app files were requested from the network: ${appRequests.slice(0, 5).join(', ')}`);
  const swChecks = state.requests.length - appRequests.length;
  check((errorsOf.get(page) ?? []).length === 0, `offline: page errors ${errorsOf.get(page)!.join(' | ')}`);
  notes.push(`offline reload (server down + browser offline): app started from cache, a full hand vs the computer completed (results shown), tiles from the cached atlas (${offlineFacts.atlasFaces} atlas faces); music unavailable → silent, 0 page errors; network attempts while down: ${swChecks} browser sw.js update check(s), 0 app files`);
  await goOffline(ctx, false);

  // ---- 6a. Repair keeps saves/settings and other apps' data ---------------------------
  await page.reload();
  await enterMenu(page);
  await page.click('[data-go="settings"]');
  await page.check('input[name="set-motion"][value="reduce"]'); // a setting to preserve
  await axe(page, 'settings with the offline panel');
  await page.locator('.offline-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'settings-offline-panel.png') });
  // Both save slots must survive: a Quick Play save and the Story case progress (seeded here if absent).
  await page.evaluate(() => {
    if (!localStorage.getItem('sticks-and-bones.story')) localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: 'chapter-2', part: 'pre', index: 4, outcome: null, completed: ['prologue', 'chapter-1'], textScale: 1, startedAt: 1, hand: null } }));
  });
  const beforeRepair = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  check('sticks-and-bones.story' in beforeRepair && 'sticks-and-bones.save' in beforeRepair, `repair: both save slots should exist before repair (${Object.keys(beforeRepair).join(', ')})`);
  // Plant a stale entry in our own cache, to see repair actually rebuild.
  await page.evaluate(async () => (await caches.open('inspire:sticks-and-bones:stale-test')).put('stale', new Response('x')));
  await page.click('[data-act="repair"]');
  const repaired = await waitStatus(page, /Quick Play is ready offline/);
  const afterRepair = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  const names = (await cacheReport(page)).map((c) => c.name);
  check(/ready offline/.test(repaired), `repair: status ${repaired}`);
  check(!names.includes('inspire:sticks-and-bones:stale-test'), 'repair: our stale cache survived');
  check(JSON.stringify(beforeRepair) === JSON.stringify(afterRepair), 'repair changed localStorage (saves/settings must be kept)');
  await otherAppIntact(page, 'after repair');
  notes.push(`repair: only inspire:sticks-and-bones:* caches deleted and rebuilt → "${repaired}"; ${Object.keys(afterRepair).length} localStorage keys unchanged (saves/settings kept); other app's worker, 3 caches and storage intact`);

  // ---- 6b. Erase: only this app's keys; offline files kept -------------------------------
  await page.click('[data-act="erase"]');
  const armed = await page.textContent('[data-act="erase"]');
  check(/Tap again/.test(armed ?? ''), 'erase: first tap did not arm the button');
  check(Object.keys(await page.evaluate(() => ({ ...localStorage }))).some((k: string) => k.startsWith('sticks-and-bones.')), 'erase: first tap already deleted data');
  await Promise.all([page.waitForNavigation(), page.click('[data-act="erase"]')]);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check(!keys.some((k: string) => k.startsWith('sticks-and-bones.')), `erase: our keys remain ${keys.join(', ')}`);
  await otherAppIntact(page, 'after erase');
  const cachesAfterErase = (await cacheReport(page)).filter((c) => c.name.startsWith('inspire:sticks-and-bones:'));
  check(cachesAfterErase.length === 2, 'erase: offline files were removed (they must be kept)');
  await enterMenu(page);
  check(/erased/.test((await page.textContent('.notice')) ?? ''), 'erase: no confirmation notice');
  notes.push(`erase (two taps): removed only sticks-and-bones.* keys; other app's keys ('other-app.save', 'sticks-and-bones-fan-page') kept; offline files kept; notice shown`);
  await ctx.close();

  // ---- 3. Interrupted downloads ---------------------------------------------------------
  {
    const { ctx, page } = await newContext();
    state.cut = new Set(['double-six-atlas', 'weathered-tabletop']);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const partial = await waitStatus(page, /still to download|interrupted/);
    const imageCount = (JSON.parse(readFileSync(join(SITE_A, 'build.json'), 'utf8')) as { groups: { core: unknown[] } }).groups.core.length;
    check(new RegExp(`2 of ${imageCount} table files still to download`).test(partial), `interrupted: status should report 2 of ${imageCount} table files missing — ${partial}`);
    const cached = (await cacheReport(page)).filter((c) => c.name.endsWith(':assets:v1'))[0];
    check(!!cached && !cached.urls.some((u) => /double-six-atlas|weathered-tabletop/.test(u)), 'interrupted: a truncated file was stored in the cache');
    // Offline with images missing: the game still completes with drawn fallbacks.
    await goOffline(ctx, true);
    await page.reload();
    await enterMenu(page);
    await newGame(page, 'ai');
    const ok = await playHand(page, 'offline with missing images');
    const fb = await page.evaluate(() => ({ svg: document.querySelectorAll('.face-svg').length, atlas: document.querySelectorAll('.face-atlas').length }));
    check(ok && fb.svg > 0 && fb.atlas === 0, `interrupted+offline: fallbacks not used (${JSON.stringify(fb)})`);
    await page.screenshot({ path: join(out, 'offline-fallback-results.png') });
    notes.push(`interrupted downloads (2 images cut off mid-transfer): status "${partial}"; no truncated file cached; offline hand completed with vector tile faces (${fb.svg} SVG faces, 0 atlas)`);
    await goOffline(ctx, false);
    state.cut.clear();
    await page.reload();
    await enterMenu(page);
    await page.click('[data-go="settings"]');
    await page.click('[data-act="repair"]');
    const fixed = await waitStatus(page, /Quick Play is ready offline/);
    check(/ready offline/.test(fixed), `interrupted: repair did not complete — ${fixed}`);
    notes.push(`…then online, Repair offline files → "${fixed}"`);
    check((errorsOf.get(page) ?? []).length === 0, `interrupted: page errors ${errorsOf.get(page)!.join(' | ')}`);
    await ctx.close();
  }

  // ---- 4. Quota failures ----------------------------------------------------------------
  for (const [label, quota, expect] of [
    ['images do not fit', 700_000, /Not enough storage/],
    ['shell does not fit', 40_000, /Not enough storage/],
  ] as const) {
    const { ctx, page } = await newContext();
    await page.goto('about:blank');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: ORIGIN, quotaSize: quota });
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const s = await waitStatus(page, /Not enough storage|Ready|still to download|unavailable|not saved/);
    check(expect.test(s), `quota (${label}): status "${s}"`);
    await newGame(page, 'ai');
    const played = await playHand(page, `quota ${label}`, 120_000);
    check(played, `quota (${label}): game did not work online`);
    check((errorsOf.get(page) ?? []).length === 0, `quota (${label}): page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`quota ${(quota / 1000).toFixed(0)} KB (${label}): "${s}" — online game still completed a hand, 0 page errors`);
    await ctx.close();
  }

  // ---- 5. Update from the previous build, mid-match, two humans --------------------------
  {
    const { ctx, page } = await newContext();
    state.site = SITE_A;
    await page.goto(`${ORIGIN}/other-app/`);
    await page.waitForSelector('#ok');
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitStatus(page, /Quick Play is ready offline/);
    await newGame(page, 'local');
    // Player 1 reveals and plays; Player 2 reveals: a hand is on screen when the update arrives.
    for (let i = 0; i < 2; i++) {
      await page.click('[data-act="cover-ready"]');
      await page.click('[data-act="cover-reveal"]');
      await page.waitForSelector('.hand-tile');
      if (i === 0) {
        const legal = page.locator('.hand-tile.is-legal');
        if (await legal.count()) {
          await legal.first().click();
          await page.locator('.end-slot.is-legal').first().click();
        } else await page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])').first().click();
      }
    }
    // Deploy build B and let the worker notice.
    state.site = SITE_B;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await page.click('[data-act="pause"]');
    await page.waitForSelector('dialog.pause[open] [data-region="update"]:not([hidden])', { timeout: 60_000 });
    await axe(page, 'pause sheet with Update available');
    await page.screenshot({ path: join(out, 'pause-update-available.png') });
    const saveBefore = await page.evaluate(() => localStorage.getItem('sticks-and-bones.save'));
    // What is on screen at the moment the page unloads for the update (survives the reload in sessionStorage).
    await page.evaluate(`addEventListener('beforeunload', () => sessionStorage.setItem('qa.atUnload', JSON.stringify({ tiles: document.querySelectorAll('.hand-tile').length, text: document.getElementById('app').textContent.trim().slice(0, 60) })));`);
    await Promise.all([page.waitForNavigation({ timeout: 30_000 }), page.click('dialog.pause [data-act="update-now"]')]);
    const build = await page.evaluate(() => document.documentElement.dataset.build);
    const atUnload = JSON.parse((await page.evaluate(() => sessionStorage.getItem('qa.atUnload'))) ?? '{}') as { tiles?: number; text?: string };
    check(atUnload.tiles === 0 && /Updating/.test(atUnload.text ?? ''), `update: screen at reload showed ${JSON.stringify(atUnload)}`);
    check(build === 'b', `update: still running build ${build}`);
    // After the reload the player returns straight to the saved match (once), behind the privacy cover.
    await page.waitForSelector('.start-button', { timeout: 30_000 });
    await page.click('.start-button');
    const skipU = page.locator('[data-act="intro-skip"]');
    if (await skipU.count()) await skipU.click().catch(() => undefined);
    await page.waitForSelector('.table-screen', { timeout: 30_000 });
    const saveAfter = await page.evaluate(() => localStorage.getItem('sticks-and-bones.save'));
    const strip = (s: string | null) => {
      const o = JSON.parse(s ?? '{}') as { data?: { savedAt?: number } };
      if (o.data) delete o.data.savedAt;
      return JSON.stringify(o);
    };
    check(!!saveBefore && strip(saveBefore) === strip(saveAfter), 'update: the saved match changed across the update');
    const covered = await page.evaluate(() => ({ cover: !!document.querySelector('.privacy-cover:not([hidden])'), tiles: document.querySelectorAll('.hand-tile').length }));
    check(covered.cover && covered.tiles === 0, `update: restored two-human match did not open covered (${JSON.stringify(covered)})`);
    const ourCaches = (await cacheReport(page)).map((c) => c.name).filter((n) => n.startsWith('inspire:sticks-and-bones:'));
    check(ourCaches.length === 2 && ourCaches.every((n) => !n.includes('shell:') || n.endsWith((JSON.parse(readFileSync(join(SITE_B, 'build.json'), 'utf8')) as { build: string }).build)), `update: shell caches after update: ${ourCaches.join(', ')}`);
    await otherAppIntact(page, 'after update');
    // Play on: the next player reveals and the game continues normally.
    await page.click('[data-act="cover-ready"]');
    await page.click('[data-act="cover-reveal"]');
    await page.waitForSelector('.hand-tile');
    check((errorsOf.get(page) ?? []).length === 0, `update: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`update A → B mid-match (two humans, a hand revealed): Update Available in the pause sheet; on "Update now" the save was written and the screen cleared before reload; build "${build}" running; saved match identical; the start tap returned straight to the match, behind the cover; old shell cache removed (${ourCaches.join(', ')}); other app intact`);
    await ctx.close();
  }
  // ---- 7. Story offline per chapter: visited (+ prefetched next) scenes play offline -----------------
  type G = 'shell' | 'core' | 'story' | 'audio';
  const B = JSON.parse(readFileSync(join(SITE_A, 'build.json'), 'utf8')) as { bytes: Record<G, number>; groups: Record<G, [string, number][]> };
  const seedStory = (page: Page, sceneId: string, index = 0, part = 'pre') =>
    page.evaluate(([sc, i, pt]: readonly [string, number, string]) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: sc, part: pt, index: i, outcome: null, completed: ['prologue'], textScale: 1, startedAt: 1, hand: null } })), [sceneId, index, part] as const);
  const openCase = async (page: Page) => {
    await page.click('[data-act="story"]');
    await page.locator('.story-shell').first().waitFor({ timeout: 30_000 });
  };
  const sceneUp = (page: Page) => page.waitForFunction(() => Boolean(document.querySelector('.st-curtain:not(.is-closed)') && document.querySelector('.dialogue-panel')), null, { timeout: 30_000 }).then((h: { dispose(): Promise<void> }) => h.dispose());
  {
    const { ctx, page } = await newContext();
    state.site = SITE_A;
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitStatus(page, /Quick Play is ready offline/);
    await seedStory(page, 'chapter-1', 3);
    await openCase(page);
    const noteBefore = (await page.locator('.case-offline').textContent().catch(() => '')) ?? '';
    await page.click('[data-act="story-continue"]');
    await sceneUp(page);
    await page.waitForTimeout(4000); // the next chapter prefetches once this one is presenting
    const story = (await cacheReport(page)).find((c) => c.name.endsWith(':story:v1'));
    const names = story?.urls.map((u) => u.split('/').pop()!) ?? [];
    check(names.some((n) => n.startsWith('cast-rafa')) && names.some((n) => n.startsWith('cast-marisol')), `story offline: chapter 1 cast not saved on the way (${names.join(', ')})`);
    check(names.some((n) => n.startsWith('back-alley-portrait')) && names.some((n) => n.startsWith('cast-vale')), `story offline: the next chapter was not prefetched into the cache (${names.join(', ')})`);
    check(!names.some((n) => /^(resort|moonlit|jungle|executive)/.test(n)), `story offline: chapters beyond the next were cached (${names.join(', ')})`);
    // Offline: the visited chapter plays with its art; an unvisited one still plays (drawn fallback) and says it needs a connection.
    await page.click('[data-act="story-file"]');
    await page.locator('.story-shell').first().waitFor();
    await goOffline(ctx, true);
    await page.reload();
    await enterMenu(page);
    await openCase(page);
    const noteReady = (await page.locator('.case-offline').textContent().catch(() => '')) ?? '';
    check(/Saved for offline play/.test(noteReady), `story offline: case file note for a visited chapter: "${noteReady}"`);
    await page.click('[data-act="story-continue"]');
    await sceneUp(page);
    const art = await page.evaluate(() => ({ env: document.querySelector('.st-bg.is-front')?.getAttribute('data-env'), cast: document.querySelector('.story-stage')?.hasAttribute('data-cast-visible') }));
    check(art.env === 'env.neighborhood-patio', `story offline: chapter 1 backdrop not shown offline (${JSON.stringify(art)})`);
    await page.click('[data-act="story-file"]');
    await page.locator('.story-shell').first().waitFor();
    await seedStory(page, 'chapter-5', 0);
    await openCase(page).catch(() => undefined);
    await page.reload();
    await enterMenu(page);
    await openCase(page);
    const noteMissing = (await page.locator('.case-offline').textContent().catch(() => '')) ?? '';
    check(/Needs a connection/.test(noteMissing), `story offline: unvisited chapter note "${noteMissing}"`);
    await page.click('[data-act="story-continue"]');
    await sceneUp(page);
    const fb = await page.evaluate(() => document.querySelector('.st-bg.is-front')?.getAttribute('data-env'));
    check(fb === 'none', `story offline: an unvisited chapter should fall back to the drawn backdrop (data-env=${fb})`);
    await page.click('[data-act="story-file"]');
    await page.click('[data-act="story-home"]');
    await page.click('[data-go="settings"]');
    const line = (await page.textContent('[data-region="offline-story"]')) ?? '';
    check(/of 9 story scenes are ready offline/.test(line), `story offline: Settings line "${line}"`);
    check((errorsOf.get(page) ?? []).length === 0, `story offline: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`story offline per chapter: before "${noteBefore.trim()}" → after playing Chapter 1 online the story cache held ${names.length} files (Ch. 1 cast + prefetched Ch. 2 backdrop/cast); offline, Chapter 1 opened with its backdrop and portraits ("${noteReady.trim()}"); unvisited Chapter 5 opened with the drawn backdrop ("${noteMissing.trim()}"); Settings: "${line}"`);
    await goOffline(ctx, false);
    await ctx.close();
  }

  // ---- 8. Whole-story download: measured size, progress, interruption, retry ----------------------
  {
    const { ctx, page } = await newContext();
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitStatus(page, /Quick Play is ready offline/);
    await page.click('[data-go="settings"]');
    const label = (await page.textContent('[data-act="offline-story"]')) ?? '';
    const mbStory = (B.bytes.story / 1048576).toFixed(1);
    check(label.includes(`${mbStory} MB`), `story download: button should show the measured ${mbStory} MB — "${label}"`);
    // First attempt: two story files are cut off mid-transfer.
    state.cut = new Set(['jungle-camp-portrait', 'cast-luz']);
    let sawProgress = false;
    await page.click('[data-act="offline-story"]');
    const t0 = Date.now();
    let line = '';
    while (Date.now() - t0 < 90_000) {
      sawProgress ||= await page.evaluate(() => !(document.querySelector('progress[data-region="offline-story-progress"]') as HTMLProgressElement | null)?.hidden);
      line = (await page.textContent('[data-region="offline-story"]')) ?? '';
      if (/interrupted|whole story is ready/.test(line)) break;
      await page.waitForTimeout(100);
    }
    check(/interrupted/.test(line) && /Retry continues/.test(line), `story download: interruption not reported — "${line}"`);
    const partial = (await cacheReport(page)).find((c) => c.name.endsWith(':story:v1'))!;
    check(!partial.urls.some((u) => /jungle-camp-portrait|cast-luz/.test(u)), 'story download: a truncated file was stored');
    const retryLabel = (await page.textContent('[data-act="offline-story"]')) ?? '';
    check(/Retry/.test(retryLabel), `story download: no Retry button ("${retryLabel}")`);
    state.cut.clear();
    await page.click('[data-act="offline-story"]');
    line = await (async () => {
      const t = Date.now();
      let l = '';
      while (Date.now() - t < 90_000) {
        l = (await page.textContent('[data-region="offline-story"]')) ?? '';
        if (/whole story is ready/.test(l)) break;
        await page.waitForTimeout(150);
      }
      return l;
    })();
    const full = (await cacheReport(page)).find((c) => c.name.endsWith(':story:v1'))!;
    check(/The whole story is ready offline/.test(line), `story download: did not finish — "${line}"`);
    check(full.urls.length === B.groups.story.length && full.bytes === B.bytes.story, `story download: cache has ${full.urls.length}/${B.groups.story.length} files, ${full.bytes}/${B.bytes.story} B`);
    check(sawProgress, 'story download: the progress bar never showed');
    const prefs = await page.evaluate(() => localStorage.getItem('sticks-and-bones.offline'));
    check(/"story":true/.test(prefs ?? ''), `story download: the choice was not remembered for Repair (${prefs})`);
    await axe(page, 'settings with story + audio offline controls');
    await page.locator('.offline-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, 'settings-story-offline.png') });
    // Repair keeps what the player chose: the whole story comes back.
    await page.click('[data-act="repair"]');
    await waitStatus(page, /Quick Play is ready offline/);
    const afterRepair = (await cacheReport(page)).find((c) => c.name.endsWith(':story:v1'));
    check(afterRepair?.urls.length === B.groups.story.length, `repair: the chosen whole-story download was not restored (${afterRepair?.urls.length})`);
    // Offline: every chapter opens with its art.
    await goOffline(ctx, true);
    await page.reload();
    await enterMenu(page);
    for (const sc of ['chapter-3', 'chapter-6']) {
      await seedStory(page, sc, 1);
      await openCase(page);
      await page.click('[data-act="story-continue"]');
      await sceneUp(page);
      const env = await page.evaluate(() => document.querySelector('.st-bg.is-front')?.getAttribute('data-env'));
      check(!!env && env !== 'none', `whole story offline: ${sc} opened without its backdrop`);
      await page.click('[data-act="story-file"]');
      await page.click('[data-act="story-home"]');
    }
    await goOffline(ctx, false);
    check((errorsOf.get(page) ?? []).length === 0, `story download: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`whole-story download: button "${label.trim()}"; with 2 files cut mid-transfer → "${(partial.urls.length)} saved, interrupted, Retry"; no truncated file stored; Retry → "${line}" (${full.urls.length} files, ${(full.bytes / 1048576).toFixed(2)} MB = build total); progress bar shown; choice remembered and restored by Repair; offline, Chapters 3 and 6 opened with their art`);
    await ctx.close();
  }

  // ---- 9. Optional offline audio: separate size, missing file, ranges, removal --------------------
  {
    const { ctx, page } = await newContext();
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitStatus(page, /Quick Play is ready offline/);
    await page.click('[data-go="settings"]');
    const before = (await page.textContent('[data-region="offline-audio"]')) ?? '';
    const mbAudio = (B.bytes.audio / 1048576).toFixed(1);
    check(before.includes(`optional ${mbAudio} MB`), `audio: separate size not disclosed — "${before}"`);
    const noMedia = (await cacheReport(page)).some((c) => c.urls.some((u) => u.endsWith('.mp3')));
    check(!noMedia, 'audio: music/ambience cached before the player asked');
    state.missing = new Set(['amb-terrace']);
    await page.click('[data-act="offline-audio"]');
    let line = '';
    const t0 = Date.now();
    while (Date.now() - t0 < 120_000) {
      line = (await page.textContent('[data-region="offline-audio"]')) ?? '';
      if (/unavailable and skipped|saved for offline/.test(line)) break;
      await page.waitForTimeout(150);
    }
    check(/1 audio file was unavailable and skipped/.test(line), `audio: missing optional file not reported — "${line}"`);
    state.missing.clear();
    await page.click('[data-act="offline-audio"]'); // Retry fetches only the missing one
    const t1 = Date.now();
    while (Date.now() - t1 < 60_000) {
      line = (await page.textContent('[data-region="offline-audio"]')) ?? '';
      if (/saved for offline/.test(line)) break;
      await page.waitForTimeout(150);
    }
    check(/Music and ambience are saved for offline play/.test(line), `audio: not saved — "${line}"`);
    const audioCache = (await cacheReport(page)).find((c) => c.name.endsWith(':audio:v1'));
    check(audioCache?.urls.length === B.groups.audio.length, `audio: ${audioCache?.urls.length}/${B.groups.audio.length} files cached`);
    // Offline: <audio> byte ranges are served from the cache.
    await goOffline(ctx, true);
    const music = B.groups.audio.find(([u]) => /patio-dominoes/.test(u))![0];
    const r = await page.evaluate(async (u: string) => {
      const res = await fetch(u, { headers: { Range: 'bytes=100-1123' } });
      return { status: res.status, len: (await res.arrayBuffer()).byteLength, range: res.headers.get('content-range') };
    }, music);
    check(r.status === 206 && r.len === 1024 && /^bytes 100-1123\//.test(r.range ?? ''), `audio offline: range request ${JSON.stringify(r)}`);
    await goOffline(ctx, false);
    await page.click('[data-act="offline-audio"]'); // now "Remove"
    await page.waitForTimeout(800);
    const gone = !(await cacheReport(page)).some((c) => c.name.endsWith(':audio:v1'));
    check(gone, 'audio: remove did not delete the audio cache');
    await otherAppIntact(page, 'after audio download/remove');
    notes.push(`optional audio: Settings disclosed "${before.trim()}"; with amb-terrace returning 404 → "1 audio file was unavailable and skipped"; Retry → all ${audioCache?.urls.length} files (${((audioCache?.bytes ?? 0) / 1048576).toFixed(1)} MB); offline a byte-range request for the patio track → ${r.status} ${r.range}; Remove deleted only the audio cache`);
    await ctx.close();
  }

  // ---- 10. Not enough storage for the whole story (the browser's estimate) -------------------------
  {
    const { ctx, page } = await newContext();
    await ctx.addInitScript(`navigator.storage.estimate = async () => ({ quota: 4_000_000, usage: 3_000_000 });`);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitStatus(page, /Quick Play is ready offline/);
    await page.click('[data-go="settings"]');
    state.requests = [];
    await page.click('[data-act="offline-story"]');
    await page.waitForTimeout(800);
    const line = (await page.textContent('[data-region="offline-story"]')) ?? '';
    check(/Not enough storage for the whole story: it needs .* MB, about 1\.0 MB is free/.test(line), `story quota: "${line}"`);
    check(!state.requests.some((u) => /cast-|jungle/.test(u)), 'story quota: files were downloaded anyway');
    notes.push(`story download with too little storage (estimate: 1 MB free): "${line}" — nothing downloaded`);
    await ctx.close();
  }

  // ---- 11. Update mid-case: dialogue position and an in-progress hand restored once ----------------
  {
    const { ctx, page } = await newContext();
    state.site = SITE_A;
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitStatus(page, /Quick Play is ready offline/);
    await seedStory(page, 'chapter-1', 6);
    await openCase(page);
    await page.click('[data-act="story-continue"]');
    await sceneUp(page);
    await page.click('[data-act="story-next"]');
    await page.click('[data-act="story-next"]');
    await page.waitForTimeout(600);
    const pos = await page.evaluate(() => document.querySelector('.cine-pos')?.textContent);
    const progBefore = await page.evaluate(() => localStorage.getItem('sticks-and-bones.story'));
    await page.click('[data-act="story-file"]');
    state.site = SITE_B;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await page.waitForSelector('.story-shell [data-region="update"]:not([hidden])', { timeout: 60_000 });
    await Promise.all([page.waitForNavigation({ timeout: 30_000 }), page.click('.story-shell [data-act="update-now"]')]);
    await page.waitForSelector('.start-button');
    await page.click('.start-button');
    const skip = page.locator('[data-act="intro-skip"]');
    if (await skip.count()) await skip.click().catch(() => undefined);
    await sceneUp(page);
    const after = await page.evaluate(() => ({ pos: document.querySelector('.cine-pos')?.textContent, scene: document.querySelector('.story-stage')?.getAttribute('data-scene'), build: document.documentElement.dataset.build }));
    check(after.scene === 'chapter-1' && after.pos === pos && after.build === 'b', `update mid-dialogue: returned to ${JSON.stringify(after)}, expected chapter-1 at ${pos}`);
    // Once: a plain reload goes to the menu as usual.
    await page.reload();
    await enterMenu(page);
    check(await page.locator('[data-go="setup"]').count() === 1, 'update mid-dialogue: a second reload returned to the story again');
    notes.push(`update A → B from the case file mid-dialogue: progress saved (${(progBefore ?? '').length} B record); after reload the start tap returned straight to Chapter 1 at line ${after.pos} on build "${after.build}"; a second reload went to the menu (once only)`);

    // In-progress hand (encounter): update from the story table's pause sheet.
    state.site = SITE_A;
    const { ctx: c2, page: p2 } = await newContext();
    await p2.goto(`${ORIGIN}${APP}`);
    await enterMenu(p2);
    await waitStatus(p2, /Quick Play is ready offline/);
    const pre = (JSON.parse(readFileSync(join(root, 'src/story/script.json'), 'utf8')) as { scenes: { id: string; blocks: { raw: string }[] }[] });
    void pre;
    await seedStory(p2, 'chapter-1', 0, 'hand');
    await openCase(p2);
    await p2.click('[data-act="story-continue"]');
    await p2.locator('.table-screen').first().waitFor({ timeout: 30_000 });
    await p2.waitForTimeout(800);
    const legal = p2.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click();
      await p2.locator('.end-slot.is-legal').first().click();
    }
    await p2.waitForTimeout(2500);
    const handBefore = await p2.evaluate(() => (JSON.parse(localStorage.getItem('sticks-and-bones.story') ?? '{}') as { data?: { hand?: { state?: { hand?: unknown } } } }).data?.hand?.state?.hand ?? null);
    state.site = SITE_B;
    await p2.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await p2.click('[data-act="pause"]');
    await p2.waitForSelector('dialog.pause[open] [data-region="update"]:not([hidden])', { timeout: 60_000 });
    // First: storage refuses the write → the player is told and nothing reloads.
    await p2.evaluate(() => {
      (window as unknown as { __realSet: typeof Storage.prototype.setItem }).__realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException('blocked', 'QuotaExceededError');
      };
    });
    await p2.click('dialog.pause [data-act="update-now"]');
    await p2.waitForSelector('dialog.update-unsaved[open]', { timeout: 5000 });
    const msg = (await p2.textContent('dialog.update-unsaved')) ?? '';
    await p2.click('[data-act="upd-later"]');
    await p2.waitForTimeout(500);
    check(/couldn’t be saved/.test(msg) && (await p2.evaluate(() => document.documentElement.dataset.build)) === 'a', `update with a refused save: "${msg}"`);
    await p2.evaluate(() => {
      Storage.prototype.setItem = (window as unknown as { __realSet: typeof Storage.prototype.setItem }).__realSet;
    });
    // Then: storage works → the hand is saved and comes back identical, once.
    if (!(await p2.locator('dialog.pause[open]').count())) await p2.click('[data-act="pause"]');
    await p2.evaluate(`addEventListener('beforeunload', () => sessionStorage.setItem('qa.atUnload', JSON.stringify({ tiles: document.querySelectorAll('.hand-tile').length })));`);
    await Promise.all([p2.waitForNavigation({ timeout: 30_000 }), p2.click('dialog.pause [data-act="update-now"]')]);
    const unload = JSON.parse((await p2.evaluate(() => sessionStorage.getItem('qa.atUnload'))) ?? '{}') as { tiles?: number };
    await p2.waitForSelector('.start-button');
    await p2.click('.start-button');
    const skip2 = p2.locator('[data-act="intro-skip"]');
    if (await skip2.count()) await skip2.click().catch(() => undefined);
    await p2.locator('.table-screen').first().waitFor({ timeout: 30_000 });
    const handAfter = await p2.evaluate(() => (JSON.parse(localStorage.getItem('sticks-and-bones.story') ?? '{}') as { data?: { hand?: { state?: { hand?: unknown } } } }).data?.hand?.state?.hand ?? null);
    check(!!handBefore && JSON.stringify(handBefore) === JSON.stringify(handAfter), 'update mid-hand: the encounter changed across the update');
    check(unload.tiles === 0, `update mid-hand: tiles visible while reloading (${JSON.stringify(unload)})`);
    check((errorsOf.get(p2) ?? []).length === 0 && (errorsOf.get(page) ?? []).length === 0, `update mid-case: page errors ${[...(errorsOf.get(p2) ?? []), ...(errorsOf.get(page) ?? [])].join(' | ')}`);
    notes.push(`update mid-hand (story table, Chapter 1): with storage refusing the write → "Your place couldn’t be saved" + Not now (still build a, nothing lost); then Update now → screen cleared (0 tiles at unload) → start tap returned straight to the same hand (engine hand state identical)`);
    await c2.close();
    await ctx.close();
  }

} catch (e) {
  failures.push(`exception: ${(e as Error).stack ?? e}`);
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}

writeFileSync(join(out, 'report.json'), JSON.stringify({ failures, notes, cacheBytes }, null, 1));
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\nPWA FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nPWA passed. Cache size ${cacheBytes} B. Evidence in ${out}`);
process.exit(0);
