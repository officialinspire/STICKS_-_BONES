/**
 * Stage-1 illustrated placeholder screen. Presentation only: reads the rules
 * preset for copy and the asset manifest for art, and owns no game state.
 */
import { assetUrl, getAsset, getFrame } from '../assets';
import { DEFAULT_RULES_PRESET, MODE_IDS, type ModeRules, type Pip } from '../engine';
import { dominoSvg, type FaceSprite } from './domino';
import { spriteSvg } from './sprite';
import { esc } from './svg';

function faceSprite(): FaceSprite | null {
  const url = assetUrl('tile.materials');
  if (!url) return null;
  const sheet = getAsset('tile.materials');
  return { url, sheetWidth: sheet.width, sheetHeight: sheet.height, rect: getFrame('tile.materials', 'face-ivory-divided').rect };
}

function hostPortrait(): string {
  const sheet = getAsset('cousin.atlas.portrait');
  return spriteSvg({
    url: assetUrl('cousin.atlas.portrait'),
    sheetWidth: sheet.width,
    sheetHeight: sheet.height,
    rect: getFrame('cousin.atlas.portrait', 'explaining').rect,
    label: 'Roberto, known as Cousin, your host',
    className: 'host-portrait',
  });
}

/** A short sample line of play: doubles sit crosswise, every joint matches. */
function sampleLine(face: FaceSprite | null): string {
  const line: { a: Pip; b: Pip; cross: boolean }[] = [
    { a: 6, b: 6, cross: true },
    { a: 6, b: 4, cross: false },
    { a: 4, b: 1, cross: false },
    { a: 1, b: 1, cross: true },
    { a: 1, b: 0, cross: false },
  ];
  return line
    .map((t) =>
      dominoSvg(t.a, t.b, { orientation: t.cross ? 'vertical' : 'horizontal', face, className: t.cross ? 'is-double' : '' }),
    )
    .join('');
}

function seatsLabel(r: ModeRules): string {
  return r.seatCount === 4 ? '4 seats · two teams' : '2 players';
}

function modeCard(r: ModeRules): string {
  return `
    <li class="mode-card">
      <h3>${esc(r.name)}</h3>
      <p class="mode-meta">${esc(seatsLabel(r))} · to ${r.target.default}</p>
      <p>${esc(r.summary)}</p>
      <button type="button" class="btn" disabled aria-describedby="coming-soon">Play ${esc(r.name)}</button>
    </li>`;
}

export function renderTitleScreen(root: HTMLElement): void {
  const preset = DEFAULT_RULES_PRESET;
  const env = assetUrl('env.neighborhood-patio');
  const table = assetUrl('table.weathered');
  if (env) root.style.setProperty('--env-image', `url("${env}")`);
  if (table) root.style.setProperty('--table-image', `url("${table}")`);

  // Missing or failed art: drop the broken <image> so the vector fallback
  // (flat tile + canonical pips, host monogram) shows cleanly.
  root.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof SVGImageElement) e.target.remove();
    },
    true,
  );

  root.innerHTML = `
    <div class="scene">
      <header class="brand">
        <h1 class="title">STICKS <span class="amp">&amp;</span> BONES</h1>
        <p class="tagline">Dominoes in Puerto Rico · hosted by Roberto “Cousin”</p>
      </header>

      <section class="host" aria-label="Your host">
        <div class="host-figure">
          <div class="host-fallback" aria-hidden="true">R</div>
          ${hostPortrait()}
        </div>
        <p class="speech">¡Wepa! Pull up a chair, primo. The table’s getting set up — pick your game below.</p>
      </section>

      <section class="table" aria-label="Sample line of play">
        <div class="line">${sampleLine(faceSprite())}</div>
      </section>

      <section class="modes" aria-labelledby="modes-heading">
        <h2 id="modes-heading">Choose a game</h2>
        <ul class="mode-list">${MODE_IDS.map((m) => modeCard(preset.modes[m])).join('')}</ul>
        <p id="coming-soon" class="note">Solo vs AI or two players on one device. Dealing arrives in the next build.</p>
      </section>

      <footer class="footer">
        <p><strong>${esc(preset.name)}</strong> v${preset.version}. ${esc(preset.disclaimer)}</p>
      </footer>
    </div>`;
}
