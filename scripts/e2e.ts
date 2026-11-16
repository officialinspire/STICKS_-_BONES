/**
 * npm run e2e — browser acceptance checks against the Vite dev server
 * (dev tools enabled). Uses the machine's Playwright (resolved via NODE_PATH /
 * global install); it is not a project dependency.
 *
 * Covers: complete two-player rounds (vs AI in Draw and Block, pass-and-play
 * with handoffs, developer-controlled both seats), next hand, restart/menu
 * confirmation, keyboard-only placement incl. a both-ends choice, hidden AI
 * hands, max-size board/hand fixtures at phone and desktop sizes, no overlap
 * between HUD/Cousin/board/controls/hand, the dev contact sheet, and — for
 * every board tile at every rotation, in both atlas and SVG renderers — that
 * the pips counted in the screenshot match the tile data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createServer } from 'vite';
import { countBlobs } from './lib/raster.ts';

type Page = import('playwright').Page;
type Ctx = { message: string; type(): string; text(): string };

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = process.argv[2] ?? join(root, 'test-results/e2e');
mkdirSync(outDir, { recursive: true });
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5199/';
const browser = await chromium.launch();

async function newPage(viewport: { width: number; height: number }, dsf = 1): Promise<Page> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  page.on('pageerror', (e: Ctx) => failures.push(`page error: ${e.message}`));
  page.on('console', (m: Ctx) => {
    if (m.type() === 'error') failures.push(`console error: ${m.text()}`);
  });
  return page;
}

async function startMatch(page: Page, o: { mode?: string; opponent?: string; seed?: string; fixture?: string; svg?: boolean }) {
  await page.goto(BASE);
  await page.locator('details.dev-panel summary').click();
  if (o.seed) await page.fill('input[name="seed"]', o.seed);
  if (o.svg) await page.check('input[name="forceSvg"]');
  if (o.mode) await page.check(`input[name="mode"][value="${o.mode}"]`);
  if (o.opponent) await page.check(`input[name="opponent"][value="${o.opponent}"]`);
  if (o.fixture) await page.click(`[data-fixture="${o.fixture}"]`);
  else await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
}

const resultsOpen = (page: Page) => page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false);

/** Play until the results dialog opens. Returns the number of human actions. */
async function playRound(page: Page, label: string, opts: { checkHidden?: boolean; preferTail?: boolean } = {}): Promise<number> {
  let actions = 0;
  for (let i = 0; i < 2000; i++) {
    if (await resultsOpen(page)) return actions;
    if (await page.locator('.handoff:not([hidden])').count()) {
      await page.click('[data-act="handoff-ready"]');
      continue;
    }
    if (opts.checkHidden) await assertAiHandHidden(page, label);
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click();
      const slots = page.locator('.end-slot.is-legal');
      const n = await slots.count();
      check(n >= 1, `${label}: selecting a legal tile showed no legal end`);
      await (opts.preferTail || actions % 2 ? slots.last() : slots.first()).click();
      actions++;
      continue;
    }
    const draw = page.locator('[data-act="draw"]:not([disabled])');
    if (await draw.count()) {
      await draw.click();
      actions++;
      continue;
    }
    const pass = page.locator('[data-act="pass"]:not([disabled])');
    if (await pass.count()) {
      await pass.click();
      actions++;
      continue;
    }
    await page.waitForTimeout(120);
  }
  failures.push(`${label}: round did not finish`);
  return actions;
}

async function assertAiHandHidden(page: Page, label: string) {
  const leak = await page.evaluate(() => {
    const sb = (window as unknown as { __sb?: { session: { debugState(): { hand: { hands: string[][] } }; isHuman(s: number): boolean } } }).__sb;
    if (!sb) return 'no dev hook';
    const ai = sb.session.debugState().hand.hands.filter((_, s) => !sb.session.isHuman(s)).flat();
    const outside = [...document.querySelectorAll('[data-tile]')].filter((el) => !el.closest('dialog.results'));
    const shown = outside.map((el) => (el as HTMLElement).dataset.tile);
    return ai.filter((t) => shown.includes(t)).join(',');
  });
  check(leak === '', `${label}: AI tiles visible in the DOM: ${leak}`);
}

