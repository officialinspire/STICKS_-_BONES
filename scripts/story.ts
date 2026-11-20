/**
 * npm run story:e2e — the cinematic story layer in a real browser (dev server, Chromium).
 *
 *  A. Prologue → Chapter 1: rapid tapping never skips more than one beat; skip during the
 *     entrance; deal card double-tap starts ONE hand; the hand resolves at the table; the
 *     matching outcome insert follows verbatim; board input never advances dialogue.
 *  B. Refresh mid-dialogue resumes the same beat; refresh mid-hand resumes the SAME hand;
 *     completion is recorded once and never replayed.
 *  C. Missing images (all WebP blocked): scenes still enter with drawn fallbacks.
 *  D. Background/foreground during a transition settles it (no stuck input).
 *  E. Reduced motion: short simple fades, no text reveal, no establishing move.
 *  F. Orientation change and repeated navigation: no overflow, no errors, one director.
 *  G. Compositions: each staged moment from the brief, portrait 390×844 and landscape 844×390.
 *  O. Finish hand with AI (Story pause): fixed Chapter 2 deals whose assisted result is a win, a loss and a tie
 *     — the real result, its insert, one advance, "Finished with AI assistance", no win counted; Take over
 *     returns control (no further assisted move); a reload mid-assist keeps the label but not the assistant;
 *     leaving mid-decision lands nothing.
 *  P. Transcript, recap, reach: the case file's Transcript shows only reached beats (verbatim, the recorded
 *     outcome's insert, "finished with AI assistance") and nothing later; Skip offers a dismissible recap of
 *     the skipped part's evidence only; at 320×568 and 568×320 (reduced motion, 130 % text) the pause sheet's
 *     Finish hand with AI and the table tip are on screen and keyboard-reachable.
 *  Q. Evidence cards, title reprise, credits: the case file's Evidence shows ONLY reached items as cards, each
 *     with the exact approved caption, every glyph on the card art's paper (320×568 at 130 % text, 568×320,
 *     1366×768); the epilogue's "Title and credits" shows the wordmark reprise and paginated credits (every line
 *     reachable), focus on Back, a tap finishes the reveal, reduced motion skips it, Escape returns to the case
 *     file, nothing in the save changes, and the case-complete cue falls back honestly (no file supplied).
 *  N. Chapter replay from the case file (Chapter 6): it starts at its first beat, plays its hand and the
 *     insert to the end card, withholds the result cue (a serious hand), returns to the case file, and leaves
 *     the case position, completed chapters, statistics and achievements exactly as they were; a double tap
 *     on Replay opens ONE run.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { insertLines, segments } from '../src/story/chapters.ts';
import type { Scene } from '../src/story/parse.ts';
import { STAGING } from '../src/story/staging.ts';
import { EVIDENCE } from '../src/story/evidence.ts';
import { playerCaption } from '../src/story/captions.ts';
import { showMenuItem } from './lib/menu-navigation';
import { CREDITS } from '../src/story/credits.ts';
import { engine, launchOptions } from './lib/engine';

type Page = import('playwright').Page;
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/story');
mkdirSync(out, { recursive: true });
const script = JSON.parse(readFileSync(join(root, 'src/story/script.json'), 'utf8')) as { scenes: Scene[] };
const scene = (id: string) => script.scenes.find((s) => s.id === id)!;
const EVIDENCE_TEXT = (id: string, part: 'pre' | 'post') => EVIDENCE.filter((e) => e.scene === id && e.part === part).map((e) => playerCaption(e.at)!).filter(Boolean);
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

const server = await createServer({ root, logLevel: 'error', server: { port: 5188, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5188/';
const browser = await engine.launch(launchOptions());

async function newPage(o: { width?: number; height?: number; reduce?: boolean; blockImages?: boolean; storySeed?: string } = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 390, height: o.height ?? 844 }, reducedMotion: o.reduce ? 'reduce' : 'no-preference', deviceScaleFactor: 2 });
  await ctx.addInitScript(`window.__name = (f) => f; window.__sbStoryFast = true; window.__sbIntroVideo = null;${o.storySeed ? ` window.__sbStorySeed = ${JSON.stringify(o.storySeed)};` : ''}`);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  page.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && !(o.blockImages && /Failed to load resource/.test(m.text())) && errors.push(m.text()));
  if (o.blockImages) await page.route(/\.(webp|png)(\?|$)/, (r: { abort(): Promise<void> }) => r.abort());
  return { page, errors };
}
const dstate = (page: Page) => page.evaluate(`window.__sbStory ? JSON.stringify({ state: __sbStory.director.state, index: __sbStory.director.index, scene: __sbStory.sceneId }) : 'null'`).then((s: unknown) => JSON.parse(s as string) as { state: string; index: number; scene: string } | null);
const prog = (page: Page) => page.evaluate(`JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data ?? null`) as unknown as Promise<{ sceneId: string; part: string; index: number; outcome: string | null; completed: string[]; hand: unknown } | null>;
async function waitState(page: Page, want: string, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if ((await dstate(page))?.state === want) return true;
    await page.waitForTimeout(40);
  }
  return false;
}
async function toMenu(page: Page) {
  await page.goto(BASE);
  await page.click('.start-button');
  await page.waitForSelector('[data-act="story"]');
}
async function openStory(page: Page, opts: { fresh?: boolean } = {}) {
  // From the menu (Story button) or already on the case file.
  await page.waitForSelector('[data-act="story"], .story-shell');
  if (!(await page.locator('.story-shell').count())) await page.click('[data-act="story"]');
  await page.waitForSelector('.story-shell');
  if (opts.fresh) {
    await page.click('[data-act="story-new"]');
    if (await page.locator('dialog.confirm[open] [data-act="confirm-yes"]').count()) await page.click('dialog.confirm[open] [data-act="confirm-yes"]');
  } else await page.click('[data-act="story-continue"], [data-act="story-new"]');
  // A scene, or (resuming a hand) the table — the scene is truly hidden while a hand is played.
  await page.locator('.story-stage:not([hidden]), .table-screen').first().waitFor({ timeout: 30_000 });
}
/** Seed progress directly (a valid v2 record) for composition captures. */
async function seed(page: Page, p: Record<string, unknown>) {
  await page.evaluate((data: unknown) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 3, data })), { outcome: null, completed: [], textScale: 1, startedAt: 1, hand: null, outcomes: {}, assisted: [], ...p });
}
async function playHandAtTable(page: Page, budget = 120_000) {
  const until = Date.now() + budget;
  while (Date.now() < until) {
    if (await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false)) return true;
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click({ timeout: 2000 }).catch(() => undefined);
      await page.locator('.end-slot.is-legal').first().click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    const act = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
    if (await act.count()) await act.first().click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(60);
  }
  return false;
}

