/**
 * Menus: home, game setup (mode, opponent, seating, difficulty, target, and the
 * selected mode's rules — visible before dealing), rules, and settings.
 * Dev tools appear only in development builds.
 */
import { setEnvBackdrop } from '../assets/env';
import type { OpponentKind } from '../app/session';
import type { Difficulty } from '../ai/types';
import { DEFAULT_RULES_PRESET, type ModeId, type TargetScore } from '../engine';
import { hostFigureHtml } from './host';
import { rulesPageItems } from './rules-summary';
import { helpHtml } from './help';
import { totals, type Stats } from '../app/stats';
import { bindSettingsPanel, settingsSections, type SettingsApi } from './settings-panel';
import { esc } from './svg';
import { MENU_PROMISE, STORY_SUBTITLE, wordmarkHtml } from './brand';
import { confirmSheet } from './confirm';
import { menuPages } from './menu-pages';
import type { MenuPages } from './menu-pages-element';

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

export type MenuScreen = 'home' | 'setup' | 'setup-local' | 'rules' | 'settings' | 'stats' | 'achievements';

/** Where the Story stands, for the home card (null: no case started). */
export interface StoryOffer {
  readonly label: string;
  readonly closed: boolean;
}

export interface MenuHandlers {
  readonly dev: boolean;
  readonly resume: ResumeOffer | null;
  readonly story?: StoryOffer | null;
  readonly settings: SettingsApi;
  readonly screen?: MenuScreen;
  /** The screen this one was opened from (focus returns to its button). */
  readonly from?: MenuScreen;
  /** Messages about recovered / set-aside data, shown once on the home screen. */
  readonly notices?: readonly string[];
  stats(): Stats;
  onResetStats(): void;
  onStart(c: MenuChoice): void;
  onResume(): void;
  onDiscard(): void;
  /** Open Story (NO REST FOR COUSIN): the case file. */
  onStory(): void;
  /** Offline/PWA status and actions (absent where unsupported, e.g. the dev server). */
  readonly pwa?: MenuPwa;
  /** Fill the Achievements page (loaded on demand). */
  renderAchievements?(el: HTMLElement, back: () => void): void;
  /** A destination was opened (How to Play, Statistics): exploration achievements. */
  onExplore?(screen: MenuScreen): void;
}

export interface MenuPwa {
  /** Current status line and whether a new version is waiting. */
  view(): { text: string; ready: boolean; updateReady: boolean };
  /** What of the story / optional audio is saved offline (measured sizes), and the matching button label. */
  storyLine(): string;
  audioLine(): string;
  offlineButton(g: 'story' | 'audio'): string;
  /** Explicit download (or, for saved audio, removal). */
  onOffline(g: 'story' | 'audio'): void;
  onUpdate(): void;
  onRepair(): void;
  onErase(): void;
}

/** The offline status line; main.ts keeps every `[data-region="offline-status"]` up to date. */
function offlineLine(p: MenuPwa | undefined): string {
  if (!p) return '';
  const v = p.view();
  return `<p class="offline-status${v.ready ? ' is-ready' : ''}" data-region="offline-status" role="status">${v.ready ? '✓ ' : ''}${esc(v.text)}</p>`;
}
function updateBanner(p: MenuPwa | undefined): string {
  if (!p) return '';
  return `<div class="update-banner" data-region="update" ${p.view().updateReady ? '' : 'hidden'}><p><strong>Update available.</strong> A new version of the game is ready.</p><button type="button" class="btn" data-act="update-now">Update now</button></div>`;
}

const PLAYABLE: ModeId[] = ['draw2', 'block2', 'partnership4'];

function shell(inner: string, speech: string, mood: Parameters<typeof hostFigureHtml>[0] = 'explaining', sub = false): string {
  // Sub-pages keep the brand but use the one-line mark, so their content starts near the top.
  return `
    <div class="scene${sub ? ' is-sub' : ''}">
      <header class="brand">
        ${wordmarkHtml({ level: 'h1' })}
        ${sub ? '' : `<p class="tagline">${esc(MENU_PROMISE)}</p>`}
      </header>
      <section class="host" aria-label="Your host">
        <div class="host-figure">${hostFigureHtml(mood, 'full')}</div>
        <p class="speech">${esc(speech)}</p>
      </section>
      ${inner}
      <footer class="footer"><p><strong>${esc(DEFAULT_RULES_PRESET.name)}</strong> v${DEFAULT_RULES_PRESET.version}. ${esc(DEFAULT_RULES_PRESET.disclaimer)}</p></footer>
    </div>`;
}

