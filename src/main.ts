import './styles.css';
import { createWorkerRunner, inlineRunner, type AiRunner } from './ai/runner';
import { TableController } from './app/controller';
import { browserStore, clearSave, newMatchId, readSave, writeSave, type SavedGame } from './app/save';
import { secureSeed } from './app/seed';
import { loadSettingsResult, reduceMotion, saveSettings, type Settings } from './app/settings';
import { DEFAULT_TIMING, GameSession, realScheduler, type Timing } from './app/session';
import { loadStats, recordAbandoned, recordCompleted, resetStats, saveStats, type Stats } from './app/stats';
import type { ReadStatus } from './app/storage';
import type { ModeId, SeatIndex } from './engine/types';
import { initTileArt, setForceSvg } from './render/tile-art';
import { deferredAssets, ESSENTIAL_ASSETS, warm } from './assets/warm';
import { MUSIC } from './assets/audio-manifest';
import { introVideoUrl, musicUrl } from './assets/media-urls';
import { AudioManager, type Scene, type SfxId } from './audio/manager';
import { WebAudioBackend } from './audio/webaudio';
import { haptic, type HapticCue } from './audio/haptics';
import { showStart } from './ui/intro-screen';
import { renderMenu, type MenuChoice, type ResumeOffer } from './ui/menu';
import { TableScreen } from './ui/table';
import { consumeUpdatedFlag, describeOffline, eraseLocalData, PwaController } from './app/pwa';

const DEV = import.meta.env.DEV;
document.documentElement.dataset.build = __SB_BUILD_TAG__; // support/diagnostics: which build is running
const root = document.getElementById('app')!;
const store = browserStore();

/** Messages for the next menu render (recovered or set-aside data). */
const notices: string[] = [];
const noticeFor = (what: string, status: ReadStatus): string | null =>
  status === 'corrupt'
    ? `Your ${what} couldn’t be read (the data was damaged), so ${what === 'settings' ? 'defaults are in use' : 'it was set aside'}.`
    : status === 'incompatible'
      ? `Your ${what} came from a different version of the game, so ${what === 'settings' ? 'defaults are in use' : 'it was set aside'}.`
      : status === 'unavailable'
        ? null
        : null;

const loadedSettings = loadSettingsResult(store);
let settings: Settings = loadedSettings.settings;
const sn = noticeFor('settings', loadedSettings.status);
if (sn) notices.push(sn);
const loadedStats = loadStats(store);
let stats: Stats = loadedStats.stats;
const stn = noticeFor('statistics', loadedStats.status);
if (stn) notices.push(stn);
if (!store) notices.push('This browser isn’t letting the game save. Settings, statistics and games last only until you close the page.');

// ---- audio: one manager for the whole app ---------------------------------------
const backend = new WebAudioBackend(
  { menu: musicUrl('menu') ?? undefined, gameplay: musicUrl('gameplay') ?? undefined } as never,
  Object.fromEntries(MUSIC.map((m) => [m.id, m.gainDb])),
);
const audio = new AudioManager({
  backend,
  scheduler: realScheduler,
  levels: settings.audio,
  gapSec: Object.fromEntries(MUSIC.map((m) => [m.id, m.loop.gapSec])) as Record<'menu' | 'gameplay', number>,
});
// Any later gesture re-unlocks if the browser suspended audio (iOS, focus loss).
const regesture = () => {
  if (!audio.unlocked || (audio.playing === null && audio.scene !== 'intro' && audio.scene !== 'init')) void audio.unlock();
};
document.addEventListener('pointerdown', regesture, { capture: true, passive: true });
document.addEventListener('keydown', regesture, { capture: true });
document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));
window.addEventListener('pagehide', () => audio.setHidden(true));
window.addEventListener('pageshow', () => audio.setHidden(document.hidden));

const audioApi = {
  scene: (s: Scene) => audio.setScene(s),
  sfx: (id: SfxId) => void audio.playSfx(id),
  haptic: (cue: HapticCue) => void haptic(cue, settings.haptics),
};