/** Count pips per half of every board tile from real screenshots and compare with data. */
async function verifyBoardPips(page: Page, label: string): Promise<number> {
  const tiles = page.locator('.board-tile .tile-box');
  const n = await tiles.count();
  let checked = 0;
  const rotations = new Set<string>();
  for (let i = 0; i < n; i++) {
    const el = tiles.nth(i);
    await el.scrollIntoViewIfNeeded();
    const meta: Record<string, string> = await el.evaluate((e: HTMLElement) => ({ ...e.dataset }));
    const id = meta.tile!;
    const high = Number(id[1]);
    const low = Number(id[2]);
    const png = PNG.sync.read(await el.screenshot());
    const wide = png.width > png.height;
    const short = Math.min(png.width, png.height);
    const m = Math.round(short * 0.15);
    const band = Math.round(short * 0.1);
    const halfLen = (wide ? png.width : png.height) / 2;
    const a = wide
      ? { x: m, y: m, w: Math.floor(halfLen - m - band), h: png.height - 2 * m }
      : { x: m, y: m, w: png.width - 2 * m, h: Math.floor(halfLen - m - band) };
    const b = wide
      ? { x: Math.ceil(halfLen + band), y: m, w: Math.floor(halfLen - m - band), h: png.height - 2 * m }
      : { x: m, y: Math.ceil(halfLen + band), w: png.width - 2 * m, h: Math.floor(halfLen - m - band) };
    const dark = (k: number) => png.data[k + 3]! > 200 && 0.299 * png.data[k]! + 0.587 * png.data[k + 1]! + 0.114 * png.data[k + 2]! < 110;
    const minBlob = Math.max(4, Math.round((short / 10) ** 2 * 0.5));
    const first = countBlobs(png, a, dark, minBlob); // left or top half
    const second = countBlobs(png, b, dark, minBlob); // right or bottom half
    const highFirst = meta.highDir === (wide ? 'left' : 'up');
    const exp = highFirst ? [high, low] : [low, high];
    rotations.add(meta.rotation!);
    if (first !== exp[0] || second !== exp[1]) {
      failures.push(`${label}: ${id} rot ${meta.rotation} counted ${first}|${second}, expected ${exp[0]}|${exp[1]}`);
      writeFileSync(join(outDir, `pip-fail-${label}-${id}.png`), PNG.sync.write(png));
    }
    // The half facing the head must show the head pip.
    const headFirst = meta.headDir === (wide ? 'left' : 'up');
    if (high !== low) check((headFirst ? first : second) === Number(meta.headPip), `${label}: ${id} head half does not show ${meta.headPip}`);
    checked++;
  }
  notes.push(`${label}: verified pips on ${checked} board tiles, rotations {${[...rotations].sort().join(', ')}}`);
  return checked;
}

