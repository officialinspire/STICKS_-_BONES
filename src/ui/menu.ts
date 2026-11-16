/** Start menu: mode, opponent, target. Dev tools appear only in development builds. */
import { assetUrl, getAsset, getFrame } from '../assets';
import type { OpponentKind } from '../app/session';
import { DEFAULT_RULES_PRESET, type ModeId, type TargetScore } from '../engine';
import { dominoSvg } from './domino';
import { spriteSvg } from './sprite';
import { esc } from './svg';

export interface MenuChoice {
  mode: ModeId;
  opponent: OpponentKind;
  targetScore: TargetScore;
  devSeed?: string;
  devFixture?: string;
  devForceSvg?: boolean;
}

const PLAYABLE: ModeId[] = ['draw2', 'block2'];

export function renderMenu(root: HTMLElement, initial: Partial<MenuChoice>, onStart: (c: MenuChoice) => void, dev: boolean): void {
  const preset = DEFAULT_RULES_PRESET;
  const env = assetUrl('env.neighborhood-patio');
  if (env) root.style.setProperty('--env-image', `url("${env}")`);
  const sheet = getAsset('cousin.atlas.portrait');
  const portrait = spriteSvg({ url: assetUrl('cousin.atlas.portrait'), sheetWidth: sheet.width, sheetHeight: sheet.height, rect: getFrame('cousin.atlas.portrait', 'explaining').rect, label: 'Roberto, known as Cousin, your host', className: 'host-portrait' });
  const mode = initial.mode ?? 'draw2';
  const modeCards = (['draw2', 'block2', 'partnership4'] as ModeId[])
    .map((m) => {
      const r = preset.modes[m];
      const enabled = PLAYABLE.includes(m);
      return `<label class="choice${enabled ? '' : ' is-disabled'}"><input type="radio" name="mode" value="${m}" ${m === mode ? 'checked' : ''} ${enabled ? '' : 'disabled'}><span class="choice-body"><strong>${esc(r.name)}</strong><span class="mode-meta">${r.seatCount === 4 ? '4 seats · two teams' : '2 players'} · to ${r.target.default}${enabled ? '' : ' · coming soon'}</span><span>${esc(r.summary)}</span></span></label>`;
    })
    .join('');
  const devPanel = import.meta.env.DEV && dev
    ? `<details class="dev-panel"><summary>Developer tools</summary>
        <label class="field">Seed (dev only) <input name="seed" type="text" autocomplete="off" placeholder="random"></label>
        <label class="check"><input type="radio" name="opponent" value="dev-both"> Control both seats (no handoff)</label>
        <label class="check"><input type="checkbox" name="forceSvg"> Force SVG tile fallback</label>
        <div class="dev-fixtures"><span>Layout fixtures:</span>
          <button type="button" class="btn-ghost small" data-fixture="max-board">Max board</button>
          <button type="button" class="btn-ghost small" data-fixture="max-hand">21-tile hand</button>
          <button type="button" class="btn-ghost small" data-fixture="both-ends">Both ends</button>
        </div>
        <a class="dev-link" href="./dev/contact-sheet.html">Tile contact sheet →</a>
      </details>`
    : '';
  root.innerHTML = `
    <div class="scene">
      <header class="brand">
        <h1 class="title">STICKS <span class="amp">&amp;</span> BONES</h1>
        <p class="tagline">Dominoes in Puerto Rico · hosted by Roberto “Cousin”</p>
      </header>
      <section class="host" aria-label="Your host">
        <div class="host-figure"><div class="host-fallback" aria-hidden="true">R</div>${portrait}</div>
        <p class="speech">¡Wepa! Pull up a chair, primo. Pick a game and let’s shuffle the bones.</p>
      </section>
      <section class="table" aria-hidden="true"><div class="line">${dominoSvg(6, 6, { className: 'is-double' })}${dominoSvg(6, 4, { orientation: 'horizontal' })}${dominoSvg(4, 1, { orientation: 'horizontal' })}${dominoSvg(1, 1, { className: 'is-double' })}${dominoSvg(1, 0, { orientation: 'horizontal' })}</div></section>
      <form class="modes" aria-labelledby="modes-heading">
        <h2 id="modes-heading">New game</h2>
        <fieldset><legend>Game</legend><div class="choice-grid">${modeCards}</div></fieldset>
        <fieldset><legend>Opponent</legend><div class="row">
          <label class="check"><input type="radio" name="opponent" value="ai" ${initial.opponent !== 'local' ? 'checked' : ''}> Play Cousin (computer)</label>
          <label class="check"><input type="radio" name="opponent" value="local" ${initial.opponent === 'local' ? 'checked' : ''}> Two players, one device</label>
        </div></fieldset>
        <fieldset><legend>Play to</legend><div class="row">
          <label class="check"><input type="radio" name="target" value="100" checked> 100 points</label>
          <label class="check"><input type="radio" name="target" value="200"> 200 points</label>
        </div></fieldset>
        <button type="submit" class="btn btn-start">Deal the tiles</button>
        ${devPanel}
      </form>
      <footer class="footer"><p><strong>${esc(preset.name)}</strong> v${preset.version}. ${esc(preset.disclaimer)}</p></footer>
    </div>`;
  const form = root.querySelector('form') as HTMLFormElement;
  const read = (): MenuChoice => {
    const fd = new FormData(form);
    const seed = String(fd.get('seed') ?? '').trim();
    return {
      mode: (fd.get('mode') as ModeId) ?? 'draw2',
      opponent: (fd.get('opponent') as OpponentKind) ?? 'ai',
      targetScore: Number(fd.get('target')) === 200 ? 200 : 100,
      ...(dev && seed ? { devSeed: seed } : {}),
      ...(dev ? { devForceSvg: fd.get('forceSvg') === 'on' } : {}),
    };
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onStart(read());
  });
  root.querySelectorAll<HTMLButtonElement>('[data-fixture]').forEach((b) =>
    b.addEventListener('click', () => onStart({ ...read(), opponent: 'dev-both', devFixture: b.dataset.fixture! })),
  );
}
