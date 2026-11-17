/**
 * Achievements: the lazily loaded service and screen.
 *
 * - **Loading:** a separate chunk (with its own stylesheet). main.ts loads it after the menu is up,
 *   through achievements-bridge.ts, which buffers table events until it's ready.
 * - **Badges:** inline SVG medallions. The category colour and tier come from design tokens, and each
 *   is `role="img"` with a label that says locked or unlocked.
 * - **Page:** a summary, category and status filters, cards with progress bars, and spoilers concealed
 *   until earned.
 * - **Notices:** quiet `role="status"` toasts with `pointer-events: none`. They wait while a hand is
 *   covered for a handoff, while a Story scene is on screen, while a sheet is open, during the start
 *   screen, and at the table while the player can act. Earlier-record awards show one summary instead
 *   of a burst.
 */
import './achievements.css';
import type { Stats } from '../app/stats';
import type { KeyValueStore } from '../app/storage';
import type { SceneId } from '../story/progress';
import { ACHIEVEMENTS, BY_ID, CATEGORIES, progressOf, type AchievementDef, type Category, type Glyph } from '../app/achievements/catalog';
import { AchievementTracker } from '../app/achievements/tracker';
import { esc } from './svg';

export interface ServiceDeps {
  readonly store: KeyValueStore | null;
  stats(): Stats | null;
  storyCompleted(): readonly SceneId[];
  onSaveFailed(): void;
  reduceMotion(): boolean;
}

// ---- badges ------------------------------------------------------------------------
/** 24×24 glyphs drawn in currentColor. */
const GLYPHS: Record<Glyph, string> = {
  tile: '<rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="7.2" r="1.3"/><circle cx="10" cy="15.5" r="1.2"/><circle cx="14" cy="17.5" r="1.2"/>',
  double: '<rect x="3" y="7" width="18" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8" stroke="currentColor" stroke-width="1.4"/><circle cx="7.5" cy="10" r="1.1"/><circle cx="7.5" cy="14" r="1.1"/><circle cx="16.5" cy="10" r="1.1"/><circle cx="16.5" cy="14" r="1.1"/>',
  boneyard: '<rect x="3" y="9" width="9" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="8" y="5" width="9" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="2" width="8" height="12" rx="1.6" fill="currentColor"/>',
  knock: '<path d="M6 6a8 8 0 0 0 0 12M10 8.5a4.5 4.5 0 0 0 0 7M18 6a8 8 0 0 1 0 12M14 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  star: '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0zM7 5H3.5a3.5 3.5 0 0 0 3.8 4M17 5h3.5a3.5 3.5 0 0 1-3.8 4M12 13v4M8 21h8M9.5 17h5v4h-5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  book: '<path d="M12 6c-2.5-2-5.5-2.5-9-2v15c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2V4c-3.5-.5-6.5 0-9 2zM12 6v15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  compass: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  handshake: '<circle cx="9" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  shield: '<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  crown: '<path d="M3.5 18l-1-10 5.5 4 4-7 4 7 5.5-4-1 10z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 21h16" stroke="currentColor" stroke-width="1.7"/>',
  spark: '<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3"/>',
};

export function badgeSvg(a: AchievementDef, unlocked: boolean, concealed = false): string {
  const [glyph, tier] = a.badge;
  const label = concealed ? 'Hidden story badge, locked' : `${a.title} badge, ${unlocked ? 'unlocked' : 'locked'}`;
  const dots = Array.from({ length: tier }, (_, i) => `<circle cx="${24 + (i - (tier - 1) / 2) * 6}" cy="42.5" r="1.8" class="ach-tier"/>`).join('');
  return `<svg class="ach-badge cat-${a.category}${unlocked ? ' is-on' : ''}" viewBox="0 0 48 48" role="img" aria-label="${esc(label)}"><circle cx="24" cy="24" r="21" class="ach-disc"/><circle cx="24" cy="24" r="17.5" class="ach-ring"/><g transform="translate(12 11)" class="ach-glyph">${concealed ? GLYPHS.lock : GLYPHS[glyph]}</g>${dots}</svg>`;
}