async function assertNoOverlap(page: Page, label: string) {
  const boxes = await page.evaluate(() =>
    ['.hud', '.side', '.board-wrap', '.controls', '.hand'].map((sel) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { sel, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i]!;
      const B = boxes[j]!;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      check(!(ox > 1 && oy > 1), `${label}: ${A.sel} overlaps ${B.sel}`);
    }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${label}: page scrolls horizontally by ${overflow}px`);
}

try {
  // 1. Contact sheet.
  {
    const page = await newPage({ width: 1200, height: 900 });
    await page.goto(BASE + 'dev/contact-sheet.html');
    await page.waitForSelector('[data-summary]');
    const failed = await page.getAttribute('[data-summary]', 'data-failed');
    const total = await page.getAttribute('[data-summary]', 'data-checks');
    check(failed === '0', `contact sheet reports ${failed} failed checks`);
    notes.push(`contact sheet: ${total} checks, ${failed} failed`);
    await page.screenshot({ path: join(outDir, 'contact-sheet.png'), fullPage: true });
    await page.context().close();
  }

  // 2. Complete rounds in every two-player setup, then the next hand.
  for (const [mode, opponent, vp] of [
    ['draw2', 'ai', { width: 390, height: 844 }],
    ['block2', 'ai', { width: 1366, height: 900 }],
    ['draw2', 'local', { width: 820, height: 1180 }],
    ['block2', 'dev-both', { width: 390, height: 844 }],
  ] as const) {
    const label = `${mode}-${opponent}`;
    const page = await newPage(vp, 2);
    await startMatch(page, { mode, opponent, seed: `e2e-${label}` });
    if (opponent === 'local') check((await page.locator('.handoff:not([hidden])').count()) === 1, `${label}: no handoff screen at start`);
    const actions = await playRound(page, label, { checkHidden: opponent === 'ai' });
    await page.screenshot({ path: join(outDir, `${label}-results.png`) });
    const title = await page.textContent('#results-title');
    notes.push(`${label}: round finished after ${actions} human actions — "${title}"`);
    await page.click('[data-act="next-hand"], [data-act="new-match"]');
    await page.waitForTimeout(300);
    const meta = await page.textContent('.score-meta');
    check(/Hand 2|Hand 1/.test(meta ?? ''), `${label}: next hand did not start (${meta})`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `${label}-hand2.png`) });
    await assertNoOverlap(page, label);
    await page.context().close();
  }

  // 3. Pips at every rotation, atlas and SVG, on the 27-tile board.
  for (const svg of [false, true]) {
    const page = await newPage({ width: 1366, height: 900 }, 2);
    await startMatch(page, { fixture: 'max-board', svg });
    const label = svg ? 'svg' : 'atlas';
    await page.waitForTimeout(400);
    const n = await verifyBoardPips(page, `max-board-${label}`);
    check(n === 26, `max-board-${label}: expected 26 tiles, saw ${n}`);
    await page.context().close();
  }

  // 4. Max fixtures at phone and desktop sizes.
  for (const vp of [
    { width: 390, height: 844, name: 'phone' },
    { width: 1366, height: 900, name: 'desktop' },
  ]) {
    const page = await newPage(vp, 1);
    await startMatch(page, { fixture: 'max-board' });
    await page.waitForTimeout(300);
    const unit = Number(await page.getAttribute('.board', 'data-unit'));
    check(unit >= 26, `max-board ${vp.name}: tile unit ${unit}px is below the legibility floor`);
    await assertNoOverlap(page, `max-board ${vp.name}`);
    await page.click('.hand-tile[data-tile="t66"]');
    const slots = page.locator('.end-slot.is-legal');
    check((await slots.count()) === 2, `max-board ${vp.name}: 6|6 should offer two ends`);
    for (let k = 0; k < (await slots.count()); k++) {
      await slots.nth(k).scrollIntoViewIfNeeded();
      const box = await slots.nth(k).boundingBox();
      const wrap = await page.locator('.board-wrap').boundingBox();
      check(!!box && !!wrap && box.y >= wrap.y - 1 && box.y + box.height <= wrap.y + wrap.height + 1, `max-board ${vp.name}: end ${k} not visible after focus`);
    }
    await page.screenshot({ path: join(outDir, `max-board-${vp.name}.png`) });
    await slots.last().click();
    await page.waitForSelector('dialog.results[open]', { timeout: 5000 });
    const boardCount = await page.locator('.board-tile').count();
    check(boardCount === 27, `max-board ${vp.name}: expected 27 tiles after the final play, saw ${boardCount}`);
    await page.screenshot({ path: join(outDir, `max-board-${vp.name}-results.png`) });
    await page.context().close();

    const p2 = await newPage(vp, 1);
    await startMatch(p2, { fixture: 'max-hand' });
    await p2.waitForTimeout(300);
    const dims = await p2.evaluate(() => {
      const s = document.querySelector('.hand-scroll') as HTMLElement;
      const tiles = [...document.querySelectorAll('.hand-tile')].map((t) => t.getBoundingClientRect().width);
      return { scroll: s.scrollWidth, client: s.clientWidth, count: tiles.length, minW: Math.min(...tiles) };
    });
    check(dims.count === 21, `max-hand ${vp.name}: ${dims.count} tiles rendered`);
    check(dims.minW >= 40, `max-hand ${vp.name}: hand tiles only ${dims.minW}px wide`);
    if (vp.name === 'phone') check(dims.scroll > dims.client, `max-hand phone: hand should scroll horizontally`);
    await assertNoOverlap(p2, `max-hand ${vp.name}`);
    await p2.locator('.hand-tile').first().focus();
    await p2.keyboard.press('End');
    const lastVisible = await p2.evaluate(() => {
      const s = (document.querySelector('.hand-scroll') as HTMLElement).getBoundingClientRect();
      const f = document.activeElement!.getBoundingClientRect();
      return document.activeElement === [...document.querySelectorAll('.hand-tile')].at(-1) && f.left >= s.left - 1 && f.right <= s.right + 1;
    });
    check(lastVisible, `max-hand ${vp.name}: End key did not reveal the last tile`);
    await p2.screenshot({ path: join(outDir, `max-hand-${vp.name}.png`) });
    notes.push(`max fixtures ${vp.name}: unit ${unit}px, hand ${dims.count} tiles min ${dims.minW}px, scroll ${dims.scroll}/${dims.client}`);
    await p2.context().close();
  }

  // 5. Keyboard-only placement with a both-ends choice, Escape, and confirmations.
  {
    const page = await newPage({ width: 390, height: 844 });
    await startMatch(page, { fixture: 'both-ends' });
    await page.locator('.hand-tile[data-tile="t53"]').focus();
    await page.keyboard.press('Enter');
    let focused = await page.evaluate(() => (document.activeElement as HTMLElement).className);
    check(focused.includes('end-slot'), `keyboard: Enter on a tile did not move focus to an end (${focused})`);
    check((await page.locator('.end-slot.is-legal').count()) === 2, 'keyboard: 5|3 should offer both ends');
    await page.keyboard.press('Escape');
    focused = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.tile ?? '');
    check(focused === 't53' && (await page.locator('.end-slot.is-legal').count()) === 0, 'keyboard: Escape did not cancel the selection');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    const endBefore = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.end);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    check((await page.locator('.board-tile').count()) === 3, 'keyboard: placement via Enter failed');
    notes.push(`keyboard: placed 5|3 on the ${endBefore} end using only the keyboard`);
    // Disabled controls explain themselves.
    const reasons = await page.locator('.reason').allTextContents();
    check(reasons.every((r: string) => r.trim().length > 0), 'controls: empty disabled reason');
    // Restart and menu need confirmation.
    await page.click('[data-act="restart"]');
    check(await page.locator('dialog.confirm[open]').count() === 1, 'restart: no confirmation');
    await page.click('[data-act="confirm-no"]');
    check(await page.locator('.board-tile').count() === 3, 'restart: cancel changed the game');
    await page.click('[data-act="menu"]');
    await page.click('[data-act="confirm-yes"]');
    check(await page.locator('.btn-start').count() === 1, 'menu: confirming did not return to the menu');
    await page.context().close();
  }
} catch (e) {
  failures.push(`exception: ${(e as Error).stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}

for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\nE2E FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nE2E passed. Screenshots in ${outDir}`);