const settingsApi = {
  get: () => settings,
  set: (p: Partial<Settings>) => {
    settings = { ...settings, ...p };
    saveSettings(store, settings);
    audio.setLevels(settings.audio);
  },
};

// ---- PWA: offline files, updates, repair (production builds only) -------------------
const pwa = new PwaController();
if (consumeUpdatedFlag()) notices.push('Updated to the latest version. Your game was saved first — tap Resume to carry on.');
const ERASED_FLAG = 'sticks-and-bones.erased';
try {
  if (sessionStorage.getItem(ERASED_FLAG)) {
    sessionStorage.removeItem(ERASED_FLAG);
    notices.push('Saved game, settings and statistics erased. Offline files were kept.');
  }
} catch {
  /* storage blocked */
}
const pwaView = () => {
  const d = describeOffline(pwa.view.offline);
  return { ...d, updateReady: pwa.view.updateReady };
};
/** Keep every status line / update banner on screen current (menu, settings, pause sheet). */
pwa.subscribe(() => {
  const v = pwaView();
  document.querySelectorAll<HTMLElement>('[data-region="offline-status"]').forEach((el) => {
    el.textContent = (v.ready ? '✓ ' : '') + v.text;
    el.classList.toggle('is-ready', v.ready);
  });
  document.querySelectorAll<HTMLElement>('[data-region="update"]').forEach((el) => (el.hidden = !v.updateReady));
});
/**
 * Apply a waiting update only from a stable point: save the match exactly as the
 * engine has it, stop the table (no AI move can land after the save), replace the
 * screen so no hand is visible while the new version loads, then reload. The
 * restored match opens behind the privacy cover when two humans share the device.
 */
function applyUpdate(): void {
  pwa.applyUpdate(() => {
    const a = active;
    if (a) writeSave(store, a.controller.session, a.matchId);
    teardown();
    active = null;
    document.documentElement.classList.remove('table-lock');
    root.className = 'is-start';
    root.innerHTML = '<p class="loading" role="status">Updating — your game is saved…</p>';
  });
}
const menuPwa = {
  view: pwaView,
  onUpdate: applyUpdate,
  onRepair: () => void pwa.repair(),
  onErase: () => {
    // Only this app's keys (saves, settings, statistics and their quarantined copies). Offline files stay.
    eraseLocalData(store ? globalThis.localStorage : null);
    try {
      sessionStorage.setItem(ERASED_FLAG, '1');
    } catch {
      /* storage blocked */
    }
    location.reload();
  },
};
const tableUpdate = { ready: () => pwa.view.updateReady, apply: applyUpdate };

// ---- the active match ----------------------------------------------------------------
interface Active {
  table: TableScreen;
  controller: TableController;
  matchId: string;
  /** Statistics apply (not developer fixtures / both-seats mode). */
  counted: boolean;
}
let active: Active | null = null;
let last: MenuChoice | null = null;
// One worker for the page; Hard sampling never runs on the main thread.
const runner: AiRunner = createWorkerRunner() ?? inlineRunner();
const FAST_TIMING: Timing = { aiPlay: { easy: 60, normal: 60, hard: 60 }, aiForced: 40, resolve: 250 };
const SEATING: Record<NonNullable<MenuChoice['seating']>, SeatIndex> = { across: 2, right: 1, left: 3 };

// Missing optional art: drop the broken image and reveal the code-drawn placeholder (menus, table, results).
document.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (!(t instanceof SVGImageElement)) return;
    t.closest('.host-figure-art')?.classList.add('art-missing');
    t.remove();
  },
  true,
);

function updateStats(next: Stats): void {
  stats = next;
  saveStats(store, stats);
}

/** A match given up before its end counts as abandoned — never as a loss. */
function abandon(matchId: string, mode: ModeId): void {
  updateStats(recordAbandoned(stats, matchId, mode));
}

/** Stop the current table: cancels AI work, timers, effects and sounds. */
function teardown(): void {
  audio.reset();
  active?.table.destroy();
  active?.controller.dispose();
  active = null;
  root.className = '';
}

