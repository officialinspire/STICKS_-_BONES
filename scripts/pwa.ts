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
const state = { site: SITE_A, down: false, cut: new Set<string>(), requests: [] as string[] };
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
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
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
  const first = await waitStatus(page, /Ready to play offline/);
  check(/Ready to play offline/.test(first), `first visit: status never became ready — ${first}`);
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
  const beforeRepair = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  // Plant a stale entry in our own cache, to see repair actually rebuild.
  await page.evaluate(async () => (await caches.open('inspire:sticks-and-bones:stale-test')).put('stale', new Response('x')));
  await page.click('[data-act="repair"]');
  const repaired = await waitStatus(page, /Ready to play offline/);
  const afterRepair = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  const names = (await cacheReport(page)).map((c) => c.name);
  check(/Ready/.test(repaired), `repair: status ${repaired}`);
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
    check(/2 of 6 images still to download/.test(partial), `interrupted: status should report 2 missing images — ${partial}`);
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
    const fixed = await waitStatus(page, /Ready to play offline/);
    check(/Ready/.test(fixed), `interrupted: repair did not complete — ${fixed}`);
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
    await waitStatus(page, /Ready to play offline/);
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
    await enterMenu(page);
    const notice = (await page.textContent('.notice')) ?? '';
    check(/Updated to the latest version/.test(notice), `update: no "updated" notice (${notice})`);
    const saveAfter = await page.evaluate(() => localStorage.getItem('sticks-and-bones.save'));
    const strip = (s: string | null) => {
      const o = JSON.parse(s ?? '{}') as { data?: { savedAt?: number } };
      if (o.data) delete o.data.savedAt;
      return JSON.stringify(o);
    };
    check(!!saveBefore && strip(saveBefore) === strip(saveAfter), 'update: the saved match changed across the update');
    await page.click('[data-act="resume"]');
    await page.waitForSelector('.table-screen');
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
    notes.push(`update A → B mid-match (two humans, a hand revealed): Update Available in the pause sheet; on "Update now" the save was written and the screen cleared before reload; build "${build}" running; saved match identical; Resume opened behind the cover; old shell cache removed (${ourCaches.join(', ')}); other app intact`);
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
