/**
 * npm run offline:tour — the whole game from the offline pack, on the PRODUCTION build (run `npm run build`
 * first), served from a GitHub-Pages-style subpath. Chromium only (the browser available here).
 *
 *  0. Online first visit: the whole-game download completes ("Full game ready offline").
 *  1. The browser is closed; it relaunches on the same profile OFFLINE with the server down (every app
 *     request would be logged and refused). From here on, 0 app requests may reach the network.
 *  2. The studio intro plays from the cache to its end; the menu music starts.
 *  3. A Quick Play hand completes (tile SFX, impact effects, a result cue).
 *  4. The WHOLE case through the real UI: New Case → Prologue → seven chapter hands (a legal-move bot plays
 *     Roberto) → each hand's insert matches its real result → end cards → Epilogue → "Case complete".
 *     At each scene's first line and in each hand, the music actually playing and the ambience bed actually
 *     looping are sampled and must be the scene's profile (src/audio/profiles.ts); the result cue sounds
 *     after the lighter chapters' hands and never after Chapters 5–7.
 *  5. The knock motif (Prologue's three + a fourth from beyond; Chapter 6's), waited out: three matched
 *     knocks 0.62 s apart on the audio clock, then the answer 1.15 s after the third.
 *  6. Resume: a Quick Play match and a story hand reloaded offline come back identical.
 *  7. Achievements unlocked by the tour are shown, and survive a reload.
 *  8. Phone landscape, small phone, tablet and desktop: every scene opens over its own backdrop, no
 *     horizontal overflow, the panel on screen; rotating mid-line keeps the line.
 *
 * Instrumentation is page-side and production-safe: HTMLMediaElement.play/pause and AudioBufferSourceNode
 * start/stop are wrapped (with each buffer traced to its URL through fetch → decodeAudioData), so the test
 * sees what the browser was asked to sound. It cannot hear: levels and timbre are docs/AUDIO.md's business.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, type StoryProfileId } from '../src/audio/profiles.ts';
import { MOTIF } from '../src/audio/motif.ts';
import { insertLines, segments, type Outcome } from '../src/story/chapters.ts';
import { playerCaption } from '../src/story/captions.ts';
import type { Scene } from '../src/story/parse.ts';
import { showMenuItem } from './lib/menu-navigation';
import { engine, HARNESS, unsupported } from './lib/engine';

type Page = import('playwright').Page;
type BrowserContext = import('playwright').BrowserContext;
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('offline:tour: dist/ is missing — run npm run build first');
  process.exit(1);
}
const out = join(root, 'test-results/offline-tour');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const script = JSON.parse(readFileSync(join(root, 'src/story/script.json'), 'utf8')) as { scenes: Scene[] };
const ORDER = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'] as const;
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => ok || failures.push(msg);
const T0 = Date.now();
const step = (s: string) => console.error(`[tour ${((Date.now() - T0) / 1000).toFixed(0)} s] ${s}`);

// ---- server (GitHub Pages-like: byte ranges, max-age) ---------------------------------------------
const APP = '/STICKS_-_BONES/';
const PORT = 5196;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const srv = { down: false, refused: [] as string[] };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  if (srv.down) {
    if (!url.pathname.endsWith('/sw.js')) srv.refused.push(url.pathname);
    return void req.socket.destroy();
  }
  let rel = url.pathname.startsWith(APP) ? decodeURIComponent(url.pathname.slice(APP.length)) : null;
  if (rel === '' || rel?.endsWith('/')) rel = `${rel}index.html`;
  const file = rel === null ? null : normalize(join(dist, rel));
  if (!file || !file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return void res.end();
  }
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return void res.end();
    }
    res.writeHead(206, {
      'content-type': type,
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    });
    return void createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'accept-ranges': 'bytes',
    'cache-control': 'max-age=600',
  });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(PORT, r));

// ---- page-side instrumentation ------------------------------------------------------------------------
const SETTINGS = JSON.stringify({
  format: 'sticks-and-bones/settings',
  version: 3,
  data: {
    explicitLanguage: true,
    banter: true,
    motion: 'system',
    hostAnimation: true,
    aiSpeed: 'quick',
    audio: {
      master: 0.8,
      music: 0.6,
      sfx: 0.8,
      voice: 0.9,
      ambience: 0.5,
      muted: false,
      ambienceOn: true,
    },
    haptics: false,
    storyTextScale: 1,
    instantText: true,
  },
});
const INSTRUMENT = `
window.__name = (f) => f;
if (!localStorage.getItem('sticks-and-bones.settings')) localStorage.setItem('sticks-and-bones.settings', ${JSON.stringify(SETTINGS)});
const base = (u) => String(u || '').split('/').pop().split('?')[0].replace(/-[\\w-]{8}\\.(\\w+)$/, '.$1');
const L = (window.__sbLog = []);
const playing = (window.__sbPlaying = new Set());
const loops = (window.__sbLoops = new Set());
const urlOf = new WeakMap();
const F = window.fetch;
window.fetch = async function (input, init) {
  const res = await F.apply(this, arguments);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const ab = res.arrayBuffer.bind(res);
  res.arrayBuffer = async () => { const b = await ab(); urlOf.set(b, url); return b; };
  return res;
};
const D = BaseAudioContext.prototype.decodeAudioData;
BaseAudioContext.prototype.decodeAudioData = function (buf, ...rest) {
  const u = urlOf.get(buf);
  return Promise.resolve(D.call(this, buf, ...rest)).then((ab) => { if (u) urlOf.set(ab, u); return ab; });
};
const S = AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start = function (when = 0, ...r) {
  const f = base(urlOf.get(this.buffer));
  L.push({ t: performance.now(), k: this.loop ? 'loop' : 'buf', f, when, now: this.context.currentTime });
  if (this.loop) { loops.add(this); this.__f = f; this.addEventListener('ended', () => loops.delete(this)); }
  return S.call(this, when, ...r);
};
const P = HTMLMediaElement.prototype;
const play = P.play;
P.play = function () {
  const el = this;
  const r = play.apply(el, arguments);
  Promise.resolve(r).then(() => { playing.add(el); L.push({ t: performance.now(), k: 'media', f: base(el.currentSrc || el.src) }); }, () => {});
  if (!el.__sbWatched) { el.__sbWatched = true; el.addEventListener('ended', () => playing.delete(el)); el.addEventListener('pause', () => playing.delete(el)); }
  return r;
};
window.__sbVideoMax = 0;
document.addEventListener('timeupdate', (e) => { if (e.target instanceof HTMLVideoElement) window.__sbVideoMax = Math.max(window.__sbVideoMax, e.target.currentTime); }, true);
window.__sbFx = { impact: 0, big: 0, knock: 0 };
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('fx')) { if (n.classList.contains('fx-impact')) window.__sbFx.impact++; if (n.classList.contains('fx-big')) window.__sbFx.big++; if (n.classList.contains('fx-knock')) window.__sbFx.knock++; } }).observe(document, { subtree: true, childList: true });
window.__sbNow = () => ({ music: [...playing].filter((e) => !(e instanceof HTMLVideoElement) && !e.paused).map((e) => base(e.currentSrc || e.src)), beds: [...loops].map((s) => s.__f) });
`;
type LogEntry = {
  t: number;
  k: 'loop' | 'buf' | 'media';
  f: string;
  when: number;
  now: number;
};
const now = (page: Page) => page.evaluate(() => (window as unknown as { __sbNow(): { music: string[]; beds: string[] } }).__sbNow());
const logOf = (page: Page) => page.evaluate(() => (window as unknown as { __sbLog: LogEntry[] }).__sbLog) as Promise<LogEntry[]>;

const TRACK_FILE: Record<string, string> = {
  menu: 'patio-dominoes-take-2.mp3',
  gameplay: 'domino-table-subtle-vibe.mp3',
  promenade: 'promenade-after-dark.mp3',
  threshold: 'the-lit-threshold.mp3',
};
const bedFile = (b: string | null) => (b ? `${b}.mp3` : null);

// ---- helpers ------------------------------------------------------------------------------------------
const PROFILE_DIR = join(out, 'profile');
async function launch(offline: boolean, viewport = { width: 390, height: 844 }): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  if (offline && !HARNESS.offlineNavigation) unsupported('offline:tour', 'browser-wide offline emulation on the cold relaunch', 'Playwright WebKit fails navigations under offline emulation; the server is down instead (no network for the app)');
  const ctx = await engine.launchPersistentContext(PROFILE_DIR, {
    viewport,
    offline: offline && HARNESS.offlineNavigation,
  });
  await ctx.addInitScript(INSTRUMENT);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  return { ctx, page, errors };
}
async function enterMenu(page: Page, watchIntro = false) {
  await page.waitForSelector('.start-button:not([disabled])', {
    timeout: 30_000,
  });
  await page.click('.start-button');
  if (!watchIntro)
    await page
      .locator('[data-skip="armed"] [data-act="intro-skip"]')
      .click({ timeout: 4000 })
      .catch(() => undefined);
  await page.waitForSelector('[data-go="setup"]', { timeout: 30_000 });
}
const offlineText = (page: Page) => page.locator('[data-region="offline-status"]').first().textContent();
async function playHand(page: Page, budget = 180_000): Promise<number> {
  const until = Date.now() + budget;
  let moves = 0;
  while (Date.now() < until) {
    if (await page.evaluate(() => (document.querySelector('dialog.results') as HTMLDialogElement | null)?.open ?? false)) return moves;
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
      await page
        .locator('.end-slot.is-legal')
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
      moves++;
      continue;
    }
    const act = page.locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
    if (await act.count()) {
      await act
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
      moves++;
    }
    await page.waitForTimeout(60);
  }
  return -1;
}
/** The line on screen once the scene is presenting (production: DOM only). */
async function lineOnScreen(page: Page): Promise<string> {
  await page
    .waitForFunction(
      () => {
        const panel = document.querySelector('.dialogue-panel') as HTMLElement | null;
        return (
          !!document.querySelector('.st-curtain:not(.is-closed)') &&
          !!panel &&
          !panel.hidden &&
          !!document.querySelector('.dialogue-body')?.textContent?.trim() &&
          !!document.querySelector('.cine-pos')?.textContent?.trim()
        );
      },
      null,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  return (await page.textContent('.dialogue-panel').catch(() => '')) ?? '';
}
const prog = (page: Page) =>
  page.evaluate(`JSON.parse(localStorage.getItem('sticks-and-bones.story') || 'null')?.data ?? null`) as Promise<{
    sceneId: string;
    part: string;
    index: number;
    outcome: Outcome | null;
    completed: string[];
    hand: unknown;
  } | null>;
const visible = (page: Page, sel: string) =>
  page.evaluate((s: string) => {
    const e = document.querySelector(s) as HTMLElement | null;
    return !!e && !e.hidden && e.offsetParent !== null;
  }, sel);
const seedStory = (page: Page, sceneId: string, index = 0, part = 'pre', completed: string[] = ['prologue']) =>
  page.evaluate(
    ([sc, i, pt, c]: readonly [string, number, string, string[]]) =>
      localStorage.setItem(
        'sticks-and-bones.story',
        JSON.stringify({
          format: 'sticks-and-bones/story',
          version: 2,
          data: {
            sceneId: sc,
            part: pt,
            index: i,
            outcome: null,
            completed: c,
            textScale: 1,
            startedAt: 1,
            hand: null,
          },
        }),
      ),
    [sceneId, index, part, completed] as const,
  );
async function openScene(page: Page, sceneId: string, index = 0) {
  await seedStory(page, sceneId, index);
  await page.reload();
  await enterMenu(page);
  await page.click('[data-act="story"]');
  await page.locator('[data-act="story-continue"]').first().waitFor({ timeout: 20_000 });
  await page.click('[data-act="story-continue"]');
  await lineOnScreen(page);
  // Taps during the scene's entrance (fade 550 ms + figure 260 ms) are ignored by design, never queued.
  await page.waitForTimeout(1200);
}
const sceneOf = (id: string) => script.scenes.find((s) => s.id === id)!;
const preIndex = (id: string, re: RegExp) => segments(sceneOf(id)).pre.findIndex((b) => re.test(b.raw));
const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

let pageErrors: string[] = [];
try {
  // ---- 0. Online first visit: the whole pack -----------------------------------------------------------
  step('0. online first visit');
  {
    const { ctx, page } = await launch(false);
    await page.goto(`${ORIGIN}${APP}`);
    await enterMenu(page);
    const t = Date.now();
    let s = '';
    while (Date.now() - t < 240_000 && !/^✓ Full game ready offline/.test(s)) {
      s = (await offlineText(page).catch(() => '')) ?? '';
      await page.waitForTimeout(500);
    }
    check(/^✓ Full game ready offline/.test(s), `online visit: the full game never became ready offline ("${s}")`);
    notes.push(`online first visit: "${s}" after ${((Date.now() - t) / 1000).toFixed(0)} s`);
    await ctx.close();
  }

  // ---- 1–2. Offline cold launch, intro played out, menu music ----------------------------------------------
  step('1. offline cold launch');
  srv.down = true;
  const { ctx, page, errors } = await launch(true);
  pageErrors = errors;
  await page.goto(`${ORIGIN}${APP}`);
  await page.waitForSelector('.start-button:not([disabled])', {
    timeout: 30_000,
  });
  const startStatus = (await page.textContent('.start-status')) ?? '';
  check(/^Ready\.$/.test(startStatus.trim()), `offline: start screen says "${startStatus}"`);
  await enterMenu(page, true); // the studio credit plays out by itself
  const videoMax = await page.evaluate(() => (window as unknown as { __sbVideoMax: number }).__sbVideoMax);
  check(videoMax > 5, `offline: the intro video did not play out from the cache (reached ${videoMax.toFixed(1)} s)`);
  await page.waitForTimeout(2500);
  const menuNow = await now(page);
  check(same(menuNow.music, [TRACK_FILE.menu!]), `offline menu: music playing ${JSON.stringify(menuNow.music)}, expected the patio track`);
  check((await offlineText(page))?.startsWith('✓ Full game ready offline') === true, 'offline menu: the status line no longer says the full game is ready');
  notes.push(`offline cold launch: "Ready." → the studio video played out from the cache (${videoMax.toFixed(1)} s) → menu with ${menuNow.music.join(', ')}`);

  // ---- 3. Quick Play hand -------------------------------------------------------------------------------
  step('3. quick play');
  {
    const before = (await logOf(page)).length;
    await page.click('[data-go="setup"]');
    await showMenuItem(page, 'input[name="opponent"][value="ai"]');
    await page.check('input[name="opponent"][value="ai"]');
    await page.click('.btn-start');
    await page.waitForSelector('.table-screen');
    await page.waitForTimeout(3000);
    const handNow = await now(page);
    const moves = await playHand(page);
    check(moves >= 0, 'quick play: the hand did not finish offline');
    await page.waitForTimeout(800);
    const log = (await logOf(page)).slice(before);
    const files = new Set(log.map((l) => l.f));
    const fx = await page.evaluate(() => (window as unknown as { __sbFx: Record<string, number> }).__sbFx);
    check(same(handNow.music, [TRACK_FILE.gameplay!]), `quick play: music ${JSON.stringify(handNow.music)}, expected the table track`);
    check(handNow.beds.includes('amb-patio.mp3'), `quick play: beds ${JSON.stringify(handNow.beds)}, expected the patio bed`);
    check(
      [...files].some((f) => /^tile-(place|pickup|slam-owner|drop-owner)/.test(f)),
      `quick play: no tile sound (${[...files].join(', ')})`,
    );
    check([...files].filter((f) => /^result-(win|other)\.mp3$/.test(f)).length === 1, `quick play: result cue starts ${[...files].filter((f) => /^result-/.test(f)).join(', ') || 'none'}`);
    check(fx.impact + fx.big > 0, `quick play: no impact effect (${JSON.stringify(fx)})`);
    notes.push(
      `offline Quick Play hand (${moves} moves): music ${handNow.music.join(', ')}, bed ${handNow.beds.join(', ')}; sounds ${[...files].filter(Boolean).sort().join(', ')}; effects ${JSON.stringify(fx)}`,
    );
  }

  // ---- 4. The whole case ----------------------------------------------------------------------------------
  step('4. the whole case');
  await page.reload();
  await enterMenu(page);
  await page.evaluate(() => localStorage.removeItem('sticks-and-bones.story'));
  await page.click('[data-act="story"]');
  await page.locator('[data-act="story-new"]').first().waitFor();
  await page.click('[data-act="story-new"]');
  if (await page.locator('dialog.confirm[open] [data-act="confirm-yes"]').count()) await page.click('dialog.confirm[open] [data-act="confirm-yes"]');
  const caseRows: string[] = [];
  const moods: string[] = [];
  for (const id of ORDER) {
    step(`   ${id}`);
    const prof = PROFILES[id as StoryProfileId];
    const seg = segments(sceneOf(id));
    await page.locator(`.story-stage[data-scene="${id}"]`).first().waitFor({ timeout: 30_000 });
    await lineOnScreen(page);
    await page.waitForTimeout(3200); // fades and the bed cross-fade (2.4 s) settle
    const talk = await now(page);
    const wantMusic = prof.track ? [TRACK_FILE[prof.track]!] : [];
    check(same(talk.music, wantMusic), `${id} dialogue: music ${JSON.stringify(talk.music)}, expected ${JSON.stringify(wantMusic)}`);
    check(same(talk.beds, prof.bed ? [bedFile(prof.bed)!] : []), `${id} dialogue: beds ${JSON.stringify(talk.beds)}, expected ${prof.bed}`);
    let outcome: Outcome | null = null;
    let handNow: { music: string[]; beds: string[] } | null = null;
    let cues: string[] = [];
    const until = Date.now() + 300_000;
    while (Date.now() < until) {
      if (await visible(page, '.end-card')) break;
      if (await visible(page, '[data-act="story-deal"]')) {
        await page.click('[data-act="story-deal"]');
        await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
        await page.waitForTimeout(3000);
        handNow = await now(page);
        const before = (await logOf(page)).length;
        const moves = await playHand(page);
        check(moves >= 0, `${id}: the hand did not finish`);
        await page.waitForTimeout(600);
        cues = (await logOf(page))
          .slice(before)
          .map((l) => l.f)
          .filter((f) => /^result-/.test(f));
        outcome = (await prog(page))?.outcome ?? null;
        // Roberto is the player here: his figure never laughs or gloats at the other side's win.
        const mood = await page.evaluate(() => document.querySelector('dialog.results .results-host')?.getAttribute('data-mood') ?? null);
        const wantMood = outcome === 'win' ? 'delighted' : 'thinking';
        check(mood === wantMood, `${id}: after a ${outcome} the results sheet shows Roberto "${mood}" (want "${wantMood}")`);
        moods.push(`${id} ${outcome}→${mood}`);
        await page.click('dialog.results [data-act="story-hand-done"]');
        const first = await lineOnScreen(page);
        const ins = outcome && seg.inserts[outcome] ? insertLines(seg.inserts[outcome]!)[0] : null;
        const want = ins ? (ins.kind === 'line' ? ins.text! : (playerCaption(ins.raw) ?? '')) : '';
        check(!!ins && first.includes(want.replace(/^“|”$/g, '').slice(0, 30)), `${id}: after a ${outcome} the first line was not its insert ("${first.slice(0, 70)}")`);
        continue;
      }
      await page.click('[data-act="story-next"]').catch(() => undefined);
      await page.waitForTimeout(30);
    }
    if (handNow) {
      const wantHand = prof.handTrack ? [TRACK_FILE[prof.handTrack]!] : [];
      // Chapter 6's music-off holds through its hand (the rest area): no music.
      check(same(handNow.music, wantHand), `${id} hand: music ${JSON.stringify(handNow.music)}, expected ${JSON.stringify(wantHand)}`);
      check(same(handNow.beds, prof.bed ? [bedFile(prof.bed)!] : []), `${id} hand: beds ${JSON.stringify(handNow.beds)}, expected ${prof.bed}`);
      check(cues.length === (prof.resultCue ? 1 : 0), `${id}: ${cues.length} result cue(s) (${cues.join(', ')}); the profile says ${prof.resultCue ? 'one' : 'none'}`);
    }
    const card = (await page.textContent('.end-card').catch(() => '')) ?? '';
    if (seg.notebook) check(card.includes(seg.notebook.raw.replace(/^Notebook:\s*/, '').slice(0, 40)), `${id}: the notebook entry is missing from the end card`);
    if (id === 'epilogue') check(/Case complete/.test(card), 'epilogue: no "Case complete"');
    caseRows.push(
      `${id}${outcome ? ` (${outcome})` : ''}: talk ${talk.music.join('+') || 'no music'} / ${talk.beds.join('+') || 'no bed'}${handNow ? `; hand ${handNow.music.join('+') || 'no music'} / ${handNow.beds.join('+') || 'no bed'}; result cue ${cues.join('+') || 'none'}` : ''}`,
    );
    if (id !== 'epilogue') await page.locator('[data-act="story-onward"]').click();
  }
  const p = await prog(page);
  check(
    ORDER.every((s) => p?.completed.includes(s)),
    `completion not recorded for every scene: ${p?.completed.join(', ')}`,
  );
  notes.push(`whole case offline (production build): ${caseRows.join(' · ')}`);
  notes.push(`Roberto's results-sheet mood per hand: ${moods.join(', ')}`);

  // ---- 5. The knock motif, waited out ---------------------------------------------------------------------
  step('5. knocks');
  {
    const motif = async (label: string, setup: () => Promise<void>, act: () => Promise<void>) => {
      await setup(); // may reload the page, which starts a fresh log
      const before = (await logOf(page)).length;
      await act();
      const kn = (await logOf(page)).slice(before).filter((l) => /^motif-knock-/.test(l.f));
      const three = kn.filter((l) => /^motif-knock-[123]\.wav$/.test(l.f));
      const beyond = kn.filter((l) => l.f === 'motif-knock-beyond.wav');
      const gaps = three.slice(1).map((l, j) => +(l.when - three[j]!.when).toFixed(3));
      check(
        three.length === 3 && new Set(three.map((l) => l.f)).size === 3 && gaps.every((g) => Math.abs(g - MOTIF.interval) < 0.02),
        `${label}: the three knocks ${JSON.stringify(three.map((l) => l.f))} at gaps ${JSON.stringify(gaps)} (want 3 distinct, ${MOTIF.interval} s apart)`,
      );
      check(beyond.length === 1, `${label}: the fourth knock sounded ${beyond.length}×`);
      return { three, beyond, gaps };
    };
    // Prologue: a fresh case. Three measured knocks on its first beat; the fourth alone, two beats later.
    const pro = await motif(
      'prologue',
      async () => {
        await page.reload();
        await enterMenu(page);
        await page.click('[data-act="story"]');
        await page.locator('[data-act="story-new"]').first().waitFor();
      },
      async () => {
        await page.click('[data-act="story-new"]');
        if (await page.locator('dialog.confirm[open] [data-act="confirm-yes"]').count()) await page.click('dialog.confirm[open] [data-act="confirm-yes"]');
        await lineOnScreen(page);
        await page.waitForTimeout(2800); // the three knocks play out on the first beat
        for (const k of [0, 1]) {
          await page.click('[data-act="story-next"]');
          await page.waitForTimeout(k ? 1800 : 600);
        }
      },
    );
    notes.push(
      `prologue motif offline (fresh case): knocks ${pro.three.map((l) => l.f.replace(/motif-knock-|\.wav/g, '')).join(', ')} at ${pro.gaps.join(' / ')} s on the audio clock; the fourth "from beyond" once, on its own beat`,
    );
    // Chapter 6: the whole motif on one beat; the answer comes 1.15 s after the third knock.
    const i = preIndex('chapter-6', /Three knocks\. A fourth answers/);
    const c6 = await motif(
      'chapter-6',
      () => openScene(page, 'chapter-6', i - 1),
      async () => {
        await page.click('[data-act="story-next"]');
        await page.waitForTimeout(4500);
      },
    );
    const answer = c6.beyond[0] && c6.three.at(-1) ? +(c6.beyond[0].when - c6.three.at(-1)!.when).toFixed(3) : null;
    check(answer !== null && Math.abs(answer - MOTIF.answerGap) < 0.02, `chapter-6: the answer came ${answer} s after the third knock (want ${MOTIF.answerGap})`);
    notes.push(`chapter 6 motif offline: knocks at ${c6.gaps.join(' / ')} s, the answer from beyond ${answer} s after the third (audio clock)`);
  }

  // ---- 6. Resume offline ----------------------------------------------------------------------------------
  step('6. resume');
  {
    // A story hand: two moves, reload, the same hand comes back.
    await seedStory(page, 'chapter-2', 0, 'hand', ['prologue', 'chapter-1']);
    await page.reload();
    await enterMenu(page);
    await page.click('[data-act="story"]');
    await page.click('[data-act="story-continue"]');
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    for (let k = 0; k < 2; k++) {
      const legal = page.locator('.hand-tile.is-legal');
      if (await legal.count()) {
        await legal.first().click();
        await page.locator('.end-slot.is-legal').first().click();
      } else
        await page
          .locator('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])')
          .first()
          .click()
          .catch(() => undefined);
      await page.waitForTimeout(2500);
    }
    const before = JSON.stringify((await prog(page))?.hand ?? null);
    await page.reload();
    await enterMenu(page);
    await page.click('[data-act="story"]');
    await page.click('[data-act="story-continue"]');
    await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
    const after = JSON.stringify((await prog(page))?.hand ?? null);
    check(before !== 'null' && before === after, 'resume: the story hand changed across an offline reload');
    // Quick Play: start, one move, reload, Resume.
    await page.reload();
    await enterMenu(page);
    await page.click('[data-go="setup"]');
    await showMenuItem(page, 'input[name="opponent"][value="ai"]');
    await page.check('input[name="opponent"][value="ai"]');
    await page.click('.btn-start');
    await page.waitForSelector('.table-screen');
    await page.waitForTimeout(2500);
    const legal = page.locator('.hand-tile.is-legal');
    if (await legal.count()) {
      await legal.first().click();
      await page.locator('.end-slot.is-legal').first().click();
    }
    await page.waitForTimeout(2500);
    const save = await page.evaluate(() => localStorage.getItem('sticks-and-bones.save'));
    await page.reload();
    await enterMenu(page);
    await page.click('[data-act="resume"]');
    await page.waitForSelector('.table-screen');
    const strip = (s: string | null) =>
      JSON.stringify({
        ...(JSON.parse(s ?? '{}') as { data?: object }).data,
        savedAt: 0,
      });
    const save2 = await page.evaluate(() => localStorage.getItem('sticks-and-bones.save'));
    check(!!save && strip(save) === strip(save2), 'resume: the Quick Play match changed across an offline reload');
    notes.push('offline resume: a story hand (two moves in) and a Quick Play match (one move in) each came back identical after a reload');
  }

  // ---- 7. Achievements ------------------------------------------------------------------------------------
  step('7. achievements');
  {
    await page.reload();
    await enterMenu(page);
    await page.click('[data-go="achievements"]');
    const s1 = (await page.locator('.ach-summary').first().textContent({ timeout: 20_000 })) ?? '';
    await page.reload();
    await enterMenu(page);
    await page.click('[data-go="achievements"]');
    const s2 = (await page.locator('.ach-summary').first().textContent({ timeout: 20_000 })) ?? '';
    const n = Number(/(\d+) of/.exec(s1)?.[1] ?? 0);
    check(n >= 9 && s1 === s2, `achievements: "${s1}" then "${s2}" after a reload (the tour should unlock the case and chapter badges)`);
    notes.push(`achievements offline: "${s1.trim()}", unchanged after a reload`);
  }

  // ---- 8. Other screens -------------------------------------------------------------------------------------
  step('8. viewports');
  const VIEWPORTS = [
    ['phone landscape', 844, 390],
    ['small phone', 360, 800],
    ['tablet', 768, 1024],
    ['desktop', 1366, 768],
  ] as const;
  const ENV: Record<string, string> = {
    prologue: 'env.cave-waterfall',
    'chapter-1': 'env.neighborhood-patio',
    'chapter-2': 'env.back-alley',
    'chapter-3': 'env.executive-terrace',
    'chapter-4': 'env.moonlit-promenade',
    'chapter-5': 'env.jungle-camp',
    'chapter-6': 'env.cave-waterfall',
    'chapter-7': 'env.executive-terrace',
    epilogue: 'env.neighborhood-patio',
  };
  for (const [label, w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    const bad: string[] = [];
    for (const id of ORDER) {
      await openScene(page, id, 1);
      const r = await page.evaluate(() => {
        const panel = document.querySelector('.dialogue-panel')!.getBoundingClientRect();
        return {
          env: document.querySelector('.st-bg.is-front')?.getAttribute('data-env') ?? null,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          panelOn: panel.top >= 0 && panel.bottom <= innerHeight + 1 && panel.height > 0,
        };
      });
      if (r.env !== ENV[id]) bad.push(`${id} over ${r.env}`);
      if (r.overflow) bad.push(`${id} overflows horizontally`);
      if (!r.panelOn) bad.push(`${id} panel off screen`);
    }
    check(bad.length === 0, `${label} ${w}×${h}: ${bad.join('; ')}`);
    await page.screenshot({ path: join(out, `chapter-7-${w}x${h}.png`) });
    notes.push(`${label} ${w}×${h} offline: all 9 scenes opened over their own backdrop, panel on screen, no horizontal overflow`);
  }
  // Rotation mid-line: the line stays.
  await page.setViewportSize({ width: 390, height: 844 });
  await openScene(page, 'chapter-4', 3);
  const pos1 = await page.textContent('.cine-pos');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  const pos2 = await page.textContent('.cine-pos');
  check(pos1 === pos2, `rotation: the line moved from ${pos1} to ${pos2}`);
  notes.push(`rotation mid-line (portrait → landscape, Chapter 4): stayed at ${pos2}`);
  // A desktop story hand at the end (Chapter 7, partnership) with its terrace backdrop.
  await page.setViewportSize({ width: 1366, height: 768 });
  await seedStory(page, 'chapter-7', 0, 'hand', ['prologue']);
  await page.reload();
  await enterMenu(page);
  await page.click('[data-act="story"]');
  await page.click('[data-act="story-continue"]');
  await page.locator('.table-screen').first().waitFor({ timeout: 20_000 });
  check((await playHand(page)) >= 0, 'desktop: the Chapter 7 hand did not finish');
  await page.screenshot({ path: join(out, 'desktop-chapter-7-results.png') });

  check(srv.refused.length === 0, `offline: ${srv.refused.length} app request(s) reached the network: ${srv.refused.slice(0, 5).join(', ')}`);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  notes.push(`offline throughout: ${srv.refused.length} app requests reached the network; ${pageErrors.length} page errors`);
  await ctx.close();
} catch (e) {
  failures.push(`exception: ${(e as Error).stack ?? e}`);
} finally {
  await new Promise<void>((r) => server.close(() => r()));
}

writeFileSync(join(out, 'report.json'), JSON.stringify({ failures, notes }, null, 1));
for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error(`\noffline:tour FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\noffline:tour passed. Evidence in ${out}`);
process.exit(0);