/** Public summary of a saved game for the menu (no hidden information). */
function resumeOffer(game: SavedGame): ResumeOffer {
  const s = new GameSession({ state: game.state, opponent: game.opponent, difficulty: game.difficulty, aiRng: game.aiRng }, { scheduler: { set: () => 0, clear: () => {} } });
  const phase = game.state.phase === 'playing' ? `Hand ${game.state.hand.number}` : `Hand ${game.state.hand.number} finished`;
  const summary = `${s.rules.name} · ${s.rules.teams.map((_, t) => `${s.teamName(t)} ${game.state.scores[t]}`).join(' – ')} · ${phase}`;
  s.dispose();
  return { summary, twoHumans: game.opponent === 'local' };
}

function showMenu(): void {
  document.documentElement.classList.remove('table-lock');
  // Background warm-up (≤ 2 downloads at a time) for the first table: atlas, tabletop, then the
  // optional art this device will actually show (see deferredAssets).
  initTileArt();
  void warm(
    deferredAssets({
      reduceMotion: reduceMotion(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
      wide: matchMedia('(min-width: 900px)').matches,
      hostAnimation: settings.hostAnimation,
    }),
  );
  teardown();
  const saved = readSave(store);
  const sv = noticeFor('saved game', saved.status);
  if (sv) notices.push(sv);
  audio.setScene('menu');
  renderMenu(root, last ?? {}, {
    dev: DEV,
    settings: settingsApi,
    resume: saved.value ? resumeOffer(saved.value) : null,
    notices: notices.splice(0),
    stats: () => stats,
    onResetStats: () => updateStats(resetStats(store)),
    onStart: (c) => void start(c),
    onResume: () => resume(),
    pwa: import.meta.env.PROD ? menuPwa : undefined,
    onDiscard: () => {
      const g = readSave(store).value;
      if (g) abandon(g.matchId, g.state.config.mode);
      clearSave(store);
      notices.push('Saved game discarded.');
      showMenu();
    },
  });
}

function mount(controller: TableController, matchId: string, counted: boolean, onRestart: () => void): void {
  root.className = 'is-table';
  document.documentElement.classList.add('table-lock'); // no page scroll / rubber-band under the table
  const session = controller.session;
  const table = new TableScreen(root, controller, {
    onMenu: showMenu, // the save is kept: Resume from the menu (not abandoned)
    onRestart,
    settings: settingsApi,
    audio: audioApi,
    update: tableUpdate,
  });
  active = { table, controller, matchId, counted };
  audio.setScene('gameplay');
  audio.preload('gameplay');
  table.mount();
  controller.subscribe((events) => {
    if (!events.length) return;
    // Autosave after every change (local only; see save.ts for what this is and isn't).
    writeSave(store, session, matchId);
    const won = events.find((e) => e.type === 'match-won');
    if (won && won.type === 'match-won' && counted && session.opponent !== 'dev-both') {
      const p1 = session.humanSeats[0] ?? 0;
      updateStats(
        recordCompleted(stats, {
          matchId,
          mode: session.config.mode,
          opponent: session.opponent,
          difficulty: session.difficulty,
          player1Won: session.rules.teams[won.team]!.includes(p1),
          humansArePartners: session.humanSeats.length === 2 && session.rules.teams.some((t) => session.humanSeats.every((h) => t.includes(h))),
        }),
      );
    }
  });
  writeSave(store, session, matchId);
  if (DEV) (window as unknown as { __sb: unknown }).__sb = { session, controller, runnerKind: runner.kind, matchId, stats: () => stats };
}

/** Restart / rematch from a table: an unfinished match is abandoned first. */
function restartFrom(c: MenuChoice): void {
  const a = active;
  if (a && a.counted && a.controller.session.phase !== 'match-over') abandon(a.matchId, a.controller.session.config.mode);
  void start(c);
}

async function start(c: MenuChoice): Promise<void> {
  last = c;
  // Starting fresh replaces any saved game: that match is abandoned (unless it's this one, already handled).
  const saved = readSave(store).value;
  if (saved && saved.matchId !== active?.matchId) abandon(saved.matchId, saved.state.config.mode);
  teardown();
  clearSave(store);
  setForceSvg(Boolean(c.devForceSvg));
  const timing = DEV && c.devFastAi ? FAST_TIMING : DEFAULT_TIMING;
  let session: GameSession;
  let counted = true;
  if (DEV && c.devFixture) {
    const { FIXTURES } = await import('./dev/fixtures');
    const fx = FIXTURES[c.devFixture as keyof typeof FIXTURES];
    const opponent = fx.opponent ?? 'dev-both';
    counted = opponent !== 'dev-both';
    session = new GameSession({ state: fx.build(), opponent, difficulty: c.difficulty, aiSeed: secureSeed() }, { runner, timing });
  } else {
    const local = c.opponent === 'local' || c.opponent === 'dev-both';
    counted = c.opponent !== 'dev-both';
    session = new GameSession(
      {
        mode: c.mode,
        opponent: c.opponent,
        humanSeats: local ? [0, c.mode === 'partnership4' ? SEATING[c.seating ?? 'across'] : 1] : [0],
        names: c.names,
        targetScore: c.targetScore,
        difficulty: c.difficulty,
        seed: DEV && c.devSeed ? c.devSeed : secureSeed(),
        // A separate secret stream: AI choices never share randomness with the shuffle.
        aiSeed: DEV && c.devAiSeed ? c.devAiSeed : secureSeed(),
      },
      { runner, timing },
    );
  }
  const next: MenuChoice = { ...c, devFixture: undefined };
  mount(new TableController(session), newMatchId(), counted, () => restartFrom(next));
}

/** Rebuild the setup of a (possibly resumed) match for a rematch: same mode, seats, names, target, skill. */
function choiceFromSession(s: GameSession): MenuChoice {
  const humans = s.humanSeats;
  const seat2 = humans[1];
  return {
    mode: s.config.mode,
    opponent: s.opponent,
    targetScore: s.config.targetScore,
    difficulty: s.difficulty,
    names: humans.map((h) => s.config.seats[h]?.displayName ?? ''),
    seating: seat2 === 1 ? 'right' : seat2 === 3 ? 'left' : 'across',
  };
}

function resume(): void {
  const r = readSave(store);
  if (!r.value) {
    const n = noticeFor('saved game', r.status) ?? 'There’s no saved game to resume.';
    notices.push(n);
    return showMenu();
  }
  const saved = r.value;
  teardown();
  // Engine state only: no animation, timer or AI request is restored. The session
  // re-derives what happens next (an AI turn asks afresh; a finished hand resolves once).
  const session = new GameSession({ state: saved.state, opponent: saved.opponent, difficulty: saved.difficulty, aiRng: saved.aiRng }, { runner });
  // A restored game always opens covered when two humans share the device.
  mount(new TableController(session, { restored: true }), saved.matchId, true, () => restartFrom(choiceFromSession(session)));
}

// ---- boot: start screen → studio intro (if supplied) → fade through black → menu ----
function boot(): void {
  audio.setScene('init');
  const devOverride = DEV ? (window as unknown as { __sbIntroVideo?: string | null }).__sbIntroVideo : undefined;
  showStart({
    root,
    videoUrl: devOverride !== undefined ? devOverride : introVideoUrl(),
    reduceMotion: () => reduceMotion(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
    onGesture: () => {
      // Inside the user gesture: unlock audio, but play nothing — the credit has its own sound.
      audio.setScene('intro');
      void audio.unlock();
    },
    videoVolume: () => ({ muted: settings.audio.muted, volume: Math.max(0, Math.min(1, settings.audio.master * Math.max(settings.audio.music, settings.audio.voice))) }),
    setMuted: (muted) => settingsApi.set({ audio: { ...settings.audio, muted } }),
    preload: () => {
      // Only what the first menu needs; the rest is warmed once the menu is up.
      void warm(ESSENTIAL_ASSETS);
      audio.preload('menu', 'metadata');
    },
    onMenu: () => showMenu(),
  });
  if (DEV) (window as unknown as { __sbAudio: unknown }).__sbAudio = { audio, backend };
}

boot();
// Register after the first screen is up, so the worker's downloads never compete with it.
if (document.readyState === 'complete') void pwa.start();
else window.addEventListener('load', () => void pwa.start(), { once: true });
