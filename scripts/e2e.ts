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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createServer } from 'vite';
import { countBlobs } from './lib/raster.ts';
import { getAsset } from '../src/assets/index.ts';
import { bustBox, stageFor } from '../src/render/stage.ts';

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

async function newPage(viewport: { width: number; height: number }, dsf = 1, opts: { blockedImages?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  page.on('pageerror', (e: Ctx) => failures.push(`page error: ${e.message}`));
  page.on('console', (m: Ctx) => {
    // When a test deliberately blocks images, the browser's own load errors are expected.
    if (opts.blockedImages && /Failed to load resource/.test(m.text())) return;
    if (m.type() === 'error') failures.push(`console error: ${m.text()}`);
  });
  return page;
}

/** Load the app and pass the start screen (and the studio intro, if any) to reach the menu. */
async function enterMenu(page: Page, reload = false) {
  if (reload) await page.reload();
  else await page.goto(BASE);
  await page.click('.start-button');
  const skip = page.locator('[data-act="intro-skip"]');
  if (await skip.count()) await tryClick(skip);
  await page.waitForSelector('[data-go="setup"]');
}

async function startMatch(
  page: Page,
  o: { mode?: string; opponent?: string; seed?: string; aiSeed?: string; difficulty?: string; fast?: boolean; fixture?: string; svg?: boolean; names?: [string, string]; seating?: string },
) {
  await enterMenu(page);
  await page.click('[data-go="setup"]');
  await page.locator('details.dev-panel summary').click();
  if (o.seed) await page.fill('input[name="seed"]', o.seed);
  if (o.aiSeed) await page.fill('input[name="aiSeed"]', o.aiSeed);
  if (o.fast) await page.check('input[name="fastAi"]');
  if (o.svg) await page.check('input[name="forceSvg"]');
  if (o.mode) await page.check(`input[name="mode"][value="${o.mode}"]`);
  if (o.opponent) await page.check(`input[name="opponent"][value="${o.opponent}"]`);
  if (o.names) {
    await page.fill('input[name="name1"]', o.names[0]);
    await page.fill('input[name="name2"]', o.names[1]);
  }
  if (o.seating) await page.selectOption('select[name="seating"]', o.seating);
  if (o.difficulty && (await page.locator(`input[name="difficulty"][value="${o.difficulty}"]`).isVisible())) await page.check(`input[name="difficulty"][value="${o.difficulty}"]`);
  if (o.fixture) await page.click(`[data-fixture="${o.fixture}"]`);
  else await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
}

const resultsOpen = (page: Page) => page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false);

/** Play until the results dialog opens. Returns the number of human actions. */
/** While the privacy cover is up: no hand in the DOM, table inert, nothing private in the accessibility tree or live region. */
async function assertCovered(page: Page, label: string) {
  const facts = await page.evaluate(() => ({
    handTiles: document.querySelectorAll('.hand-tile').length,
    privateTiles: [...document.querySelectorAll('[data-tile]')].filter((el) => !el.closest('.board') && !el.closest('dialog.results')).length,
    inert: (document.querySelector('.table-screen') as HTMLElement & { inert: boolean }).inert,
    modal: document.querySelector('.privacy-cover [role="dialog"][aria-modal="true"]') !== null,
    announce: document.querySelector('[data-region="announce"]')?.textContent ?? '',
    bubble: document.querySelector('.bubble')?.textContent ?? '',
  }));
  check(facts.handTiles === 0 && facts.privateTiles === 0, `${label}: hand tiles present under the cover (${facts.handTiles}/${facts.privateTiles})`);
  check(facts.inert && facts.modal, `${label}: covered table is not inert/modal`);
  check(!/drew \d\|\d/.test(facts.announce + facts.bubble), `${label}: live region/bubble names a drawn tile: ${facts.announce} ${facts.bubble}`);
  const tree = await page.locator('body').ariaSnapshot();
  check(!/pips, (playable|not playable)/.test(tree) && !/Your tiles|’s tiles/.test(tree), `${label}: accessibility tree exposes a covered hand`);
}

/** Outside a human's revealed turn (AI turns, results), no hand is rendered at all. */
async function assertNoForeignHand(page: Page, label: string) {
  const st = await page.evaluate(() => {
    const sb = (window as unknown as { __sb?: { controller: { state: { kind: string } } } }).__sb;
    return { kind: sb?.controller.state.kind ?? '', tiles: document.querySelectorAll('.hand-tile').length };
  });
  if (st.kind !== 'human-turn') check(st.tiles === 0, `${label}: ${st.tiles} hand tiles rendered during ${st.kind}`);
}

