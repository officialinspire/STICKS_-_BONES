import './styles.css';
import { createWorkerRunner, inlineRunner, type AiRunner } from './ai/runner';
import { TableController } from './app/controller';
import { browserStore, clearSave, readSave, writeSave, type SavedGame } from './app/save';
import { secureSeed } from './app/seed';
import { loadSettings, saveSettings, type Settings } from './app/settings';
import { DEFAULT_TIMING, GameSession, type Timing } from './app/session';
import type { SeatIndex } from './engine/types';
import { initTileArt, setForceSvg } from './render/tile-art';
import { assetUrl } from './assets';
import { MUSIC } from './assets/audio-manifest';
import { introVideoUrl, musicUrl } from './assets/media-urls';
import { AudioManager, type Scene, type SfxId } from './audio/manager';
import { WebAudioBackend } from './audio/webaudio';
import { haptic, type HapticCue } from './audio/haptics';
import { reduceMotion } from './app/settings';
import { realScheduler } from './app/session';
import { showStart } from './ui/intro-screen';
import { renderMenu, type MenuChoice, type ResumeOffer } from './ui/menu';
import { TableScreen } from './ui/table';

const DEV = import.meta.env.DEV;
const root = document.getElementById('app')!;
const store = browserStore();
let settings: Settings = loadSettings(store);
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
  reset: () => audio.reset(),
};

const settingsApi = {
  get: () => settings,
  set: (p: Partial<Settings>) => {
    settings = { ...settings, ...p };
    saveSettings(store, settings);
    audio.setLevels(settings.audio);
  },
};
let table: TableScreen | null = null;
let controller: TableController | null = null;
let last: MenuChoice | null = null;
// One worker for the page; Hard sampling never runs on the main thread.
const runner: AiRunner = createWorkerRunner() ?? inlineRunner();
const FAST_TIMING: Timing = { aiPlay: { easy: 60, normal: 60, hard: 60 }, aiForced: 40, resolve: 250 };
const SEATING: Record<NonNullable<MenuChoice['seating']>, SeatIndex> = { across: 2, right: 1, left: 3 };

initTileArt();
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

function teardown(): void {
  audio.reset(); // cut any sounds still ringing from the old table
  table?.destroy();
  controller?.dispose();
  table = null;
  controller = null;
  root.className = '';
}

/** Public summary of a saved game for the menu (no hidden information). */
function resumeOffer(game: SavedGame): ResumeOffer {
  const s = new GameSession({ state: game.state, opponent: game.opponent, difficulty: game.difficulty, aiRng: game.aiRng }, { scheduler: { set: () => 0, clear: () => {} } });
  const summary = `${s.rules.name} · ${s.rules.teams.map((_, t) => `${s.teamName(t)} ${game.state.scores[t]}`).join(' – ')} · Hand ${game.state.hand.number}`;
  s.dispose();
  return { summary, twoHumans: game.opponent === 'local' };
}

function showMenu(): void {
  teardown();
  const saved = readSave(store);
  audio.setScene('menu');
  renderMenu(root, last ?? {}, {
    dev: DEV,
    settings: settingsApi,
    resume: saved ? resumeOffer(saved) : null,
    onStart: (c) => void start(c),
    onResume: () => resume(),
    onDiscard: () => {
      clearSave(store);
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
      // Enough for a smooth first menu, without pulling every large asset.
      for (const id of ['env.neighborhood-patio', 'cousin.atlas.portrait'] as const) {
        const url = assetUrl(id);
        if (url) new Image().src = url;
      }
      audio.preload('menu', 'metadata');
    },
    onMenu: () => showMenu(),
  });
  if (DEV) (window as unknown as { __sbAudio: unknown }).__sbAudio = { audio, backend };
}

boot();
    },
  });
}

function mount(c: TableController, onRestart: () => void): void {
  controller = c;
  root.className = 'is-table';
  table = new TableScreen(root, c, { onMenu: showMenu, onRestart, settings: settingsApi, audio: audioApi });
  audio.setScene('gameplay');
  audio.preload('gameplay');
  table.mount();
  // Autosave after every game change (local only; see save.ts for what this is and isn't).
  c.subscribe((events) => {
    if (events.length) writeSave(store, c.session);
  });
  writeSave(store, c.session);
  if (DEV) (window as unknown as { __sb: unknown }).__sb = { session: c.session, controller: c, runnerKind: runner.kind };
}

async function start(c: MenuChoice): Promise<void> {
  last = c;
  teardown();
  setForceSvg(Boolean(c.devForceSvg));
  const timing = DEV && c.devFastAi ? FAST_TIMING : DEFAULT_TIMING;
  let session: GameSession;
  if (DEV && c.devFixture) {
    const { FIXTURES } = await import('./dev/fixtures');
    const fx = FIXTURES[c.devFixture as keyof typeof FIXTURES];
    session = new GameSession({ state: fx.build(), opponent: 'dev-both', aiSeed: secureSeed() }, { runner, timing });
  } else {
    clearSave(store);
    const local = c.opponent === 'local' || c.opponent === 'dev-both';
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
  mount(new TableController(session), () => void start({ ...c, devFixture: undefined }));
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
  const saved = readSave(store);
  if (!saved) return // ---- boot: start screen → studio intro (if supplied) → fade through black → menu ----
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
      // Enough for a smooth first menu, without pulling every large asset.
      for (const id of ['env.neighborhood-patio', 'cousin.atlas.portrait'] as const) {
        const url = assetUrl(id);
        if (url) new Image().src = url;
      }
      audio.preload('menu', 'metadata');
    },
    onMenu: () => showMenu(),
  });
  if (DEV) (window as unknown as { __sbAudio: unknown }).__sbAudio = { audio, backend };
}

boot();
  teardown();
  const session = new GameSession({ state: saved.state, opponent: saved.opponent, difficulty: saved.difficulty, aiRng: saved.aiRng }, { runner });
  // A restored game always starts covered when two humans share the device.
  mount(new TableController(session, { restored: true }), () => void start(choiceFromSession(session)));
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
      // Enough for a smooth first menu, without pulling every large asset.
      for (const id of ['env.neighborhood-patio', 'cousin.atlas.portrait'] as const) {
        const url = assetUrl(id);
        if (url) new Image().src = url;
      }
      audio.preload('menu', 'metadata');
    },
    onMenu: () => showMenu(),
  });
  if (DEV) (window as unknown as { __sbAudio: unknown }).__sbAudio = { audio, backend };
}

boot();