/**
 * Browser/OS Back on a menu sub-page returns to the home menu. Each sub-page pushes one history entry
 * (no URL change, nothing secret in it). Back only acts while that sub-page is still on screen: once
 * a table or Story is open, it does nothing.
 */
let onPop: (() => void) | null = null;
let popInstalled = false;
/** A sub-page entry of ours is on top of the history stack. */
let pushed = false;

export function renderMenu(root: HTMLElement, initial: Partial<MenuChoice>, h: MenuHandlers): void {
  setEnvBackdrop(root, 'env.neighborhood-patio'); // the 3:4 crop on portrait screens
  const screen = h.screen ?? 'home';
  const from = h.from;
  if (screen === 'rules' || screen === 'stats') h.onExplore?.(screen);
  const go = (to: MenuScreen) => {
    if (to !== 'home' && screen === 'home' && !pushed) {
      history.pushState({ sbMenu: to }, '');
      pushed = true;
    }
    renderMenu(root, initial, { ...h, screen: to, from: screen, notices: [] });
  };
  // Back control, Escape and the browser's Back all land on the same place.
  const goHome = () => (pushed ? history.back() : go('home'));
  if (!popInstalled) {
    popInstalled = true;
    addEventListener('popstate', () => {
      pushed = false;
      onPop?.();
    });
  }
  // Home reached another way (a game or Story in between): drop our stale entry quietly.
  if (screen === 'home' && pushed) {
    pushed = false;
    history.back();
  }
  onPop = screen === 'home' ? null : () => {
    if (root.querySelector('.scene.is-sub')) renderMenu(root, initial, { ...h, screen: 'home', from: screen, notices: [] });
  };
  const preset = DEFAULT_RULES_PRESET;
  const back = `<button type="button" class="btn-ghost dark back" data-act="home">← Menu</button>`;
  const wire = () => {
    root.querySelectorAll<HTMLElement>('[data-act="home"]').forEach((b) => b.addEventListener('click', goHome));
    root.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go as MenuScreen)));
    const scene = root.querySelector<HTMLElement>('.scene');
    if (screen !== 'home') {
      scene?.addEventListener('keydown', (e) => {
        const t = e.target as HTMLElement;
        if (e.key !== 'Escape' || e.defaultPrevented || t.closest('dialog, input, select, textarea, details[open]')) return;
        e.preventDefault();
        goHome();
      });
      // Keyboard and screen-reader users land on the new page's heading.
      root.querySelector<HTMLElement>('.scene h2')?.setAttribute('tabindex', '-1');
      root.querySelector<HTMLElement>('.scene h2')?.focus({ preventScroll: true });
    } else if (from && from !== 'home') {
      const target = root.querySelector<HTMLElement>(`[data-go="${from}"]`);
      if (target) {
        target.closest<MenuPages>('menu-pages')?.reveal(target);
        target.focus({ preventScroll: true });
      }
    }
  };
  if (screen === 'home') {
    root.innerHTML = shell(
      `<nav class="panel home-nav" aria-label="Main menu">
        ${menuPages('Main menu pages', [{ title: 'Main menu', html: `
        ${h.resume ? `<div class="resume"><h2>Game in progress</h2><p>${esc(h.resume.summary)}</p>${h.resume.twoHumans ? '<p class="note">Hands stay hidden until the right player reveals them.</p>' : ''}<div class="row"><button type="button" class="btn" data-act="resume">Resume</button><button type="button" class="btn-ghost dark" data-act="discard">Discard…</button></div></div>` : ''}
        ${updateBanner(h.pwa)}
        <ul class="destinations" role="list">
          <li><button type="button" class="dest dest-story" data-act="story"><span class="dest-kicker">Story · ${esc(STORY_SUBTITLE)}</span><span class="dest-title">${h.story ? (h.story.closed ? 'Case Closed' : 'Continue Case') : 'New Case'}</span><span class="dest-sub">${esc(h.story ? h.story.label : 'Seven chapters, seven hands')}</span></button></li>
          <li><button type="button" class="dest dest-quick btn-start" data-go="setup"><span class="dest-title">Quick Play</span><span class="dest-sub">You against Cousin: Draw, Block or Partnership</span></button></li>
          <li><button type="button" class="dest dest-two" data-go="setup-local"><span class="dest-title">Two Players</span><span class="dest-sub">Share one device, hands kept private</span></button></li>
        </ul>
        <div class="home-row">
          <button type="button" class="btn-ghost dark" data-go="rules">How to Play</button>
          <button type="button" class="btn-ghost dark" data-go="settings">Settings</button>
          <button type="button" class="btn-ghost dark" data-go="stats">Statistics</button>
          <button type="button" class="btn-ghost dark" data-go="achievements">Achievements</button>
        </div>
        ${(h.notices ?? []).map((n) => `<p class="notice" role="status">${esc(n)}</p>`).join('')}
        ${offlineLine(h.pwa)}
        ` }])}
      </nav>`,
      'Pull up a chair. Pick a game and let’s get the tiles moving.',
    );
    wire();
    root.querySelector('[data-act="resume"]')?.addEventListener('click', () => h.onResume());
    root.querySelector('[data-act="discard"]')?.addEventListener('click', () => {
      void confirmSheet(root, { title: 'Discard the game in progress?', body: 'It can’t be resumed afterwards and counts as abandoned in Statistics (never as a loss).', yes: 'Discard game', no: 'Keep it' }).then((yes) => yes && h.onDiscard());
    });
    root.querySelector('[data-act="update-now"]')?.addEventListener('click', () => h.pwa?.onUpdate());
    root.querySelector('[data-act="story"]')?.addEventListener('click', () => h.onStory());
    return;
  }
  if (screen === 'rules') {
    root.innerHTML = shell(
      `<section class="panel" aria-labelledby="rules-heading">${back}<h2 id="rules-heading">How to play</h2>${helpHtml()}</section>`,
      'Same bones, three ways to play. Here’s how my table runs.',
      'thinking',
      true,
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
    // One card per mode (no wide table, so no sideways scrolling on phones).
    const cards = modes.map(([m, label]) => {
      const vs = (['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<li><span>${d === 'easy' ? 'Easy' : d === 'normal' ? 'Normal' : 'Hard'}</span> <strong>${st.solo[m][d].wins}–${st.solo[m][d].losses}</strong></li>`).join('');
      return { title: label, html: `<section class="stat-card" aria-labelledby="stat-${m}"><h3 id="stat-${m}">${label}</h3><p class="stat-k">Against the computer (won–lost)</p><ul class="stat-skill">${vs}</ul><p class="stat-k">Two players: <strong>${st.local[m].completed}</strong> completed · Abandoned: <strong>${st.abandoned[m]}</strong></p></section>` };
    });
    root.innerHTML = shell(
      `<section class="panel" aria-labelledby="stats-heading">${back}<h2 id="stats-heading">Statistics</h2>
        ${menuPages('Statistics', [{ title: 'Overview', html: `
        <p class="stat-line"><strong>${t.completed}</strong> completed · <strong>${t.wins}</strong> won · <strong>${t.losses}</strong> lost vs the computer · <strong>${t.abandoned}</strong> abandoned</p>
        <p>Two players as partners (vs the computers): <strong>${st.localPartners.wins}–${st.localPartners.losses}</strong></p>
        ${t.completed + t.abandoned + st.localPartners.wins + st.localPartners.losses ? '<button type="button" class="btn-ghost dark danger-ghost" data-act="reset-stats">Reset statistics…</button>' : ''}
        <p class="status" role="status" data-stats-status></p>
        <p class="note">Kept on this device only. Discarding or restarting an unfinished game counts as abandoned.</p>
        ` }, ...cards])}
      </section>`,
      t.completed ? 'Numbers don’t lie. Mostly.' : 'No games on the books yet. Let’s fix that.',
      'smirk',
      true,
    );
    wire();
    root.querySelector('[data-act="reset-stats"]')?.addEventListener('click', () => {
      void confirmSheet(root, { title: 'Reset all statistics?', body: 'Every win, loss and abandoned count on this device goes back to zero. Saved games and Story progress are kept. This can’t be undone.', yes: 'Reset statistics' }).then((yes) => {
        if (!yes) return;
        h.onResetStats();
        renderMenu(root, initial, { ...h, screen: 'stats', notices: [] });
        (root.querySelector('[data-stats-status]') as HTMLElement).textContent = 'Statistics reset.';
      });
    });
    return;
  }
  if (screen === 'achievements') {
    root.innerHTML = shell(
      `<section class="panel ach-panel" aria-labelledby="ach-heading">${back}<h2 id="ach-heading">Achievements</h2>
        <div data-region="achievements"><p class="note" role="status">Loading achievements…</p></div>
      </section>`,
      'A hundred ways to earn your seat at this table.',
      'smirk',
      true,
    );
    wire();
    // Back from a load failure is the page's own Back (same history handling).
    h.renderAchievements?.(root.querySelector('[data-region="achievements"]') as HTMLElement, () => (root.querySelector('.ach-panel [data-act="home"]') as HTMLElement | null)?.click());
    return;
  }
  if (screen === 'settings') {
    const offline = h.pwa
      ? [{ title: 'Offline play', layout: 'offline-panel', html: `
          ${offlineLine(h.pwa)}
          <p class="note">Quick Play works offline after one complete online visit. Story scenes save as you play them (and the next one ahead); to take the whole case offline, download it below.</p>
          <div><h3 class="offline-sub">Story</h3>
          <p class="offline-status" data-region="offline-story" role="status">${esc(h.pwa.storyLine())}</p>
          <progress data-region="offline-story-progress" hidden aria-label="Story download progress"></progress>
          <div class="row"><button type="button" class="btn-ghost dark" data-act="offline-story">${esc(h.pwa.offlineButton('story'))}</button></div></div>
          <div><h3 class="offline-sub">Music &amp; ambience (optional)</h3>
          <p class="offline-status" data-region="offline-audio" role="status">${esc(h.pwa.audioLine())}</p>
          <progress data-region="offline-audio-progress" hidden aria-label="Audio download progress"></progress>
          <div class="row"><button type="button" class="btn-ghost dark" data-act="offline-audio">${esc(h.pwa.offlineButton('audio'))}</button></div></div>
          <p class="note">The studio intro always needs a connection.</p>
        ` }, { title: 'Storage', layout: 'offline-panel', html: `
          <div class="row"><button type="button" class="btn-ghost dark" data-act="repair">Repair offline files</button></div>
          <p class="note">Repair re-downloads only this game’s offline files (and the story or audio you chose to keep). Your saved game, story progress, settings and statistics are kept.</p>
          <div class="row"><button type="button" class="btn-ghost dark danger-ghost" data-act="erase">Erase saved game, settings &amp; statistics…</button></div>
        ` }]
      : [];
    root.innerHTML = shell(`<section class="panel" aria-labelledby="settings-heading">${back}<h2 id="settings-heading">Settings</h2>${menuPages('Settings', [...settingsSections(h.settings.get()), ...offline])}</section>`, 'Set the table how you like it.', 'smirk', true);
    wire();
    bindSettingsPanel(root.querySelector('menu-pages') as HTMLElement, h.settings);
    root.querySelector('[data-act="repair"]')?.addEventListener('click', () => h.pwa?.onRepair());
    root.querySelector('[data-act="offline-story"]')?.addEventListener('click', () => h.pwa?.onOffline('story'));
    root.querySelector('[data-act="offline-audio"]')?.addEventListener('click', () => h.pwa?.onOffline('audio'));
    const erase = root.querySelector<HTMLButtonElement>('[data-act="erase"]');
    erase?.addEventListener('click', () => {
      void confirmSheet(root, { title: 'Erase this game’s data?', body: 'Your saved game, settings, statistics and Story progress on this device are deleted. Offline files stay. This can’t be undone.', yes: 'Erase everything' }).then((yes) => yes && h.pwa?.onErase());
    });
    return;
  }
  const { dev, onStart } = h;
  // Quick Play opens on the computer opponent, Two Players on one shared device (both can still switch).
  const init: Partial<MenuChoice> = { ...initial, opponent: screen === 'setup-local' ? 'local' : 'ai' };
  const mode = init.mode ?? 'draw2';
  const modeCards = (['draw2', 'block2', 'partnership4'] as ModeId[])
    .map((m) => {
      const r = preset.modes[m];
      const enabled = PLAYABLE.includes(m);
      return `<label class="choice${enabled ? '' : ' is-disabled'}"><input type="radio" name="mode" value="${m}" ${m === mode ? 'checked' : ''} ${enabled ? '' : 'disabled'}><span class="choice-body"><strong>${esc(r.name)}</strong><span class="mode-meta">${r.seatCount === 4 ? '4 seats · two teams' : '2 players'} · to ${r.target.default}${enabled ? '' : ' · coming soon'}</span></span></label>`;
    })
    .join('');
  const devSections = import.meta.env.DEV && dev
    ? [{ title: 'Developer tools', html: `
        <label class="field">Shuffle seed (dev only) <input name="seed" type="text" autocomplete="off" placeholder="random"></label>
        <label class="field">AI seed (dev only, independent) <input name="aiSeed" type="text" autocomplete="off" placeholder="random"></label>
        <label class="check"><input type="radio" name="opponent" value="dev-both"> Control both seats (no handoff)</label>
        <label class="check"><input type="checkbox" name="forceSvg"> Force SVG tile fallback</label>
        <label class="check"><input type="checkbox" name="fastAi"> Fast AI (short thinking delays)</label>
        ` }, { title: 'Layout fixtures', html: `<div class="dev-fixtures"><span>Layout fixtures:</span>
          <button type="button" class="btn-ghost small" data-fixture="max-board">Max board</button>
          <button type="button" class="btn-ghost small" data-fixture="max-hand">21-tile hand</button>
          <button type="button" class="btn-ghost small" data-fixture="both-ends">Both ends</button>
          <button type="button" class="btn-ghost small" data-fixture="match-point">Match point</button>
          <button type="button" class="btn-ghost small" data-fixture="match-point-solo">Match point (solo)</button>
        </div>
        <a class="dev-link" href="./dev/contact-sheet.html">Tile contact sheet →</a>
        <a class="dev-link" href="./dev/audio-audition.html">Music loop audition →</a>
      ` }]
    : [];
  root.innerHTML = shell(
    `
      <form class="modes" aria-labelledby="modes-heading">
        ${back}
        <h2 id="modes-heading">${screen === 'setup-local' ? 'Two Players' : 'Quick Play'}</h2>
        ${menuPages('Game setup', [
          { title: 'Game & score', html: `
            <fieldset><legend>Game</legend><div class="choice-grid">${modeCards}</div></fieldset>
            <fieldset><legend>Play to</legend><div class="row">
              <label class="check"><input type="radio" name="target" value="100" checked> 100 points</label>
              <label class="check"><input type="radio" name="target" value="200"> 200 points</label>
            </div></fieldset>` },
          { title: 'Players', html: `<fieldset><legend>Players</legend><div class="row">
          <label class="check"><input type="radio" name="opponent" value="ai" ${init.opponent !== 'local' ? 'checked' : ''}> Play the computer</label>
          <label class="check" data-local><input type="radio" name="opponent" value="local" ${init.opponent === 'local' ? 'checked' : ''}> Two players, one device</label>
        </div><p class="note" data-p4-note hidden>Partnership: you and Luz (computer) against Cousin and Tío Rafa (computer).</p>
        </fieldset>
        <div class="two-players" data-two hidden>
          <div class="row">
            <label class="field">Player 1 <input name="name1" type="text" maxlength="20" autocomplete="off" value="${esc(init.names?.[0] ?? '')}" placeholder="Player 1"></label>
            <label class="field">Player 2 <input name="name2" type="text" maxlength="20" autocomplete="off" value="${esc(init.names?.[1] ?? '')}" placeholder="Player 2"></label>
          </div>
        </div>
        <div class="two-players" data-seating hidden>
          <label class="field">Where does Player 2 sit?
            <select name="seating">
              <option value="across" ${init.seating === 'across' || !init.seating ? 'selected' : ''}>Across — partners</option>
              <option value="right" ${init.seating === 'right' ? 'selected' : ''}>Right of Player 1 — opponents (plays next)</option>
              <option value="left" ${init.seating === 'left' ? 'selected' : ''}>Left of Player 1 — opponents (plays before)</option>
            </select>
          </label>
        </div>
        <p class="note" data-two hidden>You’ll pass the device between turns. Each hand stays covered until its owner taps Reveal.</p>
        <fieldset data-skill><legend>Computer skill</legend><div class="row">
          ${(['easy', 'normal', 'hard'] as Difficulty[])
            .map(
              (d) =>
                `<label class="check"><input type="radio" name="difficulty" value="${d}" ${(init.difficulty ?? 'normal') === d ? 'checked' : ''}> ${d === 'easy' ? 'Easy' : d === 'normal' ? 'Normal' : 'Hard'}</label>`,
            )
            .join('')}
        </div></fieldset>` },
          { title: 'Rules', html: '', layout: 'rules-card' },
          ...devSections,
        ])}
        <button type="submit" class="btn btn-start">Deal the tiles</button>
      </form>`,
    'Choose your game. The rules for it are right there before we deal.',
    'explaining',
    true,
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
    form.querySelectorAll<HTMLElement>('[data-two]').forEach((el) => { el.hidden = !two; });
    (form.querySelector('[data-seating]') as HTMLElement).hidden = !(p4 && two);
    (form.querySelector('[data-skill]') as HTMLElement).hidden = two && !p4;
    // The heading follows the choice, so switching here never leaves a stale title.
    (form.querySelector('#modes-heading') as HTMLElement).textContent = two ? 'Two Players' : 'Quick Play';
  };
  const syncRules = () => {
    const m = ((form.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value ?? 'draw2') as ModeId;
    (form.querySelector('.rules-card') as HTMLElement).innerHTML = rulesPageItems(preset.modes[m]);
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
