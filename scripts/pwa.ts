/**
 * npm run pwa — installable-PWA and full offline storage acceptance on real production builds (Chromium).
 *
 * Builds the app three times (A, B and C, differing by SB_BUILD_TAG, so the code hashes and the worker's
 * build id change; C also renames one music file, as a release that replaces a track would) and serves
 * them from a GitHub-Pages style SUBPATH (/STICKS_-_BONES/) next to a fake second INSPIRE app at
 * /other-app/ with its own worker, caches and localStorage. The test server answers byte ranges like
 * GitHub Pages, and can go "down" (every connection destroyed), cut chosen downloads off half-way,
 * slow them down, answer 404, or send corrupted bytes.
 *
 *  1. First visit (online, subpath): manifest/icons inside the subpath, installable; startup never waits
 *     for the pack (no story/media file before the menu); the whole-game download runs with progress,
 *     adopts the retired audio cache's copy, verifies, and only then says "Full game ready offline". Every
 *     shipped file is stored complete (exact bytes + SHA-256, right MIME); no source masters/duplicates.
 *  2. Cold offline launch (worker stopped, server down, browser offline): start → the studio video plays
 *     from the cache → menu; a Quick Play hand; Story chapters 3 and 6 with their art; music, ambience,
 *     cues and video decode offline; byte ranges 200/206/416 and MIME; 0 app requests to the network.
 *  3. Interrupted install downloads: Quick Play still works offline with drawn fallbacks; Retry resumes
 *     (only the missing files are fetched again) → verified.
 *  4. Quota: too little space by the browser's estimate (nothing downloaded), a real quota failure inside
 *     the worker, and a shell that cannot install — honest messages, game still works online.
 *  5. Update A → B mid-match with two humans (no hand shown during the update; save identical).
 *  6. Repair (stale cache + a corrupted stored copy → replaced; saves/settings untouched) and Erase.
 *  7. Data Saver: the pack waits for the player; chapters save as played; Download → verified.
 *  8. Whole-game download interrupted (cut transfers, then the browser stopping the worker): progress,
 *     "stopped", resume without re-fetching saved files, Retry → verified.
 *  9. Corrupted bytes from the server: never stored, reported, Retry → verified.
 * 10. Eviction: all files cleared (honest "cleared" message) and one group removed → downloads again.
 * 11. Update mid-case (dialogue and an in-progress hand).
 * 12. Upgrade retention (A → C, C's new track unavailable): the old track stays cached and plays offline
 *     (with ranges) until C's pack is verified; then it is pruned.
 * 13. Storage unavailable: honest message, game works online.
 * Throughout: the other app's worker, caches and storage are untouched.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
rmSync(out, { recursive: true, force: true }); // includes the persistent test profile
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);
const T0 = Date.now();
/** PWA_ONLY=3,9 runs sections 1, 2 and 6 (always) plus the listed ones — for debugging. */
const ONLY = process.env.PWA_ONLY?.split(',') ?? null;
const run = (id: string) => !ONLY || ONLY.includes(id);
/** Progress on stderr, so a hang shows where it is. */
const step = (label: string) => console.error(`[pwa ${((Date.now() - T0) / 1000).toFixed(0)} s] ${label}`);

// ---- three production builds ---------------------------------------------------------
async function buildSite(tag: string, dir: string) {
  process.env.SB_BUILD_TAG = tag;
  await build({ root, logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
}
const SITE_A = join(out, 'site-a');
const SITE_B = join(out, 'site-b');
const SITE_C = join(out, 'site-c');
await buildSite('a', SITE_A);
await buildSite('b', SITE_B);
await buildSite('c', SITE_C);
delete process.env.SB_BUILD_TAG;

type G = 'shell' | 'core' | 'story' | 'media';
type Pack = { build: string; bytes: Record<G, number>; total: number; groups: Record<G, [string, number, string][]> };
const packOf = (site: string) => JSON.parse(readFileSync(join(site, 'build.json'), 'utf8')) as Pack;
const PACK_A = packOf(SITE_A);
const filesOf = (p: Pack) => (Object.values(p.groups) as [string, number, string][][]).flat();
const fileA = (re: RegExp) => filesOf(PACK_A).find(([u]) => re.test(u))!;

// Release C replaces the patio track: same audio, new content-hashed name (as a re-encoded track would get).
const OLD_TRACK = fileA(/patio-dominoes-take-2-[\w-]{8}\.mp3$/)[0];
const NEW_TRACK = 'assets/patio-dominoes-take-2-Upd8Tst1.mp3';
{
  renameSync(join(SITE_C, OLD_TRACK), join(SITE_C, NEW_TRACK));
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of walk(SITE_C).filter((f) => /\.(js|css|html|json|webmanifest)$/.test(f))) {
    const t = readFileSync(f, 'utf8');
    if (t.includes(OLD_TRACK.slice('assets/'.length))) writeFileSync(f, t.split(OLD_TRACK.slice('assets/'.length)).join(NEW_TRACK.slice('assets/'.length)));
  }
  // The edited files' sizes and checksums change: list them as the real build would have (else the worker
  // rightly refuses to install release C).
  const pack = JSON.parse(readFileSync(join(SITE_C, 'build.json'), 'utf8')) as { groups: Record<string, [string, number, string][]> };
  for (const list of Object.values(pack.groups))
    for (const e of list) {
      const body = readFileSync(join(SITE_C, e[0]));
      e[1] = body.length;
      e[2] = createHash('sha256').update(body).digest('hex');
    }
  writeFileSync(join(SITE_C, 'build.json'), JSON.stringify(pack, null, 1));
  const sw = readFileSync(join(SITE_C, 'sw.js'), 'utf8');
  if (!/const GROUPS = \{.*\};/.test(sw)) throw new Error('site C: GROUPS line not found in sw.js');
  writeFileSync(join(SITE_C, 'sw.js'), sw.replace(/const GROUPS = \{.*\};/, () => `const GROUPS = ${JSON.stringify(pack.groups)};`));
}

// ---- test server: subpath app + another INSPIRE app ---------------------------------
const APP = '/STICKS_-_BONES/';
const PORT = 5194;
const ORIGIN = `http://localhost:${PORT}`;
const state = {
  site: SITE_A,
  down: false,
  cut: new Set<string>(),
  missing: new Set<string>(),
  corrupt: new Set<string>(),
  slow: new Set<string>(),
  requests: [] as string[],
  /** Every app request: path, whether it asked for a range, when. */
  log: [] as { p: string; range: boolean; t: number }[],
};
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
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const hit = (set: Set<string>, rel: string) => [...set].some((m) => rel.includes(m));
const server: Server = createServer((req, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  state.requests.push(url.pathname);
  if (url.pathname.startsWith(APP)) state.log.push({ p: url.pathname.slice(APP.length), range: !!req.headers.range, t: Date.now() });
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
  if (hit(state.missing, rel)) {
    res.writeHead(404); // a file simply not on the server
    return void res.end();
  }
  const file = normalize(join(state.site, rel));
  if (!file.startsWith(state.site) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return void res.end();
  }
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  // GitHub Pages-like: byte ranges for media elements, 10-minute caching (the worker must still pick up updates).
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (m && !hit(state.cut, rel) && !hit(state.corrupt, rel)) {
    const start = Number(m[1]);
    const end = m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return void res.end();
    }
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'max-age=600' });
    return void createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'max-age=600' });
  if (hit(state.cut, rel)) {
    // Interrupted download: send half the body, then drop the connection.
    const s = createReadStream(file, { start: 0, end: Math.floor(size / 2) });
    s.on('data', (d) => res.write(d));
    s.on('end', () => req.socket.destroy());
    return;
  }
  if (hit(state.corrupt, rel)) {
    // Damaged in transit: the right length, wrong bytes.
    const body = readFileSync(file);
    body[Math.floor(body.length / 2)]! ^= 0xff;
    return void res.end(body);
  }
  if (hit(state.slow, rel)) {
    // A slow connection: 64 KB every 100 ms.
    const body = readFileSync(file);
    let at = 0;
    const tick = () => {
      if (res.destroyed) return;
      res.write(body.subarray(at, at + 65536));
      at += 65536;
      if (at < body.length) setTimeout(tick, 100);
      else res.end();
    };
    return void tick();
  }
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(PORT, r));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const browser = await chromium.launch();
const errorsOf = new WeakMap<Page, string[]>();
/** Records every text the offline line shows (a fast local download can pass a state between polls). */
const TEXT_LOG = `window.__name = (f) => f;
window.__offlineTexts = [];
new MutationObserver(() => {
  const t = document.querySelector('[data-region="offline-status"]')?.textContent ?? '';
  const l = window.__offlineTexts;
  if (t && l[l.length - 1] !== t) l.push(t);
  const p = document.querySelector('progress[data-region="offline-progress"]');
  if (p && !p.hidden) window.__sawProgress = true;
}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });`;
async function newContext(init = ''): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // tsx/esbuild adds __name() around named inner functions of callbacks serialized into the page.
  await ctx.addInitScript(TEXT_LOG + init);
  const page = await ctx.newPage();
  watchErrors(page);
  return { ctx, page };
}
/** A context on an on-disk profile, so the whole browser can be closed and relaunched (a true cold start). */
const PROFILE = join(out, 'profile');
async function persistentContext(offline = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 390, height: 844 }, offline });
  await ctx.addInitScript(TEXT_LOG);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  watchErrors(page);
  return { ctx, page };
}
function watchErrors(page: Page) {
  const errs: string[] = [];
  errorsOf.set(page, errs);
  page.on('pageerror', (e: Error) => errs.push(`page error: ${e.message}`));
}
const seenTexts = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __offlineTexts: string[] }).__offlineTexts ?? []);