/** Click if still actionable; the table may legitimately change state (cover, results) between lookup and click. */
async function tryClick(loc: { click(o: { timeout: number }): Promise<void> }): Promise<boolean> {
  try {
    await loc.click({ timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function playRound(page: Page, label: string, opts: { checkHidden?: boolean; preferTail?: boolean; privacy?: boolean } = {}): Promise<number> {
  let actions = 0;
  for (let i = 0; i < 2000; i++) {
    if (await resultsOpen(page)) return actions;
    if (await page.locator('.privacy-cover:not([hidden])').count()) {
      if (opts.privacy) await assertCovered(page, label);
      const ready = page.locator('[data-act="cover-ready"]');
      if (await ready.count()) await tryClick(ready);
      else await tryClick(page.locator('[data-act="cover-reveal"]'));
      continue;
    }
    if (opts.privacy) await assertNoForeignHand(page, label);
    if (opts.checkHidden) await assertAiHandHidden(page, label);
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      if (!(await tryClick(legal.first()))) continue;
      const slots = page.locator('.end-slot.is-legal');
      const n = await slots.count();
      check(n >= 1, `${label}: selecting a legal tile showed no legal end`);
      if (await tryClick(opts.preferTail || actions % 2 ? slots.last() : slots.first())) actions++;
      continue;
    }
    const draw = page.locator('[data-act="draw"]:not([disabled])');
    if (await draw.count()) {
      if (await tryClick(draw)) actions++;
      continue;
    }
    const pass = page.locator('[data-act="pass"]:not([disabled])');
    if (await pass.count()) {
      if (await tryClick(pass)) actions++;
      continue;
    }
    await page.waitForTimeout(120);
  }
  // Diagnostics: exactly where the table was stuck.
  const diag = await page
    .evaluate(() => {
      const sb = (window as unknown as { __sb?: { controller: { state: unknown }; session: { turn: number; phase: string; paused: boolean; aiThinking: boolean; seq: number; stats: unknown } } }).__sb;
      if (!sb) return 'no dev hook';
      const s = sb.session;
      return JSON.stringify({
        controller: sb.controller.state,
        turn: s.turn,
        phase: s.phase,
        paused: s.paused,
        thinking: s.aiThinking,
        seq: s.seq,
        stats: s.stats,
        cover: !!document.querySelector('.privacy-cover:not([hidden])'),
        dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.className),
        hidden: document.hidden,
      });
    })
    .catch((e: Error) => `diag failed: ${e.message}`);
  failures.push(`${label}: round did not finish — ${diag}`);
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
  for (const [mode, opponent, difficulty, vp] of [
    ['draw2', 'ai', 'easy', { width: 390, height: 844 }],
    ['block2', 'ai', 'normal', { width: 1366, height: 900 }],
    ['partnership4', 'ai', 'hard', { width: 390, height: 844 }],
    ['partnership4', 'ai', 'normal', { width: 1366, height: 900 }],
    ['block2', 'dev-both', 'normal', { width: 390, height: 844 }],
  ] as const) {
    const label = `${mode}-${opponent}-${difficulty}-${vp.width}`;
    const page = await newPage(vp, 2);
    await page.addInitScript(() => {
      const w = window as unknown as { __lt: number[] };
      w.__lt = [];
      try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true });
      } catch {
        /* longtask API unavailable */
      }
    });
    await startMatch(page, { mode, opponent, difficulty, seed: `e2e-${label}`, aiSeed: `e2e-ai-${label}`, fast: true });
    // Measure gameplay only: drop long tasks from page start-up (dev-server module loading, image decode).
    await page.waitForTimeout(400);
    await page.evaluate(() => ((window as unknown as { __lt: number[] }).__lt.length = 0));
    if (opponent === 'ai') {
      const kind = await page.evaluate(() => (window as unknown as { __sb: { runnerKind: string } }).__sb.runnerKind);
      check(kind === 'worker', `${label}: AI runs in ${kind}, expected a Web Worker`);
    }
    const actions = await playRound(page, label, { checkHidden: opponent === 'ai' });
    await page.screenshot({ path: join(outDir, `${label}-results.png`) });
    const title = await page.textContent('#results-title');
    const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { __lt: number[] }).__lt));
    const stats = await page.evaluate(() => (window as unknown as { __sb: { session: { stats: { aiDecisions: number; staleDiscarded: number } } } }).__sb.session.stats);
    check(longest < 250, `${label}: main thread blocked for ${longest.toFixed(0)} ms`);
    notes.push(`${label}: round finished after ${actions} human actions, ${stats.aiDecisions} AI decisions, longest main-thread task ${longest.toFixed(0)} ms — "${title}"`);
    await page.click('[data-act="next-hand"], [data-act="new-match"]');
    await page.waitForTimeout(300);
    const meta = await page.textContent('.score-meta');
    check(/Hand 2|Hand 1/.test(meta ?? ''), `${label}: next hand did not start (${meta})`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `${label}-hand2.png`) });
    await assertNoOverlap(page, label);
    await page.context().close();
  }

  // 2a. Two humans on one device: every seating, several complete hands, privacy checked at every step.
  const FLASH_RECORDER = () => {
    const w = window as unknown as { __flash: string[]; __sb?: { controller: { privacy: boolean; state: { kind: string } } } };
    w.__flash = [];
    new MutationObserver(() => {
      const sb = w.__sb;
      if (!sb || !sb.controller.privacy) return;
      const tiles = document.querySelectorAll('.hand-tile').length;
      const cover = document.querySelector('.privacy-cover:not([hidden])');
      if (tiles && (cover || sb.controller.state.kind !== 'human-turn')) w.__flash.push(`${sb.controller.state.kind}${cover ? '+cover' : ''}:${tiles}`);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  };
  {
    const page = await newPage({ width: 320, height: 800 });
    await enterMenu(page);
    await page.click('[data-go="setup"]');
    await page.check('input[name="mode"][value="partnership4"]');
    await page.check('input[name="opponent"][value="local"]');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0 && (await page.locator('select[name="seating"]').isVisible()), `menu: two-player Partnership setup overflows at 320px (${overflow}px) or hides seating`);
    await page.context().close();
  }
  for (const [mode, seating, vp] of [
    ['draw2', undefined, { width: 390, height: 844 }],
    ['block2', undefined, { width: 1366, height: 900 }],
    ['partnership4', 'across', { width: 390, height: 844 }],
    ['partnership4', 'right', { width: 820, height: 1180 }],
    ['partnership4', 'left', { width: 1366, height: 900 }],
  ] as const) {
    const label = `two-humans-${mode}${seating ? `-${seating}` : ''}`;
    const page = await newPage(vp, 1);
    await page.addInitScript(FLASH_RECORDER);
    await startMatch(page, { mode, opponent: 'local', seed: `e2e-${label}`, aiSeed: `ai-${label}`, fast: true, names: ['Ana', 'Ben'], seating, difficulty: 'normal' });
    const cover = await page.textContent('#cover-title');
    check(/Pass the device to (Ana|Ben)/.test(cover ?? ''), `${label}: match did not open on the privacy cover (${cover})`);
    let hands = 0;
    for (; hands < 2; hands++) {
      await playRound(page, `${label} hand ${hands + 1}`, { privacy: true });
      if (await page.locator('[data-act="new-match"]').count()) break;
      await page.click('[data-act="next-hand"]');
    }
    const names = await page.textContent('.scoreboard');
    check(/Ana/.test(names ?? '') && /Ben/.test(names ?? ''), `${label}: player names missing from scores (${names})`);
    const flashes = await page.evaluate(() => (window as unknown as { __flash: string[] }).__flash);
    check(flashes.length === 0, `${label}: hand flashed while covered or off-turn: ${flashes.slice(0, 5).join(', ')}`);
    notes.push(`${label}: ${hands === 2 ? 2 : hands + 1} complete hands through the cover, 0 flashes — ${names?.replace(/\s+/g, ' ').trim()}`);
    await page.context().close();
  }

  // 2a'. Reload/resume, tab hide, orientation change and pause all come back covered.
  {
    const page = await newPage({ width: 390, height: 844 });
    await page.addInitScript(FLASH_RECORDER);
    await startMatch(page, { mode: 'draw2', opponent: 'local', seed: 'e2e-resume', aiSeed: 'r', names: ['Ana', 'Ben'] });
    await page.click('[data-act="cover-ready"]');
    await page.click('[data-act="cover-reveal"]');
    check((await page.locator('.hand-tile').count()) > 0, 'resume test: hand not revealed after Reveal');
    const tile = page.locator('.hand-tile.is-legal').first();
    await tile.click();
    await page.locator('.end-slot.is-legal').first().click();
    await page.click('[data-act="cover-ready"]');
    await page.click('[data-act="cover-reveal"]'); // Ben is revealed now
    const scenarios: [string, () => Promise<void>][] = [
      [
        'tab hidden',
        // A string script: tsx would inject a __name helper into a serialized function here.
        async () =>
          page.evaluate(`
            Object.defineProperty(document, 'hidden', { configurable: true, get() { return true; } });
            document.dispatchEvent(new Event('visibilitychange'));
            Object.defineProperty(document, 'hidden', { configurable: true, get() { return false; } });
            document.dispatchEvent(new Event('visibilitychange'));
          `),
      ],
      ['orientation change', async () => page.evaluate(() => window.dispatchEvent(new Event('orientationchange')))],
      ['pause sheet opened then resumed', async () => {
        await page.click('[data-act="pause"]');
        await page.click('[data-act="pause-resume"]');
      }],
    ];
    for (const [what, act] of scenarios) {
      await act();
      await page.waitForTimeout(100);
      const covered = await page.locator('.privacy-cover:not([hidden])').count();
      check(covered === 1, `${what}: hand not covered afterwards`);
      await assertCovered(page, what);
      await page.click('[data-act="cover-ready"]');
      await page.click('[data-act="cover-reveal"]');
      notes.push(`privacy: ${what} → covered, re-revealed explicitly`);
    }
    await enterMenu(page, true);
    await page.waitForSelector('[data-act="resume"]');
    const summary = await page.textContent('.resume');
    check(!/t\d\d/.test(summary ?? ''), 'resume summary leaks tile ids');
    await page.click('[data-act="resume"]');
    await page.waitForSelector('.table-screen');
    check((await page.locator('.privacy-cover:not([hidden])').count()) === 1 && (await page.locator('.hand-tile').count()) === 0, 'reload: restored game did not open covered');
    await assertCovered(page, 'restored');
    const flashes = await page.evaluate(() => (window as unknown as { __flash: string[] }).__flash);
    check(flashes.length === 0, `restore: hand flashed during hydration: ${flashes.join(', ')}`);
    notes.push(`privacy: reload → menu "Resume" (${summary?.replace(/\s+/g, ' ').trim().slice(0, 70)}…) → covered, no flash`);
    await page.context().close();
  }

  // 2b. Reset during an AI turn cannot place a ghost tile; pause stops thinking (real delays, not fast AI).
  {
    const page = await newPage({ width: 390, height: 844 });
    await startMatch(page, { mode: 'partnership4', opponent: 'ai', difficulty: 'hard', seed: 'e2e-p4-0', aiSeed: 'ghost' });
    const legal = page.locator('.hand-tile.is-legal');
    await legal.first().click();
    await page.locator('.end-slot.is-legal').first().click();
    await page.waitForTimeout(150); // Cousin (seat 1) is now thinking
    const thinking = await page.evaluate(() => (window as unknown as { __sb: { session: { aiThinking: boolean } } }).__sb.session.aiThinking);
    check(thinking, 'ghost test: expected the AI to be thinking after the human lead');
    await page.click('[data-act="pause"]');
    await page.click('dialog.pause [data-act="restart"]');
    await page.click('[data-act="confirm-yes"]');
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => {
      const s = (window as unknown as { __sb: { session: { debugState(): { seq: number; hand: { line: { tiles: unknown[] }; turn: number } } } } }).__sb.session.debugState();
      return { seq: s.seq, tiles: s.hand.line.tiles.length, turn: s.hand.turn };
    });
    const domTiles = await page.locator('.board-tile').count();
    check(after.seq === 0 && after.tiles === 0 && domTiles === 0 && after.turn === 0, `ghost test: restarted match was touched (${JSON.stringify(after)}, DOM ${domTiles})`);
    notes.push(`ghost test: restart during Cousin's thinking left the new match untouched (seq ${after.seq}, ${domTiles} tiles)`);
    await page.context().close();

    const p2 = await newPage({ width: 390, height: 844 });
    await startMatch(p2, { mode: 'partnership4', opponent: 'ai', difficulty: 'hard', seed: 'e2e-p4-2', aiSeed: 'pause' });
    await p2.click('[data-act="pause"]'); // the pause sheet pauses the table
    await p2.waitForTimeout(2200);
    const whilePaused = await p2.locator('.board-tile').count();
    await p2.click('[data-act="pause-resume"]');
    await p2.waitForTimeout(2200);
    const afterResume = await p2.locator('.board-tile').count();
    check(whilePaused === 0, `pause test: AI moved while paused (${whilePaused} tiles)`);
    check(afterResume === 1, `pause test: expected exactly one AI lead after resuming, saw ${afterResume}`);
    notes.push(`pause test: 0 tiles while the confirmation was open, ${afterResume} after resuming`);
    await p2.context().close();
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
    // Restart and leaving need confirmation (both live in the pause sheet).
    await page.click('[data-act="pause"]');
    check((await page.locator('dialog.pause[open] details').count()) === 2, 'pause: rules and settings missing from the pause sheet');
    await page.click('dialog.pause [data-act="restart"]');
    check(await page.locator('dialog.confirm[open]').count() === 1, 'restart: no confirmation');
    await page.click('[data-act="confirm-no"]');
    check(await page.locator('.board-tile').count() === 3, 'restart: cancel changed the game');
    await page.click('[data-act="pause"]');
    await page.click('dialog.pause [data-act="menu"]');
    await page.click('[data-act="confirm-yes"]');
    check(await page.locator('[data-go="setup"]').count() === 1, 'menu: confirming did not return to the menu');
    await page.context().close();
  }
  // 6. Presentation: opening line & language setting, rules before play, art positions,
  //    effects that never block input or hide scores, reduced motion, slam, rematch, missing art.
  {
    const quipOf = async (page: Page) => ({
      quip: ((await page.locator('.bubble .quip').textContent().catch(() => '')) ?? '').trim(),
      announce: ((await page.textContent('[data-region="announce"]')) ?? '').trim(),
    });
    // 6a. Opening line, explicit (default) then clean, then banter off.
    const page = await newPage({ width: 390, height: 844 });
    await startMatch(page, { mode: 'draw2', opponent: 'ai', seed: 'e2e-open', aiSeed: 'o' });
    let q = await quipOf(page);
    check(q.quip === 'Fuck that, we playing DOMINOES!', `opening line (explicit) was "${q.quip}"`);
    await enterMenu(page);
    await page.click('[data-go="settings"]');
    await page.check('input[name="set-language"][value="clean"]');
    await page.click('[data-act="home"]');
    await startMatch(page, { mode: 'draw2', opponent: 'ai', seed: 'e2e-open', aiSeed: 'o' });
    q = await quipOf(page);
    check(q.quip === 'Forget that, we playing DOMINOES!', `opening line (clean) was "${q.quip}"`);
    check(q.announce.startsWith(q.quip), `subtitle/live region differ: "${q.announce}" vs "${q.quip}"`);
    notes.push(`opening line: explicit and clean variants shown; live region matches the bubble`);
    // Banter off from the pause sheet: Cousin goes quiet, facts stay.
    await page.click('[data-act="pause"]');
    await page.locator('dialog.pause details').nth(1).locator('summary').click();
    await page.uncheck('dialog.pause input[name="set-banter"]');
    await page.click('[data-act="pause-resume"]');
    for (let i = 0; i < 6; i++) {
      const legal = page.locator('.hand-tile.is-legal');
      if (await legal.count()) {
        await legal.first().click();
        await page.locator('.end-slot.is-legal').first().click();
      }
      await page.waitForTimeout(900);
    }
    q = await quipOf(page);
    const fact = ((await page.textContent('.bubble .fact')) ?? '').trim();
    check(q.quip === '' && fact.length > 0, `banter off still shows a quip ("${q.quip}") or lost the fact`);
    await page.context().close();

    // 6b. Rules are visible on the setup screen before dealing, and follow the selected mode.
    const p2 = await newPage({ width: 390, height: 844 });
    await enterMenu(p2);
    await p2.click('[data-go="setup"]');
    const drawRules = (await p2.textContent('.rules-preview')) ?? '';
    await p2.check('input[name="mode"][value="partnership4"]');
    const p4Rules = (await p2.textContent('.rules-preview')) ?? '';
    check(/boneyard/.test(drawRules) && /6\|6/.test(p4Rules) && /two teams/.test(p4Rules), 'setup: mode rules not shown/updated before play');
    const box = await p2.locator('.rules-preview').boundingBox();
    const start = await p2.locator('.btn-start').boundingBox();
    check(!!box && !!start && box.y < start.y, 'setup: rules should appear above the Deal button');
    notes.push('rules: selected mode’s rules shown on setup before dealing (Draw → Partnership updates)');
    await p2.context().close();

    // 6c. Art positions: every rendered Cousin frame uses its stable stage box (no crop, no neighbours).
    const stage = stageFor(getAsset('cousin.atlas.portrait'));
    const slamStage = stageFor(getAsset('cousin.anim.slam'));
    const expected = (frame: string, variant: string) => {
      const [sheet, id] = frame.split('/') as [string, string];
      const b = sheet === 'cousin.anim.slam' ? slamStage.boxes[id]! : variant === 'bust' ? bustBox(stage, id) : stage.boxes[id]!;
      return `${b.x} ${b.y} ${b.w} ${b.h}`;
    };
    for (const vp of [
      { width: 390, height: 844, variant: 'bust' },
      { width: 1366, height: 900, variant: 'full' },
    ]) {
      const p3 = await newPage(vp, 1);
      await p3.addInitScript(() => {
        const w = window as unknown as { __frames: string[]; __fx: number };
        w.__frames = [];
        w.__fx = 0;
        new MutationObserver((ms) => {
          for (const m of ms) {
            const t = m.target as Element;
            if (m.type === 'attributes' && t instanceof SVGSVGElement && t.dataset.frame) w.__frames.push(`${t.dataset.frame}|${t.getAttribute('viewBox')}`);
            m.addedNodes.forEach((n) => {
              if (n instanceof HTMLElement && n.classList.contains('fx')) w.__fx++;
            });
          }
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['viewBox', 'data-frame'], childList: true });
      });
      await startMatch(p3, { fixture: 'max-board' });
      await p3.waitForTimeout(300);
      // Effects never cover the playable ends or swallow input; scores stay on top.
      await p3.click('.hand-tile[data-tile="t66"]');
      const slotsTopmost = await p3.evaluate(() =>
        [...document.querySelectorAll('.end-slot.is-legal')].every((el) => {
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return hit === el || el.contains(hit);
        }),
      );
      check(slotsTopmost, `${vp.variant}: something covers a playable end`);
      await p3.locator('.end-slot.is-legal').first().click();
      await p3.waitForTimeout(60); // effects are mid-flight now
      const during = await p3.evaluate(() => {
        const fx = [...document.querySelectorAll('.fx')];
        const sb = document.querySelector('.scoreboard')!.getBoundingClientRect();
        const hit = document.elementFromPoint(sb.left + sb.width / 2, sb.top + sb.height / 2);
        return { fx: fx.length, blocking: fx.filter((e) => getComputedStyle(e).pointerEvents !== 'none').length, scoresOnTop: !!hit && !!hit.closest('.scoreboard') };
      });
      check(during.blocking === 0, `${vp.variant}: an effect accepts pointer input`);
      check(during.scoresOnTop, `${vp.variant}: scores hidden during effects`);
      await p3.waitForSelector('dialog.results[open]', { timeout: 6000 });
      await p3.waitForTimeout(900);
      const frames: string[] = await p3.evaluate(() => (window as unknown as { __frames: string[] }).__frames);
      const bad = frames.filter((f) => {
        const [frame, vb] = f.split('|') as [string, string];
        return expected(frame, vp.variant) !== vb;
      });
      check(bad.length === 0, `${vp.variant}: frames off their stage boxes: ${bad.slice(0, 3).join(', ')}`);
      const slammed = frames.some((f) => f.startsWith('cousin.anim.slam/slam'));
      if (vp.variant === 'full') check(slammed, 'desktop: domino did not trigger the slam');
      const fxCount = await p3.evaluate(() => (window as unknown as { __fx: number }).__fx);
      notes.push(`${vp.variant}: ${frames.length} host frame swaps all on stage boxes${slammed ? ', slam played' : ''}; ${fxCount} effects, none blocking input or scores`);
      // Results: larger art, tally, and (after match point) rematch.
      check((await p3.locator('dialog.results .results-host svg').count()) === 1, `${vp.variant}: results lack Cousin art`);
      await p3.context().close();
    }

    // 6d. Reduced motion: no effects, no slam, static art; controls unchanged.
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    const p4 = await ctx.newPage();
    p4.on('pageerror', (e: { message: string }) => failures.push(`page error: ${e.message}`));
    await p4.addInitScript(() => {
      const w = window as unknown as { __fx: number; __slam: number };
      w.__fx = 0;
      w.__slam = 0;
      new MutationObserver((ms) => {
        for (const m of ms) {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement && n.classList.contains('fx')) w.__fx++;
          });
          const t = m.target as Element;
          if (m.type === 'attributes' && t instanceof SVGSVGElement && (t.dataset.frame ?? '').startsWith('cousin.anim.slam')) w.__slam++;
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-frame'] });
    });
    await startMatch(p4, { fixture: 'match-point' });
    const rm = await p4.evaluate(() => document.getElementById('app')!.classList.contains('reduce-motion'));
    await p4.click('.hand-tile[data-tile="t61"]');
    await p4.locator('.end-slot.is-legal').first().click();
    await p4.waitForSelector('dialog.results[open]', { timeout: 6000 });
    const motion = await p4.evaluate(() => ({ fx: (window as unknown as { __fx: number }).__fx, slam: (window as unknown as { __slam: number }).__slam }));
    check(rm && motion.fx === 0 && motion.slam === 0, `reduced motion: effects ${motion.fx}, slam frames ${motion.slam}, class ${rm}`);
    // Match over → Rematch starts a fresh match.
    const matchLine = await p4.textContent('.match-line');
    check(/wins the match/.test(matchLine ?? ''), `match point: no match result (${matchLine})`);
    const tally = await p4.textContent('.tally');
    check(tally === '115' || tally === '115', `reduced motion: tally should show the final score immediately (${tally})`);
    await p4.click('[data-act="new-match"]');
    await p4.waitForTimeout(400);
    const meta = await p4.textContent('.score-meta');
    check(/Hand 1/.test(meta ?? '') && !(await p4.locator('dialog.results[open]').count()), `rematch did not start a fresh match (${meta})`);
    notes.push('reduced motion: 0 effects, no slam, tally instant; match point → match result → Rematch → Hand 1');
    await ctx.close();

    // 6e. Optional art missing: everything still renders and plays with code-drawn fallbacks.
    const p5 = await newPage({ width: 390, height: 844 }, 1, { blockedImages: true });
    await p5.route('**/*.png', (r: { abort(): Promise<void> }) => r.abort());
    await startMatch(p5, { mode: 'block2', opponent: 'ai', seed: 'e2e-noart', aiSeed: 'n', fast: true });
    for (let i = 0; i < 4; i++) {
      const legal = p5.locator('.hand-tile.is-legal');
      if (await legal.count()) {
        await legal.first().click();
        await p5.locator('.end-slot.is-legal').first().click();
      }
      await p5.waitForTimeout(300);
    }
    const fb = await p5.evaluate(() => ({
      tiles: document.querySelectorAll('.board-tile').length,
      svgFaces: document.querySelectorAll('.board-tile .face-svg').length,
      fallback: (() => {
        const f = document.querySelector('.host-avatar .host-fallback');
        return !!f && getComputedStyle(f).display !== 'none';
      })(),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    check(fb.tiles > 0 && fb.svgFaces === fb.tiles && fb.fallback && fb.overflow <= 0, `missing art: fallbacks failed ${JSON.stringify(fb)}`);
    notes.push(`missing art: ${fb.tiles} board tiles drawn as vector faces, host monogram shown, no overflow`);
    await p5.context().close();
  }

  // 7. Start → studio intro → fade through black → menu, and the audio manager.
  {
    // A tiny test credit (VP9/Opus WebM: plays in open-source Chromium). Generated, never committed.
    const fixture = join(outDir, 'e2e-intro.webm');
    let haveVideo = existsSync(fixture);
    if (!haveVideo) {
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=2.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.5', '-c:v', 'libvpx-vp9', '-b:v', '200k', '-c:a', 'libopus', '-shortest', fixture]);
        haveVideo = true;
      } catch {
        notes.push('intro video tests skipped: ffmpeg not available to build the fixture');
      }
    }
    const INSTRUMENT = () => {
      const w = window as unknown as { __rej: string[]; __maxMedia: number; __menus: number; __sbAudio?: { backend: { playingCount(): number } } };
      w.__rej = [];
      w.__maxMedia = 0;
      w.__menus = 0;
      addEventListener('unhandledrejection', (e) => w.__rej.push(String((e as PromiseRejectionEvent).reason)));
      setInterval(() => {
        const vids = [...document.querySelectorAll('video')].filter((v) => !v.paused && !v.muted).length;
        w.__maxMedia = Math.max(w.__maxMedia, vids + (w.__sbAudio?.backend.playingCount() ?? 0));
      }, 25);
      new MutationObserver((ms) => {
        for (const m of ms) m.addedNodes.forEach((n) => n instanceof HTMLElement && n.matches('.scene') && w.__menus++);
      }).observe(document, { subtree: true, childList: true });
    };
    const probe = (page: Page) =>
      page.evaluate(() => {
        const w = window as unknown as { __rej: string[]; __maxMedia: number; __menus: number; __sbAudio: { audio: { scene: string; playing: string | null; unlocked: boolean; levels: { muted: boolean }; activeSfx(): number }; backend: { playingCount(): number } } };
        return { rej: w.__rej, maxMedia: w.__maxMedia, menus: w.__menus, scene: w.__sbAudio.audio.scene, playing: w.__sbAudio.audio.playing, count: w.__sbAudio.backend.playingCount(), muted: w.__sbAudio.audio.levels.muted, sfx: w.__sbAudio.audio.activeSfx(), unlocked: w.__sbAudio.audio.unlocked };
      });
    const intro = async (route: 'ok' | '404' | 'hang' | 'none' | 'reject', vp = { width: 390, height: 844 }, mobile = false) => {
      const ctx = await browser.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
      const page = await ctx.newPage();
      page.on('pageerror', (e: { message: string }) => failures.push(`page error: ${e.message}`));
      page.on('console', (m: Ctx) => {
        if (m.type() === 'error' && !(route !== 'ok' && /Failed to load resource|404/.test(m.text()))) failures.push(`console error: ${m.text()}`);
      });
      await page.addInitScript(INSTRUMENT);
      if (route !== 'none') await page.addInitScript(() => ((window as unknown as { __sbIntroVideo: string }).__sbIntroVideo = './e2e-intro.webm'));
      // Simulate the browser refusing to play the credit (autoplay policy); music elements keep the real play().
      if (route === 'reject')
        await page.addInitScript(
          `(() => { const orig = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { return this instanceof HTMLVideoElement ? Promise.reject(new DOMException('blocked', 'NotAllowedError')) : orig.call(this); }; })();`,
        );
      await page.route('**/e2e-intro.webm', async (r: { fulfill(o: unknown): Promise<void>; abort(): Promise<void> }) => {
        if (route === 'ok' || route === 'reject') return r.fulfill({ status: 200, contentType: 'video/webm', body: readFileSync(fixture) });
        if (route === '404') return r.fulfill({ status: 404, body: '' });
        /* hang: never answer */
      });
      await page.goto(BASE);
      await page.waitForSelector('.start-button');
      return { ctx, page };
    };

    // 7a. No intro video supplied (the repository today): start → black → menu once; music only after the gesture.
    {
      const { ctx, page } = await intro('none');
      const before = await probe(page);
      check(before.count === 0 && !before.unlocked && before.scene === 'init', `before the gesture audio must be silent and locked (${JSON.stringify(before)})`);
      await page.click('.start-button');
      await page.click('.start-button', { force: true }).catch(() => {}); // double-click
      await page.waitForSelector('[data-go="setup"]');
      await page.waitForTimeout(2000);
      const after = await probe(page);
      check(after.menus === 1 && after.scene === 'menu' && after.playing === 'menu' && after.count === 1 && after.rej.length === 0, `missing video → menu: ${JSON.stringify(after)}`);
      // Background/foreground: silence, then resume only the menu scene.
      await page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get() { return true; } }); document.dispatchEvent(new Event('visibilitychange'));`);
      await page.waitForTimeout(200);
      const hidden = await probe(page);
      await page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get() { return false; } }); document.dispatchEvent(new Event('visibilitychange'));`);
      await page.waitForTimeout(1500);
      const back = await probe(page);
      check(hidden.count === 0 && back.playing === 'menu' && back.count === 1, `background/foreground: hidden ${hidden.count}, back ${back.playing}/${back.count}`);
      // Reload: back to the start screen, silent until a new gesture.
      await page.reload();
      await page.waitForSelector('.start-button');
      const reloaded = await probe(page);
      check(reloaded.count === 0 && reloaded.scene === 'init', 'reload: audio playing before the start gesture');
      notes.push(`intro (no video): one menu mount, music after the gesture only, background → silent → menu resumed, reload silent until tapped`);
      await ctx.close();
    }

    if (haveVideo) {
      // 7b. Video plays to the end: no overlap between the credit's audio and menu music.
      {
        const { ctx, page } = await intro('ok');
        await page.click('.start-button');
        await page.waitForSelector('video');
        const sceneDuring = await probe(page);
        check(sceneDuring.scene === 'intro' && sceneDuring.count === 0, `during the credit menu music must be silent (${JSON.stringify(sceneDuring)})`);
        await page.waitForSelector('[data-go="setup"]', { timeout: 15000 });
        await page.waitForTimeout(2200);
        const r = await probe(page);
        check(r.menus === 1 && r.maxMedia <= 1 && r.playing === 'menu' && r.rej.length === 0, `video ended → menu: ${JSON.stringify(r)}`);
        check((await page.locator('video').count()) === 0, 'intro video element left behind');
        notes.push(`intro (video, played out): menu once, max concurrent media sources ${r.maxMedia}`);
        await ctx.close();
      }
      // 7c. Rapid start + double Skip, and mute during the intro.
      {
        const { ctx, page } = await intro('ok');
        await page.dblclick('.start-button');
        await page.waitForSelector('[data-act="intro-skip"]');
        await page.click('[data-act="intro-mute"]');
        await page.click('[data-act="intro-skip"]');
        await page.click('[data-act="intro-skip"]', { timeout: 500 }).catch(() => {});
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-go="setup"]');
        await page.waitForTimeout(3500); // past the clip's natural end: no stale 'ended' may act
        const r = await probe(page);
        check(r.menus === 1 && r.muted && r.maxMedia <= 1 && r.rej.length === 0, `rapid skip + mute: ${JSON.stringify(r)}`);
        notes.push(`intro: double-click start, mute, double Skip + Escape → one menu, mute kept (${r.muted}), no stale callbacks`);
        await ctx.close();
      }
      // 7d. Error, stall and autoplay refusal each enter the menu exactly once.
      for (const route of ['404', 'reject', 'hang'] as const) {
        const { ctx, page } = await intro(route);
        await page.click('.start-button');
        await page.waitForSelector('[data-go="setup"]', { timeout: 15000 });
        await page.waitForTimeout(800);
        const r = await probe(page);
        check(r.menus === 1 && r.rej.length === 0, `intro ${route}: ${JSON.stringify(r)}`);
        notes.push(`intro ${route}: menu entered once`);
        await ctx.close();
      }
      // 7e. Clean start on a mobile-emulated browser (touch).
      {
        const { ctx, page } = await intro('ok', { width: 390, height: 844 }, true);
        await page.tap('.start-button');
        await page.waitForSelector('[data-act="intro-skip"]');
        await page.tap('[data-act="intro-skip"]');
        await page.waitForSelector('[data-go="setup"]');
        await page.waitForTimeout(1500);
        const r = await probe(page);
        check(r.menus === 1 && r.unlocked && r.rej.length === 0, `mobile tap start: ${JSON.stringify(r)}`);
        notes.push('mobile emulation: tap to start → Skip → menu, audio unlocked');
        await ctx.close();
      }
    }

    // 7f. Gameplay: one music source through results and rematch; reset cuts sounds.
    {
      const page = await newPage({ width: 1366, height: 900 });
      await page.addInitScript(INSTRUMENT);
      await startMatch(page, { fixture: 'match-point' });
      await page.waitForTimeout(1500);
      let r = await probe(page);
      check(r.scene === 'gameplay' && r.count <= 1, `gameplay scene: ${JSON.stringify(r)}`);
      await page.click('.hand-tile[data-tile="t61"]');
      await page.locator('.end-slot.is-legal').first().click();
      await page.waitForSelector('dialog.results[open]', { timeout: 6000 });
      r = await probe(page);
      check(r.scene === 'results', `results scene: ${r.scene}`);
      await page.click('[data-act="new-match"]');
      await page.waitForTimeout(1500);
      r = await probe(page);
      check(r.scene === 'gameplay' && r.count <= 1 && r.maxMedia <= 1, `rematch: ${JSON.stringify(r)}`);
      // Reset during sounds: play, then restart immediately.
      const legal = page.locator('.hand-tile.is-legal');
      if (await legal.count()) {
        await legal.first().click();
        await page.locator('.end-slot.is-legal').first().click();
      }
      await page.click('[data-act="pause"]');
      r = await probe(page);
      check(r.scene === 'paused', `pause scene: ${r.scene}`);
      await page.click('dialog.pause [data-act="restart"]');
      await page.click('[data-act="confirm-yes"]');
      await page.waitForTimeout(300);
      r = await probe(page);
      check(r.sfx === 0 && r.count <= 1 && r.maxMedia <= 1 && r.rej.length === 0, `reset during sounds: ${JSON.stringify(r)}`);
      notes.push(`audio in play: gameplay → results → rematch → paused → restart; max concurrent music ${r.maxMedia}, SFX cut on reset`);
      await page.context().close();
    }
  }

  // 8. Versioned saves, recovery, statistics, results arithmetic, actions in every state, no dead buttons.
  {
    type DebugState = { seq: number; scores: number[]; phase: string; hand: { number: number; turn: number } };
    const dbg = (page: Page) =>
      page.evaluate(() => {
        const sb = (window as unknown as { __sb?: { session: { debugState(): unknown; stats: { aiDecisions: number; staleDiscarded: number }; aiThinking: boolean }; matchId: string } }).__sb!;
        return { state: JSON.stringify(sb.session.debugState()), stats: sb.session.stats, thinking: sb.session.aiThinking, matchId: sb.matchId };
      });
    const savedState = (page: Page) => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('sticks-and-bones.save') ?? 'null')?.data?.state ?? null));

    // 8a. Refresh during a human turn: Resume reproduces the exact state and scores.
    {
      const page = await newPage({ width: 390, height: 844 });
      await startMatch(page, { mode: 'draw2', opponent: 'ai', seed: 'e2e-resume-exact', aiSeed: 'r', fast: true });
      for (let i = 0; i < 3; i++) {
        const legal = page.locator('.hand-tile.is-legal');
        if (await legal.count()) {
          await tryClick(legal.first());
          await tryClick(page.locator('.end-slot.is-legal').first());
        } else if (await page.locator('[data-act="draw"]:not([disabled])').count()) await tryClick(page.locator('[data-act="draw"]'));
        await page.waitForTimeout(600);
      }
      await page.waitForFunction(() => {
        const sb = (window as unknown as { __sb: { controller: { canAct(): boolean } } }).__sb;
        return sb.controller.canAct();
      });
      const before = await dbg(page);
      await enterMenu(page, true);
      await page.click('[data-act="resume"]');
      await page.waitForSelector('.table-screen');
      await page.waitForTimeout(400);
      const after = await dbg(page);
      check(after.state === before.state && after.matchId === before.matchId, 'resume: restored state differs from the state before the refresh');
      const st = JSON.parse(after.state) as DebugState;
      notes.push(`resume (human turn): identical state after refresh — seq ${st.seq}, scores ${st.scores.join('–')}, hand ${st.hand.number}`);
      await page.context().close();
    }

    // 8b. Refresh during AI thinking: no stale pending move; the AI moves exactly once afresh.
    {
      const page = await newPage({ width: 390, height: 844 });
      await startMatch(page, { mode: 'partnership4', opponent: 'ai', difficulty: 'hard', seed: 'e2e-p4-0', aiSeed: 'reload-ai' });
      await tryClick(page.locator('.hand-tile.is-legal').first());
      await tryClick(page.locator('.end-slot.is-legal').first());
      await page.waitForTimeout(120);
      const mid = await dbg(page);
      check(mid.thinking, 'reload-during-AI: the AI should be thinking');
      const saved = await savedState(page);
      await enterMenu(page, true);
      await page.click('[data-act="resume"]');
      await page.waitForSelector('.table-screen');
      const restored = await dbg(page);
      check(restored.state === saved, 'reload-during-AI: restored state differs from the saved state');
      await page.waitForTimeout(2600);
      const later = await dbg(page);
      const seq0 = (JSON.parse(saved) as DebugState).seq;
      const seq1 = (JSON.parse(later.state) as DebugState).seq;
      check(later.stats.staleDiscarded === 0 && later.stats.aiDecisions >= 1 && seq1 >= seq0 + 1, `reload-during-AI: ${JSON.stringify({ seq0, seq1, stats: later.stats })}`);
      notes.push(`resume (AI thinking): restored = saved, then ${later.stats.aiDecisions} fresh AI decision(s), 0 stale`);
      // Leave during AI thinking, resume, and keep going.
      await page.click('[data-act="pause"]');
      await page.click('dialog.pause [data-act="menu"]');
      await page.click('[data-act="confirm-yes"]');
      await page.waitForSelector('[data-act="resume"]');
      await page.click('[data-act="resume"]');
      await page.waitForSelector('.table-screen');
      await page.context().close();
    }

    // 8c. Damaged save and settings: menu explains, nothing crashes, bad data is set aside.
    {
      const page = await newPage({ width: 390, height: 844 });
      await page.goto(BASE);
      await page.evaluate(() => {
        localStorage.setItem('sticks-and-bones.save', '{"format":"sticks-and-bones/match","version":2,"data":{"matchId":"x"');
        localStorage.setItem('sticks-and-bones.settings', 'not json at all');
      });
      await enterMenu(page, true);
      const notice = (await page.textContent('.notice').catch(() => '')) ?? '';
      const q = await page.evaluate(() => [localStorage.getItem('sticks-and-bones.save.quarantine') !== null, localStorage.getItem('sticks-and-bones.save')]);
      check(/saved game couldn’t be read/.test(notice) && /settings couldn’t be read/.test(notice), `corrupt data: notice was "${notice}"`);
      check(q[0] === true && q[1] === null && (await page.locator('[data-act="resume"]').count()) === 0, 'corrupt save: not set aside / Resume still offered');
      notes.push('recovery: damaged save + settings → menu notice, save quarantined, defaults in use');
      await page.context().close();
    }

    // 8d. Statistics: win counted once, persisted; abandoned ≠ loss; leaving keeps the save (not abandoned).
    {
      const page = await newPage({ width: 1366, height: 900 });
      await page.goto(BASE);
      await page.evaluate(() => localStorage.clear());
      await startMatch(page, { fixture: 'match-point-solo' });
      await page.click('.hand-tile[data-tile="t61"]');
      await page.locator('.end-slot.is-legal').first().click();
      await page.waitForSelector('dialog.results[open] .match-line', { timeout: 6000 });
      const how = (await page.textContent('dialog.results .how')) ?? '';
      check(/Opponent’s pips|Every pip left/.test(how) && /= 20/.test(how), `results arithmetic missing: "${how}"`);
      const mathLine = (await page.locator('dialog.results .math-line').allTextContents()).join(' | ');
      check(/5\|5 \(10\) \+ 4\|4 \(8\) \+ 2\|0 \(2\) = 20/.test(mathLine), `hand arithmetic: ${mathLine}`);
      await page.click('[data-act="menu-now"]');
      await page.click('[data-go="stats"]');
      let stat = (await page.textContent('.stat-line')) ?? '';
      check(/1\s*completed/.test(stat) && /1\s*won/.test(stat), `stats after a win: ${stat}`);
      await enterMenu(page, true);
      await page.click('[data-go="stats"]');
      stat = (await page.textContent('.stat-line')) ?? '';
      check(/1\s*completed/.test(stat), `stats not persisted across reload: ${stat}`);
      // Start a match, leave it (kept), then start another → the first becomes abandoned, not lost.
      await startMatch(page, { mode: 'block2', opponent: 'ai', seed: 'e2e-abandon', aiSeed: 'a', fast: true });
      await page.click('[data-act="pause"]');
      await page.click('dialog.pause [data-act="menu"]');
      await page.click('[data-act="confirm-yes"]');
      await page.click('[data-go="stats"]');
      stat = (await page.textContent('.stat-line')) ?? '';
      check(/0\s*abandoned/.test(stat), `leaving to menu must not count as abandoned: ${stat}`);
      await startMatch(page, { mode: 'draw2', opponent: 'ai', seed: 'e2e-abandon-2', aiSeed: 'a', fast: true });
      await page.click('[data-act="pause"]');
      await page.click('dialog.pause [data-act="restart"]');
      await page.click('[data-act="confirm-yes"]');
      await page.waitForTimeout(300);
      await page.click('[data-act="pause"]');
      await page.click('dialog.pause [data-act="menu"]');
      await page.click('[data-act="confirm-yes"]');
      await page.click('[data-go="stats"]');
      stat = (await page.textContent('.stat-line')) ?? '';
      check(/2\s*abandoned/.test(stat) && /0\s*lost/.test(stat), `abandoned vs lost: ${stat}`);
      notes.push(`statistics: ${stat.replace(/\s+/g, ' ').trim()}`);
      // Discard (Stage 7 regression): returns to the menu with a notice, not the start screen.
      await page.click('[data-act="home"]');
      await page.click('[data-act="discard"]');
      await page.waitForTimeout(200);
      check((await page.locator('[data-go="setup"]').count()) === 1 && (await page.locator('.start-button').count()) === 0, 'discard: did not return to the menu');
      check(/Saved game discarded/.test((await page.textContent('.notice').catch(() => '')) ?? ''), 'discard: no feedback');
      await page.click('[data-go="stats"]');
      stat = (await page.textContent('.stat-line')) ?? '';
      check(/3\s*abandoned/.test(stat), `discard should count as abandoned: ${stat}`);
      await page.context().close();
    }

    // 8e. Leave and resume during results and during a two-player handoff.
    {
      const page = await newPage({ width: 390, height: 844 });
      await startMatch(page, { mode: 'draw2', opponent: 'local', seed: 'e2e-handoff-resume', aiSeed: 'h', names: ['Ana', 'Ben'] });
      await page.waitForSelector('[data-act="cover-menu"]');
      await page.click('[data-act="cover-menu"]');
      await page.waitForSelector('[data-act="resume"]');
      await page.click('[data-act="resume"]');
      await page.waitForSelector('.privacy-cover:not([hidden])');
      check((await page.locator('.hand-tile').count()) === 0, 'handoff resume: a hand is visible before Reveal');
      await playRound(page, 'resume-results', { privacy: true });
      await enterMenu(page, true); // refresh with the results sheet up
      await page.click('[data-act="resume"]');
      await page.waitForSelector('dialog.results[open]');
      const before = await page.evaluate(() => (window as unknown as { __sb: { session: { debugState(): { scores: number[]; history: unknown[] } } } }).__sb.session.debugState());
      await page.click('[data-act="next-hand"]');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => (window as unknown as { __sb: { session: { debugState(): { scores: number[]; history: unknown[]; hand: { number: number } } } } }).__sb.session.debugState());
      check(JSON.stringify(after.scores) === JSON.stringify(before.scores) && after.history.length === before.history.length && after.hand.number === 2, `results resume scored twice or stalled: ${JSON.stringify({ before: before.scores, after: after.scores })}`);
      notes.push('leave/resume during handoff (covered) and results (no double score, Next hand works)');
      await page.context().close();
    }

    // 8f. No dead buttons: every enabled button on each menu screen and in the pause sheet does something visible.
    {
      const page = await newPage({ width: 390, height: 844 });
      const sweep = async (screen: string, setup: () => Promise<void>) => {
        await setup();
        const labels: string[] = await page.$$eval('button:not([disabled])', (bs: HTMLButtonElement[]) => bs.filter((b) => b.offsetParent !== null).map((b) => b.dataset.act ?? b.dataset.go ?? b.dataset.fixture ?? b.textContent ?? ''));
        for (const label of labels) {
          await setup();
          const sel = `button[data-act="${label}"], button[data-go="${label}"]`;
          if (!(await page.locator(sel).count())) continue; // not addressable by data attribute (e.g. form submit)
          const sig = () => page.evaluate(() => `${document.querySelector('#app')!.innerHTML.length}|${document.querySelectorAll('dialog[open]').length}|${(document.activeElement as HTMLElement | null)?.outerHTML.slice(0, 60)}|${document.body.textContent?.length}`);
          const s0 = await sig();
          await tryClick(page.locator(sel).first());
          await page.waitForTimeout(150);
          const s1 = await sig();
          check(s0 !== s1, `dead button on ${screen}: ${label}`);
        }
        return labels.length;
      };
      const home = async () => {
        await enterMenu(page);
      };
      const n1 = await sweep('home', home);
      const n2 = await sweep('stats', async () => {
        await enterMenu(page);
        await page.click('[data-go="stats"]');
      });
      const n3 = await sweep('rules', async () => {
        await enterMenu(page);
        await page.click('[data-go="rules"]');
      });
      const n4 = await sweep('pause sheet', async () => {
        await startMatch(page, { mode: 'block2', opponent: 'ai', seed: 'e2e-sweep', aiSeed: 's' });
        await page.click('[data-act="pause"]');
      });
      notes.push(`no dead buttons: ${n1 + n2 + n3 + n4} buttons across home, stats, rules and the pause sheet each produced a visible change`);
      await page.context().close();
    }
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
