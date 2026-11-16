/**
 * npm run matches — play COMPLETE matches (to the preset's target score) in every
 * supported arrangement on the dev server (fast AI timing, real UI clicks):
 *   vs the computer: Draw (easy), Block (normal), Partnership (hard)
 *   two humans:      Draw, Block, Partnership with the second human across / right / left
 * For each: the console stays clean (no errors, no page errors) and the analytics
 * recorder (dev-only; the real adapter is disabled) shows exactly one fresh
 * match_start, one round_end per hand, one match_end, nothing secret.
 * Also: a mid-match reload → Resume is labelled match_resume (no new start),
 * Rematch is labelled "rematch", and a double-tapped "Deal the tiles" starts once.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

type Page = import('playwright').Page;
type Ev = { name: string; [k: string]: unknown };
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/matches');
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

const server = await createServer({ root, logLevel: 'error', server: { port: 5193, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5193/';
const browser = await chromium.launch();

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await ctx.addInitScript('window.__name = (f) => f;');
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m: { type(): string; text(): string }) => (m.type() === 'error' || m.type() === 'warning') && consoleErrors.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e: Error) => consoleErrors.push(`pageerror: ${e.message}`));
  return { page, consoleErrors };
}
async function enterMenu(page: Page, reload = false) {
  if (reload) await page.reload();
  else await page.goto(BASE);
  await page.click('.start-button');
  const skip = page.locator('[data-act="intro-skip"]');
  if (await skip.count()) await skip.click().catch(() => undefined);
  await page.waitForSelector('[data-go="setup"]');
}
async function setup(page: Page, o: { mode: string; opponent: 'ai' | 'local'; difficulty?: string; seating?: string; seed: string; dbl?: boolean }) {
  await page.click('[data-go="setup"]');
  await page.locator('details.dev-panel summary').click();
  await page.fill('input[name="seed"]', o.seed);
  await page.fill('input[name="aiSeed"]', `${o.seed}-ai`);
  await page.check('input[name="fastAi"]');
  await page.check(`input[name="mode"][value="${o.mode}"]`);
  await page.check(`input[name="opponent"][value="${o.opponent}"]`);
  if (o.difficulty && (await page.locator(`input[name="difficulty"][value="${o.difficulty}"]`).isVisible())) await page.check(`input[name="difficulty"][value="${o.difficulty}"]`);
  if (o.seating) await page.selectOption('select[name="seating"]', o.seating);
  if (o.dbl) await page.locator('.btn-start').dblclick();
  else await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __sbAnalytics: Ev[] }).__sbAnalytics.slice()) as Promise<Ev[]>;
const tryClick = async (page: Page, sel: string) => {
  const l = page.locator(sel);
  if (!(await l.count())) return false;
  return l.first().click({ timeout: 2000 }).then(() => true, () => false);
};

/** Play until the match is over (Rematch visible) or `stopAfterHands` hands are resolved. */
async function playMatch(page: Page, label: string, stopAfterHands = Infinity, budgetMs = 600_000): Promise<number> {
  const until = Date.now() + budgetMs;
  let hands = 0;
  while (Date.now() < until) {
    if (await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false)) {
      hands++;
      if (await page.locator('dialog.results [data-act="new-match"]').count()) return hands;
      if (hands >= stopAfterHands) return hands;
      await tryClick(page, 'dialog.results [data-act="next-hand"]');
      await page.waitForTimeout(150);
      continue;
    }
    if ((await tryClick(page, '[data-act="cover-ready"]')) || (await tryClick(page, '[data-act="cover-reveal"]'))) continue;
    if (await page.locator('.hand-tile.is-legal').count()) {
      await tryClick(page, '.hand-tile.is-legal');
      await tryClick(page, '.end-slot.is-legal');
      continue;
    }
    if ((await tryClick(page, '[data-act="draw"]:not([disabled])')) || (await tryClick(page, '[data-act="pass"]:not([disabled])'))) continue;
    await page.waitForTimeout(60);
  }
  failures.push(`${label}: match did not finish within ${budgetMs / 1000}s (${hands} hands)`);
  return hands;
}
const SECRET = /"t[0-6]{2}"|\d\|\d|seed|Ana|Ben|hands"|history|stock/;

const ARRANGEMENTS = [
  { label: 'Draw vs computer (easy)', mode: 'draw2', opponent: 'ai', difficulty: 'easy' },
  { label: 'Block vs computer (normal)', mode: 'block2', opponent: 'ai', difficulty: 'normal' },
  { label: 'Partnership vs computers (hard)', mode: 'partnership4', opponent: 'ai', difficulty: 'hard' },
  { label: 'Draw, two humans', mode: 'draw2', opponent: 'local' },
  { label: 'Block, two humans', mode: 'block2', opponent: 'local' },
  { label: 'Partnership, two humans as partners (across)', mode: 'partnership4', opponent: 'local', seating: 'across' },
  { label: 'Partnership, two humans as opponents (right)', mode: 'partnership4', opponent: 'local', seating: 'right' },
  { label: 'Partnership, two humans as opponents (left)', mode: 'partnership4', opponent: 'local', seating: 'left' },
] as const;

