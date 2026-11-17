/**
 * npm run qa — visual + functional QA capture on real rendered screens.
 *
 * For every target viewport it opens the nine key screens (startup, menu,
 * setup, longest chain, largest hand, partnership table, handoff cover, pause,
 * results), saves a screenshot and measures, in the live DOM:
 *   - page scroll (document larger than the viewport) and horizontal overflow;
 *   - interactive controls outside the viewport or clipped by an ancestor;
 *   - touch targets below the comfortable size (44 CSS px) / hard floor (32);
 *   - text clipped inside its box;
 *   - Cousin's portrait clipped by any ancestor, and sprite upscaling (blur);
 *   - tile short side and pip diameter on the board and in the hand;
 *   - open-end targets that are covered by another element at their centre.
 * Results go to test-results/qa/report.json plus one contact sheet per screen.
 * Exit code 1 if any hard limit is broken (see LIMITS).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

type Page = import('playwright').Page;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'test-results/qa');
mkdirSync(outDir, { recursive: true });

export const VIEWPORTS = [
  { name: 'phone-360x800', width: 360, height: 800 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'phone-land-667x375', width: 667, height: 375 },
  { name: 'phone-land-844x390', width: 844, height: 390 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'tablet-land-1024x768', width: 1024, height: 768 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
] as const;

/** Hard limits (fail) — comfortable targets are reported separately as warnings. */
export const LIMITS = {
  /** Smallest acceptable touch target side, CSS px (WCAG 2.5.8 is 24; we hold 32 as a floor). */
  targetFloor: 32,
  /** Comfortable target side, CSS px (reported, expected on all primary controls). */
  targetComfortable: 44,
  /** Smallest pip diameter on screen, CSS px. */
  pipMin: 3,
  /** Largest sprite upscale (CSS px × DPR per source px) before it reads as blurry. */
  spriteUpscaleMax: 1.6,
};

const failures: string[] = [];
const warnings: string[] = [];
const report: Record<string, Record<string, unknown>> = {};
const bleedNotes: string[] = [];
const textNotes: string[] = [];

const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5198/';
const browser = await chromium.launch();
const DPR = Number(process.env.QA_DPR ?? 2);

