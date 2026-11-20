/**
 * npm run a11y — accessibility and input checks on the real app (Chromium):
 *
 *  1. axe-core (WCAG 2.1 A/AA + best practice) on every screen and dialog;
 *     serious/critical violations fail.
 *  2. Keyboard-only: start → menu → setup → deal → select a tile → place it,
 *     with a visible focus indicator on every focused control.
 *  3. Focus trapping and restoration: pause sheet, confirm dialog, results
 *     sheet and the privacy cover keep Tab inside; Escape/close returns focus
 *     to the control that opened them.
 *  4. Screen-reader hand privacy: under the cover and during computer turns,
 *     the accessibility tree and live region never expose a hidden hand.
 *  5. Non-colour legal indicators: legal tiles carry a ✓ badge and "playable"
 *     in their name; others carry neither — verified with colour removed.
 *  6. Reduced motion (device setting and in-app setting): no running
 *     animations, no effects, no slam after real moves.
 *  7. Safe areas (notch/home-indicator insets via DevTools emulation),
 *     portrait and landscape: no control inside an inset.
 *  8. Orientation change mid-game (portrait ↔ landscape resize): layout
 *     re-fits with no page scroll, open ends stay reachable, state unchanged;
 *     with two humans the hand is covered.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { showMenuItem } from './lib/menu-navigation';
import { engine, HARNESS, launchOptions, unsupported } from './lib/engine';

type Page = import('playwright').Page;
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'test-results/a11y');
mkdirSync(outDir, { recursive: true });
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

const server = await createServer({ root, logLevel: 'error', server: { port: 5196, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5196/';
const browser = await engine.launch(launchOptions());

async function newPage(o: { width?: number; height?: number; reducedMotion?: 'reduce' | 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 390, height: o.height ?? 844 }, reducedMotion: o.reducedMotion ?? 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e: Error) => failures.push(`page error: ${e.message}`));
  page.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && failures.push(`console error: ${m.text()}`));
  return page;
}

async function tryClick(loc: { click(o: { timeout: number }): Promise<void> }) {
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
  // The studio credit: Skip is armed once the start gesture is released (it can't skip by accident).
  const skip = page.locator('[data-skip="armed"] [data-act="intro-skip"]');
  await skip.waitFor({ timeout: 2500 }).then(() => tryClick(skip), () => undefined);
  await page.waitForSelector('[data-go="setup"]');
}

async function startMatch(page: Page, o: { mode?: string; opponent?: string; fixture?: string; seed?: string }) {
  await enterMenu(page);
  await page.click('[data-go="setup"]');
  await showMenuItem(page, 'input[name="seed"]');
  await page.fill('input[name="seed"]', o.seed ?? 'a11y');
  await showMenuItem(page, 'input[name="aiSeed"]');
  await page.fill('input[name="aiSeed"]', 'a11y-ai');
  await showMenuItem(page, 'input[name="fastAi"]');
  await page.check('input[name="fastAi"]');
  if (o.mode) {
    await showMenuItem(page, `input[name="mode"][value="${o.mode}"]`);
    await page.check(`input[name="mode"][value="${o.mode}"]`);
  }
  if (o.opponent) {
    await showMenuItem(page, `input[name="opponent"][value="${o.opponent}"]`);
    await page.check(`input[name="opponent"][value="${o.opponent}"]`);
  }
  if (o.fixture) {
    await showMenuItem(page, `[data-fixture="${o.fixture}"]`);
    await page.click(`[data-fixture="${o.fixture}"]`);
  }
  else await page.click('.btn-start');
  await page.waitForSelector('.table-screen');
}

const kind = (page: Page) => page.evaluate(() => (window as unknown as { __sb?: { controller: { state: { kind: string } } } }).__sb?.controller.state.kind ?? '');
async function waitHumanTurn(page: Page) {
  for (let i = 0; i < 300; i++) {
    if ((await kind(page)) === 'human-turn' && (await page.locator('.hand-tile').count())) return true;
    if (await page.locator('[data-act="cover-ready"]').count()) await tryClick(page.locator('[data-act="cover-ready"]'));
    if (await page.locator('[data-act="cover-reveal"]').count()) await tryClick(page.locator('[data-act="cover-reveal"]'));
    await page.waitForTimeout(100);
  }
  return false;
}

// ---- 1. axe ---------------------------------------------------------------
const axeSummary: Record<string, string> = {};
async function axe(page: Page, label: string) {
  await page.addScriptTag({ path: AXE });
  const res = (await page.evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })`)) as {
    violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[];
  };
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const minor = res.violations.filter((v) => !bad.includes(v));
  for (const v of bad) failures.push(`axe ${label}: [${v.impact}] ${v.id} — ${v.help} @ ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
  axeSummary[label] = `${bad.length} serious/critical, ${minor.length} minor${minor.length ? ` (${minor.map((v) => v.id).join(', ')})` : ''}`;
}

// Focus is visibly indicated: an outline or box-shadow differs from the unfocused state.
async function focusVisible(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'nothing focused';
    const s = getComputedStyle(el);
    const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || /rgb/.test(s.boxShadow);
    return ring ? null : `${el.tagName}.${el.className} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" has no visible focus ring`;
  });
}

async function tabStaysInside(page: Page, container: string, label: string, presses = 25) {
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
    const inside = await page.evaluate((sel: string) => {
      const a = document.activeElement;
      const c = document.querySelector(sel);
      return !!a && !!c && (c.contains(a) || a === c);
    }, container);
    if (!inside) {
      const where = await page.evaluate(() => `${document.activeElement?.tagName}.${(document.activeElement as HTMLElement | null)?.className}`);
      failures.push(`${label}: Tab escaped ${container} to ${where}`);
      return;
    }
  }
  notes.push(`${label}: focus stayed inside ${container} for ${presses} Tab/Shift+Tab presses`);
}

const activeIs = (page: Page, sel: string) => page.evaluate((s: string) => document.activeElement?.matches(s) ?? false, sel);

try {
  // 1. axe on every screen.
  {
    const page = await newPage();
    await page.goto(BASE);
    await page.waitForSelector('.start-button');
    await axe(page, 'start screen');
    await page.click('.start-button');
    await page.waitForSelector('[data-go="setup"]');
    // Contrast is judged on the settled menu, not mid-reveal (elements fade in from transparent).
    await page.locator('.scene:not(.is-reveal)').waitFor();
    await axe(page, 'menu');
    for (const s of ['setup', 'setup-local', 'rules', 'stats', 'settings', 'achievements']) {
      await page.click(`[data-go="${s}"]`);
      await page.waitForSelector('[data-act="home"]');
      await axe(page, `menu: ${s}`);
      await page.click('[data-act="home"]');
    }
    // Story: case file, a scene — and keyboard-only advancing.
    await page.click('[data-act="story"]');
    await page.waitForSelector('.story-shell');
    await axe(page, 'story: case file');
    await page.click('[data-act="story-new"], [data-act="story-continue"]');
    await page.waitForSelector('.story-stage');
    // Input during the entrance fade is ignored by design: wait until the scene is presenting.
    await page.waitForFunction(`window.__sbStory && window.__sbStory.director.state === 'presenting'`, null, { timeout: 8000 });
    check(await activeIs(page, '[data-act="story-next"]'), 'story: Continue not focused when the scene opens');
    // First input on a revealing line only completes the reveal (by design); let it finish so Enter advances.
    await page.waitForTimeout(1000);
    const pos0 = await page.textContent('.cine-pos');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const pos1 = await page.textContent('.cine-pos');
    check(pos0 !== pos1, `story: Enter did not advance (${pos0} → ${pos1})`);
    await page.waitForTimeout(300);
    await axe(page, 'story: scene');
    // The dialogue panel holds one control (Continue); Aa and Transcript are gone (no extra focus stops).
    const panel = await page.evaluate(() => ({ buttons: [...document.querySelectorAll('.dialogue-panel button, .dialogue-panel [tabindex="0"]')].map((b) => (b as HTMLElement).dataset.act ?? b.className), removed: document.querySelectorAll('[data-act="story-text"], [data-act="story-transcript"], dialog.transcript').length, live: document.querySelector('.dialogue-body')?.getAttribute('aria-live') }));
    check(panel.buttons.length === 1 && panel.buttons[0] === 'story-next' && panel.removed === 0 && panel.live === 'polite', `story: dialogue panel controls ${JSON.stringify(panel)}`);
    notes.push(`story: keyboard Enter advanced ${pos0} → ${pos1}; the dialogue panel's only control is Continue; the line is announced (aria-live polite)`);
    await page.click('[data-act="story-file"]');
    await page.click('[data-act="story-home"]');
    await page.waitForSelector('[data-go="setup"]');
    await startMatch(page, { mode: 'partnership4', opponent: 'ai', seed: 'axe' });
    await waitHumanTurn(page);
    await page.locator('.hand-tile.is-legal').first().click();
    await axe(page, 'table (tile selected, ends shown)');
    await page.click('[data-act="pause"]');
    await axe(page, 'pause sheet');
    await page.click('[data-act="restart"]');
    await page.waitForSelector('dialog.confirm[open]');
    await axe(page, 'confirm dialog');
    await page.click('[data-act="confirm-no"]');
    await startMatch(page, { fixture: 'match-point' });
    await page.locator('.hand-tile.is-legal').first().click();
    await page.locator('.end-slot.is-legal').first().click();
    await page.waitForSelector('dialog.results[open]');
    await page.waitForTimeout(1200);
    await axe(page, 'results sheet');
    await startMatch(page, { mode: 'draw2', opponent: 'local' });
    await axe(page, 'handoff cover');
    await page.click('[data-act="cover-ready"]');
    await axe(page, 'reveal step');
    await page.context().close();
  }

  // 2 + 3. Keyboard only, focus rings, traps, restoration.
  {
    const page = await newPage();
    await page.goto(BASE);
    // The button is shown disabled ("Loading…") during initialization and is focused once it is ready.
    await page.waitForSelector('.start-button:not([disabled])');
    check(await activeIs(page, '.start-button'), 'keyboard: start button is not focused on load');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-go="setup"]');
    // Tab to "New game" and open setup.
    for (let i = 0; i < 10 && !(await activeIs(page, '[data-go="setup"]')); i++) await page.keyboard.press('Tab');
    check(await activeIs(page, '[data-go="setup"]'), 'keyboard: cannot Tab to New game');
    const ring = await focusVisible(page);
    check(ring === null, `keyboard: ${ring}`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('form');
    // Every control in the setup form is reachable and shows focus.
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => {
        const a = document.activeElement as HTMLInputElement | null;
        return a ? `${a.tagName}:${a.name || a.dataset.act || a.textContent?.trim().slice(0, 20)}` : '';
      });
      if (seen.has(id)) continue;
      seen.add(id);
      const r = await focusVisible(page);
      if (r) failures.push(`keyboard (setup): ${r}`);
      if (await activeIs(page, '.btn-start')) break;
    }
    check(await activeIs(page, '.btn-start'), 'keyboard: cannot Tab to "Deal the tiles"');
    notes.push(`keyboard: setup form — ${seen.size} stops, all with a visible focus ring`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.table-screen');
    await waitHumanTurn(page);
    // Select a legal tile and place it with the keyboard only.
    let placed = false;
    for (let i = 0; i < 60 && !placed; i++) {
      await page.keyboard.press('Tab');
      if (await activeIs(page, '.hand-tile.is-legal')) {
        const r = await focusVisible(page);
        check(r === null, `keyboard (hand): ${r}`);
        const before = await page.locator('.board-tile').count();
        await page.keyboard.press('Enter');
        await page.waitForSelector('.end-slot.is-legal');
        check(await activeIs(page, '.end-slot.is-legal'), 'keyboard: focus did not move to an open end after selecting a tile');
        const r2 = await focusVisible(page);
        check(r2 === null, `keyboard (end): ${r2}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        placed = (await page.locator('.board-tile').count()) > before;
      }
    }
    check(placed, 'keyboard: could not place a tile with Tab + Enter');
    if (placed) notes.push('keyboard: placed a tile with Tab/Enter only (focus moved to the open end, rings visible)');
    // Pause: trap + Escape restores focus to Pause.
    await page.focus('[data-act="pause"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.pause[open]');
    check(await activeIs(page, '[data-act="pause-resume"]'), 'pause: Resume not focused on open');
    await tabStaysInside(page, 'dialog.pause[open]', 'pause sheet');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check(!(await page.locator('dialog.pause[open]').count()), 'pause: Escape did not close the sheet');
    check(await activeIs(page, '[data-act="pause"]'), 'pause: focus not restored to the Pause button after Escape');
    // Confirm: trap + Escape returns to the pause sheet's Restart button.
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.pause[open]');
    await page.focus('[data-act="restart"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.confirm[open]');
    check(await activeIs(page, '[data-act="confirm-no"]'), 'confirm: safe choice not focused on open');
    await tabStaysInside(page, 'dialog.confirm[open]', 'confirm dialog', 10);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const back = await page.evaluate(() => `${document.activeElement?.tagName} ${(document.activeElement as HTMLElement | null)?.dataset.act ?? ''}`);
    check(/pause|restart/.test(back), `confirm: focus not restored after Escape (on ${back})`);
    notes.push(`confirm: Escape restored focus to ${back.trim()}`);
    await page.keyboard.press('Escape');
    await page.context().close();
  }
  // Results trap; cover trap; focus returns to the table after the cover.
  {
    const page = await newPage();
    await startMatch(page, { fixture: 'match-point' });
    await page.locator('.hand-tile.is-legal').first().click();
    await page.locator('.end-slot.is-legal').first().click();
    await page.waitForSelector('dialog.results[open]');
    check(await activeIs(page, 'dialog.results [data-act="new-match"]'), 'results: primary action not focused');
    const top = await page.evaluate(() => document.querySelector('dialog.results')!.scrollTop);
    check(top === 0, `results: sheet opened scrolled by ${top}px (title hidden)`);
    await tabStaysInside(page, 'dialog.results[open]', 'results sheet', 12);
    await page.keyboard.press('Escape');
    check((await page.locator('dialog.results[open]').count()) === 1, 'results: Escape dismissed the results sheet (it must not)');
    await startMatch(page, { mode: 'draw2', opponent: 'local', seed: 'cover' });
    check(await activeIs(page, '[data-act="cover-ready"]'), 'cover: "ready" not focused');
    await tabStaysInside(page, '.privacy-cover', 'privacy cover', 12);
    await page.focus('[data-act="cover-ready"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-act="cover-reveal"]');
    check(await activeIs(page, '[data-act="cover-reveal"]'), 'cover: Reveal not focused');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.hand-tile');
    const after = await page.evaluate(() => (document.activeElement?.closest('.table-screen') ? 'table' : document.activeElement?.tagName));
    check(after === 'table', `cover: focus not returned to the table after Reveal (on ${after})`);
    await page.context().close();
  }

  // 4. Screen-reader privacy: accessibility tree + live region.
  {
    const page = await newPage();
    await page.addInitScript(`window.__live = []; new MutationObserver(() => { const t = document.querySelector('[data-region="announce"]')?.textContent; if (t && __live[__live.length - 1] !== t) __live.push(t); }).observe(document, { subtree: true, childList: true, characterData: true });`);
    await startMatch(page, { mode: 'draw2', opponent: 'local', seed: 'sr-privacy' });
    const hiddenTiles = async () =>
      page.evaluate(() => {
        const sb = (window as unknown as { __sb: { session: { debugState(): { hand: { hands: string[][] } } }; controller: { revealed(): number | null } } }).__sb;
        const r = sb.controller.revealed();
        return sb.session.debugState().hand.hands.filter((_, s) => s !== r).flat();
      });
    const nameOf = (id: string) => {
      const n = ['blank', 'one', 'two', 'three', 'four', 'five', 'six'];
      const hi = Number(id[1]);
      const lo = Number(id[2]);
      return hi === lo ? `double ${n[hi]}` : `${n[hi]}–${n[lo]}`;
    };
    let checks = 0;
    for (let turn = 0; turn < 8; turn++) {
      // Covered: nothing private in the tree.
      if (await page.locator('.privacy-cover:not([hidden])').count()) {
        const tree = await page.locator('body').ariaSnapshot();
        const hidden = await hiddenTiles();
        const leak = hidden.filter((t: string) => tree.includes(nameOf(t) + ',') || tree.includes(t));
        check(leak.length === 0 && !/playable/.test(tree), `screen reader: covered table exposes ${leak.join(',')}`);
        checks++;
      }
      if (!(await waitHumanTurn(page))) break;
      const tree = await page.locator('body').ariaSnapshot();
      const hidden = await hiddenTiles();
      const leak = hidden.filter((t: string) => tree.includes(nameOf(t) + ','));
      check(leak.length === 0, `screen reader: the other player's tiles in the tree during a revealed turn: ${leak.join(',')}`);
      checks++;
      const legal = page.locator('.hand-tile.is-legal');
      if (await legal.count()) {
        await legal.first().click();
        await page.locator('.end-slot.is-legal').first().click();
      } else {
        const d = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
        if (await d.count()) await d.first().click();
      }
      await page.waitForTimeout(200);
    }
    const live = (await page.evaluate('__live')) as string[];
    const drewLeak = live.filter((t) => /drew (a |the )?\d\|\d|drew (double|blank|one|two|three|four|five|six)/i.test(t));
    check(drewLeak.length === 0, `screen reader: live region named a drawn tile: ${drewLeak.join(' / ')}`);
    notes.push(`screen-reader privacy (two humans): ${checks} accessibility-tree snapshots and ${live.length} live-region messages, no hidden tile named`);
    await page.context().close();
    // Solo: the computer's hand never appears in the tree.
    const p2 = await newPage();
    await startMatch(p2, { mode: 'partnership4', opponent: 'ai', seed: 'sr-ai' });
    let snaps = 0;
    for (let i = 0; i < 12; i++) {
      const st = await p2.evaluate(() => {
        const sb = (window as unknown as { __sb: { session: { debugState(): { hand: { hands: string[][] } }; isHuman(s: number): boolean } } }).__sb;
        return sb.session.debugState().hand.hands.filter((_, s) => !sb.session.isHuman(s)).flat();
      });
      const tree = await p2.locator('body').ariaSnapshot();
      const leak = st.filter((t: string) => tree.includes(nameOf(t) + ','));
      check(leak.length === 0, `screen reader: computer tiles in the accessibility tree: ${leak.join(',')}`);
      snaps++;
      if ((await kind(p2)) === 'human-turn') {
        const legal = p2.locator('.hand-tile.is-legal');
        if (await legal.count()) {
          await tryClick(legal.first());
          await tryClick(p2.locator('.end-slot.is-legal').first());
        } else await tryClick(p2.locator('[data-act="pass"]:not([disabled])'));
      }
      await p2.waitForTimeout(250);
    }
    notes.push(`screen-reader privacy (vs computer): ${snaps} snapshots across human and computer turns, no computer tile named`);
    await p2.context().close();
  }

  // 5. Non-colour legal indicators (checked with colour removed).
  {
    const page = await newPage();
    await startMatch(page, { fixture: 'both-ends' });
    await page.addStyleTag({ content: 'html { filter: grayscale(1) }' });
    const facts = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hand-tile')].map((el) => ({
        legal: el.classList.contains('is-legal'),
        badge: getComputedStyle(el, '::after').content,
        name: el.getAttribute('aria-label') ?? '',
        lift: getComputedStyle(el).transform,
      })),
    );
    for (const f of facts) {
      if (f.legal) check(/✓/.test(f.badge) && /, playable/.test(f.name), `legal tile lacks ✓ badge or "playable" name: ${f.name} ${f.badge}`);
      else check(!/✓/.test(f.badge) && /not playable/.test(f.name), `illegal tile shows a badge or lacks "not playable": ${f.name}`);
    }
    await page.locator('.hand-tile.is-legal').first().click();
    const ends = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.end-slot.is-legal')].map((e) => ({ cue: e.querySelector('.slot-cue')?.textContent ?? '', name: e.getAttribute('aria-label') ?? '' })));
    check(ends.length >= 1 && ends.every((e: { cue: string; name: string }) => e.cue === '▼' && /^Play .+ on the \d end/.test(e.name)), `open ends lack the ▼ cue or a descriptive name: ${JSON.stringify(ends)}`);
    await page.screenshot({ path: join(outDir, 'legal-indicators-grayscale.png') });
    notes.push(`non-colour indicators: ${facts.filter((f: { legal: boolean }) => f.legal).length} legal tiles with ✓ + "playable", ${facts.filter((f: { legal: boolean }) => !f.legal).length} without; ${ends.length} open ends with ▼ + name (grayscale screenshot saved)`);
    await page.context().close();
  }

  // 6. Reduced motion: device preference, then the in-app setting with the device at full motion.
  for (const how of ['device', 'setting'] as const) {
    const page = await newPage({ reducedMotion: how === 'device' ? 'reduce' : 'no-preference', width: 1366, height: 768 });
    if (how === 'setting') {
      await enterMenu(page);
      await page.click('[data-go="settings"]');
      await showMenuItem(page, 'input[name="set-motion"][value="reduce"]');
      await page.check('input[name="set-motion"][value="reduce"]');
    }
    await page.addInitScript(`window.__anims = 0; window.__fx = 0; window.__slam = 0;
      new MutationObserver(() => {
        if (document.querySelector('.fx')) __fx++;
        if (document.querySelector('svg.host-svg[data-frame^="cousin.anim.slam"]')) __slam++;
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-frame'] });`);
    await startMatch(page, { mode: 'draw2', opponent: 'ai', seed: 'motion' });
    let running = 0;
    for (let i = 0; i < 6; i++) {
      if (await waitHumanTurn(page)) {
        const legal = page.locator('.hand-tile.is-legal');
        if (await legal.count()) {
          await tryClick(legal.first());
          running = Math.max(running, (await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)) as number);
          await tryClick(page.locator('.end-slot.is-legal').first());
        } else await tryClick(page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])').first());
      }
      running = Math.max(running, (await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)) as number);
      await page.waitForTimeout(150);
    }
    const fx = (await page.evaluate('__fx')) as number;
    const slam = (await page.evaluate('__slam')) as number;
    check(running === 0 && fx === 0 && slam === 0, `reduced motion (${how}): ${running} running animations, ${fx} effect frames, ${slam} slam frames`);
    notes.push(`reduced motion (${how}): 6 turns, 0 running animations, 0 effects, 0 slam frames`);
    await page.context().close();
  }

  // 7. Safe areas: emulated notch/home-indicator insets, portrait and landscape.
  for (const vp of [
    { width: 390, height: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
    { width: 844, height: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  ]) {
    if (!HARNESS.cdp) {
      unsupported('a11y', `safe-area insets ${vp.width}×${vp.height} (notch / home indicator)`, 'inset emulation is a DevTools (Chromium) feature; real-device checklist item 11');
      continue;
    }
    const page = await newPage({ width: vp.width, height: vp.height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: vp.insets });
    const inInset = `(() => { const I = ${JSON.stringify(vp.insets)}; const out = [];
      for (const el of document.querySelectorAll('button, a[href], input, select, summary, .hand-tile')) {
        if (!el.checkVisibility || !el.checkVisibility()) continue;
        if (el.closest('[inert], .dev-panel')) continue;
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        const sc = el.closest('.scene'); // menu pages scroll: only the first screenful counts
        if (sc && r.top > innerHeight) continue;
        if (r.top < I.top - 0.5 || r.left < I.left - 0.5 || r.right > innerWidth - I.right + 0.5 || r.bottom > innerHeight - I.bottom + 0.5) out.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      } return out; })()`;
    await enterMenu(page);
    const menu = (await page.evaluate(inInset)) as string[];
    await startMatch(page, { mode: 'partnership4', opponent: 'ai', seed: 'safe' });
    await waitHumanTurn(page);
    await page.locator('.hand-tile.is-legal').first().click();
    const table = (await page.evaluate(inInset)) as string[];
    check(menu.length === 0, `safe area ${vp.width}x${vp.height}: menu controls inside the inset: ${menu.join(' | ')}`);
    check(table.length === 0, `safe area ${vp.width}x${vp.height}: table controls inside the inset: ${table.join(' | ')}`);
    await page.screenshot({ path: join(outDir, `safe-area-${vp.width}x${vp.height}.png`) });
    notes.push(`safe areas ${vp.width}x${vp.height} insets ${JSON.stringify(vp.insets)}: no control inside an inset (menu + table)`);
    await page.context().close();
  }

  // 8. Orientation change mid-game.
  {
    const page = await newPage();
    await startMatch(page, { fixture: 'max-board' });
    await waitHumanTurn(page);
    await page.locator('.hand-tile.is-legal').first().click();
    const before = await page.evaluate(() => JSON.stringify((window as unknown as { __sb: { session: { debugState(): unknown } } }).__sb.session.debugState()));
    for (const vp of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(400);
      const f = await page.evaluate(() => {
        const ends = [...document.querySelectorAll('.end-slot.is-legal')].map((el) => {
          const r = el.getBoundingClientRect();
          const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!t && (t === el || el.contains(t));
        });
        return { scrollY: document.documentElement.scrollHeight - innerHeight, scrollX: document.documentElement.scrollWidth - innerWidth, ends };
      });
      check(f.scrollX <= 0 && f.scrollY <= 0, `orientation ${vp.width}x${vp.height}: page scrolls (${f.scrollX}, ${f.scrollY})`);
      check(f.ends.length === 2 && f.ends.every(Boolean), `orientation ${vp.width}x${vp.height}: open ends not both reachable (${JSON.stringify(f.ends)})`);
    }
    const after = await page.evaluate(() => JSON.stringify((window as unknown as { __sb: { session: { debugState(): unknown } } }).__sb.session.debugState()));
    check(before === after, 'orientation: game state changed across rotations');
    notes.push('orientation: 390×844 → 844×390 → 390×844 → 1024×768 → 768×1024 with a tile selected — no page scroll, both open ends reachable each time, state unchanged');
    await page.context().close();
    // Two humans: a real orientation event covers the hand.
    const p2 = await newPage();
    await startMatch(p2, { mode: 'draw2', opponent: 'local', seed: 'rotate' });
    await waitHumanTurn(p2);
    await p2.setViewportSize({ width: 844, height: 390 });
    await p2.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await p2.waitForTimeout(150);
    check((await p2.locator('.privacy-cover:not([hidden])').count()) === 1 && (await p2.locator('.hand-tile').count()) === 0, 'orientation (two humans): hand not covered after rotating');
    notes.push('orientation (two humans): rotating to landscape covers the hand');
    await p2.context().close();
  }
} finally {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ failures, notes, axe: axeSummary }, null, 1));
  await browser.close();
  await server.close();
}
for (const [k, v] of Object.entries(axeSummary)) console.log(`  axe ${k}: ${v}`);
for (const n of notes) console.log('  ✓ ' + n);
console.log(`a11y: ${failures.length} failures`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
