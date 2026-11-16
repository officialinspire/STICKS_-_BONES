/**
 * Menus: home, game setup (mode, opponent, seating, difficulty, target, and the
 * selected mode's rules — visible before dealing), rules, and settings.
 * Dev tools appear only in development builds.
 */
import { assetUrl } from '../assets';
import type { OpponentKind } from '../app/session';
import type { Difficulty } from '../ai/types';
import { DEFAULT_RULES_PRESET, type ModeId, type TargetScore } from '../engine';
import { dominoSvg } from './domino';
import { hostFigureHtml } from './host';
import { rulesHtml } from './rules-summary';
import { helpHtml } from './help';
import { totals, type Stats } from '../app/stats';
import { bindSettingsPanel, settingsPanelHtml, type SettingsApi } from './settings-panel';
import { esc } from './svg';

export interface MenuChoice {
  mode: ModeId;
  opponent: OpponentKind;
  targetScore: TargetScore;
  difficulty: Difficulty;
  devSeed?: string;
  devAiSeed?: string;
  devFixture?: string;
  devForceSvg?: boolean;
  devFastAi?: boolean;
  /** Two humans: names for Player 1 and Player 2. */
  names?: string[];
  /** Two humans in Partnership: where Player 2 sits relative to Player 1. */
  seating?: 'across' | 'right' | 'left';
}

export interface ResumeOffer {
  readonly summary: string;
  readonly twoHumans: boolean;
}

export type MenuScreen = 'home' | 'setup' | 'rules' | 'settings' | 'stats';

export interface MenuHandlers {
  readonly dev: boolean;
  readonly resume: ResumeOffer | null;
  readonly settings: SettingsApi;
  readonly screen?: MenuScreen;
  /** Messages about recovered / set-aside data, shown once on the home screen. */
  readonly notices?: readonly string[];
  stats(): Stats;
  onResetStats(): void;
  onStart(c: MenuChoice): void;
  onResume(): void;
  onDiscard(): void;
}

const PLAYABLE: ModeId[] = ['draw2', 'block2', 'partnership4'];

function shell(inner: string, speech: string, mood: Parameters<typeof hostFigureHtml>[0] = 'explaining'): string {
  return `
    <div class="scene">
      <header class="brand">
        <h1 class="title">STICKS <span class="amp">&amp;</span> BONES</h1>
        <p class="tagline">Dominoes in Puerto Rico · hosted by Roberto “Cousin”</p>
      </header>
      <section class="host" aria-label="Your host">
        <div class="host-figure">${hostFigureHtml(mood, 'full')}</div>
        <p class="speech">${esc(speech)}</p>
      </section>
      ${inner}
      <footer class="footer"><p><strong>${esc(DEFAULT_RULES_PRESET.name)}</strong> v${DEFAULT_RULES_PRESET.version}. ${esc(DEFAULT_RULES_PRESET.disclaimer)}</p></footer>
    </div>`;
}

const SAMPLE_LINE = `<section class="table" aria-hidden="true"><div class="line">${dominoSvg(6, 6, { className: 'is-double' })}${dominoSvg(6, 4, { orientation: 'horizontal' })}${dominoSvg(4, 1, { orientation: 'horizontal' })}${dominoSvg(1, 1, { className: 'is-double' })}${dominoSvg(1, 0, { orientation: 'horizontal' })}</div></section>`;

