import './styles.css';
import { secureSeed } from './app/seed';
import { DEFAULT_TIMING, GameSession, type Timing } from './app/session';
import { createWorkerRunner, inlineRunner, type AiRunner } from './ai/runner';
import { initTileArt, setForceSvg } from './render/tile-art';
import { renderMenu, type MenuChoice } from './ui/menu';
import { TableScreen } from './ui/table';

const DEV = import.meta.env.DEV;
const root = document.getElementById('app')!;
let table: TableScreen | null = null;
let session: GameSession | null = null;
let last: MenuChoice | null = null;
// One worker for the page; Hard sampling never runs on the main thread.
const runner: AiRunner = createWorkerRunner() ?? inlineRunner();

initTileArt();

function teardown(): void {
  table?.destroy();
  session?.dispose();
  table = null;
  session = null;
  root.className = '';
}

function showMenu(): void {
  teardown();
  renderMenu(root, last ?? {}, (c) => void start(c), DEV);
}

const FAST_TIMING: Timing = { aiPlay: { easy: 60, normal: 60, hard: 60 }, aiForced: 40, resolve: 250 };

async function start(c: MenuChoice): Promise<void> {
  last = c;
  teardown();
  setForceSvg(Boolean(c.devForceSvg));
  if (DEV && c.devFixture) {
    const { FIXTURES } = await import('./dev/fixtures');
    const fx = FIXTURES[c.devFixture as keyof typeof FIXTURES];
    session = new GameSession({ state: fx.build(), opponent: 'dev-both', aiSeed: secureSeed() }, { runner });
  } else {
    session = new GameSession(
      {
        mode: c.mode,
        opponent: c.mode === 'partnership4' && c.opponent === 'local' ? 'ai' : c.opponent,
        targetScore: c.targetScore,
        difficulty: c.difficulty,
        seed: DEV && c.devSeed ? c.devSeed : secureSeed(),
        // A separate secret stream: AI choices never share randomness with the shuffle.
        aiSeed: DEV && c.devAiSeed ? c.devAiSeed : secureSeed(),
      },
      { runner, timing: DEV && c.devFastAi ? FAST_TIMING : DEFAULT_TIMING },
    );
  }
  root.className = 'is-table';
  table = new TableScreen(root, session, { onMenu: showMenu, onRestart: () => void start({ ...c, devFixture: undefined }) });
  table.mount();
  if (DEV) (window as unknown as { __sb: unknown }).__sb = { session, runnerKind: runner.kind };
}

showMenu();