async function tryClick(loc: { click(o: { timeout: number }): Promise<void> }): Promise<boolean> {
  try {
    await loc.click({ timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function enterMenu(page: Page) {
  await page.goto(BASE);
  await page.click('.start-button');
  const skip = page.locator('[data-act="intro-skip"]');
  if (await skip.count()) await tryClick(skip);
  await page.waitForSelector('[data-go="setup"]');
}

async function setup(page: Page, o: { mode?: string; opponent?: string; difficulty?: string; fixture?: string; seed?: string }) {
  await enterMenu(page);
  await page.click('[data-go="setup"]');
  await page.locator('details.dev-panel summary').click();
  await page.fill('input[name="seed"]', o.seed ?? 'qa-seed');
  await page.fill('input[name="aiSeed"]', 'qa-ai');
  await page.check('input[name="fastAi"]');
  if (o.mode) await page.check(`input[name="mode"][value="${o.mode}"]`);
  if (o.opponent) await page.check(`input[name="opponent"][value="${o.opponent}"]`);
  if (o.difficulty && (await page.locator(`input[name="difficulty"][value="${o.difficulty}"]`).isVisible())) await page.check(`input[name="difficulty"][value="${o.difficulty}"]`);
  if (o.fixture) await page.click(`[data-fixture="${o.fixture}"]`);
  else await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
}

const controllerKind = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sb?: { controller: { state: { kind: string } } } }).__sb?.controller.state.kind ?? '');

async function waitHumanTurn(page: Page) {
  for (let i = 0; i < 200; i++) {
    if ((await controllerKind(page)) === 'human-turn' && (await page.locator('.hand-tile').count())) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/** Select the first legal tile so open-end targets show. */
async function showEnds(page: Page) {
  const legal = page.locator('.hand-tile.is-legal');
  if (await legal.count()) await legal.first().click();
  await page.waitForTimeout(350);
}

async function playToResults(page: Page, budgetMs = 90_000) {
  const until = Date.now() + budgetMs;
  for (let i = 0; i < 1500 && Date.now() < until; i++) {
    if (await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false)) return true;
    if (await page.locator('.privacy-cover:not([hidden])').count()) {
      const ready = page.locator('[data-act="cover-ready"]');
      if (await ready.count()) await tryClick(ready);
      else await tryClick(page.locator('[data-act="cover-reveal"]'));
      continue;
    }
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      if (!(await tryClick(legal.first()))) continue;
      await tryClick(page.locator('.end-slot.is-legal').first());
      continue;
    }
    for (const a of ['draw', 'pass']) {
      const b = page.locator(`[data-act="${a}"]:not([disabled])`);
      if (await b.count()) await tryClick(b);
    }
    await page.waitForTimeout(80);
  }
  return false;
}

/** All measurements, in the page. String script: tsx would inject helpers into a serialized function. */
const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight, dpr = devicePixelRatio;
  const de = document.documentElement;
  const visible = (el) => { if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden],[inert]'); };
  const topLayer = document.querySelector('dialog[open]:modal, .privacy-cover:not([hidden])');
  const inScope = (el) => !topLayer || topLayer.contains(el);
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).replace(/\\s+/g, ' ').trim().slice(0, 40) + (el.className && typeof el.className === 'string' ? ' .' + el.className.split(' ')[0] : '');
  // Clip rect of an element by its overflow ancestors (null = fully visible).
  const clipOf = (el) => {
    let r = el.getBoundingClientRect(); const full = { x: r.x, y: r.y, w: r.width, h: r.height };
    let L = r.left, T = r.top, R = r.right, B = r.bottom, scroller = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow === 'visible' && s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      if (/auto|scroll/.test(s.overflowX + s.overflowY) && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) scroller = true;
      L = Math.max(L, pr.left); T = Math.max(T, pr.top); R = Math.min(R, pr.right); B = Math.min(B, pr.bottom);
    }
    const lost = Math.max(0, full.w * full.h - Math.max(0, R - L) * Math.max(0, B - T));
    return { lost: lost / (full.w * full.h || 1), scroller };
  };
  const out = { vw, vh, dpr };
  out.pageScrollX = de.scrollWidth - vw;
  out.pageScrollY = de.scrollHeight - vh;
  // The table locks page scroll, so also catch content that overflows the table screen itself.
  const ts = document.querySelector('.table-screen');
  out.tableOverflow = ts ? ts.scrollHeight - ts.clientHeight : 0;
  out.bodyOverflow = getComputedStyle(document.body).overflow;
  // What sticks out below the viewport (diagnostic for page scroll).
  out.below = out.pageScrollY > 0 ? [...document.querySelectorAll('body *')].filter((el) => !el.parentElement?.closest('svg') && el.getBoundingClientRect().bottom > vh + 1 && el.getBoundingClientRect().height > 0).slice(0, 6).map((el) => label(el) + ' ' + Math.round(el.getBoundingClientRect().bottom)).concat(['html', 'body', '#app', '.table-screen', '.privacy-cover'].map((q) => { const e = document.querySelector(q); if (!e) return q + ' none'; const r = e.getBoundingClientRect(); return q + ' ' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' sh' + e.scrollHeight; })) : [];
  // Interactive controls.
  const ctl = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, summary, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => visible(el) && inScope(el));
  out.controls = ctl.length;
  out.offscreen = []; out.clipped = []; out.small = []; out.uncomfortable = []; out.unnamed = [];
  for (const el of ctl) {
    const r = el.getBoundingClientRect();
    const c = clipOf(el);
    const off = r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1;
    if (off && !c.scroller) out.offscreen.push(label(el) + ' ' + [r.x, r.y, r.width, r.height].map(Math.round).join(','));
    if (c.lost > 0.25 && !c.scroller) out.clipped.push(label(el) + ' ' + Math.round(c.lost * 100) + '%');
    const isCheck = el.matches('input[type=radio], input[type=checkbox]');
    // Radios/checkboxes are measured by their label (the real target).
    const tgt = isCheck ? (el.closest('label') || el) : el;
    const tr0 = tgt.getBoundingClientRect();
    // A positioned ::before with negative insets extends the hit area (used by open-end targets).
    const pb = getComputedStyle(tgt, '::before');
    const ext = pb.content !== 'none' && pb.position === 'absolute' ? { l: -parseFloat(pb.left) || 0, r: -parseFloat(pb.right) || 0, t: -parseFloat(pb.top) || 0, b: -parseFloat(pb.bottom) || 0 } : { l: 0, r: 0, t: 0, b: 0 };
    const tr = { width: tr0.width + Math.max(0, ext.l) + Math.max(0, ext.r), height: tr0.height + Math.max(0, ext.t) + Math.max(0, ext.b) };
    const side = Math.min(tr.width, tr.height);
    if (el.closest('.dev-panel')) continue;
    if (side < ${LIMITS.targetFloor} && !el.matches('summary') ) out.small.push(label(el) + ' ' + Math.round(tr.width) + 'x' + Math.round(tr.height));
    else if (side < ${LIMITS.targetComfortable}) out.uncomfortable.push(label(el) + ' ' + Math.round(tr.width) + 'x' + Math.round(tr.height));
    const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.textContent || el.getAttribute('title') || (el.labels && el.labels[0]?.textContent) || '').trim();
    if (!name) out.unnamed.push(label(el));
  }
  // Clipped text (single-line boxes whose content is cut).
  out.textCut = [];
  for (const el of document.querySelectorAll('button, .btn, h1, h2, h3, p, .chip, .score-meta, .seat, label, th, td, .bubble')) {
    if (!visible(el) || !inScope(el) || el.closest('.sr-only')) continue;
    const s = getComputedStyle(el);
    if (s.overflow === 'visible' && s.overflowX === 'visible') continue;
    if (/auto|scroll/.test(s.overflowX + s.overflowY)) continue;
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) out.textCut.push(label(el) + ' ' + el.scrollWidth + '>' + el.clientWidth);
  }
  // Cousin portrait: clipping and upscale.
  out.sprites = [];
  for (const svg of document.querySelectorAll('svg.host-svg')) {
    if (!visible(svg) || !inScope(svg)) continue;
    const vb = svg.viewBox.baseVal; const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / vb.width, r.height / vb.height) * dpr;
    const c = clipOf(svg);
    out.sprites.push({ w: Math.round(r.width), h: Math.round(r.height), upscale: +scale.toFixed(2), clipped: +c.lost.toFixed(3), offscreen: r.bottom > vh + 1 || r.top < -1 || r.right > vw + 1 || r.left < -1 });
  }
  // Tiles: short side and pip diameter (19% of the short side), board and hand.
  const tileStats = (sel) => { const s = [...document.querySelectorAll(sel)].filter(visible).map((el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }); return s.length ? { n: s.length, minShort: +Math.min(...s).toFixed(1), minPip: +(Math.min(...s) * 0.19).toFixed(2) } : null; };
  out.board = tileStats('.board-tile .tile-box');
  out.hand = tileStats('.hand-tile');
  out.handVisible = (() => { const h = [...document.querySelectorAll('.hand-tile')].filter(visible); if (!h.length) return null; const strip = h[0].parentElement.getBoundingClientRect(); return h.filter((el) => { const r = el.getBoundingClientRect(); return r.left >= strip.left - 1 && r.right <= strip.right + 1; }).length + '/' + h.length; })();
  // Table regions must not overlap one another (art included: the bubble must not cover Cousin).
  out.overlaps = [];
  const regions = ['.hud', '.host-avatar', '.bubble', '.opponent', '.turn-banner', '.board-wrap', '.actions', '.view-tools', '.hand'].map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && visible(e) && !e.closest('[hidden]'));
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const A = regions[i][1].getBoundingClientRect(), B = regions[j][1].getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (ox > 2 && oy > 2) out.overlaps.push(regions[i][0] + ' × ' + regions[j][0] + ' ' + Math.round(ox) + 'x' + Math.round(oy));
  }
  // Cousin's drawn figure (the svg content box) vs the bubble.
  const art = document.querySelector('.host-avatar svg.host-svg'), bub = document.querySelector('.bubble');
  if (art && bub && visible(art)) { const g = art.querySelector('image'); const A = art.getBoundingClientRect(), B = bub.getBoundingClientRect(); if (Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 2 && Math.min(A.right, B.right) - Math.max(A.left, B.left) > 2) out.overlaps.push('Cousin art × bubble'); }
  // Open-end targets must be the topmost element at their centre and on screen.
  out.ends = [];
  for (const el of document.querySelectorAll('.end-slot.is-legal')) {
    const r = el.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    out.ends.push({ ok: !!top && (top === el || el.contains(top)), onScreen: cx >= 0 && cy >= 0 && cx <= vw && cy <= vh, w: Math.round(r.width), h: Math.round(r.height), top: top ? label(top) : 'none' });
  }
  return out;
})()`;

type Measure = {
  overlaps: string[];
  tableOverflow: number;
  below: string[];
  pageScrollX: number;
  pageScrollY: number;
  offscreen: string[];
  clipped: string[];
  small: string[];
  uncomfortable: string[];
  unnamed: string[];
  textCut: string[];
  sprites: { upscale: number; clipped: number; offscreen: boolean }[];
  board: { minPip: number } | null;
  hand: { minPip: number } | null;
  ends: { ok: boolean; onScreen: boolean; top: string }[];
  handVisible: string | null;
};

function judge(where: string, m: Measure, opts: { pageMayScroll?: boolean }) {
  const f = (ok: boolean, msg: string) => ok || failures.push(`${where}: ${msg}`);
  if (!opts.pageMayScroll) f(m.pageScrollY <= 0, `page scrolls vertically by ${m.pageScrollY}px (below the fold: ${m.below.join(' | ')})`);
  f(m.pageScrollX <= 0, `page scrolls horizontally by ${m.pageScrollX}px`);
  f(m.tableOverflow <= 0, `table content overflows the screen by ${m.tableOverflow}px`);
  if (!opts.pageMayScroll) f(m.offscreen.length === 0, `controls off screen: ${m.offscreen.join(' | ')}`);
  f(m.clipped.length === 0, `controls clipped: ${m.clipped.join(' | ')}`);
  f(m.small.length === 0, `targets under ${LIMITS.targetFloor}px: ${m.small.join(' | ')}`);
  f(m.unnamed.length === 0, `controls without an accessible name: ${m.unnamed.join(' | ')}`);
  f(m.textCut.length === 0, `text clipped: ${m.textCut.join(' | ')}`);
  for (const s of m.sprites) {
    f(s.clipped < 0.01 && (!s.offscreen || !!opts.pageMayScroll), `Cousin's portrait clipped (${(s.clipped * 100).toFixed(1)}%)${s.offscreen ? ' / off screen' : ''}`);
    f(s.upscale <= LIMITS.spriteUpscaleMax, `Cousin's portrait upscaled ×${s.upscale} (blurry)`);
  }
  if (m.board) f(m.board.minPip >= LIMITS.pipMin, `board pips ${m.board.minPip}px < ${LIMITS.pipMin}px`);
  if (m.hand) f(m.hand.minPip >= LIMITS.pipMin, `hand pips ${m.hand.minPip}px < ${LIMITS.pipMin}px`);
  if (m.handVisible) {
    const [shown, total] = m.handVisible.split('/').map(Number);
    if (total! <= 7) f(shown === total, `only ${m.handVisible} hand tiles visible without scrolling`);
  }
  f(m.overlaps.length === 0, `regions overlap: ${m.overlaps.join(' | ')}`);
  for (const e of m.ends) f(e.ok && e.onScreen, `open end blocked by ${e.top}${e.onScreen ? '' : ' (off screen)'}`);
  if (m.uncomfortable.length) warnings.push(`${where}: under ${LIMITS.targetComfortable}px: ${m.uncomfortable.join(' | ')}`);
}