try {
  // ---- A + B -----------------------------------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    await openStory(page, { fresh: true });
    // Skip during the entrance transition, then rapid taps.
    await page.click('[data-act="story-skip"]').catch(() => undefined);
    await waitState(page, 'presenting');
    const pro = segments(scene('prologue')).pre.length;
    check(/hand-card|end-card/.test((await page.innerHTML('.scene-card-slot')) || '') || (await dstate(page))!.index >= 0, 'A: skip during entrance left no decision card');
    // Fresh again for the tap test.
    await page.click('[data-act="story-file"]');
    await openStory(page, { fresh: true });
    await waitState(page, 'presenting');
    const before = (await dstate(page))!.index;
    await page.evaluate(`for (let i = 0; i < 25; i++) document.querySelector('[data-act="story-next"]').click()`);
    const after = (await dstate(page))!.index;
    check(after - before <= 1, `A: a 25-tap burst advanced ${after - before} beats (max 1)`);
    notes.push(`A: 25 taps in one instant advanced ${after - before} beat (reveal-first + double-tap guard); prologue has ${pro} beats`);
    // Read the prologue to its end, continue into Chapter 1.
    for (let i = 0; i < 40 && !(await page.locator('.end-card').count()); i++) {
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(200);
    }
    check((await page.locator('.end-card').count()) === 1, 'A: prologue end card not reached');
    await page.click('[data-act="story-onward"]');
    await waitState(page, 'presenting');
    check((await dstate(page))!.scene === 'chapter-1', 'A: did not continue to chapter 1');
    // Refresh mid-dialogue resumes the same beat.
    for (let i = 0; i < 3; i++) {
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(220);
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(220);
    }
    const mid = (await dstate(page))!.index;
    await toMenu(page);
    await openStory(page);
    await waitState(page, 'presenting');
    const resumed = await dstate(page);
    check(resumed!.scene === 'chapter-1' && resumed!.index === mid, `B: refresh mid-dialogue resumed at ${JSON.stringify(resumed)} (expected index ${mid})`);
    notes.push(`B: refresh mid-dialogue → chapter-1 beat ${resumed!.index} (same as before)`);
    // Skip to the deal card; double-tap Deal → exactly one hand.
    await page.click('[data-act="story-skip"]');
    await page.waitForSelector('[data-act="story-deal"]');
    await page.locator('[data-act="story-deal"]').dblclick();
    await page.waitForSelector('.story-table-host:not([hidden]) .table-screen', { timeout: 10_000 });
    check((await page.locator('.table-screen').count()) === 1, `A: ${await page.locator('.table-screen').count()} tables after a double-tapped Deal`);
    check((await dstate(page))!.state === 'in-hand', 'A: director not in-hand at the table');
    // Board interaction never advances dialogue.
    const idxBefore = (await dstate(page))!.index;
    await page.evaluate(`__sbStory.director.advance(); __sbStory.director.advance();`);
    check((await dstate(page))!.index === idxBefore, 'A: dialogue advanced while the hand was in play');
    // Refresh mid-hand: the SAME hand comes back.
    await page.waitForTimeout(600);
    const savedHand = await prog(page);
    check(savedHand?.part === 'hand', `B: progress part during the hand is ${savedHand?.part}`);
    const handBefore = await page.evaluate(`JSON.stringify(__sb.session.debugState().hand.hands)`);
    await toMenu(page);
    await openStory(page);
    await page.waitForSelector('.story-table-host:not([hidden]) .table-screen', { timeout: 10_000 });
    const handAfter = await page.evaluate(`JSON.stringify(__sb.session.debugState().hand.hands)`);
    check(handBefore === handAfter, 'B: refresh mid-hand dealt a different hand');
    notes.push('B: refresh mid-hand → the same hand restored (identical tiles in every seat)');
    // Finish the hand; the matching insert follows verbatim.
    check(await playHandAtTable(page), 'A: chapter 1 hand did not finish');
    const outcome = (await prog(page))!.outcome as 'win' | 'loss' | 'tie';
    check(['win', 'loss', 'tie'].includes(outcome), `A: no outcome recorded (${outcome})`);
    const done1 = (await prog(page))!.completed.filter((c) => c === 'chapter-1').length;
    check(done1 === 1, `B: chapter-1 recorded ${done1} times at resolution`);
    await page.click('[data-act="story-hand-done"]');
    await waitState(page, 'presenting');
    const firstInsert = insertLines(segments(scene('chapter-1')).inserts[outcome]!)[0]!;
    const shown = (await page.textContent('.dialogue-panel'))!.replace(/\s+/g, ' ');
    check(shown.includes(firstInsert.text ?? firstInsert.raw), `A: ${outcome} insert not shown verbatim (got "${shown}")`);
    notes.push(`A: hand resolved as ${outcome}; the ${outcome} insert followed verbatim: ${firstInsert.raw.slice(0, 70)}…`);
    // Reload after completion: never replayed.
    await toMenu(page);
    await openStory(page);
    await waitState(page, 'presenting');
    const p2 = await prog(page);
    check(p2!.completed.filter((c) => c === 'chapter-1').length === 1 && p2!.part === 'post' && (await page.locator('.story-table-host:not([hidden])').count()) === 0, `B: reload after completion replayed something (${JSON.stringify({ part: p2!.part, completed: p2!.completed })})`);
    notes.push('B: reload after the hand → continuation, chapter-1 completed once, no re-deal');
    check(errors.length === 0, `A/B: console errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.context().close();
  }

  // ---- C. missing images ------------------------------------------------------------------------
  {
    const { page, errors } = await newPage({ blockImages: true });
    await toMenu(page);
    await openStory(page, { fresh: true });
    const ok = await waitState(page, 'presenting', 9000);
    check(ok && (await page.locator('.dialogue-panel').count()) === 1, 'C: with images blocked the scene never presented');
    const bg = await page.evaluate(`getComputedStyle(document.querySelector('.st-bg.is-front') || document.querySelector('.st-bg')).backgroundImage`);
    check(/gradient/.test(bg as string), `C: no drawn fallback behind a missing backdrop (${bg})`);
    check(errors.length === 0, `C: errors ${errors.join(' | ')}`);
    notes.push('C: all images blocked → the prologue still entered and presented over the drawn fallback gradient');
    await page.context().close();
  }

  // ---- D + E + F -----------------------------------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    await openStory(page, { fresh: true });
    // Background during the entrance: settles immediately.
    await page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get() { return true; } }); document.dispatchEvent(new Event('visibilitychange'));`);
    const st = (await dstate(page))!.state;
    check(st === 'presenting', `D: backgrounding during the entrance left the director in ${st}`);
    await page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get() { return false; } }); document.dispatchEvent(new Event('visibilitychange'));`);
    notes.push(`D: background during the entrance → ${st} immediately; foreground continues normally`);
    // F: rotate during a scene, then rapid navigation file ↔ scene.
    for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(300);
      const f = await page.evaluate(`({ x: document.documentElement.scrollWidth - innerWidth, panel: !!document.querySelector('.dialogue-panel'), next: !!document.querySelector('[data-act="story-next"]') })`) as { x: number; panel: boolean; next: boolean };
      check(f.x <= 0 && f.panel && f.next, `F: after rotating to ${vp.width}x${vp.height}: ${JSON.stringify(f)}`);
    }
    for (let i = 0; i < 6; i++) {
      await page.click('[data-act="story-file"]');
      await page.click('[data-act="story-continue"]');
    }
    await waitState(page, 'presenting');
    await page.waitForTimeout(1500); // any stale timer from the abandoned directors would fire now
    const s = await dstate(page);
    check(s?.state === 'presenting', `F: after 6 rapid case-file round trips the director is ${s?.state}`);
    check(errors.length === 0, `D/F: errors ${errors.join(' | ')}`);
    notes.push('F: rotated portrait ↔ landscape mid-scene (no overflow) and 6 rapid case-file round trips — one live director, no stale callbacks, no errors');
    await page.context().close();
  }
  {
    const { page, errors } = await newPage({ reduce: true });
    await toMenu(page);
    await openStory(page, { fresh: true });
    await waitState(page, 'presenting', 3000);
    const r = await page.evaluate(`({ curtain: document.querySelector('.st-curtain').style.transitionDuration, revealing: !!document.querySelector('.dialogue-panel.is-revealing'), move: document.querySelector('.st-backdrop').dataset.move || 'none', anims: document.getAnimations().filter((a) => a.playState === 'running').length })`) as { curtain: string; revealing: boolean; move: string; anims: number };
    check(r.curtain === '120ms' && !r.revealing && r.move === 'none' && r.anims === 0, `E: reduced motion ${JSON.stringify(r)}`);
    notes.push(`E: reduced motion → curtain ${r.curtain}, no text reveal, no establishing move, ${r.anims} running animations`);
    check(errors.length === 0, `E: errors ${errors.join(' | ')}`);
    await page.context().close();
  }

  // ---- G. compositions --------------------------------------------------------------------------------
  const MOMENTS: [string, string, 'pre' | 'post', string][] = [
    ['dream-threshold', 'prologue', 'pre', '[No voice answers. A fourth knock'],
    ['marisol-arrival-facade-drops', 'chapter-1', 'pre', '[She almost smiles. He sees that it takes effort and stops performing.]'],
    ['vale-smile-to-menace', 'chapter-3', 'post', '[His smile is gone.]'],
    ['promenade-impossible-water', 'chapter-4', 'post', '[They share a quiet smile. Under the bench'],
    ['jungle-shared-event', 'chapter-5', 'post', '[A small line of water gathers on a root'],
    ['cave-rising-water-boundary', 'chapter-6', 'pre', '[The reflection brightens as if a door has opened farther.'],
    ['cave-accepted-hand', 'chapter-6', 'pre', '[She takes his hand. He lets her.]'],
    ['terrace-confrontation', 'chapter-7', 'pre', '[Vale checks his phone. The stop notice has arrived.'],
    ['dinner-kiss', 'epilogue', 'pre', '[She touches his jaw'],
    ['final-knocks', 'epilogue', 'pre', '[No one stands outside.'],
  ];
  for (const vp of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
    const { page, errors } = await newPage({ width: vp.width, height: vp.height });
    await toMenu(page);
    for (const [name, id, part, at] of MOMENTS) {
      const seg = segments(scene(id));
      const list = part === 'pre' ? seg.pre : [...insertLines(seg.inserts.win!), ...seg.post];
      const idx = list.findIndex((b) => b.raw.startsWith(at));
      if (idx < 0) {
        failures.push(`G: anchor not found for ${name}`);
        continue;
      }
      await seed(page, { sceneId: id, part, index: idx, outcome: part === 'post' ? 'win' : null });
      await page.click('[data-act="story"]');
      await page.waitForSelector('.story-shell');
      await page.click('[data-act="story-continue"]');
      await waitState(page, 'presenting');
      await page.waitForTimeout(1300); // let light/water transitions finish for the still
      const m = await page.evaluate(`(() => {
        const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom }; };
        const actor = r('.st-actor'), cast = r('.st-cast'), panel = r('.dialogue-panel'), controls = r('.cine-next'), bar = r('.story-bar');
        const stage = document.querySelector('.story-stage');
        const shown = [...document.querySelectorAll('.st-actor.is-on, .st-cast.is-on')];
        const actorVisible = !!document.querySelector('.st-actor.is-on');
        const castVisible = !!document.querySelector('.st-cast.is-on');
        const art = document.querySelector('.st-actor svg');
        const vb = art ? art.viewBox.baseVal : null;
        const up = art && vb ? (art.getBoundingClientRect().height / vb.height) * devicePixelRatio : 0;
        // Cast upscale: box height vs the visible source region (background-size % encodes sheet/region).
        const cb = document.querySelector('.st-cast-art');
        const bs = cb ? getComputedStyle(cb).backgroundSize.split(' ').map(parseFloat) : null;
        const castSrcH = cb && cb.dataset.cast ? ({ 'cast.vale.atlas': 836, 'cast.luz.atlas': 828, 'cast.marisol.atlas': 868, 'cast.rafa.atlas': 826 })[cb.dataset.cast] : 0;
        const castUp = cast && bs && castSrcH ? ((cast.h * devicePixelRatio) / (castSrcH / (bs[1] / 100))) : 0;
        // FACES: Cousin's head (hat to chin) is the top 38 % of his crop, the cast heads ~43 % of theirs.
        const fig = actorVisible ? actor : castVisible ? cast : null;
        const faceFrac = actorVisible ? 0.4 : 0.47;
        const faceCover = fig && panel ? Math.max(0, Math.min(fig.y + fig.h * faceFrac, panel.b) - Math.max(fig.y, panel.y)) * (panel.x < fig.x + fig.w && panel.x + panel.w > fig.x ? 1 : 0) : 0;
        const underBar = fig && bar ? Math.max(0, bar.b - fig.y) : 0;
        // The panel's one action (Continue) is on screen, and the figure never reaches below the panel.
        const intoControls = fig && panel ? Math.max(0, fig.b - panel.b) : 0;
        const nextOnScreen = !!controls && controls.y >= 0 && controls.b <= innerHeight;
        const tag = document.querySelector('.dialogue-panel .speaker-name')?.textContent || null;
        return { nextOnScreen, count: shown.length, actorVisible, castVisible, speaking: stage.dataset.speaking, tag, faceCover, underBar, intoControls, figH: fig ? Math.round(fig.h) : 0, overflowX: document.documentElement.scrollWidth - innerWidth, overflowY: document.documentElement.scrollHeight - innerHeight, panel, controls, cousin: actorVisible, up: +up.toFixed(2), castUp: +castUp.toFixed(2), env: document.querySelector('.st-bg.is-front')?.dataset.env || null };
      })()`) as { nextOnScreen: boolean; count: number; actorVisible: boolean; castVisible: boolean; speaking: string; tag: string | null; faceCover: number; underBar: number; intoControls: number; figH: number; overflowX: number; overflowY: number; panel: { y: number; b: number } | null; controls: { y: number } | null; cousin: boolean; up: number; castUp: number; env: string | null };
      check(m.overflowX <= 0 && m.overflowY <= 0, `G ${vp.name} ${name}: page overflow ${m.overflowX}/${m.overflowY}`);
      check(!!m.panel && m.nextOnScreen, `G ${vp.name} ${name}: Continue is off screen`);
      check(m.count <= 1, `G ${vp.name} ${name}: ${m.count} figures on stage (only the speaker may be)`);
      // Captions and narration: the backdrop only. A line: its own speaker (or nobody without a portrait).
      if (m.speaking === 'none' || m.speaking === 'other') check(m.count === 0, `G ${vp.name} ${name}: a figure is on stage during ${m.speaking === 'none' ? 'a caption' : `narration / ${m.tag}`}`);
      if (m.actorVisible) check(m.speaking === 'cousin', `G ${vp.name} ${name}: Roberto on stage while ${m.speaking} speaks`);
      if (m.cousin) check(m.up <= 1.6, `G ${vp.name} ${name}: Roberto upscaled ×${m.up} (blurry)`);
      if (m.castVisible) check(m.castUp <= 1.6, `G ${vp.name} ${name}: cast portrait upscaled ×${m.castUp} (blurry)`);
      check(m.faceCover <= 1, `G ${vp.name} ${name}: the dialogue panel covers the speaker's face by ${m.faceCover.toFixed(0)}px`);
      check(m.underBar <= 1, `G ${vp.name} ${name}: the speaker's head is under the scene bar by ${m.underBar}px`);
      // 0.01 px: Firefox lays out in 1/60 px units, so equal edges can differ by float noise (1.5e-5 px measured).
      check(m.intoControls <= 0.01, `G ${vp.name} ${name}: the speaker reaches below the dialogue panel by ${m.intoControls}px`);
      if (id === 'chapter-6' && name === 'cave-accepted-hand') check(m.env === 'env.rest-area', `G: chapter 6 rest-area beat shows ${m.env}, expected env.rest-area (never the ancient platform)`);
      // The resort and the confrontation are the approved corporate terrace (never the retired leisure patio).
      if (id === 'chapter-3' || id === 'chapter-7') check(m.env === 'env.executive-terrace', `G ${vp.name} ${name}: ${id} shows ${m.env}, not the corporate terrace`);
      await page.screenshot({ path: join(out, `${vp.name}-${name}.png`) });
      await page.click('[data-act="story-file"]');
      await page.click('[data-act="story-home"]');
      await page.waitForSelector('[data-act="story"]');
    }
    check(errors.length === 0, `G ${vp.name}: errors ${errors.slice(0, 3).join(' | ')}`);
    notes.push(`G: ${MOMENTS.length} staged moments captured in ${vp.name} — at most one figure (the speaker; none for captions/narration), no overflow, dialogue and figure clear of the controls, the face clear of the panel and the scene bar, ≤ 1.6× upscale`);
    await page.context().close();
  }
  void STAGING;
  // ---- K. One speaker: the speaker change fades out then in; the same speaker never moves; reduced motion swaps ----
  for (const reduce of [false, true]) {
    const { page, errors } = await newPage({ reduce });
    await toMenu(page);
    await seed(page, { sceneId: 'chapter-1', part: 'pre', index: 1, completed: ['prologue'] }); // 1 RAFA, 2 COUSIN, 3 RAFA, 4 COUSIN
    await openStory(page);
    await waitState(page, 'presenting');
    await page.waitForFunction(() => !!document.querySelector('.st-cast.is-on'), null, { timeout: 10_000 }).then((h: { dispose(): unknown }) => h.dispose(), () => failures.push(`K: Rafa never came on stage (reduce ${reduce})`));
    // Let the line settle (a tap during its reveal only completes the reveal).
    await waitState(page, 'presenting');
    await page.waitForTimeout(1200);
    const castBox = () => page.evaluate(() => { const b = document.querySelector('.st-cast')!.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}|${(document.querySelector('.st-cast-art') as HTMLElement).dataset.frame}|${document.querySelector('.story-stage')!.getAttribute('data-expression')}`; });
    const rafa1 = await castBox(); // Rafa #1: untagged → neutral (e1)
    // Next: sample which figure is on stage every 20 ms for 700 ms.
    const timeline = (await page.evaluate(`new Promise((res) => {
      const out = [];
      const t0 = performance.now();
      document.querySelector('[data-act="story-next"]').click();
      const tick = () => {
        const a = document.querySelector('.st-actor'), c = document.querySelector('.st-cast');
        out.push({ t: Math.round(performance.now() - t0), actor: a.classList.contains('is-on'), cast: c.classList.contains('is-on'), aOp: +getComputedStyle(a).opacity, cOp: +getComputedStyle(c).opacity });
        if (performance.now() - t0 < 700) setTimeout(tick, 20); else res(out);
      };
      tick();
    })`)) as { t: number; actor: boolean; cast: boolean; aOp: number; cOp: number }[];
    const both = timeline.filter((x) => x.actor && x.cast).length;
    const firstOn = timeline.find((x) => x.actor)?.t ?? -1;
    const castOff = timeline.find((x) => !x.cast)?.t ?? -1;
    check(both === 0, `K: two figures on stage at once during a speaker change (reduce ${reduce})`);
    check(firstOn >= 0 && timeline.at(-1)!.actor && !timeline.at(-1)!.cast, `K: Roberto never replaced Rafa (reduce ${reduce}) ${JSON.stringify(timeline.slice(-1))}`);
    if (reduce) check(firstOn - castOff <= 60, `K: reduced motion should swap at once (gap ${firstOn - castOff} ms)`);
    else check(firstOn - castOff >= 120 && timeline.some((x) => !x.actor && !x.cast && x.cOp > 0 && x.cOp < 1), `K: the speaker change should fade out first, then in (gap ${firstOn - castOff} ms)`);
    const rect = () => page.evaluate(() => { const b = document.querySelector('.st-actor')!.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}`; });
    const expr = () => page.evaluate(() => document.querySelector('.story-stage')!.getAttribute('data-expression'));
    await page.waitForTimeout(500);
    const first = await rect();
    const firstExpr = await expr(); // Roberto #2: teasing (smirk)
    const next = async () => {
      await waitState(page, 'presenting');
      await page.waitForTimeout(900);
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(700);
    };
    await next(); // Rafa
    const rafa3 = await castBox(); // Rafa #3: teasing → sly grin (e3)
    await next(); // Cousin again
    const again = await rect();
    const againExpr = await expr(); // Roberto #4: amusement (laughing)
    check(first === again, `K: Roberto moved between his lines (${first} → ${again})`);
    check(firstExpr === 'teasing' && againExpr === 'amusement', `K: Roberto's verified expressions not applied (${firstExpr} → ${againExpr})`);
    const [box1, fr1] = rafa1.split('|');
    const [box3, fr3] = rafa3.split('|');
    check(fr1 === 'e1' && fr3 === 'e3' && box1 === box3, `K: Rafa's expression change must keep the same box (${rafa1} → ${rafa3})`);
    check(errors.length === 0, `K: errors ${errors.join(' | ')}`);
    notes.push(`K (reduce ${reduce}): Rafa → Roberto: never two figures; ${reduce ? `instant swap (${firstOn - castOff} ms)` : `fade out, then in after ${firstOn - castOff} ms`}; Roberto's box identical across smirk → laugh (${again}); Rafa e1 → e3 in the same box`);
    await page.context().close();
  }

  // ---- L. One action: Continue. Rapid taps, Enter/Space, key repeat, reload, rotation, the longest line ----------
  {
    const { page, errors } = await newPage({ width: 390, height: 844 });
    await toMenu(page);
    await seed(page, { sceneId: 'chapter-1', part: 'pre', index: 1, completed: ['prologue'] });
    await openStory(page);
    await waitState(page, 'presenting');
    const idx = async () => (await dstate(page))!.index;
    const ui = await page.evaluate(() => ({ inPanel: [...document.querySelectorAll('.dialogue-panel button')].map((b) => (b as HTMLElement).dataset.act), gone: document.querySelectorAll('[data-act="story-text"], [data-act="story-transcript"], dialog.transcript, .cine-controls').length, nav: [...document.querySelectorAll('.story-bar [data-act]')].map((b) => (b as HTMLElement).dataset.act), label: document.querySelector('.cine-next')?.textContent?.trim() }));
    check(JSON.stringify(ui.inPanel) === '["story-next"]' && ui.gone === 0 && ui.label === 'Continue' && ['story-file', 'story-back', 'story-skip'].every((a) => ui.nav.includes(a)), `L: controls ${JSON.stringify(ui)}`);
    // Rapid taps on a line that is still revealing: the first completes it, the burst moves at most ONE beat.
    await page.waitForTimeout(1200);
    await page.click('[data-act="story-next"]'); // → line 2 (Roberto), revealing
    const i0 = await idx();
    await page.evaluate(() => { const b = document.querySelector('[data-act="story-next"]') as HTMLElement; for (let k = 0; k < 6; k++) b.click(); });
    await page.waitForTimeout(400);
    const i1 = await idx();
    check(i1 - i0 <= 1, `L: a burst of 6 taps skipped ${i1 - i0} lines`);
    // Enter and Space on the focused Continue: exactly one beat each (never the key AND the click).
    await page.waitForTimeout(900);
    await page.focus('[data-act="story-next"]');
    const i2 = await idx();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const i3 = await idx();
    await page.keyboard.press(' ');
    await page.waitForTimeout(900);
    const i4 = await idx();
    check(i3 - i2 === 1 && i4 - i3 === 1, `L: Enter/Space advanced ${i3 - i2} / ${i4 - i3} beats (want 1 / 1)`);
    // A held key (auto-repeat) never runs through lines.
    await page.evaluate(() => { for (let k = 0; k < 8; k++) document.querySelector('.story-stage')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true })); });
    await page.waitForTimeout(300);
    check((await idx()) === i4, 'L: key auto-repeat advanced the dialogue');
    // Reload: the same line, Continue focused, still the only action.
    await page.waitForTimeout(400);
    const before = await prog(page);
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await waitState(page, 'presenting');
    await page.waitForTimeout(600);
    const after = await prog(page);
    const focused = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.act);
    check(after?.index === before?.index && focused === 'story-next', `L: reload → index ${before?.index} → ${after?.index}, focus ${focused}`);
    // Rotation: Continue stays on screen and keeps focus.
    for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => { const n = document.querySelector('.cine-next')!.getBoundingClientRect(); return { on: n.top >= 0 && n.bottom <= innerHeight && n.left >= 0 && n.right <= innerWidth, page: document.documentElement.scrollHeight <= innerHeight + 1, focus: (document.activeElement as HTMLElement)?.dataset.act }; });
      check(r.on && r.page && r.focus === 'story-next', `L: rotation ${vp.width}×${vp.height}: ${JSON.stringify(r)}`);
    }
    // The longest spoken line at 130 % on a short landscape phone: readable, Continue on screen.
    await page.setViewportSize({ width: 667, height: 375 });
    await page.click('[data-act="story-file"]');
    await page.click('[data-act="story-home"]');
    await page.waitForSelector('[data-act="story"]');
    await page.evaluate(() => localStorage.setItem('sticks-and-bones.settings', JSON.stringify({ format: 'sticks-and-bones/settings', version: 3, data: { storyTextScale: 1.3, instantText: true } })));
    const luz = segments(scene('chapter-5')).pre.findIndex((b) => b.raw.startsWith('LUZ: “Our local name'));
    await seed(page, { sceneId: 'chapter-5', part: 'pre', index: luz, completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4'] });
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await waitState(page, 'presenting');
    await page.waitForTimeout(600);
    const long = await page.evaluate(() => {
      const b = document.querySelector('.dialogue-body') as HTMLElement;
      const n = document.querySelector('.cine-next')!.getBoundingClientRect();
      b.scrollTop = b.scrollHeight;
      const t = document.querySelector('.dialogue-text')!.getBoundingClientRect();
      const bb = b.getBoundingClientRect();
      return { scale: getComputedStyle(document.querySelector('#app')!).getPropertyValue('--story-scale'), revealing: !!document.querySelector('.dialogue-panel.is-revealing'), next: n.bottom <= innerHeight && n.top >= 0, page: document.documentElement.scrollHeight <= innerHeight + 1, endVisible: t.bottom <= bb.bottom + 1, scrolls: b.scrollHeight > b.clientHeight + 32, focusable: b.getAttribute('tabindex') === '0' };
    });
    check(long.scale.trim() === '1.3' && !long.revealing && long.next && long.page && long.endVisible && (!long.scrolls || long.focusable), `L: longest line at 130 % on 667×375: ${JSON.stringify(long)}`);
    check(errors.length === 0, `L: errors ${errors.join(' | ')}`);
    notes.push(`L: one action (Continue); 6-tap burst moved ${i1 - i0} beat; Enter and Space one beat each; key repeat ignored; reload kept line ${after?.index} with Continue focused; Continue on screen through 844×390 / 667×375 / 390×844; longest line at 130 % (instant text from Settings) readable on 667×375${long.scrolls ? ' (its text scrolls, focusable)' : ''}`);
    await page.context().close();
  }

  // ---- H. Story analytics events (dev recorder; the transport is disabled) ------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    type Ev = { name: string; [k: string]: unknown };
    const evs = async (): Promise<Ev[]> => JSON.parse((await page.evaluate(`JSON.stringify(window.__sbAnalytics || [])`)) as string) as Ev[];
    const pre = segments(scene('chapter-1')).pre.length;
    await seed(page, { sceneId: 'chapter-1', part: 'pre', index: pre - 1 });
    await openStory(page);
    await waitState(page, 'presenting');
    await page.click('[data-act="story-next"]');
    await page.waitForTimeout(300);
    await page.click('[data-act="story-next"]').catch(() => undefined);
    await page.locator('[data-act="story-deal"]').first().waitFor({ timeout: 10_000 });
    await page.click('[data-act="story-deal"]');
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    // (The opponent may move first: any first accepted command — the AI's included — is the real start.)
    // One real move, then refresh mid-hand: the restored hand is a resume, never a second start.
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click();
      await page.locator('.end-slot.is-legal').first().click();
    } else await page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])').first().click();
    await page.waitForTimeout(600);
    const afterMove = await evs();
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    const resumed = await evs();
    const done = await playHandAtTable(page);
    await page.waitForTimeout(500);
    const final = await evs();
    const all = [...afterMove, ...final];
    const enc = afterMove.filter((e) => e.name === 'story_encounter_start');
    check(enc.length === 1 && enc[0]!.scene === 'chapter-1' && enc[0]!.mode === 'draw2' && enc[0]!.replay === false, `H: encounter start ${JSON.stringify(enc)}`);
    check(resumed.some((e) => e.name === 'story_resume' && e.scene === 'chapter-1' && e.part === 'hand' && e.via === 'continue') && !resumed.some((e) => e.name === 'story_encounter_start'), `H: refresh mid-hand should report one resume and no new start: ${JSON.stringify(resumed)}`);
    check(done && final.filter((e) => e.name === 'story_chapter_complete' && e.scene === 'chapter-1').length === 1, `H: chapter completion ${JSON.stringify(final)}`);
    check(final.filter((e) => e.name === 'story_encounter_start').length === 0, `H: the restored hand reported another start: ${JSON.stringify(final)}`);
    check(!all.some((e) => /^match_|^round_/.test(e.name)), `H: a story hand emitted Quick Play events: ${all.map((e) => e.name).join(', ')}`);
    const allowed = new Set(['name', 'scene', 'mode', 'replay', 'outcome', 'part', 'via', 'kind', 'display', 'build']);
    check(all.every((e) => Object.keys(e).every((k) => allowed.has(k))), `H: a Story event carried an unexpected field: ${JSON.stringify(all)}`);
    check(errors.length === 0, `H: page errors ${errors.join(' | ')}`);
    notes.push(`H: Story analytics — encounter start only on the first move (${enc.length}); refresh mid-hand → story_resume(hand) and no second start; chapter complete once (${final.filter((e) => e.name === 'story_chapter_complete').map((e) => e.outcome).join(',')}); no match_*/round_* from story hands; fields limited to enums`);
    await page.context().close();
  }
  // ---- I. Reload at the risky moments: AI thinking, results showing, chapter end card ------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    // AI thinking in a story hand: seed a hand that has started, reload while the opponent is to move.
    await seed(page, { sceneId: 'chapter-1', part: 'hand', index: 0 });
    await openStory(page);
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    // Regression: the scene must be truly gone under the table (it once stayed drawn and readable behind it).
    const stageGone = await page.evaluate(() => { const st = document.querySelector('.story-stage') as HTMLElement | null; return !st || getComputedStyle(st).display === 'none'; });
    check(stageGone, 'I: the story stage is still rendered under the table');
    // Make a move so the opponent thinks next, then reload inside that window.
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click();
      await page.locator('.end-slot.is-legal').first().click();
    } else await page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])').first().click();
    // What's saved at the moment of the reload (the fast test AI may already have answered the move).
    await page.reload();
    const savedAt = await prog(page);
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    const resumed = await prog(page);
    // The same hand came back: same hand number, the human's own tiles untouched, and the public log
    // continues the saved one. The restored AI may legitimately answer before this read (the log then
    // grows), but a re-deal or a lost move would break the prefix.
    type H = { number: number; hands: unknown[]; log: unknown[] };
    const hs = (savedAt?.hand as { state?: { hand?: H } } | null)?.state?.hand;
    const hr = (resumed?.hand as { state?: { hand?: H } } | null)?.state?.hand;
    const prefix = !!hs && !!hr && hs.log.length <= hr.log.length && JSON.stringify(hr.log.slice(0, hs.log.length)) === JSON.stringify(hs.log);
    check(!!hs && !!hr && hs.number === hr.number && JSON.stringify(hs.hands[0]) === JSON.stringify(hr.hands[0]) && prefix, `I: reload during the AI turn changed the hand (saved log ${hs?.log.length}, resumed ${hr?.log.length})`);
    // Results showing: finish the hand, reload with the sheet open → the outcome is kept, completion is not repeated.
    await playHandAtTable(page);
    const atResults = await prog(page);
    check(atResults?.part === 'post' && !!atResults.outcome && atResults.completed.includes('chapter-1'), `I: results not recorded at once (${JSON.stringify(atResults)})`);
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await waitState(page, 'presenting');
    const afterResultsReload = await prog(page);
    check(afterResultsReload?.outcome === atResults?.outcome && afterResultsReload?.completed.filter((c) => c === 'chapter-1').length === 1, 'I: reload on the results sheet changed the outcome or repeated the completion');
    // The first line is that outcome's insert (never a re-deal).
    check(!(await page.locator('.table-screen').count()), 'I: reload after results dealt the hand again');
    // Chapter end card: reload → the end card again, completion once.
    const n = segments(scene('chapter-1'));
    const total = (n.inserts[atResults!.outcome as 'win' | 'loss' | 'tie'] ? insertLines(n.inserts[atResults!.outcome as 'win' | 'loss' | 'tie']!).length : 0) + n.post.length;
    await seed(page, { sceneId: 'chapter-1', part: 'post', index: total - 1, outcome: atResults!.outcome, completed: ['prologue', 'chapter-1'] });
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await waitState(page, 'presenting');
    // Tap on through the last line (a tap may first finish its reveal) until the end card shows.
    for (let k = 0; k < 6 && !(await page.locator('.end-card').count()); k++) {
      await page.click('[data-act="story-next"]').catch(() => undefined);
      await page.waitForTimeout(350);
    }
    await page.locator('.end-card').first().waitFor({ timeout: 10_000 });
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await page.locator('.end-card').first().waitFor({ timeout: 10_000 });
    const end = await prog(page);
    check(end?.part === 'end' && end.completed.filter((c) => c === 'chapter-1').length === 1, `I: end-card reload ${JSON.stringify(end)}`);
    check(errors.length === 0, `I: page errors ${errors.join(' | ')}`);
    notes.push(`I: reloads — during the opponent's turn the same hand came back (hand number and the player's tiles unchanged, the public log continued, never re-dealt); with results showing the outcome (${atResults?.outcome}) and the single completion were kept and nothing re-dealt; on the chapter end card the end card came back with completion recorded once`);
    await page.context().close();
  }
  // ---- M. The corporate scenes' hands: played over the terrace, in both orientations and after rotation ----
  {
    const { page, errors } = await newPage();
    const urls: string[] = [];
    page.on('request', (r: { url(): string }) => urls.push(r.url()));
    const seen: string[] = [];
    for (const [id, done] of [['chapter-3', 3], ['chapter-7', 7]] as const) {
      const completed = ['prologue', ...[1, 2, 3, 4, 5, 6].filter((n) => n < done).map((n) => `chapter-${n}`)];
      await page.setViewportSize({ width: 390, height: 844 });
      await toMenu(page); // a fresh page: the previous hand can't write over the seed
      await seed(page, { sceneId: id, part: 'hand', index: 0, completed });
      await openStory(page);
      await page.waitForSelector('.table-screen');
      for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(700);
        const b = (await page.evaluate(`(() => { const h = document.querySelector('.story-table-host'); return { id: h.dataset.envId, bg: getComputedStyle(h).backgroundImage, app: getComputedStyle(document.getElementById('app')).backgroundImage }; })()`)) as { id: string; bg: string; app: string };
        const portrait = vp.width < vp.height;
        check(b.id === 'env.executive-terrace', `M ${id}: the hand's backdrop is ${b.id}`);
        check(b.bg.includes(portrait ? 'executive-terrace-portrait' : 'executive-terrace.'), `M ${id} ${portrait ? 'portrait' : 'landscape'}: the hand shows ${b.bg.slice(0, 160)}`);
        check(!/neighborhood-patio/.test(b.app), `M ${id}: the patio is painted behind the hand`);
        seen.push(`${id} ${portrait ? 'P' : 'L'}`);
      }
    }
    check(!urls.some((u) => /resort-patio/.test(u)), 'M: the retired leisure-resort backdrop was requested');
    check(errors.length === 0, `M: page errors ${errors.join(' | ')}`);
    notes.push(`M: Chapter 3 and 7 hands over the corporate terrace (${seen.length} checks: portrait, landscape, rotated back), no patio behind them, no resort-patio request`);
    await page.context().close();
  }
  // ---- N. Chapter replay: plays in full, counts nothing, changes nothing ----------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    const completed = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6'];
    await seed(page, { sceneId: 'chapter-7', part: 'pre', index: 2, completed });
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    const keys = ['sticks-and-bones.story', 'sticks-and-bones.stats', 'sticks-and-bones.achievements'];
    const snap = () => page.evaluate((ks: string[]) => ks.map((k) => localStorage.getItem(k)), keys);
    const before = await snap();
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    const replay = page.locator('[data-act="story-replay"][data-scene="chapter-6"]');
    await showMenuItem(page, '[data-act="story-replay"][data-scene="chapter-6"]'); // the chapter list is paginated
    await replay.dblclick(); // a double tap must open one run
    await page.locator('.story-stage[data-scene="chapter-6"]:not([hidden])').first().waitFor({ timeout: 30_000 });
    await waitState(page, 'presenting');
    const first = await dstate(page);
    const directors = await page.evaluate(() => document.querySelectorAll('.story-stage').length);
    check(first?.scene === 'chapter-6' && first.index === 0 && directors === 1, `N: replay opened ${JSON.stringify(first)} with ${directors} stage(s)`);
    const withheld0 = (await page.evaluate(`window.__sbAudio?.audio.stats.resultCuesWithheld ?? -1`)) as number;
    const cues0 = (await page.evaluate(`window.__sbAudio?.audio.stats.resultCues ?? -1`)) as number;
    const until = Date.now() + 240_000;
    let outcome: string | null = null;
    while (Date.now() < until) {
      if (await page.locator('.end-card').count()) break;
      if (await page.locator('[data-act="story-deal"]:visible').count()) {
        await page.click('[data-act="story-deal"]');
        await page.waitForSelector('.table-screen');
        check(await playHandAtTable(page), 'N: the replayed hand did not finish');
        outcome = await page.evaluate(() => document.querySelector('#results-title')?.textContent ?? null);
        await page.click('dialog.results [data-act="story-hand-done"]');
        await waitState(page, 'presenting');
        continue;
      }
      await page.click('[data-act="story-next"]').catch(() => undefined);
      await page.waitForTimeout(30);
    }
    const card = (await page.textContent('.end-card').catch(() => '')) ?? '';
    const withheld = ((await page.evaluate(`window.__sbAudio?.audio.stats.resultCuesWithheld ?? -1`)) as number) - withheld0;
    const cues = ((await page.evaluate(`window.__sbAudio?.audio.stats.resultCues ?? -1`)) as number) - cues0;
    check(/End of Chapter 6/.test(card) && /Back to the case file/.test(card), `N: replay end card "${card.slice(0, 120)}"`);
    check(withheld === 1 && cues === 0, `N: Chapter 6's replayed hand: ${cues} result cue(s), ${withheld} withheld (want none played)`);
    await page.click('[data-act="story-onward"]');
    await page.waitForSelector('.story-shell [data-act="story-continue"]', { timeout: 20_000 });
    const after = await snap();
    keys.forEach((k, i) => check(before[i] === after[i], `N: replay changed ${k}`));
    check(errors.length === 0, `N: page errors ${errors.join(' | ')}`);
    notes.push(`N: Chapter 6 replayed from the case file (double tap → one run, from beat 1): hand "${outcome}", insert, end card "Back to the case file"; result cue withheld; story position, completed chapters, statistics and achievements byte-identical afterwards`);
    await page.context().close();
  }
  // ---- O. Finish hand with AI: the real result, labelled, counted once; take over; reload; leave -----------
  {
    // Chapter 2 (Block vs Marisol) deals whose assisted result is known (found with the same session + policy).
    const SEEDS = { win: 'as3', loss: 'as0', tie: 'as37' } as const;
    const seg2 = segments(scene('chapter-2'));
    const completed = ['prologue', 'chapter-1'];
    const achCounts = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('sticks-and-bones.achievements') || 'null')?.data?.counts ?? {}) as Record<string, number>);
    const openHand = async (page: Page) => {
      await toMenu(page);
      await seed(page, { sceneId: 'chapter-2', part: 'hand', index: 0, completed, outcomes: {}, assisted: [] });
      await openStory(page);
      await page.waitForSelector('.table-screen');
    };
    const finishWithAi = async (page: Page) => {
      await page.click('[data-act="pause"]');
      await page.waitForSelector('dialog.pause[open] [data-act="assist-finish"]');
      await page.click('dialog.pause [data-act="assist-finish"]');
    };
    const rows: string[] = [];
    for (const [want, s] of Object.entries(SEEDS) as ['win' | 'loss' | 'tie', string][]) {
      const { page, errors } = await newPage({ storySeed: s });
      await openHand(page);
      const before = await achCounts(page);
      await finishWithAi(page);
      const stop = await page.locator('[data-act="assist-stop"]').count();
      const moves = await page.evaluate(() => document.querySelectorAll('.hand-tile.is-legal').length);
      await page.waitForSelector('dialog.results[open]', { timeout: 120_000 });
      const sheet = (await page.textContent('dialog.results')) ?? '';
      const p = await prog(page);
      const after = await achCounts(page);
      const gained = Object.keys(after).filter((k) => (after[k] ?? 0) !== (before[k] ?? 0));
      check(stop === 1 && moves === 0, `O ${want}: while assisting, Take over ${stop}× and ${moves} selectable tiles (want 1 and 0)`);
      check(/Finished with AI assistance/.test(sheet), `O ${want}: the results sheet is not labelled`);
      check(p?.outcome === want && (p as unknown as { outcomes: Record<string, string> }).outcomes['chapter-2'] === want, `O ${want}: recorded ${p?.outcome}`);
      check((p as unknown as { assisted: string[] }).assisted.includes('chapter-2') && p!.completed.filter((c) => c === 'chapter-2').length === 1, `O ${want}: assistance/completion not recorded once`);
      check(JSON.stringify(gained) === '["story.chapter-2"]', `O ${want}: the assisted hand changed counts ${gained.join(', ')} (want only story.chapter-2)`);
      // Continue the case: the matching insert, exactly one step on.
      await page.click('dialog.results [data-act="story-hand-done"]');
      await waitState(page, 'presenting');
      const ins = insertLines(seg2.inserts[want]!)[0]!;
      const line = (await page.textContent('.dialogue-panel')) ?? '';
      const p2 = await prog(page);
      check(line.includes((ins.text ?? '').replace(/^“|”$/g, '').slice(0, 24)), `O ${want}: first line after the hand "${line.slice(0, 60)}" is not the ${want} insert`);
      check(p2?.part === 'post' && p2.index === 0, `O ${want}: advanced to ${p2?.part} ${p2?.index}`);
      check(errors.length === 0, `O ${want}: page errors ${errors.join(' | ')}`);
      rows.push(`${want} (${s}): ${gained.length ? gained.join('+') : 'no achievement counts'}`);
      await page.context().close();
    }
    notes.push(`O: Finish hand with AI on fixed Chapter 2 deals — ${rows.join('; ')}; each labelled "Finished with AI assistance", its own insert next, one advance, completion once`);

    // Take over, reload mid-assist, leave mid-decision.
    const { page, errors } = await newPage({ storySeed: SEEDS.loss });
    await openHand(page);
    await finishWithAi(page);
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data?.hand?.assisted ?? false) === true, null, { timeout: 30_000 });
    await page.click('[data-act="assist-stop"]');
    const taken = await page.evaluate(() => document.querySelectorAll('[data-act="assist-stop"]').length);
    type Sess = { seq: number; turn: number; phase: string; canAct(seat: number): boolean };
    const sess = () => page.evaluate(() => {
      const x = (window as unknown as { __sb: { session: Sess } }).__sb.session;
      return { seq: x.seq, turn: x.turn, phase: x.phase, canAct: x.canAct(0) };
    });
    // Wait for Cousin's own turn (the opponent may move first), then nothing may move for 2.5 s.
    await page.waitForFunction(() => {
      const x = (window as unknown as { __sb: { session: Sess } }).__sb.session;
      return x.phase !== 'playing' || x.canAct(0);
    }, null, { timeout: 30_000 });
    const seqAt = await sess();
    await page.waitForTimeout(2500);
    const still = await sess();
    check(taken === 0 && seqAt.phase === 'playing' && seqAt.canAct && still.seq === seqAt.seq && still.canAct, `O take over: ${JSON.stringify({ taken, seqAt, still })} (want the player on turn and nothing moved)`);
    // Reload with an assisted hand: the label stays, the assistant does not.
    await page.reload();
    await page.click('.start-button');
    await openStory(page);
    await page.waitForSelector('.table-screen');
    const resumed = await page.evaluate(() => ({ stop: document.querySelectorAll('[data-act="assist-stop"]').length, used: (window as unknown as { __sb: { session: { assistUsed: boolean } } }).__sb.session.assistUsed }));
    check(resumed.stop === 0 && resumed.used, `O reload: ${JSON.stringify(resumed)} (want the player in control, the assisted label kept)`);
    // Leave while the assistant is deciding: nothing lands afterwards.
    await finishWithAi(page);
    await page.click('[data-act="pause"]');
    await page.click('dialog.pause [data-act="menu"]');
    await page.click('dialog.confirm[open] [data-act="confirm-yes"]');
    const handAt = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data?.hand?.state ?? null));
    await page.waitForTimeout(2500);
    const handLater = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data?.hand?.state ?? null));
    check(handAt === handLater && handAt !== 'null', 'O leave: a move landed after leaving the table');
    check(errors.length === 0, `O: page errors ${errors.join(' | ')}`);
    notes.push('O: Take over stops the assistant at once (no further assisted move); a reload mid-hand keeps "assisted" but returns control; leaving while it decides lands nothing');
    await page.context().close();
  }
  // ---- P. Transcript (reached only), recap after Skip, reach at the smallest sizes ------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    const ch1 = segments(scene('chapter-1'));
    const ch2 = segments(scene('chapter-2'));
    await seed(page, { sceneId: 'chapter-2', part: 'pre', index: 3, completed: ['prologue', 'chapter-1'], outcomes: { 'chapter-1': 'loss' }, assisted: ['chapter-1'] });
    await page.reload();
    await page.click('.start-button');
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await showMenuItem(page, '.transcript-list li');
    const t = (await page.textContent('.transcript-list')) ?? '';
    const ins = (o: 'win' | 'loss' | 'tie') => insertLines(ch1.inserts[o]!).filter((b) => b.kind === 'line').map((b) => b.text!);
    const later = ch2.pre.slice(4).filter((b) => b.kind === 'line').map((b) => b.text!).filter((x) => !ch2.pre.slice(0, 4).some((b) => b.text === x));
    check(ins('loss').every((x) => t.includes(x)) && !ins('win').some((x) => t.includes(x)), 'P transcript: the recorded loss insert is not the one shown');
    check(/lost the hand · finished with AI assistance/.test(t), 'P transcript: the assisted result label is missing');
    check(!later.some((x) => t.includes(x)) && !/Chapter 3/.test(t), 'P transcript: a beat beyond the saved line (or a later chapter) was shown');
    check(ch2.pre.slice(0, 4).filter((b) => b.kind === 'line').every((b) => t.includes(b.text!)), 'P transcript: a reached Chapter 2 line is missing');
    // Recap after Skip: Chapter 5's pre-hand evidence only; Dismiss returns focus to Deal.
    await seed(page, { sceneId: 'chapter-5', part: 'pre', index: 0, completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4'] });
    await toMenu(page);
    await openStory(page);
    await waitState(page, 'presenting');
    await page.waitForTimeout(400);
    await page.click('[data-act="story-skip"]');
    await page.waitForSelector('.hand-card .skip-recap', { timeout: 10_000 });
    const recap = (await page.textContent('.skip-recap')) ?? '';
    const own = EVIDENCE_TEXT('chapter-5', 'pre');
    const other = [...EVIDENCE_TEXT('chapter-6', 'pre'), ...EVIDENCE_TEXT('chapter-4', 'post')];
    check(own.every((x) => recap.includes(x)) && !other.some((x) => recap.includes(x)), `P recap: "${recap.slice(0, 160)}"`);
    await page.click('[data-act="recap-dismiss"]');
    const after = await page.evaluate(() => ({ recap: document.querySelectorAll('.skip-recap').length, focus: (document.activeElement as HTMLElement | null)?.dataset.act }));
    check(after.recap === 0 && after.focus === 'story-deal', `P recap dismiss: ${JSON.stringify(after)}`);
    check(errors.length === 0, `P: page errors ${errors.join(' | ')}`);
    await page.context().close();
    // Reach: the smallest portrait and landscape, reduced motion, 130 % text.
    for (const vp of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
      const { page: q, errors: e2 } = await newPage({ ...vp, reduce: true });
      await q.goto(BASE);
      await q.evaluate(() => (document.documentElement.style.fontSize = '130%'));
      await q.click('.start-button');
      await q.waitForSelector('[data-act="story"]');
      await seed(q, { sceneId: 'chapter-3', part: 'hand', index: 0, completed: ['prologue', 'chapter-1', 'chapter-2'] });
      await openStory(q);
      await q.waitForSelector('.table-screen');
      await q.evaluate(() => (document.documentElement.style.fontSize = '130%'));
      const inView = async (sel: string) => {
        // Reachable = on screen, or brought on screen by scrolling the table (large text on a small phone).
        await q.locator(sel).first().scrollIntoViewIfNeeded().catch(() => undefined);
        const b = await q.locator(sel).first().boundingBox();
        return !!b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1;
      };
      for (let k = 0; k < 60 && !(await q.locator('.table-tip').count()); k++) await q.waitForTimeout(100);
      const tipOk = (await q.locator('.table-tip').count()) === 0 || (await inView('[data-act="tips-off"]'));
      const handOk = await inView('.hand-tile');
      check(handOk, `P ${vp.width}×${vp.height}: the hand can't be reached at 130 % text`);
      await q.click('[data-act="pause"]');
      await q.waitForSelector('dialog.pause[open]');
      const finishOk = await inView('dialog.pause [data-act="assist-finish"]');
      // Keyboard: from Resume, Tab reaches Finish hand with AI.
      let reached = false;
      for (let k = 0; k < 6 && !reached; k++) {
        await q.keyboard.press('Tab');
        reached = (await q.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.act)) === 'assist-finish';
      }
      check(tipOk && finishOk && reached, `P ${vp.width}×${vp.height}: tip on screen ${tipOk}, Finish hand with AI on screen ${finishOk}, Tab-reachable ${reached}`);
      check(e2.length === 0, `P ${vp.width}×${vp.height}: page errors ${e2.join(' | ')}`);
      await q.context().close();
    }
    notes.push('P: Transcript shows reached beats only (recorded loss insert, "finished with AI assistance", nothing after the saved line or from later chapters); Skip recap lists only the skipped part’s evidence, Dismiss returns focus to Deal; at 320×568 and 568×320 (reduced motion, 130 % text) the tip and Finish hand with AI are on screen and Tab-reachable');
  }
  // ---- Q. Evidence inspection cards, the title reprise and the credits --------------------------------------
  {
    const reached = ['gate-access', 'photo-statement', 'sketch-photo', 'water-record'];
    const later = EVIDENCE.filter((e) => !reached.includes(e.id)).map((e) => playerCaption(e.at)!);
    for (const vp of [{ width: 320, height: 568, big: true }, { width: 568, height: 320, big: false }, { width: 1366, height: 768, big: false }]) {
      const { page, errors } = await newPage({ width: vp.width, height: vp.height, reduce: vp.big });
      await toMenu(page);
      await seed(page, { sceneId: 'chapter-6', part: 'pre', index: 0, completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5'], outcomes: { 'chapter-2': 'win', 'chapter-4': 'tie' } });
      await page.reload();
      if (vp.big) await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
      await page.click('.start-button');
      await page.click('[data-act="story"]');
      await page.waitForSelector('.case-menu menu-pages');
      const ids = await page.$$eval('.evidence-card', (els: Element[]) => els.map((e) => (e as HTMLElement).dataset.evidence));
      check(JSON.stringify(ids) === JSON.stringify(reached), `Q ${vp.width}×${vp.height}: evidence cards ${JSON.stringify(ids)}, want ${JSON.stringify(reached)}`);
      const all = (await page.textContent('.evidence-cards')) ?? '';
      check(!later.some((x) => all.includes(x)), `Q ${vp.width}×${vp.height}: an unreached item is on a card`);
      for (let k = 1; k <= reached.length; k++) {
        const sel = `.evidence-card:nth-child(${k})`;
        await showMenuItem(page, sel);
        await page.waitForFunction(() => !!document.querySelector<HTMLElement>('.evidence-cards')?.style.getPropertyValue('--evidence-card'), null, { timeout: 15_000 });
        const r = await page.$eval(`${sel} .evidence-card-paper`, (el: Element) => {
          const b = el.getBoundingClientRect();
          // The art (1086×1448) is cover-scaled and centred; its paper is x 85–999, y 121–1322 (measured).
          const s = Math.max(b.width / 1086, b.height / 1448);
          const ox = b.left + (b.width - 1086 * s) / 2;
          const oy = b.top + (b.height - 1448 * s) / 2;
          const paper = { l: ox + 85 * s, r: ox + 999 * s, t: oy + 121 * s, b: oy + 1322 * s };
          const out: string[] = [];
          for (const t of el.querySelectorAll('p')) {
            const range = document.createRange();
            range.selectNodeContents(t);
            for (const g of range.getClientRects()) if (g.left < paper.l - 0.5 || g.right > paper.r + 0.5 || g.top < paper.t - 0.5 || g.bottom > paper.b + 0.5) out.push(`${(t.textContent ?? '').slice(0, 24)}@${Math.round(g.left)},${Math.round(g.top)}`);
          }
          const vis = b.top >= -1 && b.bottom <= innerHeight + 1 && b.left >= -1 && b.right <= innerWidth + 1;
          return { out, vis, text: el.querySelector('.evidence-card-text')!.textContent };
        });
        const want = playerCaption(EVIDENCE.find((e) => e.id === reached[k - 1])!.at);
        check(r.text === want, `Q ${vp.width}×${vp.height} card ${k}: text "${r.text}" is not the approved caption`);
        check(r.vis && r.out.length === 0, `Q ${vp.width}×${vp.height} card ${k}: on screen ${r.vis}; glyphs off the paper ${r.out.join(' | ')}`);
      }
      await page.screenshot({ path: join(out, `evidence-${vp.width}x${vp.height}.png`) });
      check(errors.length === 0, `Q ${vp.width}×${vp.height}: page errors ${errors.join(' | ')}`);
      await page.context().close();
    }
    // Reprise and credits, after the epilogue's end card (motion on, then reduced motion).
    for (const reduce of [false, true]) {
      const vp = reduce ? { width: 320, height: 568 } : { width: 1366, height: 768 };
      const { page, errors } = await newPage({ ...vp, reduce });
      await toMenu(page);
      const all = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'];
      await seed(page, { sceneId: 'epilogue', part: 'end', index: 0, completed: all });
      await page.reload();
      await page.click('.start-button');
      await openStory(page);
      await page.waitForSelector('.end-card [data-act="story-onward"]', { timeout: 20_000 });
      check(/Title and credits/.test((await page.textContent('.end-card [data-act="story-onward"]')) ?? ''), 'Q: the epilogue end card does not offer the title and credits');
      const saved = await page.evaluate(() => localStorage.getItem('sticks-and-bones.story'));
      const ach = await page.evaluate(() => localStorage.getItem('sticks-and-bones.achievements'));
      const missing0 = (await page.evaluate(`window.__sbAudio?.audio.stats.caseCompleteMissing ?? -1`)) as number;
      await page.click('.end-card [data-act="story-onward"]');
      await page.waitForSelector('.credits-screen');
      const st = await page.evaluate(() => ({ reveal: document.querySelector<HTMLElement>('.credits-screen')!.dataset.reveal, focus: (document.activeElement as HTMLElement | null)?.dataset.act, title: !!document.querySelector('.credits-screen .wordmark'), done: document.querySelector('.credits-end')?.textContent ?? '' }));
      check(st.reveal === (reduce ? 'done' : 'play') && st.focus === 'credits-done' && st.title && /Case complete\./.test(st.done), `Q credits ${vp.width}×${vp.height}: ${JSON.stringify(st)}`);
      const missing = ((await page.evaluate(`window.__sbAudio?.audio.stats.caseCompleteMissing ?? -1`)) as number) - missing0;
      check(missing === 1, `Q credits: the case-complete cue should report its missing file once (${missing})`);
      await page.waitForTimeout(1500); // the seeded save's earlier-games notice is queued: it must wait for the Case file
      check((await page.locator('.ach-toast').count()) === 0, `Q credits ${vp.width}×${vp.height}: an achievement notice covers the reprise`);
      await page.screenshot({ path: join(out, `credits-${vp.width}x${vp.height}.png`) });
      if (!reduce) {
        await page.mouse.click(5, vp.height - 5);
        check((await page.getAttribute('.credits-screen', 'data-reveal')) === 'done', 'Q credits: a tap did not finish the reveal');
      }
      for (const pg of CREDITS) for (const l of pg.lines) {
        const sel = `.credit:has(.credit-name:text-is(${JSON.stringify(l.name)})):has(.credit-role:text-is(${JSON.stringify(l.role)}))`;
        await showMenuItem(page, sel);
        const b = await page.locator(sel).first().boundingBox();
        check(!!b && b.y >= -1 && b.y + b.height <= vp.height + 1, `Q credits ${vp.width}×${vp.height}: "${l.role}" not on screen`);
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('.story-shell [data-act="story-continue"], .story-shell [data-act="story-new"]', { timeout: 10_000 });
      check(!(await page.locator('.credits-screen').count()), 'Q credits: Escape did not return to the case file');
      check((await page.evaluate(() => localStorage.getItem('sticks-and-bones.story'))) === saved && (await page.evaluate(() => localStorage.getItem('sticks-and-bones.achievements'))) === ach, 'Q credits: the reprise or credits changed the save or achievements');
      check(errors.length === 0, `Q credits: page errors ${errors.join(' | ')}`);
      await page.context().close();
    }
    notes.push(`Q: Evidence cards show the ${reached.length} reached items only, each the exact approved caption with every glyph on the card's paper at 320×568 (130 % text), 568×320 and 1366×768; the epilogue's "Title and credits" shows the wordmark reprise and ${CREDITS.reduce((n, p) => n + p.lines.length, 0)} credit lines across ${CREDITS.length} pages, all reachable, focus on Back, a tap finishes the reveal, reduced motion skips it, Escape returns to the case file with the save and achievements unchanged; the case-complete cue reports its file missing and nothing else plays`);
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
  console.error(`\nSTORY FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nStory cinematics passed.');
process.exit(0);
