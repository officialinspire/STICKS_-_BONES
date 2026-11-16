import './styles.css';
import { createWorkerRunner, inlineRunner, type AiRunner } from './ai/runner';
import { TableController } from './app/controller';
import { browserStore, clearSave, readSave, writeSave, type SavedGame } from './app/save';
import { secureSeed } from './app/seed';
import { DEFAULT_TIMING, GameSession, type Timing } from './app/session';
import type { SeatIndex } from './engine/types';
import { initTileArt, setForceSvg } from './render/tile-art';
import { renderMenu, type MenuChoice, type ResumeOffer } from './ui/menu';
import { TableScreen } from './ui/table';

const DEV = import.meta.env.DEV;
const root = document.getElementById('app')!;
const store = browserStore();
let table: TableScreen | null = null;
let controller: TableController | null = null;
let last: MenuChoice | null = null;
// One worker for the page; Hard sampling never runs on the main thread.
const runner: AiRunner = createWorkerRunner() ?? inlineRunner();
const FAST_TIMING: Timing = { aiPlay: { easy: 60, normal: 60, hard: 60 }, aiForced: 40, resolve: 250 };
const SEATING: Record<NonNullable<MenuChoice['seating']>, SeatIndex> = { across: 2, right: 1, left: 3 };

initTileArt();

function teardown(): void {
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
  renderMenu(root, last ?? {}, {
    dev: DEV,
    resume: saved ? resumeOffer(saved) : null,
    onStart: (c) => void start(c),
    onResume: () => resume(),
    onDiscard: () => {
      clearSave(store);
      showMenu();
    },
  });
}

function mount(c: TableController, onRestart: () => void): void {
  controller = c;
  root.className = 'is-table';
  table = new TableScreen(root, c, { onMenu: showMenu, onRestart });
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

function resume(): void {
  const saved = readSave(store);
  if (!saved) return showMenu();
  teardown();
  const session = new GameSession({ state: saved.state, opponent: saved.opponent, difficulty: saved.difficulty, aiRng: saved.aiRng }, { runner });
  // A restored game always starts covered when two humans share the device.
  mount(new TableController(session, { restored: true }), () => {
    clearSave(store);
    showMenu();
  });
}

showMenu();
