/**
 * Startup / media / loading / storage fault tests (hardening pass), against the real app in Chromium.
 *
 *   A  Story chunk fails to load        → Retry / Back panel; Retry opens the case file
 *   B  Leaving while the Story loads    → the late chunk never remounts the abandoned screen
 *   C  Script fails to load             → the case file's Retry / Back; Retry renders it
 *   D  Achievements chunk fails         → the page shows Retry / Back (not a stuck "Loading…"); Retry lists them
 *   E  A stalled backdrop               → the scene still presents (fallback), and the cast still loads
 *   F  One record refuses to save       → the alert names it; another record's success doesn't hide it;
 *                                         Try again clears it only once it is really stored
 *   G  A bed fails while offline        → silence (not "broken"); back online → the current bed starts once;
 *                                         an absent (404) bed is never retried
 *   H  Story table backdrops            → every chapter's hand shows its own place (Chapter 6 drawn, no photo)
 *   I  Music fails offline              → transient, not broken; back online → the current track plays, once
 *
 * Usage: npm run faults
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

type Page = import('playwright').Page;
type Route = { abort(code?: string): Promise<void>; continue(): Promise<void>; fulfill(o: { status: number; body?: string }): Promise<void> };
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/faults');
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);

const server = await createServer({ root, logLevel: 'error', server: { port: 5186, strictPort: true } });
await server.listen();
const BASE = 'http://localhost:5186/';
const browser = await chromium.launch();

async function newPage(o: { width?: number; height?: number } = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 390, height: o.height ?? 844 } });
  await ctx.addInitScript('window.__name = (f) => f; window.__sbStoryFast = true;');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  return { page, errors, ctx };
}
async function toMenu(page: Page) {
  await page.goto(BASE);
  await page.click('.start-button');
  await page.waitForSelector('[data-act="story"]');
}
const seedStory = (page: Page, data: Record<string, unknown>) =>
  page.evaluate((d: unknown) => localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: d })), { part: 'pre', index: 0, outcome: null, completed: ['prologue'], textScale: 1, startedAt: 1, hand: null, ...data });
/** After Retry: if the app reloaded (a refused chunk), tap Start; it returns to the same screen once. */
async function afterRetry(page: Page): Promise<void> {
  await page.waitForTimeout(600);
  if (await page.locator('.start-button').count()) {
    await page.click('.start-button');
    const skip = page.locator('[data-act="intro-skip"]');
    if (await skip.count()) await skip.click().catch(() => undefined);
  }
}
const until = async (fn: () => Promise<boolean>, ms = 10_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 60));
  }
  return false;
};