// ---- notices -------------------------------------------------------------------------
class Notices {
  #queue: string[] = [];
  #timer = 0;
  #showing = false;
  readonly #reduce: () => boolean;
  constructor(reduce: () => boolean) {
    this.#reduce = reduce;
  }
  push(text: string): void {
    this.#queue.push(text);
    this.#tick();
  }
  /** Never over a private handoff, a Story scene, an open sheet, the start screen, or a hidden page. */
  static canShow(starting = true): boolean {
    if (document.hidden) return false;
    if (document.querySelector('#app.is-start, .privacy-cover:not([hidden]), dialog[open]')) return false;
    const stage = document.querySelector<HTMLElement>('.story-stage');
    if (stage && !stage.hidden && !document.querySelector('#app .table-screen')) return false;
    // At the table, never while the player can act: the notice must not sit over a tile or control
    // they're about to use. It shows on the computer's turn or between hands.
    if (starting && document.querySelector('.table-screen .hand-tile.is-legal, .table-screen [data-act="draw"]:not([disabled]), .table-screen [data-act="pass"]:not([disabled])')) return false;
    return true;
  }
  #tick(): void {
    window.clearTimeout(this.#timer);
    if (this.#showing || !this.#queue.length) return;
    if (!Notices.canShow()) {
      this.#timer = window.setTimeout(() => this.#tick(), 800);
      return;
    }
    this.#showing = true;
    const html = this.#queue.shift()!;
    const el = document.createElement('div');
    el.className = `ach-toast${this.#reduce() ? ' no-motion' : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = html;
    document.body.append(el);
    const t0 = performance.now();
    // Yield if a sheet, a privacy cover, a Story scene or a hidden page arrives while showing: withdraw
    // and show it again, in full, later (never stranded under a sheet). The player's turn only delays a
    // notice from starting; one already showing finishes (it never takes input).
    const watch = window.setInterval(() => {
      const yielded = !Notices.canShow(false);
      if (!yielded && performance.now() - t0 < 3600) return;
      window.clearInterval(watch);
      el.remove();
      if (yielded) this.#queue.unshift(html);
      this.#showing = false;
      this.#tick();
    }, 250);
  }
}

// ---- service ---------------------------------------------------------------------------
export interface Service {
  readonly tracker: AchievementTracker;
  renderPage(el: HTMLElement): void;
}

export function createService(d: ServiceDeps): Service {
  const notices = new Notices(d.reduceMotion);
  const tracker = new AchievementTracker({
    store: d.store,
    now: () => Date.now(),
    onSaveFailed: d.onSaveFailed,
    onUnlock: (ids, retro) => {
      if (retro) {
        notices.push(`<p class="ach-toast-k">Achievements</p><p class="ach-toast-t">${ids.length} earned from your earlier games</p>`);
        return;
      }
      for (const id of ids) {
        const a = BY_ID.get(id)!;
        notices.push(`${badgeSvg(a, true)}<div><p class="ach-toast-k">Achievement unlocked</p><p class="ach-toast-t">${esc(a.title)}</p></div>`);
      }
    },
  });
  tracker.retro(d.stats(), d.storyCompleted());
  return { tracker, renderPage: (el) => renderPage(el, tracker) };
}

type Status = 'all' | 'unlocked' | 'progress' | 'locked';

function renderPage(el: HTMLElement, tracker: AchievementTracker): void {
  let cat: Category | 'all' = 'all';
  let status: Status = 'all';
  const draw = () => {
    const p = tracker.progress;
    const total = ACHIEVEMENTS.length;
    const got = ACHIEVEMENTS.filter((a) => p.unlocked[a.id]).length;
    const list = ACHIEVEMENTS.filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false;
      const on = !!p.unlocked[a.id];
      const prog = progressOf(a, p.counts);
      if (status === 'unlocked') return on;
      if (status === 'locked') return !on;
      if (status === 'progress') return !on && prog > 0;
      return true;
    });
    const chip = (group: string, v: string, label: string, on: boolean) => `<button type="button" class="ach-chip" data-${group}="${v}" aria-pressed="${on}">${esc(label)}</button>`;
    el.innerHTML = `
      <p class="ach-summary"><strong>${got}</strong> of ${total} unlocked</p>
      <progress class="ach-total" max="${total}" value="${got}" aria-label="Achievements unlocked: ${got} of ${total}"></progress>
      <p class="note">Counted from Quick Play against the computer and first-time Story hands. Two-player games count finished shared matches only. Story replays and developer tools never count.</p>
      <div class="ach-filters" role="group" aria-label="Category">${chip('cat', 'all', 'All', cat === 'all')}${CATEGORIES.map((c) => chip('cat', c.id, c.label, cat === c.id)).join('')}</div>
      <div class="ach-filters" role="group" aria-label="Status">${(
        [
          ['all', 'Any status'],
          ['unlocked', 'Unlocked'],
          ['progress', 'In progress'],
          ['locked', 'Locked'],
        ] as const
      )
        .map(([v, l]) => chip('status', v, l, status === v))
        .join('')}</div>
      <p class="ach-count" role="status">${list.length} shown</p>
      <ul class="ach-list" role="list">${list.map((a) => card(a, tracker)).join('') || '<li class="ach-empty">Nothing here yet.</li>'}</ul>`;
  };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.ach-chip');
    if (!b) return;
    if (b.dataset.cat) cat = b.dataset.cat as Category | 'all';
    if (b.dataset.status) status = b.dataset.status as Status;
    const which = b.dataset.cat ? `[data-cat="${b.dataset.cat}"]` : `[data-status="${b.dataset.status}"]`;
    draw();
    el.querySelector<HTMLElement>(`.ach-chip${which}`)?.focus();
  });
  draw();
}

function card(a: AchievementDef, tracker: AchievementTracker): string {
  const p = tracker.progress;
  const u = p.unlocked[a.id];
  const concealed = !!a.spoiler && !u;
  const prog = progressOf(a, p.counts);
  const cat = CATEGORIES.find((c) => c.id === a.category)!.label;
  const title = concealed ? 'Hidden story achievement' : a.title;
  const desc = concealed ? 'Keep working the case to reveal this one.' : a.desc;
  const how = concealed ? 'Revealed when earned.' : a.how;
  const bar = u
    ? `<p class="ach-state">Unlocked${u.r ? ' · from earlier records' : ''}</p>`
    : concealed
      ? '<p class="ach-state">Locked</p>'
      : `<div class="ach-prog"><progress max="${a.target}" value="${prog}" aria-label="${esc(`${a.title}: ${prog} of ${a.target}`)}"></progress><span aria-hidden="true">${prog} / ${a.target}</span></div>`;
  return `<li class="ach-card${u ? ' is-on' : ''}" data-id="${a.id}" data-state="${u ? 'unlocked' : 'locked'}">${badgeSvg(a, !!u, concealed)}<div class="ach-body"><p class="ach-cat">${esc(cat)}</p><h3 class="ach-title">${esc(title)}</h3><p class="ach-desc">${esc(desc)}</p><p class="ach-how">${esc(how)}</p>${bar}</div></li>`;
}
