/**
 * Story sweep (QA checkpoint): walks EVERY beat of the Story in the real UI and checks, at each one:
 * - the text on screen is the script's verbatim line (or its player caption);
 * - the line's expression is the tagged one (`src/story/expressions.ts`) and a cast member shows its
 *   verified frame;
 * - at most one figure is on stage (the speaker), and the same speaker keeps exactly the same box;
 * - the panel holds one action (Continue), on screen and focused, with no stale focus stop on the text;
 * - each Continue moves exactly one beat (no duplicate progression);
 * - Chapters 3 and 7 are always the corporate terrace;
 * - nothing overflows.
 *
 * Pass 1: every scene's pre-hand beats plus all three outcome routes (win / loss / tie) at 390×844.
 * Pass 2: Chapters 3 and 7 (pre and the win route) at the seven QA viewports.
 * Usage: npm run story:sweep
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { insertLines, segments } from '../src/story/chapters.ts';
import { playerCaption } from '../src/story/captions.ts';
import { castFrameFor, lineExpression, lineNumbers } from '../src/story/expressions.ts';
import type { Block, Scene } from '../src/story/parse.ts';
import { engine, launchOptions } from './lib/engine';

type Page = import('playwright').Page;
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/story-sweep');
mkdirSync(out, { recursive: true });
const script = JSON.parse(readFileSync(join(root, 'src/story/script.json'), 'utf8')) as { scenes: Scene[] };
const ORDER = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'];
const failures: string[] = [];
const notes: string[] = [];
const fail = (m: string) => failures.length < 200 && failures.push(m);

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '667x375', width: 667, height: 375 },
  { name: '844x390', width: 844, height: 390 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1366x768', width: 1366, height: 768 },
];
const CHAR: Record<string, 'vale' | 'luz' | 'marisol' | 'rafa'> = { 'cast.vale.atlas': 'vale', 'cast.luz.atlas': 'luz', 'cast.marisol.atlas': 'marisol', 'cast.rafa.atlas': 'rafa' };

const server = await createServer({ root, logLevel: 'error', server: { port: 5195, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5195/';
const browser = await engine.launch(launchOptions());

type Probe = {
  card: string | null; index: number; text: string; caption: string; speaking: string; expression: string;
  figures: number; fig: string | null; castFrame: string | null; castId: string | null; env: string | null;
  buttons: number; focusOk: boolean; nextOn: boolean; panelOn: boolean; bodyTab: boolean; bodyScrolls: boolean; overflow: number;
};
const PROBE = `(() => {
  const q = (s) => document.querySelector(s);
  const card = q('.hand-card') ? 'hand' : q('.end-card') ? 'end' : null;
  const panel = q('.dialogue-panel'); const body = q('.dialogue-body'); const next = q('.cine-next');
  const on = [...document.querySelectorAll('.st-actor.is-on, .st-cast.is-on')];
  const r = on[0]?.getBoundingClientRect();
  const nr = next?.getBoundingClientRect(); const pr = panel?.getBoundingClientRect();
  const art = q('.st-cast.is-on .st-cast-art');
  const max = body ? parseFloat(getComputedStyle(body).maxHeight) : NaN;
  return {
    card, index: Number(panel?.dataset.index ?? -1),
    text: q('.dialogue-body .dialogue-text')?.textContent ?? '', caption: q('.dialogue-body .caption-text')?.textContent ?? '',
    speaking: q('.story-stage')?.dataset.speaking ?? '', expression: q('.story-stage')?.dataset.expression ?? '',
    figures: on.length, fig: r ? [r.x, r.y, r.width, r.height].map(Math.round).join(',') : null,
    castFrame: art?.dataset.frame ?? null, castId: art?.dataset.cast ?? null,
    env: q('.st-bg.is-front')?.dataset.env ?? null,
    buttons: panel ? panel.querySelectorAll('button, [tabindex="0"]').length : 0,
    focusOk: document.activeElement === next, nextOn: !!nr && nr.top >= 0 && nr.bottom <= innerHeight + 0.5 && nr.left >= 0 && nr.right <= innerWidth + 0.5,
    panelOn: !!pr && pr.top >= 0 && pr.bottom <= innerHeight + 0.5,
    bodyTab: body?.getAttribute('tabindex') === '0',
    bodyScrolls: !!body && body.scrollHeight > body.clientHeight + 2 && body.offsetHeight >= max - 2,
    overflow: Math.max(document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight),
  };
})()`;
const probe = (page: Page) => page.evaluate(PROBE) as Promise<Probe>;

async function newPage(vp: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addInitScript('window.__name = (f) => f; window.__sbStoryFast = true; window.__sbIntroVideo = null;');
  // Instant text (the player's own Settings choice) so each Continue is one beat with no reveal step.
  await ctx.addInitScript(`try { localStorage.setItem('sticks-and-bones.settings', JSON.stringify({ format: 'sticks-and-bones/settings', version: 3, data: { instantText: true } })); } catch {}`);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  page.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  await page.click('.start-button');
  await page.waitForSelector('[data-act="story"]');
  return { page, errors };
}

/** Walk one segment (pre, or post for an outcome) and check every beat. Returns the beats seen. */
async function walk(page: Page, vpName: string, sceneId: string, part: 'pre' | 'post', outcome: 'win' | 'loss' | 'tie' | null): Promise<number> {
  const scene = script.scenes.find((s) => s.id === sceneId)!;
  const seg = segments(scene);
  const list: Block[] = part === 'pre' ? [...seg.pre] : [...(outcome && seg.inserts[outcome] ? insertLines(seg.inserts[outcome]!) : []), ...seg.post];
  if (!list.length) return 0;
  const lineNo = lineNumbers(scene);
  const completed = ['prologue', ...ORDER.slice(1, ORDER.indexOf(sceneId) + (part === 'post' ? 1 : 0))].filter((s) => s !== sceneId || part === 'post');
  await page.evaluate((data: unknown) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data })), { sceneId, part, index: 0, outcome, completed, textScale: 1, startedAt: 1, hand: null });
  await page.click('[data-act="story"]');
  await page.waitForSelector('.story-shell');
  await page.click('[data-act="story-continue"]');
  await page.waitForFunction(`window.__sbStory && window.__sbStory.director.state === 'presenting'`, null, { timeout: 15_000 });
  const tag = `${vpName} ${sceneId} ${part}${outcome ? `/${outcome}` : ''}`;
  const boxes = new Map<string, string>();
  let lastIndex = -1;
  let seen = 0;
  for (let guard = 0; guard < list.length + 5; guard++) {
    // Wait for the beat (or the card that ends the segment), then for any speaker fade to settle.
    let p = await probe(page);
    for (let t = 0; t < 40 && !p.card && p.index === lastIndex; t++) {
      await page.waitForTimeout(50);
      p = await probe(page);
    }
    if (p.card) break;
    // Let a speaker change finish (fade out, then the 240 ms entrance) before measuring the box.
    await page.waitForTimeout(200);
    await page.waitForFunction(`!document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.st-actor, .st-cast'))`, null, { timeout: 3000 }).catch(() => fail(`${vpName} ${sceneId}: a figure transition never settled`));
    p = await probe(page);
    if (p.card) break;
    if (lastIndex >= 0 && p.index !== lastIndex + 1) fail(`${tag}: one Continue moved ${lastIndex} → ${p.index}`);
    lastIndex = p.index;
    seen++;
    const b = list[p.index];
    if (!b) {
      fail(`${tag}: beat ${p.index} beyond the script segment (${list.length})`);
      break;
    }
    const where = `${tag} #${p.index}`;
    // Verbatim text.
    if (b.kind === 'line') {
      if (p.text !== b.text) fail(`${where}: text ${JSON.stringify(p.text.slice(0, 60))} ≠ script ${JSON.stringify(b.text!.slice(0, 60))}`);
    } else {
      const cap = playerCaption(b.raw);
      if (cap !== null && p.caption !== cap) fail(`${where}: caption ${JSON.stringify(p.caption.slice(0, 60))} ≠ ${JSON.stringify(cap.slice(0, 60))}`);
    }
    // Expression: the tagged one (Roberto's untagged lines keep the cue mood; the cast's are neutral).
    if (b.kind === 'line' && (p.speaking === 'cousin' || p.speaking === 'cast')) {
      const n = lineNo(b);
      const e = n !== undefined ? lineExpression(sceneId, n) : undefined;
      const want = p.speaking === 'cousin' ? (e ?? 'cue') : (e ?? 'neutral');
      if (p.expression !== want) fail(`${where}: expression ${p.expression} ≠ tagged ${want} (line ${n})`);
      if (p.speaking === 'cast' && p.castId && p.castFrame) {
        const f = castFrameFor(CHAR[p.castId]!, (e ?? 'neutral') as never);
        if (p.castFrame !== f) fail(`${where}: ${p.castId} shows ${p.castFrame}, verified frame is ${f}`);
      }
    }
    // One figure, the speaker's, in a stable box.
    if (p.figures > 1) fail(`${where}: ${p.figures} figures on stage`);
    if ((p.speaking === 'none' || p.speaking === 'other') && p.figures) fail(`${where}: a figure is on stage while ${p.speaking}`);
    if (p.fig) {
      const who = p.speaking === 'cast' ? (p.castId ?? 'cast') : p.speaking;
      const prev = boxes.get(who);
      if (prev && prev !== p.fig) fail(`${where}: ${who} moved ${prev} → ${p.fig}`);
      boxes.set(who, p.fig);
    }
    // One action, on screen, focused; the text is a focus stop only when it really scrolls.
    if (p.buttons !== 1 + (p.bodyTab ? 1 : 0)) fail(`${where}: ${p.buttons} focus stops in the panel`);
    if (p.bodyTab !== p.bodyScrolls) fail(`${where}: text focus stop ${p.bodyTab} but scrolls ${p.bodyScrolls}`);
    if (!p.nextOn || !p.panelOn) fail(`${where}: Continue/panel off screen`);
    if (!p.focusOk) fail(`${where}: Continue lost focus`);
    if (p.overflow > 0) fail(`${where}: page overflow ${p.overflow}px`);
    if ((sceneId === 'chapter-3' || sceneId === 'chapter-7') && p.env !== 'env.executive-terrace') fail(`${where}: backdrop ${p.env}, not the corporate terrace`);
    await page.click('[data-act="story-next"]');
  }
  if (seen !== list.length) fail(`${tag}: saw ${seen} of ${list.length} beats`);
  // Back to the menu for the next segment.
  await page.click('[data-act="story-file"]');
  await page.click('[data-act="story-home"]');
  await page.waitForSelector('[data-act="story"]');
  return seen;
}

