import './styles.css';
import { secureSeed } from './app/seed';
import { GameSession } from './app/session';
import { initTileArt, setForceSvg } from './render/tile-art';
import { renderMenu, type MenuChoice } from './ui/menu';
import { TableScreen } from './ui/table';

const DEV = import.meta.env.DEV;
const root = document.getElementById('app')!;
let table: TableScreen | null = null;
let session: GameSession | null = null;
let last: MenuChoice | null = null;

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

async function start(c: MenuChoice): Promise<void> {
  last = c;
  teardown();
  setForceSvg(Boolean(c.devForceSvg));
  if (DEV && c.devFixture) {
    const { FIXTURES } = await import('./dev/fixtures');
    const fx = FIXTURES[c.devFixture as keyof typeof FIXTURES];
    session = new GameSession({ state: fx.build(), opponent: 'dev-both' });
  } else {
    session = new GameSession({ mode: c.mode, opponent: c.opponent, targetScore: c.targetScore, seed: DEV && c.devSeed ? c.devSeed : secureSeed() });
  }
  root.className = 'is-table';
  table = new TableScreen(root, session, { onMenu: showMenu, onRestart: () => void start({ ...c, devFixture: undefined }) });
  table.mount();
  if (DEV) (window as unknown as { __sb: unknown }).__sb = { session };
}

showMenu();