const SCREENS = ['startup', 'menu', 'menu-stats', 'menu-settings', 'menu-achievements', 'setup', 'story-home', 'story-scene', 'story-cast', 'story-transcript', 'longest-chain', 'largest-hand', 'partnership', 'handoff', 'pause', 'results'] as const;
type Screen = (typeof SCREENS)[number];

async function capture(vp: (typeof VIEWPORTS)[number], screen: Screen, page: Page, opts: { pageMayScroll?: boolean } = {}) {
  await page.waitForTimeout(450); // let entrance transitions settle
  const file = join(outDir, `${screen}--${vp.name}.png`);
  await page.screenshot({ path: file });
  const m = (await page.evaluate(MEASURE)) as Measure;
  (report[vp.name] ??= {})[screen] = m;
  judge(`${vp.name} ${screen}`, m, opts);
}

const only = process.env.QA_ONLY?.split(',');
try {
  for (const vp of VIEWPORTS) {
    if (only && !only.some((o) => vp.name.includes(o))) continue;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: DPR, hasTouch: vp.width < 1100 });
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => failures.push(`${vp.name}: page error ${e.message}`));
    page.on('console', (msg: { type(): string; text(): string }) => msg.type() === 'error' && failures.push(`${vp.name}: console error ${msg.text()}`));

    await page.goto(BASE);
    await page.waitForSelector('.start-button');
    await capture(vp, 'startup', page);
    await page.click('.start-button');
    const skip = page.locator('[data-act="intro-skip"]');
    if (await skip.count()) await tryClick(skip);
    await page.waitForSelector('[data-go="setup"]');
    await capture(vp, 'menu', page);
    for (const sub of ['stats', 'settings', 'achievements']) {
      await page.click(`[data-go="${sub}"]`);
      await capture(vp, `menu-${sub}` as Screen, page, { pageMayScroll: true });
      await page.click('[data-act="home"]');
      await page.waitForSelector('[data-go="setup"]');
    }
    await page.click('[data-go="setup"]');
    await page.check('input[name="mode"][value="partnership4"]');
    await capture(vp, 'setup', page, { pageMayScroll: true });

    // Story: case file, then the Prologue scene player (real script text).
    await page.click('[data-act="home"]');
    await page.waitForSelector('[data-act="story"]');
    await page.evaluate(() => localStorage.removeItem('sticks-and-bones.story'));
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await capture(vp, 'story-home', page, { pageMayScroll: true });
    await page.click('[data-act="story-new"]');
    await page.waitForSelector('.story-stage');
    for (let k = 0; k < 2; k++) await page.click('[data-act="story-next"]');
    await capture(vp, 'story-scene', page);
    await page.click('[data-act="story-file"]');
    await page.waitForSelector('.story-shell');
    // A cast line (Vale, Chapter 3) with his portrait decoded, then the transcript.
    await page.evaluate(() => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: 'chapter-3', part: 'pre', index: 4, outcome: null, completed: ['prologue', 'chapter-1', 'chapter-2'], textScale: 1, startedAt: 1, hand: null } })));
    await page.click('[data-act="story-home"]');
    await page.waitForSelector('[data-act="story"]');
    await page.click('[data-act="story"]');
    await page.waitForSelector('[data-act="story-continue"]');
    await page.click('[data-act="story-continue"]');
    await page.waitForFunction(() => document.querySelector('.story-stage')?.hasAttribute('data-cast-visible') && document.querySelector('.st-curtain:not(.is-closed)'), null, { timeout: 20_000 }).then((h: { dispose(): Promise<void> }) => h.dispose()).catch(() => failures.push(`${vp.name} story-cast: Vale's portrait never appeared`));
    await page.waitForTimeout(400);
    await capture(vp, 'story-cast', page);
    await page.click('[data-act="story-transcript"]');
    await page.waitForSelector('dialog.transcript[open]');
    await capture(vp, 'story-transcript', page, { pageMayScroll: true });
    await page.keyboard.press('Escape');
    await page.click('[data-act="story-file"]');
    await page.waitForSelector('.story-shell');
    await page.click('[data-act="story-home"]');
    await page.waitForSelector('[data-go="setup"]');

    await setup(page, { fixture: 'max-board' });
    await waitHumanTurn(page);
    await showEnds(page);
    await capture(vp, 'longest-chain', page);

    await setup(page, { fixture: 'max-hand' });
    await waitHumanTurn(page);
    await showEnds(page);
    await capture(vp, 'largest-hand', page);

    await setup(page, { mode: 'partnership4', opponent: 'ai', difficulty: 'normal', seed: 'qa-partner' });
    await waitHumanTurn(page);
    await showEnds(page);
    await capture(vp, 'partnership', page);
    await page.click('[data-act="pause"]');
    await page.waitForSelector('dialog.pause[open]');
    await capture(vp, 'pause', page);
    await page.click('[data-act="pause-resume"]');
    if (!(await playToResults(page))) failures.push(`${vp.name}: partnership round could not be finished by clicking (blocked input?)`);
    await page.waitForTimeout(1200); // tally finishes
    await capture(vp, 'results', page);

    await setup(page, { mode: 'partnership4', opponent: 'local', seed: 'qa-local' });
    await page.waitForSelector('.privacy-cover:not([hidden])');
    await capture(vp, 'handoff', page);
    await ctx.close();
  }
  // Atlas bleeding: the teal back sprite sits right of 6|6 and below 6|1 in the atlas. Render those faces
  // at the smallest sizes the app uses (board unit 26 → 24×48, hand 38×76, results 24×48, rotated too)
  // and require no teal pixels along the shared edges. Then the back itself at the mini size (13×26).
  for (const dpr of [1, 2, 3]) {
    const ctx = await browser.newContext({ viewport: { width: 600, height: 400 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.goto(BASE); // the app page: same module graph and stylesheet as the real table
    await page.waitForSelector('.start-button');
    await page.evaluate(`(async () => {
      const m = await import('/src/render/tile-art.ts');
      m.initTileArt();
      for (let i = 0; i < 100 && m.backend() !== 'atlas'; i++) await new Promise((r) => setTimeout(r, 50));
      if (m.backend() !== 'atlas') throw new Error('atlas did not load');
      const cases = [['t66', 24, 48, 0], ['t66', 48, 24, 90], ['t66', 38, 76, 0], ['t66', 18, 36, 0], ['t61', 24, 48, 0], ['t61', 48, 24, 270], ['t61', 18, 36, 0], ['back', 13, 26, 0], ['back', 16, 32, 0]];
      document.body.innerHTML = '<div id="bleed" style="display:flex;gap:12px;padding:12px;background:#f0f;flex-wrap:wrap">' + cases.map(([id, w, h, r], i) => '<div data-case="' + i + '" data-id="' + id + '" data-rot="' + r + '" style="padding:3px;background:#f0f">' + m.tileBoxHtml(id, w, h, r) + '</div>').join('') + '</div>';
      await new Promise((r) => setTimeout(r, 300));
    })()`);
    const boxes = page.locator('#bleed [data-case]');
    const n = await boxes.count();
    const { PNG } = await import('pngjs');
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const el = boxes.nth(i);
      const meta = await el.evaluate((e: HTMLElement) => ({ id: e.dataset.id!, rot: Number(e.dataset.rot) }));
      const png = PNG.sync.read(await el.locator('.tile-box').screenshot());
      const teal = (x: number, y: number) => {
        const k = (y * png.width + x) * 4;
        const [r, g, b] = [png.data[k]!, png.data[k + 1]!, png.data[k + 2]!];
        return g - r > 25 && b - r > 25; // teal/green-blue, never present on an ivory face or its border
      };
      // Magenta page background: transparency can never pass for ivory or teal. Faces must contain no teal
      // anywhere; the back must show no ivory (from 6|6) along its edges.
      let bad = 0;
      if (meta.id !== 'back') {
        for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (teal(x, y)) bad++;
      } else {
        const ivory = (x: number, y: number) => {
          const k = (y * png.width + x) * 4;
          return png.data[k]! > 200 && png.data[k + 1]! > 190 && png.data[k + 2]! > 170 && png.data[k + 3]! > 200;
        };
        for (let y = 2; y < png.height - 2; y++) for (const x of [0, 1, png.width - 2, png.width - 1]) if (ivory(x, y)) bad++;
      }
      if (bad) failures.push(`atlas bleed @${dpr}x: ${meta.id} rot ${meta.rot} shows ${bad} neighbour pixels`);
      checked++;
    }
    bleedNotes.push(`${checked} cases @${dpr}x`);
    await ctx.close();
  }

  // Text scaling (browser text size / zoom): 150% and 200% root font size on reading screens.
  // Vertical scrolling is fine; horizontal overflow, clipped text or clipped controls are not.
  if (!only || only.some((o) => 'text-scale'.includes(o) || o === 'all')) {
    for (const pct of [150, 200]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      // The browser's own default text size (what a player changes in settings), via DevTools.
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Page.enable');
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round((16 * pct) / 100), fixed: Math.round((13 * pct) / 100) } });
      await page.goto(BASE);
      const rootPx = (await page.evaluate('getComputedStyle(document.documentElement).fontSize')) as string;
      if (rootPx !== `${Math.round((16 * pct) / 100)}px`) failures.push(`text ${pct}%: browser text size did not apply (root ${rootPx})`);
      await page.click('.start-button');
      await page.waitForSelector('[data-act="story"]');
      const grab = async (label: string) => {
        await page.waitForTimeout(450); // let entrance transitions settle
        const m = (await page.evaluate(MEASURE)) as Measure;
        const f = (ok: boolean, msg: string) => ok || failures.push(`text ${pct}% ${label}: ${msg}`);
        f(m.pageScrollX <= 0, `page scrolls horizontally by ${m.pageScrollX}px`);
        f(m.clipped.length === 0, `controls clipped: ${m.clipped.join(' | ')}`);
        f(m.textCut.length === 0, `text clipped: ${m.textCut.join(' | ')}`);
        await page.screenshot({ path: join(outDir, `text-${pct}-${label}.png`) });
      };
      await grab('menu');
      await page.click('[data-act="story"]');
      await page.waitForSelector('.story-shell');
      await grab('story-home');
      await page.click('[data-act="story-new"], [data-act="story-continue"]');
      await page.waitForSelector('.story-stage');
      await page.click('[data-act="story-next"]');
      await grab('story-scene');
      await page.click('[data-act="story-file"]');
      await page.waitForSelector('[data-act="story-home"]');
      await page.click('[data-act="story-home"]');
      await page.click('[data-go="setup"]');
      await grab('setup');
      textNotes.push(`${pct}% browser text size (root ${rootPx}): menu, story case file, story scene, setup`);
      await ctx.close();
    }
    // Typography facts: tabular score digits, and layout shift while the web fonts swap in.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.addInitScript(`window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });`);
    await page.goto(BASE);
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const typo = (await page.evaluate(`(() => {
      const probe = document.createElement('span');
      probe.className = 'score-val';
      probe.style.position = 'absolute';
      document.body.append(probe);
      const widths = [...'0123456789'].map((d) => { probe.textContent = d.repeat(4); return probe.getBoundingClientRect().width.toFixed(2); });
      const family = getComputedStyle(probe).fontFamily;
      probe.remove();
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
      return { widths, family, loaded, cls: window.__cls };
    })()`)) as { widths: string[]; family: string; loaded: string[]; cls: number };
    if (new Set(typo.widths).size !== 1) failures.push(`score digits are not tabular: ${typo.widths.join(',')} (${typo.family})`);
    if (!typo.loaded.includes('DM Sans') || !typo.loaded.includes('Bricolage Grotesque')) failures.push(`web fonts not loaded: ${typo.loaded.join(', ')}`);
    if (typo.cls > 0.1) failures.push(`layout shift during load/font swap: CLS ${typo.cls.toFixed(3)}`);
    textNotes.push(`score digits ${typo.widths[0]} px each (tabular, ${typo.family.split(',')[0]}); fonts loaded: ${typo.loaded.join(', ')}; CLS to menu ${typo.cls.toFixed(4)}`);
    await ctx.close();
  }

  // Contact sheets: one image per screen across viewports (small, for review).
  for (const s of SCREENS) {
    const files = VIEWPORTS.filter((v) => !only || only.some((o) => v.name.includes(o))).map((v) => join(outDir, `${s}--${v.name}.png`));
    if (!files.length) continue;
    try {
      execFileSync('montage', [...files, '-geometry', '+8+8', '-tile', `${files.length}x1`, '-resize', '400x400>', '-background', '#222', '-label', '%t', join(outDir, `sheet-${s}.jpg`)]);
    } catch {
      /* montage unavailable */
    }
  }
} finally {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ limits: LIMITS, dpr: DPR, failures, warnings, atlasBleed: bleedNotes, typography: textNotes, report }, null, 1));
  await browser.close();
  await server.close();
}
console.log(`atlas bleed: ${bleedNotes.join(', ')}`);
for (const n of textNotes) console.log(`text/typography: ${n}`);
console.log(`QA: ${failures.length} failures, ${warnings.length} comfort warnings → ${outDir}`);
for (const f of failures) console.log('  ✗ ' + f);
for (const w of warnings.slice(0, 60)) console.log('  ! ' + w);
process.exit(failures.length ? 1 : 0);