const offlineText = (page: Page) => page.locator('[data-region="offline-status"]').first().textContent();
async function enterMenu(page: Page) {
  await page.waitForSelector('.start-button', { timeout: 30_000 });
  await page.click('.start-button');
  const skip = page.locator('[data-skip="armed"] [data-act="intro-skip"]');
  await skip.click({ timeout: 2500 }).catch(() => undefined);
  await page.waitForSelector('[data-go="setup"]');
}
async function waitStatus(page: Page, re: RegExp, timeout = 90_000): Promise<string> {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeout) {
    last = (await offlineText(page).catch(() => '')) ?? '';
    if (re.test(last)) return last;
    await page.waitForTimeout(200);
  }
  return `TIMEOUT (last: ${last})`;
}
const FULL = /^✓ Full game ready offline \(\d+\.\d MB on this device\)\.$/;
const waitFull = (page: Page, timeout = 120_000) => waitStatus(page, FULL, timeout);
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
        const r = await c.match(req);
        if (!r) continue; // removed meanwhile (a prune running in the worker)
        urls.push(new URL(req.url).pathname);
        bytes += (await r.blob()).size;
      }
      out.push({ name, urls, bytes });
    }
    return out;
  });
/** Every file of a pack, read back from our caches: present, exact bytes, SHA-256 and stored MIME type. */
const packAudit = (page: Page, pack: Pack) =>
  page.evaluate(
    async ([files, app]: readonly [[string, number, string][], string]) => {
      const names = (await caches.keys()).filter((n) => n.startsWith('inspire:sticks-and-bones:'));
      const bad: string[] = [];
      for (const [u, bytes, want] of files) {
        const url = new URL(u, location.origin + app).href;
        let r: Response | undefined;
        for (const n of names) r ??= await (await caches.open(n)).match(url);
        if (!r) {
          bad.push(`${u}: missing`);
          continue;
        }
        const buf = await r.arrayBuffer();
        const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
        if (buf.byteLength !== bytes) bad.push(`${u}: ${buf.byteLength} of ${bytes} bytes`);
        if (hex !== want) bad.push(`${u}: checksum mismatch`);
        const type = r.headers.get('content-type') ?? '';
        const ext = u.split('.').pop()!;
        const expect: Record<string, RegExp> = { js: /^text\/javascript/, css: /^text\/css/, html: /^text\/html/, webp: /^image\/webp$/, png: /^image\/png$/, wav: /^audio\/wav$/, mp3: /^audio\/mpeg$/, mp4: /^video\/mp4$/, woff2: /^font\/woff2$/, txt: /^text\/plain/, webmanifest: /^application\/manifest\+json$/ };
        if (expect[ext] && !expect[ext]!.test(type)) bad.push(`${u}: stored as ${type}`);
      }
      return bad;
    },
    [filesOf(pack), APP] as const,
  );
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
async function visitOtherApp(page: Page) {
  await page.goto(`${ORIGIN}/other-app/`);
  await page.waitForSelector('#ok');
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length > 0 && (await caches.keys()).length >= 2);
  await page.waitForTimeout(300);
}
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
/** The browser stops this origin's workers (as it does to idle or long-running ones). Change offline emulation before, not after. */
function within<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`${what} timed out`)), 10_000))]);
}
async function stopWorkers(page: Page) {
  const cdp = (await within(page.context().newCDPSession(page), 'CDP session')) as { send(m: string): Promise<unknown>; detach(): Promise<void> };
  await within(cdp.send('ServiceWorker.enable'), 'ServiceWorker.enable');
  await within(cdp.send('ServiceWorker.stopAllWorkers'), 'ServiceWorker.stopAllWorkers');
  await within(cdp.detach(), 'CDP detach');
}
const openSettings = async (page: Page) => {
  await page.click('[data-go="settings"]');
  await page.locator('.offline-panel').waitFor();
};
const seedStory = (page: Page, sceneId: string, index = 0, part = 'pre') =>
  page.evaluate(([sc, i, pt]: readonly [string, number, string]) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: sc, part: pt, index: i, outcome: null, completed: ['prologue'], textScale: 1, startedAt: 1, hand: null } })), [sceneId, index, part] as const);
const openCase = async (page: Page) => {
  await page.click('[data-act="story"]');
  await page.locator('.story-shell').first().waitFor({ timeout: 30_000 });
};
// The dialogue panel is permanent markup, so "up" means the curtain is open AND a line is placed (its position shown).
const sceneUp = (page: Page) => page.waitForFunction(() => Boolean(document.querySelector('.st-curtain:not(.is-closed)') && document.querySelector('.cine-pos')?.textContent?.trim()), null, { timeout: 30_000 }).then((h: { dispose(): Promise<void> }) => h.dispose());
/** Offline Story check: the chapter opens with its own backdrop (not the drawn fallback). */
async function chapterArt(page: Page, sc: string): Promise<string | null> {
  await seedStory(page, sc, 1);
  await openCase(page);
  await page.click('[data-act="story-continue"]');
  await sceneUp(page);
  const env = await page.evaluate(() => document.querySelector('.st-bg.is-front')?.getAttribute('data-env') ?? null);
  await page.click('[data-act="story-file"]');
  await page.click('[data-act="story-home"]');
  await page.waitForSelector('[data-go="setup"]');
  return env;
}
/** App requests made by the worker's downloads (no Range header) since a point in the log. */
const downloadsSince = (i: number) => state.log.slice(i).filter((r) => !r.range && r.p !== 'sw.js').map((r) => r.p);