try {
  for (const [i, a] of ARRANGEMENTS.entries()) {
    const { page, consoleErrors } = await newPage();
    await enterMenu(page);
    const t0 = Date.now();
    await setup(page, { mode: a.mode, opponent: a.opponent, difficulty: 'difficulty' in a ? a.difficulty : undefined, seating: 'seating' in a ? a.seating : undefined, seed: `match-${i}`, dbl: i === 0 });
    let resumed = false;
    let hands = 0;
    if (i === 0) {
      // Mid-match reload → Resume: labelled as a resume, never a second start.
      hands += await playMatch(page, a.label, 1);
      const before = await events(page);
      await enterMenu(page, true);
      await page.click('[data-act="resume"]');
      await page.waitForSelector('.table-screen');
      const after = await events(page);
      check(after.some((e) => e.name === 'match_resume') && !after.some((e) => e.name === 'match_start'), `${a.label}: resume not labelled as match_resume (${JSON.stringify(after)})`);
      check(before.filter((e) => e.name === 'match_start').length === 1, `${a.label}: double-tapped deal produced ${before.filter((e) => e.name === 'match_start').length} starts`);
      resumed = true;
      await tryClick(page, 'dialog.results [data-act="next-hand"]');
    }
    hands += await playMatch(page, a.label);
    const ev = await events(page);
    const scores = (await page.textContent('dialog.results .scores-line'))?.replace(/\s+/g, ' ').trim();
    const winner = (await page.textContent('dialog.results .match-line'))?.trim();
    check(!!winner, `${a.label}: no match winner shown`);
    // Analytics: one start (or a resume), one round_end per hand on this page, one match_end, nothing secret.
    const starts = ev.filter((e) => e.name === 'match_start');
    const rounds = ev.filter((e) => e.name === 'round_end');
    const ends = ev.filter((e) => e.name === 'match_end');
    if (!resumed) check(starts.length === 1 && starts[0]!.start_kind === 'fresh', `${a.label}: starts ${JSON.stringify(starts)}`);
    check(ends.length === 1, `${a.label}: ${ends.length} match_end events`);
    check(rounds.length === (resumed ? hands - 1 : hands) || rounds.length === hands, `${a.label}: ${rounds.length} round_end for ${hands} hands`);
    check(!SECRET.test(JSON.stringify(ev)), `${a.label}: analytics payload contains something secret: ${JSON.stringify(ev)}`);
    check(ev.every((e) => e.mode === undefined || e.mode === a.mode), `${a.label}: wrong mode in events`);
    // Rematch is labelled as such once it really starts.
    await page.click('dialog.results [data-act="new-match"]');
    await page.waitForSelector('.table-screen');
    for (let k = 0; k < 60; k++) {
      if ((await events(page)).filter((e) => e.name === 'match_start').length > starts.length) break;
      if ((await tryClick(page, '[data-act="cover-ready"]')) || (await tryClick(page, '[data-act="cover-reveal"]'))) continue;
      if (await page.locator('.hand-tile.is-legal').count()) {
        await tryClick(page, '.hand-tile.is-legal');
        await tryClick(page, '.end-slot.is-legal');
      } else if (!(await tryClick(page, '[data-act="draw"]:not([disabled])'))) await tryClick(page, '[data-act="pass"]:not([disabled])');
      await page.waitForTimeout(100);
    }
    const after = (await events(page)).filter((e) => e.name === 'match_start');
    check(after.length === starts.length + 1 && after[after.length - 1]!.start_kind === 'rematch', `${a.label}: rematch not labelled (${JSON.stringify(after)})`);
    check(consoleErrors.length === 0, `${a.label}: console not clean: ${consoleErrors.slice(0, 3).join(' | ')}`);
    await page.screenshot({ path: join(out, `${i + 1}-${a.mode}-${a.opponent}${'seating' in a ? `-${a.seating}` : ''}.png`) });
    notes.push(`${a.label}: complete match in ${hands} hands (${((Date.now() - t0) / 1000).toFixed(0)} s) — "${winner}" ${scores}; analytics ${ev.map((e) => e.name).join(',').replace(/round_end(,round_end)*/g, `round_end×${rounds.length}`)}; rematch labelled; console clean`);
    writeFileSync(join(out, `events-${i + 1}.json`), JSON.stringify(await events(page), null, 1));
    await page.context().close();
  }
} catch (e) {
  failures.push(`exception: ${(e as Error).stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ failures, notes }, null, 1));
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\nMATCHES FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nAll arrangements completed full matches.');
process.exit(0);
