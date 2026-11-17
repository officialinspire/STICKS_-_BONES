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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { insertLines, segments } from '../src/story/chapters.ts';
import type { Scene } from '../src/story/parse.ts';
import { STAGING } from '../src/story/staging.ts';

type Page = import('playwright').Page;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/story');
mkdirSync(out, { recursive: true });
const script = JSON.parse(readFileSync(join(root, 'src/story/script.json'), 'utf8')) as { scenes: Scene[] };
const scene = (id: string) => script.scenes.find((s) => s.id === id)!;
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

const server = await createServer({ root, logLevel: 'error', server: { port: 5188, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5188/';
const browser = await chromium.launch();

async function newPage(o: { width?: number; height?: number; reduce?: boolean; blockImages?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 390, height: o.height ?? 844 }, reducedMotion: o.reduce ? 'reduce' : 'no-preference', deviceScaleFactor: 2 });
  await ctx.addInitScript('window.__name = (f) => f; window.__sbStoryFast = true;');
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
  await page.evaluate((data: unknown) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data })), { outcome: null, completed: [], textScale: 1, startedAt: 1, hand: null, ...p });
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
        const actor = r('.st-actor'), cast = r('.st-cast'), panel = r('.dialogue-panel'), controls = r('.cine-controls'), bar = r('.story-bar');
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
        const intoControls = fig && controls ? Math.max(0, fig.b - controls.y) : 0;
        const tag = document.querySelector('.dialogue-panel .speaker-name')?.textContent || null;
        return { count: shown.length, actorVisible, castVisible, speaking: stage.dataset.speaking, tag, faceCover, underBar, intoControls, figH: fig ? Math.round(fig.h) : 0, overflowX: document.documentElement.scrollWidth - innerWidth, overflowY: document.documentElement.scrollHeight - innerHeight, panel, controls, cousin: actorVisible, up: +up.toFixed(2), castUp: +castUp.toFixed(2), env: document.querySelector('.st-bg.is-front')?.dataset.env || null };
      })()`) as { count: number; actorVisible: boolean; castVisible: boolean; speaking: string; tag: string | null; faceCover: number; underBar: number; intoControls: number; figH: number; overflowX: number; overflowY: number; panel: { y: number; b: number } | null; controls: { y: number } | null; cousin: boolean; up: number; castUp: number; env: string | null };
      check(m.overflowX <= 0 && m.overflowY <= 0, `G ${vp.name} ${name}: page overflow ${m.overflowX}/${m.overflowY}`);
      check(!!m.panel && !!m.controls && m.panel.b <= m.controls.y + 1, `G ${vp.name} ${name}: dialogue overlaps the controls`);
      check(m.count <= 1, `G ${vp.name} ${name}: ${m.count} figures on stage (only the speaker may be)`);
      // Captions and narration: the backdrop only. A line: its own speaker (or nobody without a portrait).
      if (m.speaking === 'none' || m.speaking === 'other') check(m.count === 0, `G ${vp.name} ${name}: a figure is on stage during ${m.speaking === 'none' ? 'a caption' : `narration / ${m.tag}`}`);
      if (m.actorVisible) check(m.speaking === 'cousin', `G ${vp.name} ${name}: Roberto on stage while ${m.speaking} speaks`);
      if (m.cousin) check(m.up <= 1.6, `G ${vp.name} ${name}: Roberto upscaled ×${m.up} (blurry)`);
      if (m.castVisible) check(m.castUp <= 1.6, `G ${vp.name} ${name}: cast portrait upscaled ×${m.castUp} (blurry)`);
      check(m.faceCover <= 1, `G ${vp.name} ${name}: the dialogue panel covers the speaker's face by ${m.faceCover.toFixed(0)}px`);
      check(m.underBar <= 1, `G ${vp.name} ${name}: the speaker's head is under the scene bar by ${m.underBar}px`);
      check(m.intoControls <= 0, `G ${vp.name} ${name}: the speaker reaches into the controls by ${m.intoControls}px`);
      if (id === 'chapter-6' && name === 'cave-accepted-hand') check(m.env !== 'env.cave-waterfall', `G: chapter 6 rest-area beat still shows the ancient platform (${m.env})`);
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
    const savedAt = await prog(page);
    await page.reload();
    await page.click('.start-button');
    await page.waitForSelector('[data-act="story"]');
    await openStory(page);
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    const resumed = await prog(page);
    check(JSON.stringify((savedAt?.hand as { state?: { hand?: unknown } } | null)?.state?.hand ?? null) === JSON.stringify((resumed?.hand as { state?: { hand?: unknown } } | null)?.state?.hand ?? null), 'I: reload during the AI turn changed the hand');
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
    notes.push(`I: reloads — during the opponent's turn the saved hand came back identical; with results showing the outcome (${atResults?.outcome}) and the single completion were kept and nothing re-dealt; on the chapter end card the end card came back with completion recorded once`);
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
  console.error(`\nSTORY FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nStory cinematics passed.');
process.exit(0);