try {
  // Pass 1: the whole Story, every route, at 390×844.
  {
    const { page, errors } = await newPage({ width: 390, height: 844 });
    let beats = 0;
    for (const id of ORDER) {
      beats += await walk(page, '390x844', id, 'pre', null);
      const seg = segments(script.scenes.find((s) => s.id === id)!);
      if (seg.deal) for (const o of ['win', 'loss', 'tie'] as const) beats += await walk(page, '390x844', id, 'post', o);
    }
    if (errors.length) fail(`pass 1: page errors ${errors.slice(0, 3).join(' | ')}`);
    notes.push(`pass 1 (390×844): ${beats} beats across 9 scenes and every win / loss / tie route, verbatim text, tagged expressions and verified frames, one figure in a stable box, Continue only`);
    await page.context().close();
  }
  // Pass 2: the corporate scenes at every QA viewport.
  for (const vp of VIEWPORTS) {
    const { page, errors } = await newPage(vp);
    let beats = 0;
    for (const id of ['chapter-3', 'chapter-7']) {
      beats += await walk(page, vp.name, id, 'pre', null);
      beats += await walk(page, vp.name, id, 'post', 'win');
    }
    if (errors.length) fail(`pass 2 ${vp.name}: page errors ${errors.slice(0, 3).join(' | ')}`);
    notes.push(`pass 2 (${vp.name}): Chapters 3 and 7, ${beats} beats over the corporate terrace`);
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
  console.error(`\nSTORY SWEEP FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nStory sweep passed.');
process.exit(0);
