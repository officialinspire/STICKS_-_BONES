/**
 * npm run story:route — play the WHOLE case through the real UI (dev server, Chromium, fast AI timing):
 * New Case → Prologue → seven chapter hands (a simple legal-move bot plays Roberto) → outcome inserts →
 * shared continuations → notebook end cards → Epilogue → "Case complete".
 *
 * It verifies the route the player actually sees (every scene in order, the insert matching each hand's
 * real result, every notebook entry on its end card, completion recorded once) and reads the pacing hooks
 * (`story:<scene>:<phase>` performance measures).
 *
 * BOT TIMING IS NOT HUMAN PACING. The report adds a reading-time MODEL from the script's word counts so the
 * 90–110 minute target can be discussed, clearly labelled as an estimate. Only real new-player playtests
 * (docs/PLAYTEST.md) establish human pacing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { insertLines, segments, type Outcome } from '../src/story/chapters.ts';
import { playerCaption } from '../src/story/captions.ts';
import type { Scene } from '../src/story/parse.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/story-route');
mkdirSync(out, { recursive: true });
const script = JSON.parse(readFileSync(join(root, 'src/story/script.json'), 'utf8')) as { scenes: Scene[] };
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);
const ORDER = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'];

const server = await createServer({ root, logLevel: 'error', server: { port: 5202, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript('window.__name = (f) => f; window.__sbStoryFast = true;');
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e: Error) => errors.push(e.message));

const prog = () => page.evaluate(`JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data ?? null`) as Promise<{ sceneId: string; part: string; outcome: Outcome | null; completed: string[] } | null>;
const visible = (sel: string) => page.evaluate((s: string) => { const e = document.querySelector(s) as HTMLElement | null; return !!e && !e.hidden && e.offsetParent !== null; }, sel);
async function playHand(budget = 180_000) {
  const until = Date.now() + budget;
  let moves = 0;
  while (Date.now() < until) {
    if (await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false)) return moves;
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click({ timeout: 2000 }).catch(() => undefined);
      await page.locator('.end-slot.is-legal').first().click({ timeout: 2000 }).catch(() => undefined);
      moves++;
      continue;
    }
    const act = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
    if (await act.count()) {
      await act.first().click({ timeout: 2000 }).catch(() => undefined);
      moves++;
    }
    await page.waitForTimeout(50);
  }
  return -1;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
interface SceneRun { id: string; beats: number; words: number; outcome: Outcome | null; insertShown: boolean | null; notebook: boolean | null; moves: number; ms: number }
const runs: SceneRun[] = [];
const t0 = Date.now();
try {
  await page.goto('http://localhost:5202/');
  await page.click('.start-button');
  await page.locator('[data-act="story"]').first().waitFor();
  await page.evaluate(() => localStorage.removeItem('sticks-and-bones.story'));
  await page.click('[data-act="story"]');
  await page.locator('[data-act="story-new"]').first().waitFor();
  await page.click('[data-act="story-new"]');
  if (await page.locator('[data-act="story-new"][data-armed="1"]').count()) await page.click('[data-act="story-new"]');

  for (const id of ORDER) {
    const scene = script.scenes.find((s) => s.id === id)!;
    const seg = segments(scene);
    const ts = Date.now();
    const run: SceneRun = { id, beats: 0, words: 0, outcome: null, insertShown: null, notebook: null, moves: 0, ms: 0 };
    await page.locator(`.story-stage[data-scene="${id}"]`).first().waitFor({ timeout: 20_000 });
    let afterHand = false;
    const until = Date.now() + 240_000;
    while (Date.now() < until) {
      if (await visible('.end-card')) break;
      if (await visible('[data-act="story-deal"]')) {
        await page.click('[data-act="story-deal"]');
        await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
        run.moves = await playHand();
        check(run.moves >= 0, `${id}: the hand did not finish`);
        const p = await prog();
        run.outcome = p?.outcome ?? null;
        await page.click('dialog.results [data-act="story-hand-done"]');
        await page.locator('.story-stage:not([hidden])').first().waitFor({ timeout: 20_000 });
        afterHand = true;
        // The first line after the hand must be the insert that matches the real result.
        await page.waitForTimeout(400);
        const first = (await page.textContent('.dialogue-panel').catch(() => '')) ?? '';
        const ins = run.outcome && seg.inserts[run.outcome] ? insertLines(seg.inserts[run.outcome]!)[0] : null;
        const want = ins ? (ins.kind === 'line' ? ins.text! : playerCaption(ins.raw) ?? '') : '';
        run.insertShown = !!ins && first.includes(want.replace(/^“|”$/g, '').slice(0, 30));
        check(run.insertShown === true, `${id}: after a ${run.outcome} the first line was not the ${run.outcome} insert ("${first.slice(0, 80)}")`);
        continue;
      }
      const before = await page.evaluate(() => document.querySelector('.cine-pos')?.textContent ?? '');
      await page.click('[data-act="story-next"]').catch(() => undefined);
      await page.waitForTimeout(25);
      const after = await page.evaluate(() => document.querySelector('.cine-pos')?.textContent ?? '');
      if (after !== before) run.beats++;
    }
    void afterHand;
    // End card: the notebook entry for chapters 1–6, "Case complete" for the epilogue.
    const card = (await page.textContent('.end-card').catch(() => '')) ?? '';
    if (seg.notebook) {
      run.notebook = card.includes(seg.notebook.raw.replace(/^Notebook:\s*/, '').slice(0, 40));
      check(run.notebook === true, `${id}: notebook entry missing from the end card`);
    }
    if (id === 'epilogue') check(/Case complete/.test(card), 'epilogue: no "Case complete" on the end card');
    const routeBlocks = [...seg.pre, ...(run.outcome && seg.inserts[run.outcome] ? insertLines(seg.inserts[run.outcome]!) : []), ...seg.post];
    run.words = routeBlocks.reduce((s, b) => s + words(b.kind === 'line' ? b.text! : playerCaption(b.raw) ?? ''), 0) + (seg.notebook ? words(seg.notebook.raw) : 0);
    run.ms = Date.now() - ts;
    runs.push(run);
    const onward = page.locator('[data-act="story-onward"]');
    if (id !== 'epilogue') await onward.click();
  }
  const p = await prog();
  check(ORDER.every((s) => p?.completed.includes(s)), `completion not recorded for every scene: ${p?.completed.join(', ')}`);
  const measures = (await page.evaluate(`performance.getEntriesByType('measure').filter((m) => m.name.startsWith('story:')).map((m) => [m.name, Math.round(m.duration)])`)) as [string, number][];
  // Every chapter × win / loss / tie, deterministically: open the continuation with that outcome and check
  // the first line shown is that insert, then the shared continuation follows.
  let routes = 0;
  for (const id of ORDER.filter((x) => x.startsWith('chapter-'))) {
    const seg = segments(script.scenes.find((x) => x.id === id)!);
    for (const o of ['win', 'loss', 'tie'] as const) {
      await page.evaluate(([sid, oc]: readonly [string, string]) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: sid, part: 'post', index: 0, outcome: oc, completed: ['prologue'], textScale: 1, startedAt: 7, hand: null } })), [id, o] as const);
      await page.goto('http://localhost:5202/');
      await page.click('.start-button');
      await page.locator('[data-act="story"]').first().waitFor();
      await page.click('[data-act="story"]');
      await page.locator('[data-act="story-continue"]').first().waitFor();
      await page.click('[data-act="story-continue"]');
      await page.locator('.dialogue-panel').first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(300);
      const lines = insertLines(seg.inserts[o]!);
      const first = (await page.textContent('.dialogue-panel')) ?? '';
      const want = lines[0]!.kind === 'line' ? lines[0]!.text! : playerCaption(lines[0]!.raw) ?? '';
      check(first.includes(want.replace(/^“|”$/g, '').slice(0, 30)), `${id} ${o}: first line "${first.slice(0, 60)}" is not the ${o} insert`);
      const total = await page.evaluate(() => Number((document.querySelector('.cine-pos')?.textContent ?? '0 / 0').split('/')[1]));
      check(total === lines.length + seg.post.length, `${id} ${o}: ${total} beats after the hand, expected ${lines.length} insert + ${seg.post.length} shared`);
      routes++;
    }
  }
  notes.push(`all ${routes} chapter routes (7 × win/loss/tie) opened in the UI: each showed its own insert first, then the shared continuation`);
  check(measures.length >= 9 + 7 * 2, `pacing hooks: only ${measures.length} measures`);
  writeFileSync(join(out, 'route.json'), JSON.stringify({ runs, measures }, null, 1));
  // Reading-time MODEL (not a measurement): 200 words/min for the shown text, 1.2 s per beat to tap on,
  // and 6–10 s per human action at the table (a first-time player thinking about each tile).
  const totalWords = runs.reduce((s, r) => s + r.words, 0);
  const totalBeats = runs.reduce((s, r) => s + r.beats, 0);
  const totalMoves = runs.reduce((s, r) => s + Math.max(0, r.moves), 0);
  const readMin = totalWords / 200 + (totalBeats * 1.2) / 60;
  const lo = readMin + (totalMoves * 6) / 60;
  const hi = totalWords / 160 + (totalBeats * 1.5) / 60 + (totalMoves * 10) / 60;
  notes.push(`route: ${runs.map((r) => `${r.id}${r.outcome ? ` (${r.outcome})` : ''}`).join(' → ')} — Case complete; completion recorded for all 9 scenes`);
  notes.push(`shown text ${totalWords} words in ${totalBeats} beats; Roberto's actions at the 7 tables ${totalMoves} (this bot's hands; real hands vary)`);
  notes.push(`bot wall time ${(Date.now() - t0) / 1000 | 0} s (fast AI, instant reading — NOT human pacing)`);
  notes.push(`pacing MODEL (not measured): reading 160–200 wpm + 1.2–1.5 s per tap + 6–10 s per table action → about ${Math.round(lo)}–${Math.round(hi)} minutes. Human timing is UNVERIFIED until playtests (docs/PLAYTEST.md).`);
  notes.push(`pacing hooks recorded: ${measures.length} measures (story:<scene>:pre|hand|post)`);
  check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
} catch (e) {
  failures.push(`exception: ${(e as Error).stack ?? e}`);
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined);
} finally {
  await browser.close();
  await server.close();
}
for (const n of notes) console.log(`  · ${n}`);
for (const r of runs) console.log(`    ${r.id.padEnd(10)} beats ${String(r.beats).padStart(3)}  words ${String(r.words).padStart(5)}  ${r.outcome ?? '—'}  moves ${r.moves}  ${(r.ms / 1000).toFixed(1)} s`);
if (failures.length) {
  console.error(`\nstory:route: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nstory:route: the whole case was played through the UI');