export function renderMenu(root: HTMLElement, initial: Partial<MenuChoice>, h: MenuHandlers): void {
  const env = assetUrl('env.neighborhood-patio');
  if (env) root.style.setProperty('--env-image', `url("${env}")`);
  const go = (screen: MenuScreen) => renderMenu(root, initial, { ...h, screen, notices: [] });
  const screen = h.screen ?? 'home';
  const preset = DEFAULT_RULES_PRESET;
  const back = `<button type="button" class="btn-ghost dark back" data-act="home">← Back</button>`;
  const wire = () => {
    root.querySelectorAll<HTMLElement>('[data-act="home"]').forEach((b) => b.addEventListener('click', () => go('home')));
    root.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go as MenuScreen)));
  };
  if (screen === 'home') {
    root.innerHTML = shell(
      `${SAMPLE_LINE}
      <nav class="panel home-nav" aria-label="Main menu">
        ${(h.notices ?? []).length ? `<div class="notice" role="status">${(h.notices ?? []).map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
        ${h.resume ? `<div class="resume"><h2>Game in progress</h2><p>${esc(h.resume.summary)}</p>${h.resume.twoHumans ? '<p class="note">Hands stay hidden until the right player reveals them.</p>' : ''}<div class="row"><button type="button" class="btn" data-act="resume">Resume</button><button type="button" class="btn-ghost dark" data-act="discard">Discard</button></div></div>` : ''}
        <button type="button" class="btn btn-start" data-go="setup">New game</button>
        <div class="row home-row">
          <button type="button" class="btn-ghost dark" data-go="rules">How to play</button>
          <button type="button" class="btn-ghost dark" data-go="stats">Statistics</button>
          <button type="button" class="btn-ghost dark" data-go="settings">Settings</button>
        </div>
      </nav>`,
      'Pull up a chair. Pick a game and let’s get the tiles moving.',
    );
    wire();
    root.querySelector('[data-act="resume"]')?.addEventListener('click', () => h.onResume());
    root.querySelector('[data-act="discard"]')?.addEventListener('click', () => h.onDiscard());
    return;
  }
  if (screen === 'rules') {
    root.innerHTML = shell(
      `<section class="panel" aria-labelledby="rules-heading">${back}<h2 id="rules-heading">How to play</h2>${helpHtml()}</section>`,
      'Same bones, three ways to play. Here’s how my table runs.',
      'thinking',
    );
    wire();
    return;
  }
  if (screen === 'stats') {
    const st = h.stats();
    const t = totals(st);
    const modes: [ModeId, string][] = [
      ['draw2', 'Draw'],
      ['block2', 'Block'],
      ['partnership4', 'Partnership'],
    ];
    const rows = modes
      .map(([m, label]) => {
        const cells = (['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<td>${st.solo[m][d].wins}–${st.solo[m][d].losses}</td>`).join('');
        return `<tr><th scope="row">${label}</th>${cells}<td>${st.local[m].completed}</td><td>${st.abandoned[m]}</td></tr>`;
      })
      .join('');
    root.innerHTML = shell(
      `<section class="panel" aria-labelledby="stats-heading">${back}<h2 id="stats-heading">Statistics</h2>
        <p class="note">Kept on this device only. Games you leave unfinished and later discard or restart count as abandoned — never as losses.</p>
        <p class="stat-line"><strong>${t.completed}</strong> completed · <strong>${t.wins}</strong> won · <strong>${t.losses}</strong> lost vs the computer · <strong>${t.abandoned}</strong> abandoned</p>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Statistics table"><table class="stats-table">
          <caption>Against the computer: wins–losses by difficulty; two-player and abandoned counts</caption>
          <thead><tr><th scope="col">Mode</th><th scope="col">Easy</th><th scope="col">Normal</th><th scope="col">Hard</th><th scope="col">Two players</th><th scope="col">Abandoned</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p>Two players as partners (vs the computers): <strong>${st.localPartners.wins}–${st.localPartners.losses}</strong></p>
        <button type="button" class="btn-ghost dark" data-act="reset-stats">Reset statistics</button>
        <p class="status" role="status" data-stats-status></p>
      </section>`,
      t.completed ? 'Numbers don’t lie. Mostly.' : 'No games on the books yet. Let’s fix that.',
      'smirk',
    );
    wire();
    const btn = root.querySelector('[data-act="reset-stats"]') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      // Two-step confirmation without a modal: the first tap arms, the second resets.
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = 'Tap again to reset all statistics';
        (root.querySelector('[data-stats-status]') as HTMLElement).textContent = 'This can’t be undone.';
        return;
      }
      h.onResetStats();
      renderMenu(root, initial, { ...h, screen: 'stats', notices: [] });
      (root.querySelector('[data-stats-status]') as HTMLElement).textContent = 'Statistics reset.';
    });
    return;
  }
  if (screen === 'settings') {
    root.innerHTML = shell(`<section class="panel" aria-labelledby="settings-heading">${back}<h2 id="settings-heading">Settings</h2>${settingsPanelHtml(h.settings.get())}</section>`, 'Set the table how you like it.', 'smirk');
    wire();
    bindSettingsPanel(root.querySelector('.settings-panel') as HTMLElement, h.settings);
    return;
  }
  const { dev, onStart } = h;
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
        <label class="field">Shuffle seed (dev only) <input name="seed" type="text" autocomplete="off" placeholder="random"></label>
        <label class="field">AI seed (dev only, independent) <input name="aiSeed" type="text" autocomplete="off" placeholder="random"></label>
        <label class="check"><input type="radio" name="opponent" value="dev-both"> Control both seats (no handoff)</label>
        <label class="check"><input type="checkbox" name="forceSvg"> Force SVG tile fallback</label>
        <label class="check"><input type="checkbox" name="fastAi"> Fast AI (short thinking delays)</label>
        <div class="dev-fixtures"><span>Layout fixtures:</span>
          <button type="button" class="btn-ghost small" data-fixture="max-board">Max board</button>
          <button type="button" class="btn-ghost small" data-fixture="max-hand">21-tile hand</button>
          <button type="button" class="btn-ghost small" data-fixture="both-ends">Both ends</button>
          <button type="button" class="btn-ghost small" data-fixture="match-point">Match point</button>
          <button type="button" class="btn-ghost small" data-fixture="match-point-solo">Match point (solo)</button>
        </div>
        <a class="dev-link" href="./dev/contact-sheet.html">Tile contact sheet →</a>
        <a class="dev-link" href="./dev/audio-audition.html">Music loop audition →</a>
      </details>`
    : '';
  root.innerHTML = shell(
    `
      <form class="modes" aria-labelledby="modes-heading">
        ${back}
        <h2 id="modes-heading">New game</h2>
        <fieldset><legend>Game</legend><div class="choice-grid">${modeCards}</div></fieldset>
        <fieldset><legend>Opponent</legend><div class="row">
          <label class="check"><input type="radio" name="opponent" value="ai" ${initial.opponent !== 'local' ? 'checked' : ''}> Play the computer</label>
          <label class="check" data-local><input type="radio" name="opponent" value="local" ${initial.opponent === 'local' ? 'checked' : ''}> Two players, one device</label>
        </div><p class="note" data-p4-note hidden>Partnership: you and Luz (computer) against Cousin and Tío Rafa (computer).</p>
        <div class="two-players" data-two hidden>
          <div class="row">
            <label class="field">Player 1 <input name="name1" type="text" maxlength="20" autocomplete="off" value="${esc(initial.names?.[0] ?? '')}" placeholder="Player 1"></label>
            <label class="field">Player 2 <input name="name2" type="text" maxlength="20" autocomplete="off" value="${esc(initial.names?.[1] ?? '')}" placeholder="Player 2"></label>
          </div>
          <label class="field" data-seating hidden>Where does Player 2 sit?
            <select name="seating">
              <option value="across" ${initial.seating === 'across' || !initial.seating ? 'selected' : ''}>Across — partners</option>
              <option value="right" ${initial.seating === 'right' ? 'selected' : ''}>Right of Player 1 — opponents (plays next)</option>
              <option value="left" ${initial.seating === 'left' ? 'selected' : ''}>Left of Player 1 — opponents (plays before)</option>
            </select>
          </label>
          <p class="note">You’ll pass the device between turns. Each hand stays covered until its owner taps Reveal.</p>
        </div></fieldset>
        <fieldset data-skill><legend>Computer skill</legend><div class="row">
          ${(['easy', 'normal', 'hard'] as Difficulty[])
            .map(
              (d) =>
                `<label class="check"><input type="radio" name="difficulty" value="${d}" ${(initial.difficulty ?? 'normal') === d ? 'checked' : ''}> ${d === 'easy' ? 'Easy' : d === 'normal' ? 'Normal' : 'Hard'}</label>`,
            )
            .join('')}
        </div></fieldset>
        <fieldset><legend>Play to</legend><div class="row">
          <label class="check"><input type="radio" name="target" value="100" checked> 100 points</label>
          <label class="check"><input type="radio" name="target" value="200"> 200 points</label>
        </div></fieldset>
        <div class="rules-preview" data-rules-preview aria-live="polite"></div>
        <button type="submit" class="btn btn-start">Deal the tiles</button>
        ${devPanel}
      </form>`,
    'Choose your game. The rules for it are right there before we deal.',
  );
  wire();
  const form = root.querySelector('form') as HTMLFormElement;
  const read = (): MenuChoice => {
    const fd = new FormData(form);
    const seed = String(fd.get('seed') ?? '').trim();
    return {
      mode: (fd.get('mode') as ModeId) ?? 'draw2',
      opponent: (fd.get('opponent') as OpponentKind) ?? 'ai',
      targetScore: Number(fd.get('target')) === 200 ? 200 : 100,
      difficulty: (fd.get('difficulty') as Difficulty) ?? 'normal',
      ...(dev && seed ? { devSeed: seed } : {}),
      ...(dev && String(fd.get('aiSeed') ?? '').trim() ? { devAiSeed: String(fd.get('aiSeed')).trim() } : {}),
      names: [String(fd.get('name1') ?? ''), String(fd.get('name2') ?? '')],
      seating: (fd.get('seating') as MenuChoice['seating']) ?? 'across',
      ...(dev ? { devForceSvg: fd.get('forceSvg') === 'on', devFastAi: fd.get('fastAi') === 'on' } : {}),
    };
  };
  // Show only the options that apply: names/seating for two humans, skill when a computer plays.
  const syncOptions = () => {
    const p4 = (form.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value === 'partnership4';
    const opp = (form.querySelector('input[name="opponent"]:checked') as HTMLInputElement | null)?.value;
    const two = opp === 'local' || opp === 'dev-both';
    (form.querySelector('[data-p4-note]') as HTMLElement).hidden = !(p4 && !two);
    (form.querySelector('[data-two]') as HTMLElement).hidden = !two;
    (form.querySelector('[data-seating]') as HTMLElement).hidden = !(p4 && two);
    (form.querySelector('[data-skill]') as HTMLElement).hidden = two && !p4;
  };
  const syncRules = () => {
    const m = ((form.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value ?? 'draw2') as ModeId;
    (form.querySelector('[data-rules-preview]') as HTMLElement).innerHTML = `<p class="kicker">Rules for this game</p>${rulesHtml(preset.modes[m])}`;
  };
  const syncTarget = () => {
    const p4 = (form.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value === 'partnership4';
    (form.querySelector(`input[name="target"][value="${p4 ? 200 : 100}"]`) as HTMLInputElement).checked = true;
  };
  form.querySelectorAll('input[name="mode"]').forEach((i) =>
    i.addEventListener('change', () => {
      syncTarget();
      syncOptions();
      syncRules();
    }),
  );
  form.querySelectorAll('input[name="opponent"]').forEach((i) => i.addEventListener('change', syncOptions));
  syncTarget();
  syncOptions();
  syncRules();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onStart(read());
  });
  root.querySelectorAll<HTMLButtonElement>('[data-fixture]').forEach((b) =>
    b.addEventListener('click', () => onStart({ ...read(), opponent: 'dev-both', devFixture: b.dataset.fixture! })),
  );
}