const AXE = require.resolve('axe-core/axe.min.js');
async function axe(page: Page, label: string) {
  await page.addScriptTag({ path: AXE });
  const r = (await page.evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })`)) as { violations: { id: string; impact: string; nodes: unknown[] }[] };
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(bad.length === 0, `axe ${label}: ${bad.map((v) => v.id).join(', ')}`);
  notes.push(`axe ${label}: ${bad.length} serious/critical, ${r.violations.length - bad.length} minor`);
}
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

let cacheBytes = 0;
const STORY_FILE = /^assets\/(cast-|jungle-camp|cave-waterfall|back-alley|moonlit|executive|motif-|water-drop|glass-|promenade-after-dark|the-lit-threshold)/;
try {
  // ---- 1. First visit on the subpath: startup first, then the whole game, verified ------------------
  step('1. First visit on the subpath: startup first, then the whole game, verified');
  const { ctx, page } = await persistentContext();
  await visitOtherApp(page);
  state.log = [];
  await page.goto(`${ORIGIN}${APP}`);
  // A release before full offline storage kept music in the optional `audio:v1` cache: leave one such copy.
  const legacy = fileA(/amb-cave-[\w-]{8}\.mp3$/);
  await page.evaluate(
    async ([u, b64]: readonly [string, string]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await (await caches.open('inspire:sticks-and-bones:audio:v1')).put(new URL(u, location.href).href, new Response(bin, { headers: { 'Content-Type': 'audio/mpeg' } }));
    },
    [legacy[0], readFileSync(join(SITE_A, legacy[0])).toString('base64')] as const,
  );
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
  const menuAt = Date.now();
  const first = await waitFull(page);
  check(FULL.test(first), `first visit: never reported the full game ready — ${first}`);
  // Startup never waited for the pack: no Story art/sound/score was requested before the menu was up.
  const early = state.log.filter((r) => r.t < menuAt && STORY_FILE.test(r.p)).map((r) => r.p);
  check(early.length === 0, `first visit: Story files were downloaded before the menu (${early.join(', ')})`);
  const texts = await seenTexts(page);
  const iSave = texts.findIndex((t) => /Saving the full game for offline play… \d/.test(t));
  const iCheck = texts.findIndex((t) => /Checking the saved files… \d+ of \d+/.test(t));
  const iFull = texts.findIndex((t) => FULL.test(t));
  check(iSave >= 0 && iCheck > iSave && iFull > iCheck && texts.slice(0, iFull).every((t) => !/Full game ready/.test(t)), `first visit: progress → check → ready order wrong: ${texts.join(' → ')}`);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { scope: r?.scope, controlled: !!navigator.serviceWorker.controller, build: document.documentElement.dataset.build };
  });
  check(reg.scope === `${ORIGIN}${APP}` && reg.controlled, `worker scope/control wrong: ${JSON.stringify(reg)}`);
  const caches1 = await cacheReport(page);
  const ours = caches1.filter((c) => c.name.startsWith('inspire:sticks-and-bones:'));
  cacheBytes = ours.filter((c) => !c.name.endsWith(':meta:v1')).reduce((s, c) => s + c.bytes, 0);
  const expectNames = ['assets:v1', 'media:v1', 'meta:v1', `shell:${PACK_A.build}`, 'story:v1'].map((n) => `inspire:sticks-and-bones:${n}`);
  check(JSON.stringify(ours.map((c) => c.name).sort()) === JSON.stringify(expectNames), `first visit: cache names ${ours.map((c) => c.name).join(', ')} (the retired audio:v1 must be gone once verified)`);
  const audit = await packAudit(page, PACK_A);
  check(audit.length === 0, `first visit: offline pack incomplete or damaged: ${audit.slice(0, 6).join('; ')}`);
  const urls = ours.filter((c) => !c.name.endsWith(':meta:v1')).flatMap((c) => c.urls);
  check(urls.length === filesOf(PACK_A).length && cacheBytes === PACK_A.total, `first visit: ${urls.length} entries / ${cacheBytes} B cached, pack is ${filesOf(PACK_A).length} files / ${PACK_A.total} B`);
  check(!urls.some((u) => /\.png$/.test(u) && !u.startsWith(`${APP}icons/`)) && !urls.some((u) => /\/(originals|art)\//.test(u)), 'first visit: a source master was cached');
  check(urls.some((u) => u.endsWith('.mp4')) && urls.some((u) => /amb-|promenade|the-lit/.test(u)) && urls.some((u) => /-portrait-/.test(u)) && urls.some((u) => /\/script-/.test(u)), 'first visit: video, music, portrait backdrops or Story chunks not cached');
  check(urls.every((u) => u.startsWith(APP)), 'cached a URL outside the app');
  check(!downloadsSince(0).includes(legacy[0]), `first visit: the copy in the retired audio cache was downloaded again instead of adopted`);
  writeFileSync(join(out, 'cache-report.json'), JSON.stringify(caches1, null, 1));
  notes.push(`first visit (online, subpath): startup → menu with no Story/media file requested before it; then "${texts[iSave]}" → "${texts[iCheck]}" → "${first}"; worker scope ${new URL(reg.scope!).pathname}`);
  notes.push(`offline pack verified in the page (bytes + SHA-256 + MIME for every file): ${urls.length} files, ${(cacheBytes / 1048576).toFixed(2)} MB = build.json total; caches ${ours.map((c) => `${c.name.replace('inspire:sticks-and-bones:', '')}=${c.urls.length}`).join(', ')}; the retired audio:v1 copy of ${legacy[0].split('/').pop()} was adopted (not re-downloaded) and the cache removed after verification`);
  // Installable from the subpath, and our own Install button when the browser offers it.
  const cdp = await ctx.newCDPSession(page);
  const inst = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };
  check(inst.installabilityErrors.length === 0, `not installable: ${inst.installabilityErrors.map((e) => e.errorId).join(', ')}`);
  await cdp.detach();
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(e, { prompt: async () => void ((window as unknown as { __prompted: boolean }).__prompted = true), userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(e);
  });
  await openSettings(page);
  check((await page.locator('[data-region="install"]:not([hidden]) [data-act="install"]').count()) === 1, 'install: no Install button after the browser offered installation');
  await page.click('[data-act="install"]');
  const installed = await page.waitForFunction(() => /^Installed/.test(document.querySelector('[data-region="install-note"]')?.textContent ?? '') && (window as unknown as { __prompted: boolean }).__prompted, null, { timeout: 5000 }).then(() => true, () => false);
  check(installed, 'install: the browser prompt was not shown / the note did not change');
  const storageLine = (await page.textContent('[data-region="offline-storage"]')) ?? '';
  check(new RegExp(`^This game keeps ${mb(PACK_A.total).replace('.', '\\.')} of ${mb(PACK_A.total).replace('.', '\\.')} on this device\\. About [\\d.]+ MB free for this site\\.`).test(storageLine), `storage line: "${storageLine}"`);
  check((await page.locator('[data-act="offline-full"]:not([hidden])').count()) === 0, 'settings: a Download button is still offered once the full game is verified');
  await axe(page, 'settings with the offline panel (full game ready, install offered)');
  await page.locator('.offline-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'settings-offline-ready.png') });
  notes.push(`installable (Chromium reports no installability errors); Install button shown when the browser offers it → prompt → "Installed"; storage: "${storageLine}"`);
  await page.click('[data-act="home"]');
  await otherAppIntact(page, 'after first visit');

  // ---- 2. Cold offline launch: worker stopped, server down, browser offline ---------------------

  step('2. Cold offline launch: worker stopped, server down, browser offline');
  // The whole browser closes (worker and all); it relaunches on the same profile already offline.
  await ctx.close();
  state.down = true;
  state.requests = [];
  const { ctx: ctx2, page: p2 } = await persistentContext(true);
  await p2.goto(`${ORIGIN}${APP}`);
  await p2.waitForFunction(() => /^Ready\.$/.test(document.querySelector('.start-status')?.textContent ?? '') && !(document.querySelector('.start-button') as HTMLButtonElement | null)?.disabled, null, { timeout: 15_000 }).then((h: { dispose(): unknown }) => h.dispose(), async () => check(false, `cold offline: not ready ("${await p2.textContent('.start-status').catch(() => '')}")`));
  await p2.click('.start-button');
  // The studio credit plays from the offline cache (through byte ranges), then Skip.
  const vid = await p2
    .waitForFunction(() => {
      const v = document.querySelector('video.intro-video') as HTMLVideoElement | null;
      return v && v.currentTime > 1 && !v.error ? { t: v.currentTime, w: v.videoWidth, h: v.videoHeight } : null;
    }, null, { timeout: 15_000 })
    .then((h: { jsonValue(): Promise<unknown> }) => h.jsonValue() as Promise<{ t: number; w: number; h: number }>, () => null);
  check(!!vid && vid.w === 1080 && vid.h === 720, `cold offline: the studio video did not play from the cache (${JSON.stringify(vid)})`);
  await p2.locator('[data-skip="armed"] [data-act="intro-skip"]').click({ timeout: 5000 }).catch(() => undefined);
  await p2.waitForSelector('[data-go="setup"]', { timeout: 15_000 });
  const coldLine = await waitStatus(p2, FULL, 15_000);
  check(FULL.test(coldLine), `cold offline: status "${coldLine}"`);
  // Music, ambience, a result cue, a story sound and the video decode offline (media elements and Web Audio).
  const music = fileA(/promenade-after-dark-[\w-]{8}\.mp3$/);
  const amb = fileA(/amb-jungle-[\w-]{8}\.mp3$/);
  const cue = fileA(/result-win-[\w-]{8}\.mp3$/);
  const wav = fileA(/motif-knock-beyond-[\w-]{8}\.wav$/);
  const video = fileA(/\.mp4$/);
  const media = await p2.evaluate(
    async ([els, decode]: readonly [[string, string][], string[]]) => {
      const out: Record<string, unknown> = {};
      for (const [u, kind] of els) {
        const el = document.createElement(kind) as HTMLMediaElement;
        el.muted = true;
        el.preload = 'auto';
        out[u] = await new Promise((res) => {
          el.oncanplaythrough = () => res(Math.round(el.duration * 10) / 10);
          el.onerror = () => res(`error ${el.error?.code}`);
          setTimeout(() => res('timeout'), 10_000);
          el.src = u;
        });
        el.removeAttribute('src');
        el.load();
      }
      const ctx = new OfflineAudioContext(2, 44_100, 44_100);
      for (const u of decode) out[u] = await fetch(u).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => Math.round(b.duration * 10) / 10, (e: Error) => `error ${e.message}`);
      return out;
    },
    [[[music[0], 'audio'], [amb[0], 'audio'], [video[0], 'video']], [cue[0], wav[0]]] as const,
  );
  check(Object.values(media).every((d) => typeof d === 'number' && d > 0), `cold offline: media did not decode from the cache ${JSON.stringify(media)}`);
  // Byte ranges and MIME types, answered by the worker from the cache.
  const R = await p2.evaluate(
    async ([mp3, mp4, webp, woff, len]: readonly [string, string, string, string, number]) => {
      const get = async (u: string, range: string | null, method = 'GET') => {
        const r = await fetch(u, { method, headers: range ? { Range: range } : {} });
        const b = method === 'HEAD' ? 0 : (await r.arrayBuffer()).byteLength;
        return { s: r.status, len: b, cr: r.headers.get('content-range'), ct: r.headers.get('content-type'), cl: r.headers.get('content-length'), ar: r.headers.get('accept-ranges') };
      };
      return {
        full: await get(mp3, null),
        mid: await get(mp3, 'bytes=100-1123'),
        suffix: await get(mp3, 'bytes=-500'),
        open: await get(mp4, 'bytes=0-'),
        past: await get(mp3, `bytes=${len}-`),
        multi: await get(mp3, 'bytes=0-0,5-9'),
        head: await get(mp3, null, 'HEAD'),
        webp: await get(webp, null),
        woff: await get(woff, null),
      };
    },
    [music[0], video[0], fileA(/cast-luz-[\w-]{8}\.webp$/)[0], fileA(/\.woff2$/)[0], music[1]] as const,
  );
  const L = music[1];
  check(R.full.s === 200 && R.full.len === L && R.full.ct === 'audio/mpeg' && R.full.cl === String(L) && R.full.ar === 'bytes', `range: full GET ${JSON.stringify(R.full)}`);
  check(R.mid.s === 206 && R.mid.len === 1024 && R.mid.cr === `bytes 100-1123/${L}` && R.mid.cl === '1024' && R.mid.ct === 'audio/mpeg', `range: bytes=100-1123 ${JSON.stringify(R.mid)}`);
  check(R.suffix.s === 206 && R.suffix.len === 500 && R.suffix.cr === `bytes ${L - 500}-${L - 1}/${L}`, `range: suffix ${JSON.stringify(R.suffix)}`);
  check(R.open.s === 206 && R.open.len === video[1] && R.open.cr === `bytes 0-${video[1] - 1}/${video[1]}` && R.open.ct === 'video/mp4', `range: video bytes=0- ${JSON.stringify(R.open)}`);
  check(R.past.s === 416 && R.past.cr === `bytes */${L}`, `range: unsatisfiable ${JSON.stringify(R.past)}`);
  check(R.multi.s === 200 && R.multi.len === L, `range: multi-range should fall back to the whole file ${JSON.stringify(R.multi)}`);
  check(R.head.s === 200 && R.head.len === 0 && R.head.cl === String(L), `HEAD ${JSON.stringify(R.head)}`);
  check(R.webp.ct === 'image/webp' && R.woff.ct === 'font/woff2', `MIME: ${R.webp.ct}, ${R.woff.ct}`);
  // A hand vs the computer and two Story chapters with their own art, all offline.
  await newGame(p2, 'ai');
  const done = await playHand(p2, 'cold offline game');
  const atlasFaces = await p2.evaluate(() => document.querySelectorAll('.face-atlas').length);
  await p2.screenshot({ path: join(out, 'offline-results.png') });
  check(done && atlasFaces > 0, `cold offline: hand ${done}, atlas faces ${atlasFaces}`);
  await p2.reload();
  await enterMenu(p2);
  const envs: Record<string, string | null> = {};
  for (const sc of ['chapter-3', 'chapter-6']) envs[sc] = await chapterArt(p2, sc);
  check(envs['chapter-3'] === 'env.executive-terrace' && envs['chapter-6'] === 'env.cave-waterfall', `cold offline: Story chapters opened over ${JSON.stringify(envs)}`);
  const appRequests = state.requests.filter((r) => !r.endsWith('/sw.js'));
  check(appRequests.length === 0, `cold offline: app files were requested from the network: ${appRequests.slice(0, 5).join(', ')}`);
  check((errorsOf.get(p2) ?? []).length === 0, `cold offline: page errors ${errorsOf.get(p2)!.join(' | ')}`);
  notes.push(`cold offline launch (worker stopped, server down, browser offline): "Ready." → studio video played from the cache (${vid?.w}×${vid?.h}, ${vid?.t.toFixed(1)} s reached) → menu "${coldLine}"; decoded offline: ${Object.entries(media).map(([u, d]) => `${u.split('/').pop()!.replace(/-[\w-]{8}\./, '.')} ${d} s`).join(', ')}; a hand vs the computer (${atlasFaces} atlas faces); Chapter 3 over the executive terrace and Chapter 6 over the cave; ${state.requests.length - appRequests.length} browser sw.js check(s), 0 app requests`);
  notes.push(`ranges/MIME offline: GET 200 audio/mpeg ${L} B + Accept-Ranges; bytes=100-1123 → 206 "${R.mid.cr}"; bytes=-500 → 206 "${R.suffix.cr}"; video bytes=0- → 206 video/mp4 "${R.open.cr}"; bytes=${L}- → 416 "${R.past.cr}"; multi-range → 200 whole file; HEAD → 200, no body; image/webp; font/woff2`);
  await goOffline(ctx2, false);

  // ---- 6a. Repair: stale cache + a silently corrupted copy; saves/settings untouched -----------

  step('6a. Repair: stale cache + a silently corrupted copy; saves/settings untouched');
  await p2.reload();
  await enterMenu(p2);
  await openSettings(p2);
  await p2.check('input[name="set-motion"][value="reduce"]'); // a setting to preserve
  await p2.evaluate(() => {
    if (!localStorage.getItem('sticks-and-bones.story')) localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: 'chapter-2', part: 'pre', index: 4, outcome: null, completed: ['prologue', 'chapter-1'], textScale: 1, startedAt: 1, hand: null } }));
  });
  const beforeRepair = await p2.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  check('sticks-and-bones.story' in beforeRepair && 'sticks-and-bones.save' in beforeRepair, `repair: both save slots should exist before repair (${Object.keys(beforeRepair).join(', ')})`);
  const victim = fileA(/cast-vale-[\w-]{8}\.webp$/);
  await p2.evaluate(
    async ([u, n]: readonly [string, number]) => {
      (await caches.open('inspire:sticks-and-bones:stale-test')).put('stale', new Response('x'));
      // Disk corruption: same length and headers, different bytes.
      const c = await caches.open('inspire:sticks-and-bones:story:v1');
      const url = new URL(u, location.href).href;
      const old = (await c.match(url))!;
      const bytes = new Uint8Array(await old.arrayBuffer());
      bytes[Math.floor(n / 2)]! ^= 0xff;
      await c.put(url, new Response(bytes, { headers: old.headers }));
    },
    [victim[0], victim[1]] as const,
  );
  await p2.click('[data-act="repair"]');
  await waitStatus(p2, /^(?!✓ Full)/, 5000);
  const repaired = await waitFull(p2);
  const afterRepair = await p2.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  const names = (await cacheReport(p2)).map((c) => c.name);
  const repairAudit = await packAudit(p2, PACK_A);
  check(FULL.test(repaired) && repairAudit.length === 0, `repair: "${repaired}"; ${repairAudit.join('; ')}`);
  check(!names.includes('inspire:sticks-and-bones:stale-test'), 'repair: our stale cache survived');
  check(JSON.stringify(beforeRepair) === JSON.stringify(afterRepair), 'repair changed localStorage (saves/settings must be kept)');
  await otherAppIntact(p2, 'after repair');
  notes.push(`repair (app-only): a stale cache of ours removed; a silently corrupted cast sheet (same size and headers) found by re-hashing and replaced → "${repaired}"; ${Object.keys(afterRepair).length} localStorage keys unchanged (saves, story, settings); other app intact`);

  // ---- 6b. Erase: only this app's keys; offline files kept -------------------------------

  step("6b. Erase: only this app's keys; offline files kept");
  await p2.click('[data-act="erase"]');
  check((await p2.locator('dialog.confirm[open]').count()) === 1, 'erase: no confirmation sheet');
  await p2.click('dialog.confirm[open] [data-act="confirm-no"]');
  check(Object.keys(await p2.evaluate(() => ({ ...localStorage }))).some((k: string) => k.startsWith('sticks-and-bones.')), 'erase: Cancel deleted data');
  await p2.click('[data-act="erase"]');
  await Promise.all([p2.waitForNavigation(), p2.click('dialog.confirm[open] [data-act="confirm-yes"]')]);
  const keys = await p2.evaluate(() => Object.keys(localStorage));
  check(!keys.some((k: string) => k.startsWith('sticks-and-bones.')), `erase: our keys remain ${keys.join(', ')}`);
  await otherAppIntact(p2, 'after erase');
  check((await packAudit(p2, PACK_A)).length === 0, 'erase: offline files were removed (they must be kept)');
  await enterMenu(p2);
  check(/erased/.test((await p2.textContent('.notice')) ?? ''), 'erase: no confirmation notice');
  notes.push(`erase (confirm sheet; Cancel keeps everything): removed only sticks-and-bones.* keys; other app's keys kept; the whole offline pack kept`);
  await ctx2.close();

  // ---- 3. Interrupted install downloads: offline fallbacks, then resume ----------------------

  step('3. Interrupted install downloads: offline fallbacks, then resume');
  if (run('3')) {
    const { ctx, page } = await newContext();
    state.cut = new Set(['double-six-atlas', 'weathered-tabletop']);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const partial = await waitStatus(page, /download stopped/);
    check(/^Quick Play works offline; 2 table files are still missing \(the game draws them\)\. The full-game download stopped at [\d.]+ MB of [\d.]+ MB\. It continues by itself while you’re online, or tap Retry\.$/.test(partial), `interrupted: status "${partial}"`);
    check(!(await cacheReport(page)).some((c) => c.urls.some((u) => /double-six-atlas|weathered-tabletop/.test(u))), 'interrupted: a truncated file was stored');
    await openSettings(page);
    const retry = (await page.textContent('[data-act="offline-full"]')) ?? '';
    check(/^Retry \([\d.]+ MB left\)$/.test(retry), `interrupted: button "${retry}"`);
    await goOffline(ctx, true);
    await page.reload();
    // Missing art at startup: the prompt says what failed, offers Try again, and still lets the player start.
    await page.waitForFunction(() => !(document.querySelector('.start-button') as HTMLButtonElement | null)?.disabled, null, { timeout: 30_000 }).then((h: { dispose(): unknown }) => h.dispose());
    const missing = (await page.textContent('.start-status')) ?? '';
    check(/Couldn’t load .*stand-ins/.test(missing) && (await page.locator('[data-act="start-retry"]:not([hidden])').count()) === 1, `offline startup with missing art: "${missing}"`);
    await enterMenu(page);
    await newGame(page, 'ai');
    const ok = await playHand(page, 'offline with missing images');
    const fb = await page.evaluate(() => ({ svg: document.querySelectorAll('.face-svg').length, atlas: document.querySelectorAll('.face-atlas').length }));
    check(ok && fb.svg > 0 && fb.atlas === 0, `interrupted+offline: fallbacks not used (${JSON.stringify(fb)})`);
    await page.screenshot({ path: join(out, 'offline-fallback-results.png') });
    await goOffline(ctx, false);
    state.cut.clear();
    const at = state.log.length;
    await page.reload();
    await enterMenu(page);
    const fixed = await waitFull(page);
    const again = downloadsSince(at).filter((p) => p.startsWith('assets/'));
    check(FULL.test(fixed), `interrupted: never completed — ${fixed}`);
    // Only the two missing files (the startup loader may ask for the atlas too, alongside the download).
    check(new Set(again).size === 2 && again.every((p) => /double-six-atlas|weathered-tabletop/.test(p)), `interrupted: resume fetched other files than the 2 missing (${again.join(', ')})`);
    check((errorsOf.get(page) ?? []).length === 0, `interrupted: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`interrupted install downloads (tile atlas + table cut mid-transfer): "${partial}"; button "${retry}"; nothing truncated stored; offline start → "${missing.trim()}" and a hand with ${fb.svg} vector faces; back online the download resumed by itself, fetching only the 2 missing files → "${fixed}"`);
    await ctx.close();
  }

  // ---- 4. Quota -------------------------------------------------------------------------------

  step('4. Quota');
  if (run('4')) {
    // a) The browser's estimate says it won't fit: nothing is downloaded, and the player is told.
    const { ctx, page } = await newContext(`if (navigator.storage) navigator.storage.estimate = async () => ({ quota: 4_000_000, usage: 3_000_000 });`);
    const at = state.log.length;
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const s = await waitStatus(page, /Not enough storage/);
    check(/^Quick Play is ready offline\. Not enough storage for the full game: it needs [\d.]+ MB more, about 1\.0 MB is free\. Free up space, then Retry\.$/.test(s), `quota (estimate): "${s}"`);
    await page.waitForTimeout(1500);
    check(!downloadsSince(at).some((p) => STORY_FILE.test(p)), 'quota (estimate): Story/media files were downloaded anyway');
    notes.push(`quota by the browser's estimate (1 MB free): "${s}" — no Story or media file downloaded`);
    await ctx.close();
  }
  if (run('4')) for (const [label, quota, init, expect] of [
    ['the pack does not fit (worker quota error)', 4_000_000, `if (navigator.storage) navigator.storage.estimate = async () => ({ quota: 1e10, usage: 0 });`, /^Quick Play is ready offline\. Not enough storage for the full game: it needs [\d.]+ MB more/],
    ['the shell does not fit', 40_000, '', /Not enough storage on this device for the offline files\. The game still works online/],
  ] as const) {
    const { ctx, page } = await newContext(init);
    await page.goto('about:blank');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: ORIGIN, quotaSize: quota });
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const s = await waitStatus(page, /Not enough storage|Full game ready/);
    check(expect.test(s), `quota (${label}): status "${s}"`);
    await newGame(page, 'ai');
    const played = await playHand(page, `quota ${label}`, 120_000);
    check(played, `quota (${label}): game did not work online`);
    check((errorsOf.get(page) ?? []).length === 0, `quota (${label}): page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`quota ${(quota / 1e6).toFixed(2)} MB (${label}): "${s}" — online game still completed a hand, 0 page errors`);
    await ctx.close();
  }

  // ---- 5. Update from the previous build, mid-match, two humans --------------------------

  step('5. Update from the previous build, mid-match, two humans');
  if (run('5')) {
    const { ctx, page } = await newContext();
    state.site = SITE_A;
    await page.goto(`${ORIGIN}/other-app/`);
    await page.waitForSelector('#ok');
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitFull(page);
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
    await page.locator('[data-skip="armed"] [data-act="intro-skip"]').click({ timeout: 2500 }).catch(() => undefined);
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
    const shells = ourCaches.filter((n) => n.includes(':shell:'));
    check(shells.length === 1 && shells[0]!.endsWith(`:shell:${packOf(SITE_B).build}`), `update: shell caches after update: ${ourCaches.join(', ')}`);
    await otherAppIntact(page, 'after update');
    // Play on: the next player reveals and the game continues normally.
    await page.click('[data-act="cover-ready"]');
    await page.click('[data-act="cover-reveal"]');
    await page.waitForSelector('.hand-tile');
    check((errorsOf.get(page) ?? []).length === 0, `update: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`update A → B mid-match (two humans, a hand revealed): Update Available in the pause sheet; on "Update now" the save was written and the screen cleared before reload; build "${build}" running; saved match identical; the start tap returned straight to the match, behind the cover; old shell cache removed (${ourCaches.join(', ')}); other app intact`);
    await ctx.close();
  }
  // ---- 7. Data Saver: the pack waits for the player; chapters still save as they are played -----------
  state.site = SITE_A; // §5 left the server on build B
  step('7. Data Saver: the pack waits for the player; chapters still save as they are played');
  if (run('7')) {
    const { ctx, page } = await newContext(`Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} }) });`);
    const at = state.log.length;
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const waiting = await waitStatus(page, /Data Saver/);
    check(/^Quick Play is ready offline\. Data Saver is on, so the full game \([\d.]+ MB\) waits for you to tap Download\.$/.test(waiting), `data saver: "${waiting}"`);
    await page.waitForTimeout(2500);
    check(!downloadsSince(at).some((p) => STORY_FILE.test(p)), 'data saver: Story/media files were downloaded without the player asking');
    await seedStory(page, 'chapter-1', 3);
    await openCase(page);
    const noteBefore = (await page.locator('.case-offline').textContent().catch(() => '')) ?? '';
    check(/Needs a connection until the full game has saved/.test(noteBefore), `data saver: case note "${noteBefore}"`);
    await page.click('[data-act="story-continue"]');
    await sceneUp(page);
    await page.waitForTimeout(4000); // the next chapter prefetches once this one is presenting
    const story = (await cacheReport(page)).find((c) => c.name.endsWith(':story:v1'));
    const names = story?.urls.map((u) => u.split('/').pop()!) ?? [];
    check(names.some((n) => n.startsWith('cast-rafa')) && names.some((n) => n.startsWith('back-alley-portrait')) && names.some((n) => n.startsWith('cast-vale')), `data saver: Chapter 1 (and the prefetched Chapter 2) were not saved as played (${names.join(', ')})`);
    check(!names.some((n) => /^(moonlit|jungle|cave)/.test(n)), `data saver: chapters beyond the next were cached (${names.join(', ')})`);
    await page.click('[data-act="story-file"]');
    await page.click('[data-act="story-home"]');
    await goOffline(ctx, true);
    await page.reload();
    await enterMenu(page);
    const c1 = await chapterArt(page, 'chapter-1');
    const c5 = await chapterArt(page, 'chapter-5');
    check(c1 === 'env.neighborhood-patio' && c5 === 'none', `data saver offline: chapter 1 over ${c1} (want its art), chapter 5 over ${c5} (want the drawn fallback)`);
    await goOffline(ctx, false);
    await page.reload();
    await enterMenu(page);
    await openSettings(page);
    const label = (await page.textContent('[data-act="offline-full"]')) ?? '';
    check(/^Download the full game \([\d.]+ MB left\)$/.test(label), `data saver: button "${label}"`);
    await page.click('[data-act="offline-full"]');
    const done = await waitFull(page);
    const saw = await page.evaluate(() => (window as unknown as { __sawProgress?: boolean }).__sawProgress === true);
    check(FULL.test(done) && saw, `data saver: Download → "${done}", progress bar shown ${saw}`);
    await goOffline(ctx, true);
    await page.click('[data-act="home"]');
    const c5b = await chapterArt(page, 'chapter-5');
    check(c5b === 'env.jungle-camp', `data saver: after Download, chapter 5 offline opened over ${c5b}`);
    await goOffline(ctx, false);
    check((errorsOf.get(page) ?? []).length === 0, `data saver: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`Data Saver on: "${waiting}" — no pack download; Chapter 1 (+ prefetched Chapter 2) saved as played; offline Chapter 1 had its art, Chapter 5 the drawn fallback ("${noteBefore.trim()}"); Settings "${label}" → progress bar → "${done}" → offline Chapter 5 over the jungle camp`);
    await ctx.close();
  }

  // ---- 8a. Whole-game download stopped by the browser mid-way, then resumed -------------------

  step('8a. Whole-game download stopped by the browser mid-way, then resumed');
  if (run('8a')) {
    const { ctx, page } = await newContext();
    state.slow = new Set(['.mp3']);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await openSettings(page);
    const mid = await waitStatus(page, /Saving the full game for offline play… ([3-9]|\d\d)\.\d MB/, 60_000);
    await stopWorkers(page);
    const stoppedAt = Date.now();
    const stopped = await waitStatus(page, /download stopped/, 90_000);
    const detectS = ((Date.now() - stoppedAt) / 1000).toFixed(0);
    check(/The full-game download stopped at [\d.]+ MB of [\d.]+ MB\. It continues by itself while you’re online, or tap Retry\./.test(stopped), `worker stopped: status "${stopped}"`);
    const saved = new Set((await cacheReport(page)).filter((c) => /:(assets|story|media):v1$/.test(c.name)).flatMap((c) => c.urls.map((u) => u.slice(APP.length))));
    const at = state.log.length;
    state.slow.clear();
    const resumed = await waitFull(page, 120_000);
    const refetched = downloadsSince(at).filter((p) => saved.has(p));
    check(FULL.test(resumed), `worker stopped: never resumed — "${resumed}"`);
    check(refetched.length === 0, `worker stopped: resume downloaded saved files again (${refetched.join(', ')})`);
    const audit8a = await packAudit(page, PACK_A);
    check(audit8a.length === 0, `worker stopped: pack incomplete after resume: ${audit8a.slice(0, 5).join('; ')}`);
    notes.push(`whole-game download stopped by the browser (worker terminated at "${mid}"): detected after ${detectS} s → "${stopped}"; resumed by itself with ${saved.size} saved files kept and none fetched again → "${resumed}"`);
    await ctx.close();
  }

  // ---- 8b. Transfers cut mid-way: what finished is kept; Retry fetches only the rest ---------------

  step('8b. Transfers cut mid-way: what finished is kept; Retry fetches only the rest');
  if (run('8b')) {
    const { ctx, page } = await newContext();
    state.cut = new Set(['promenade-after-dark', 'cast-luz']);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await openSettings(page);
    const stopped = await waitStatus(page, /download stopped/);
    check(/^Quick Play is ready offline\. The full-game download stopped at [\d.]+ MB of [\d.]+ MB\./.test(stopped), `cut: status "${stopped}"`);
    check(!(await cacheReport(page)).some((c) => c.urls.some((u) => /promenade-after-dark|cast-luz/.test(u))), 'cut: a truncated file was stored');
    const label = (await page.textContent('[data-act="offline-full"]')) ?? '';
    const left = PACK_A.groups.media.find(([u]) => /promenade-after-dark/.test(u))![1] + PACK_A.groups.story.find(([u]) => /cast-luz/.test(u))![1];
    check(label === `Retry (${mb(left)} left)`, `cut: button "${label}", expected Retry (${mb(left)} left)`);
    const storage = (await page.textContent('[data-region="offline-storage"]')) ?? '';
    check(storage.startsWith(`This game keeps ${mb(PACK_A.total - left)} of ${mb(PACK_A.total)}`), `cut: storage "${storage}"`);
    await axe(page, 'settings with an interrupted download (Retry)');
    await page.locator('.offline-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, 'settings-offline-interrupted.png') });
    state.cut.clear();
    const at = state.log.length;
    await page.click('[data-act="offline-full"]');
    const done = await waitFull(page);
    const fetched = downloadsSince(at).filter((p) => p.startsWith('assets/'));
    check(FULL.test(done) && fetched.length === 2 && fetched.every((p) => /promenade-after-dark|cast-luz/.test(p)), `cut: Retry → "${done}", fetched ${fetched.join(', ')}`);
    const saw = await page.evaluate(() => (window as unknown as { __sawProgress?: boolean }).__sawProgress === true);
    check(saw, 'cut: the progress bar never showed');
    notes.push(`whole-game download with a song and a cast sheet cut mid-transfer: "${stopped}"; button "${label}"; "${storage}"; Retry fetched only those 2 files → "${done}"; progress bar shown`);
    await ctx.close();
  }

  // ---- 9. Corrupted bytes from the server: never stored, reported, Retry ------------------------------

  step('9. Corrupted bytes from the server: never stored, reported, Retry');
  if (run('9')) {
    const { ctx, page } = await newContext();
    state.corrupt = new Set(['cast-marisol']);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const s = await waitStatus(page, /arrived damaged/);
    check(/^Quick Play is ready offline\. 1 file arrived damaged and was discarded\. Retry downloads it again\.$/.test(s), `corrupt: status "${s}"`);
    check(!(await cacheReport(page)).some((c) => c.urls.some((u) => /cast-marisol/.test(u))), 'corrupt: the damaged file was stored');
    state.corrupt.clear();
    await openSettings(page);
    await page.click('[data-act="offline-full"]');
    const done = await waitFull(page);
    const audit9 = await packAudit(page, PACK_A);
    check(FULL.test(done) && audit9.length === 0, `corrupt: Retry → "${done}"; ${audit9.slice(0, 5).join('; ')}`);
    notes.push(`corrupted download (right length, wrong bytes, twice): "${s}" — not stored; Retry → "${done}"`);
    await ctx.close();
  }

  // ---- 10. Eviction: the browser clears everything, or one part -----------------------------------

  step('10. Eviction: the browser clears everything, or one part');
  if (run('10')) {
    const { ctx, page } = await newContext();
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitFull(page);
    await page.evaluate(async () => {
      for (const n of await caches.keys()) if (n.startsWith('inspire:sticks-and-bones:')) await caches.delete(n);
      (window as unknown as { __offlineTexts: string[] }).__offlineTexts = [];
    });
    await page.reload();
    await enterMenu(page);
    const back = await waitFull(page);
    const seen = await seenTexts(page);
    check(seen.some((t) => /^The browser cleared this game’s offline files \(storage ran low or site data was cleared\)\./.test(t)) && FULL.test(back), `eviction (all): ${seen.join(' → ')}`);
    await page.evaluate(async () => {
      await caches.delete('inspire:sticks-and-bones:media:v1');
    });
    await page.reload();
    await enterMenu(page);
    const back2 = await waitFull(page);
    const seen2 = await seenTexts(page);
    const nMedia = PACK_A.groups.media.length;
    check(seen2.some((t) => new RegExp(`^${nMedia} offline files were removed by the browser\\.`).test(t)) && FULL.test(back2), `eviction (media): ${seen2.join(' → ')}`);
    const audit10 = await packAudit(page, PACK_A);
    check(audit10.length === 0, `eviction: pack incomplete after re-download: ${audit10.slice(0, 5).join('; ')}`);
    notes.push(`eviction: all caches cleared → "${seen.find((t) => /cleared/.test(t))}" → downloaded again → "${back}"; the media cache removed → "${seen2.find((t) => /removed by the browser/.test(t))}" → "${back2}"`);
    await ctx.close();
  }

  // ---- 11. Update mid-case: dialogue position and an in-progress hand restored once ----------------

  step('11. Update mid-case: dialogue position and an in-progress hand restored once');
  if (run('11')) {
    const { ctx, page } = await newContext();
    state.site = SITE_A;
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitFull(page);
    await seedStory(page, 'chapter-1', 6);
    await openCase(page);
    await page.click('[data-act="story-continue"]');
    await sceneUp(page);
    await page.click('[data-act="story-next"]');
    await page.click('[data-act="story-next"]');
    await page.waitForTimeout(600);
    const pos = await page.evaluate(() => document.querySelector('.cine-pos')?.textContent);
    const progBefore = await page.evaluate(() => localStorage.getItem('sticks-and-bones.story'));
    // An older build's retired backdrop left in the story cache must not outlive the update: once the new build's
    // pack is verified, every file it doesn't list is pruned, so it can never flash during a later transition.
    const staleArt = `${ORIGIN}${APP}assets/resort-patio-portrait-0ld.webp`;
    await page.evaluate(async (u: string) => (await caches.open('inspire:sticks-and-bones:story:v1')).put(u, new Response('old art', { headers: { 'Content-Type': 'image/webp' } })), staleArt);
    state.site = SITE_B;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    // The scene bar offers the update in the middle of the dialogue.
    await page.locator('.story-bar [data-act="update-now"]:not([hidden])').first().waitFor({ timeout: 60_000 });
    await Promise.all([page.waitForNavigation({ timeout: 30_000 }), page.click('.story-bar [data-act="update-now"]')]);
    await page.waitForSelector('.start-button');
    await page.click('.start-button');
    const skip = page.locator('[data-act="intro-skip"]');
    if (await skip.count()) await skip.click().catch(() => undefined);
    await sceneUp(page);
    const after = await page.evaluate(() => ({ pos: document.querySelector('.cine-pos')?.textContent, scene: document.querySelector('.story-stage')?.getAttribute('data-scene'), build: document.documentElement.dataset.build }));
    check(after.scene === 'chapter-1' && after.pos === pos && after.build === 'b', `update mid-dialogue: returned to ${JSON.stringify(after)}, expected chapter-1 at ${pos}`);
    // Build B's pack is verified in the background (the files are the same) and only then is the unreferenced art pruned.
    let leftover: string[] = [];
    for (let i = 0; i < 120; i++) {
      leftover = (await cacheReport(page)).flatMap((c) => c.urls).filter((u) => /resort-patio/.test(u));
      if (!leftover.length) break;
      await page.waitForTimeout(500);
    }
    check(leftover.length === 0, `update mid-dialogue: the old resort backdrop stayed cached after B's pack was verified (${leftover.join(', ')})`);
    // Once: a plain reload goes to the menu as usual.
    await page.reload();
    await enterMenu(page);
    check(await page.locator('[data-go="setup"]').count() === 1, 'update mid-dialogue: a second reload returned to the story again');
    notes.push(`update A → B from the scene bar mid-dialogue: progress saved (${(progBefore ?? '').length} B record); after reload the start tap returned straight to Chapter 1 at line ${after.pos} on build "${after.build}"; a second reload went to the menu (once only)`);

    // In-progress hand (encounter): update from the story table's pause sheet.
    state.site = SITE_A;
    const { ctx: c2, page: p2 } = await newContext();
    await p2.goto(`${ORIGIN}${APP}`);
    await enterMenu(p2);
    await waitFull(p2);
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

  // ---- 12. Upgrade retention: old media stays usable until the new pack is verified -------------------

  step('12. Upgrade retention: old media stays usable until the new pack is verified');
  if (run('12')) {
    const { ctx, page } = await newContext();
    state.site = SITE_A;
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    await waitFull(page);
    // Release C replaces the patio track (new name); the server doesn't have the new file yet.
    state.site = SITE_C;
    state.missing = new Set(['Upd8Tst1']);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await page.locator('.update-banner:not([hidden]) [data-act="update-now"]').waitFor({ timeout: 60_000 });
    await Promise.all([page.waitForNavigation({ timeout: 30_000 }), page.click('.update-banner [data-act="update-now"]')]);
    await enterMenu(page);
    const s = await waitStatus(page, /couldn’t be downloaded/);
    check(/^Quick Play is ready offline\. 1 file couldn’t be downloaded from the server; everything else is saved\. Retry later\. Your previous version’s music and art stay usable until the new files are checked\.$/.test(s), `retention: status "${s}"`);
    const media = (await cacheReport(page)).find((c) => c.name.endsWith(':media:v1'))!;
    check(media.urls.includes(`${APP}${OLD_TRACK}`) && !media.urls.includes(`${APP}${NEW_TRACK}`), `retention: old track pruned before the new one was verified (${media.urls.join(', ')})`);
    // Offline, the new build's track is served from the previous build's copy (whole file and ranges).
    await goOffline(ctx, true);
    const old = readFileSync(join(SITE_A, OLD_TRACK));
    const r = await page.evaluate(async (u: string) => {
      const full = await fetch(u);
      const buf = await full.arrayBuffer();
      const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const part = await fetch(u, { headers: { Range: 'bytes=0-1023' } });
      const a = new Audio();
      a.muted = true;
      const ok = await new Promise((res) => {
        a.oncanplaythrough = () => res(true);
        a.onerror = () => res(false);
        setTimeout(() => res(false), 10_000);
        a.src = u;
      });
      return { status: full.status, hex, type: full.headers.get('content-type'), part: part.status, partLen: (await part.arrayBuffer()).byteLength, plays: ok };
    }, NEW_TRACK);
    check(r.status === 200 && r.hex === sha(old) && r.type === 'audio/mpeg' && r.part === 206 && r.partLen === 1024 && r.plays, `retention offline: ${JSON.stringify({ ...r, hex: r.hex.slice(0, 12) })}`);
    await goOffline(ctx, false);
    state.missing.clear();
    await openSettings(page);
    await page.click('[data-act="offline-full"]');
    const done = await waitFull(page);
    const after = (await cacheReport(page)).find((c) => c.name.endsWith(':media:v1'))!;
    check(FULL.test(done) && !after.urls.includes(`${APP}${OLD_TRACK}`) && after.urls.includes(`${APP}${NEW_TRACK}`), `retention: after verification ${done}; media ${after.urls.join(', ')}`);
    check((await packAudit(page, packOf(SITE_C))).length === 0, 'retention: release C pack incomplete');
    check((errorsOf.get(page) ?? []).length === 0, `retention: page errors ${errorsOf.get(page)!.join(' | ')}`);
    notes.push(`upgrade A → C (C renames the patio track; its new file 404s at first): "${s}"; offline, C's track URL played from A's retained copy (200 audio/mpeg, identical SHA-256, Range → 206, <audio> canplaythrough); Retry → "${done}" and only then the old copy was pruned`);
    await ctx.close();
  }

  // ---- 13. Storage unavailable (e.g. a private window that refuses service workers) ----------------

  step('13. Storage unavailable (e.g. a private window that refuses service workers)');
  if (run('13')) {
    const { ctx, page } = await newContext(`Object.defineProperty(navigator.serviceWorker, 'register', { configurable: true, value: () => Promise.reject(new DOMException('The operation is insecure.', 'SecurityError')) });`);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const s = await waitStatus(page, /isn’t storing/);
    check(/^This browser isn’t storing offline files right now \(private browsing or blocked site data\)\. The game works online\.$/.test(s), `unavailable: "${s}"`);
    await newGame(page, 'ai');
    check(await playHand(page, 'storage unavailable'), 'unavailable: game did not work online');
    notes.push(`storage unavailable (registration refused): "${s}" — a hand still completed online`);
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
console.log(`\nPWA passed. Offline pack ${cacheBytes} B. Evidence in ${out}`);
process.exit(0);