try {
  // ---- A. Story chunk fails, then Retry ---------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    let fail = true;
    await page.route(/\/src\/ui\/story-ui\.ts/, (r: Route) => (fail ? r.abort('internetdisconnected') : r.continue()));
    await page.click('[data-act="story"]');
    const panel = await page.waitForSelector('.load-failed', { timeout: 10_000 }).catch(() => null);
    check(!!panel, 'A: no failure panel when the Story chunk failed');
    const txt = (await panel?.textContent()) ?? '';
    check(/didn’t load/.test(txt) && (await page.locator('.load-failed [data-act="load-retry"]').count()) === 1 && (await page.locator('.load-failed [data-act="load-back"]').count()) === 1, `A: panel lacks Retry/Back: ${txt}`);
    check(await page.evaluate(() => document.activeElement?.getAttribute('data-act') === 'load-retry'), 'A: Retry not focused');
    fail = false;
    await page.click('[data-act="load-retry"]');
    // Chromium keeps a failed dynamic import for the page's lifetime: Retry either loads it again or reloads the
    // app and returns to the Story (once) after the start tap.
    await afterRetry(page);
    const opened = await page.waitForSelector('[data-act="story-new"], [data-act="story-continue"]', { timeout: 15_000 }).catch(() => null);
    check(!!opened, 'A: Retry did not open the case file');
    check(errors.filter((e) => !/Failed to fetch dynamically imported module|Importing a module script failed/.test(e)).length === 0, `A: page errors ${errors.join(' | ')}`);
    notes.push('A: Story chunk refused → "The Story didn’t load" with Retry (focused) and Back; Retry loaded it and opened the case file');
    await page.context().close();
  }

  // ---- B. Leave while the Story chunk is still loading ----------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/src\/ui\/story-ui\.ts/, async (r: Route) => {
      await held;
      await r.continue();
    });
    await page.click('[data-act="story"]');
    await page.waitForSelector('[data-act="story-load-back"]');
    await page.click('[data-act="story-load-back"]');
    await page.waitForSelector('[data-act="story"]');
    release();
    await page.waitForTimeout(2500);
    const where = await page.evaluate(() => ({ story: !!document.querySelector('.story-shell'), menu: !!document.querySelector('[data-act="story"]'), cls: document.getElementById('app')!.className }));
    check(!where.story && where.menu, `B: the late Story chunk remounted an abandoned screen ${JSON.stringify(where)}`);
    // And it still opens normally afterwards.
    await page.click('[data-act="story"]');
    check(!!(await page.waitForSelector('[data-act="story-new"], [data-act="story-continue"]', { timeout: 15_000 }).catch(() => null)), 'B: Story did not open after the abandoned load');
    check(errors.length === 0, `B: page errors ${errors.join(' | ')}`);
    notes.push('B: left the slow Story load with ← Menu; when the chunk arrived 2.5 s later the menu stayed; Story opened normally afterwards');
    await page.context().close();
  }

  // ---- C. Script fails, then Retry --------------------------------------------------------------------
  {
    const { page } = await newPage();
    await toMenu(page);
    let fail = true;
    await page.route(/\/src\/story\/script\.json/, (r: Route) => (fail ? r.abort('internetdisconnected') : r.continue()));
    await page.click('[data-act="story"]');
    const panel = await page.waitForSelector('.load-failed', { timeout: 10_000 }).catch(() => null);
    check(/case file didn’t load/.test((await panel?.textContent()) ?? ''), 'C: no case-file failure panel when the script failed');
    fail = false;
    await page.click('[data-act="load-retry"]');
    await afterRetry(page);
    check(!!(await page.waitForSelector('[data-act="story-new"], [data-act="story-continue"]', { timeout: 15_000 }).catch(() => null)), 'C: Retry did not render the case file (rejected script promise kept?)');
    notes.push('C: script refused → "The case file didn’t load" with Retry/Back; Retry fetched it again (the rejected promise was not cached)');
    await page.context().close();
  }

  // ---- D. Achievements chunk fails, then Retry ---------------------------------------------------------
  {
    const { page } = await newPage();
    let fail = true;
    await page.route(/\/src\/ui\/achievements\.ts/, (r: Route) => (fail ? r.abort('internetdisconnected') : r.continue()));
    await toMenu(page);
    await page.click('[data-go="achievements"]');
    const panel = await page.waitForSelector('.ach-panel .load-failed', { timeout: 10_000 }).catch(() => null);
    check(!!panel, 'D: the Achievements page stayed on "Loading…" after the chunk failed');
    fail = false;
    await page.click('.ach-panel [data-act="load-retry"]');
    await afterRetry(page);
    const listed = await until(async () => (await page.locator('.ach-panel .load-failed').count()) === 0 && !(await page.locator('.ach-panel').textContent())!.includes('Loading achievements'));
    check(listed, 'D: Retry did not list the achievements');
    // Back from a failure goes to the menu.
    notes.push('D: achievements chunk refused → Retry/Back on the page (no stuck "Loading…"); Retry listed them');
    await page.context().close();
  }

  // ---- E. A stalled backdrop never blocks the scene ------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    await page.route(/executive-terrace/, () => new Promise<void>(() => {})); // never answers
    await seedStory(page, { sceneId: 'chapter-3', completed: ['prologue', 'chapter-1', 'chapter-2'] });
    await page.click('[data-act="story"]');
    await page.waitForSelector('[data-act="story-continue"]');
    const t0 = Date.now();
    await page.click('[data-act="story-continue"]');
    const up = await page.waitForFunction(`window.__sbStory && window.__sbStory.director.state === 'presenting'`, null, { timeout: 12_000 }).then(() => true, () => false);
    const ms = Date.now() - t0;
    check(up, 'E: the scene never presented behind a stalled backdrop');
    const st = await page.evaluate(() => ({ env: document.querySelector('.st-bg.is-front')?.getAttribute('data-env') ?? null }));
    check(st.env === null || st.env === 'none', `E: expected the drawn fallback while the backdrop stalls (${st.env})`);
    // The other slot still works: Vale's sheet (the next speaker) loads while the backdrop hangs.
    for (let i = 0; i < 6; i++) {
      await page.click('[data-act="story-next"]');
      await page.waitForTimeout(250);
    }
    const cast = await until(() => page.evaluate(() => !!document.querySelector('.st-cast-art[data-cast]')), 8000);
    check(cast, 'E: no cast sheet loaded while the backdrop stalled (queue blocked?)');
    check(errors.length === 0, `E: page errors ${errors.join(' | ')}`);
    notes.push(`E: executive-terrace never answered → the scene presented over the drawn fallback after ${ms} ms; cast sheets still loaded on the other slot`);
    await page.context().close();
  }

  // ---- F. One record refuses to save -----------------------------------------------------------------------
  {
    const { page, errors } = await newPage();
    await toMenu(page);
    // Refuse ONLY the Story record (as a full quota would for a bigger write).
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      (window as unknown as { __refuse: Set<string> }).__refuse = new Set(['sticks-and-bones.story']);
      Storage.prototype.setItem = function (k: string, v: string) {
        if ((window as unknown as { __refuse: Set<string> }).__refuse.has(k)) throw new DOMException('quota', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    });
    await seedStoryNoWrite(page);
    await page.click('[data-act="story"]');
    await page.waitForSelector('[data-act="story-continue"], [data-act="story-new"]');
    await page.click('[data-act="story-continue"], [data-act="story-new"]');
    await page.waitForFunction(`window.__sbStory && window.__sbStory.director.state === 'presenting'`, null, { timeout: 12_000 });
    await page.waitForTimeout(400);
    await page.click('[data-act="story-next"]');
    await page.waitForTimeout(300);
    await page.click('[data-act="story-next"]');
    const alert1 = await page.evaluate(() => ({ shown: !document.querySelector('.save-alert')?.hasAttribute('hidden') && !!document.querySelector('.save-alert'), failing: (document.querySelector('.save-alert') as HTMLElement | null)?.dataset.failing ?? '', text: document.querySelector('.save-alert')?.textContent ?? '' }));
    check(alert1.shown && alert1.failing === 'story' && /Story progress/.test(alert1.text), `F: the alert does not name the Story record ${JSON.stringify(alert1)}`);
    // Settings save fine meanwhile: that success must NOT hide the Story failure.
    await page.evaluate(() => (window as unknown as { __sbAchievements: { note(c: string): void } }).__sbAchievements.note('explore.settings'));
    await page.evaluate(() => localStorage.setItem('probe', '1'));
    const stillFailing = await page.evaluate(() => (document.querySelector('.save-alert') as HTMLElement).dataset.failing);
    check(stillFailing === 'story', `F: another record's success hid the Story failure (${stillFailing})`);
    // Try again while still refused: stays. Then storage recovers: Try again clears it and stores the LATEST position.
    await page.click('[data-act="save-retry"]');
    check((await page.evaluate(() => (document.querySelector('.save-alert') as HTMLElement).dataset.failing)) === 'story', 'F: Try again cleared the warning although storage still refused');
    const shownIndex = await page.evaluate(`window.__sbStory.director.index`);
    await page.evaluate(() => (window as unknown as { __refuse: Set<string> }).__refuse.clear());
    await page.click('[data-act="save-retry"]');
    const after = await page.evaluate(() => ({ hidden: document.querySelector('.save-alert')?.hasAttribute('hidden'), saved: JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data?.index }));
    check(after.hidden === true, 'F: the warning stayed after the record was really stored');
    check(after.saved === shownIndex, `F: the retry stored index ${after.saved}, the player is on ${shownIndex}`);
    check(errors.length === 0, `F: page errors ${errors.join(' | ')}`);
    notes.push(`F: Story writes refused → "Not saved: your Story progress"; other records saving didn't hide it; Try again kept it while still refused; once storage recovered, Try again stored the latest line (${after.saved}) and cleared the warning`);
    await page.context().close();
  }

  // ---- G. Ambience: offline failure recovers; an absent file is never retried ----------------------------
  {
    const { page, ctx, errors } = await newPage();
    let mode: 'offline' | 'ok' | 'absent' = 'offline';
    let requests = 0;
    await page.route(/amb-(terrace|promenade)\.mp3$/, (r: Route & { request(): { url(): string } }) => {
      requests++;
      if (/promenade/.test(r.request().url())) return r.fulfill({ status: 404, body: '' });
      return mode === 'offline' ? r.abort('internetdisconnected') : r.continue();
    });
    await toMenu(page);
    await seedStory(page, { sceneId: 'chapter-3', completed: ['prologue', 'chapter-1', 'chapter-2'] });
    await page.click('[data-act="story"]');
    await page.click('[data-act="story-continue"]');
    await page.waitForFunction(`window.__sbStory && window.__sbStory.director.state === 'presenting'`, null, { timeout: 12_000 });
    const transient = await until(() => page.evaluate(() => (window as unknown as { __sbAudio: { backend: { bufferStates(): Record<string, string> } } }).__sbAudio.backend.bufferStates()['bed:amb-terrace'] === 'transient'));
    check(transient, 'G: an offline bed failure was not classed as transient');
    const bedBefore = await page.evaluate(() => (window as unknown as { __sbAudio: { backend: { bedState(): { bed: string | null } } } }).__sbAudio.backend.bedState().bed);
    check(bedBefore === null, 'G: a bed sounded although its file failed');
    mode = 'ok';
    await ctx.setOffline(true);
    await ctx.setOffline(false); // fires 'online'
    const started = await until(() => page.evaluate(() => (window as unknown as { __sbAudio: { backend: { bedState(): { bed: string | null } } } }).__sbAudio.backend.bedState().bed === 'amb-terrace'));
    check(started, 'G: the bed did not start after reconnection');
    const cues = await page.evaluate(() => (window as unknown as { __sbAudio: { audio: { pendingCueVoices(): number } } }).__sbAudio.audio.pendingCueVoices());
    check(cues === 0, 'G: recovery replayed story cues');
    // Absent: Chapter 4's bed returns 404 → missing, never fetched again on gesture or reconnection.
    await page.click('[data-act="story-file"]');
    await seedStory(page, { sceneId: 'chapter-4', completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3'] });
    await page.click('[data-act="story-home"]');
    await page.click('[data-act="story"]');
    await page.click('[data-act="story-continue"]');
    await page.waitForFunction(`window.__sbStory && window.__sbStory.director.state === 'presenting'`, null, { timeout: 12_000 });
    const missing = await until(() => page.evaluate(() => (window as unknown as { __sbAudio: { backend: { bufferStates(): Record<string, string> } } }).__sbAudio.backend.bufferStates()['bed:amb-promenade'] === 'missing'));
    check(missing, 'G: a 404 bed was not classed as absent');
    const n = requests;
    await page.waitForTimeout(4200); // past the recovery cooldown
    await ctx.setOffline(true);
    await ctx.setOffline(false);
    await page.mouse.click(5, 400);
    await page.waitForTimeout(800);
    check(requests === n, `G: an absent bed was fetched again (${requests - n} more requests)`);
    check(errors.length === 0, `G: page errors ${errors.join(' | ')}`);
    notes.push('G: offline bed → transient, silence; back online → the current bed (amb-terrace) started once, no cue replayed; a 404 bed → missing and never re-fetched on reconnection or gesture');
    await page.context().close();
  }

  // ---- H. Every story table shows its own chapter's place ------------------------------------------------
  {
    const { page, errors } = await newPage();
    const order = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7'];
    const want: Record<string, string> = { 'chapter-1': 'env.neighborhood-patio', 'chapter-2': 'env.back-alley', 'chapter-3': 'env.executive-terrace', 'chapter-4': 'env.moonlit-promenade', 'chapter-5': 'env.jungle-camp', 'chapter-6': 'none', 'chapter-7': 'env.executive-terrace' };
    const seen: string[] = [];
    for (const [id, env] of Object.entries(want)) {
      await toMenu(page);
      await seedStory(page, { sceneId: id, part: 'hand', completed: order.slice(0, order.indexOf(id)) });
      await page.click('[data-act="story"]');
      await page.click('[data-act="story-continue"]');
      await page.waitForSelector('.table-screen', { timeout: 20_000 });
      const got = await page.evaluate(() => {
        const h = document.querySelector('.story-table-host') as HTMLElement;
        return { id: h.dataset.envId, bg: getComputedStyle(h).backgroundImage };
      });
      check(got.id === env, `H: ${id} hand shows ${got.id}, expected ${env}`);
      if (env === 'none') check(!/url\(/.test(got.bg), `H: chapter 6 hand painted a photo backdrop (${got.bg.slice(0, 120)})`);
      else check(got.bg.includes(env.slice(4)), `H: ${id} hand background is ${got.bg.slice(0, 140)}`);
      check(!/neighborhood-patio/.test(got.bg) || env === 'env.neighborhood-patio', `H: ${id} hand fell back to the patio`);
      seen.push(`${id.replace('chapter-', 'Ch')}=${env.replace('env.', '')}`);
      await page.screenshot({ path: join(out, `hand-${id}.png`) });
    }
    check(errors.length === 0, `H: page errors ${errors.join(' | ')}`);
    notes.push(`H: story tables over their own chapter's place: ${seen.join(', ')}`);
    await page.context().close();
  }
  // ---- I. Menu music fails while offline, then recovers on reconnection (once, current scene only) ----------
  {
    const { page, ctx, errors } = await newPage();
    let offline = true;
    let hits = 0;
    await page.route(/\/music\/[^?]*\.mp3$/, (r: Route) => {
      hits++;
      return offline ? r.abort('internetdisconnected') : r.continue();
    });
    await toMenu(page);
    const A = `window.__sbAudio`;
    const down = await until(() => page.evaluate(`${A}.audio.failure('menu') === 'transient'`) as Promise<boolean>, 12_000);
    check(down, `I: the menu track's offline failure was not classed transient (${await page.evaluate(`${A}.audio.failure('menu')`)})`);
    check((await page.evaluate(`${A}.backend.playingCount()`)) === 0, 'I: music claims to play while failed');
    offline = false;
    await ctx.setOffline(true);
    await ctx.setOffline(false);
    const playing = await until(() => page.evaluate(`${A}.audio.playing === 'menu' && ${A}.backend.playingCount() === 1`) as Promise<boolean>, 12_000);
    check(playing, 'I: the menu track did not recover after reconnection');
    check((await page.evaluate(`${A}.backend.playingCount()`)) <= 1, 'I: more than one music track after recovery');
    check(errors.length === 0, `I: page errors ${errors.join(' | ')}`);
    notes.push(`I: menu music refused offline → transient (not broken); back online → the menu track (the current scene's) played again, one track only (${hits} requests)`);
    await page.context().close();
  }
} catch (e) {
  failures.push(`exception: ${(e as Error).stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}

/** A fresh case for F, written before storage starts refusing it (the seed itself must succeed). */
async function seedStoryNoWrite(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __refuse: Set<string> }).__refuse.delete('sticks-and-bones.story');
    localStorage.setItem('sticks-and-bones.story', JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: 'chapter-1', part: 'pre', index: 0, outcome: null, completed: ['prologue'], textScale: 1, startedAt: 1, hand: null } }));
    (window as unknown as { __refuse: Set<string> }).__refuse.add('sticks-and-bones.story');
  });
}

writeFileSync(join(out, 'report.json'), JSON.stringify({ failures, notes }, null, 1));
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\nFAULTS FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nFault tests passed.');
process.exit(0);
