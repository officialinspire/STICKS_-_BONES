/**
 * Table screen. Renders ONLY from TableController.view() — one revealed
 * human's view or a concealed public table — and changes the game ONLY through
 * controller intents. On a shared device, hands are never in the DOM unless
 * the controller is in 'human-turn' for that human.
 */
import { assetUrl, type RuntimeAssetId } from '../assets';
import { setEnvBackdrop } from '../assets/env';
import { warm } from '../assets/warm';
import { layoutChain, type BoardLayout, type EndSlot } from '../board/layout';
import type { GameEvent } from '../engine/events';
import type { EndId } from '../engine/line';
import { pipTotal, tileFromId } from '../engine/tiles';
import type { SeatIndex, TileId } from '../engine/types';
import type { SeatView } from '../engine/view';
import { controlStates, SORT_LABELS, SORT_MODES, sortHand, tileLabel, tileShort, whyNotPlayable, type SortMode } from '../app/helpers';
import type { TableController } from '../app/controller';
import type { GameSession } from '../app/session';
import { faceHtml, initTileArt, onBackendChange, tileBoxHtml } from '../render/tile-art';
import { Banter, type BanterContext } from '../app/banter';
import { explainResult, handLine } from '../app/explain';
import { AI_SPEED_FACTOR, reduceMotion } from '../app/settings';
import { opposite, rotationFor } from '../render/pips';
import { Effects, preloadEffects } from './effects';
import { wrapTab } from './focus-trap';
import { HostView, hostFigureHtml, type Mood } from './host';
import { endMood, playMood, resultMood, type HostSide } from './host-mood';
import { rulesHtml } from './rules-summary';
import { bindSettingsPanel, settingsPanelHtml, type SettingsApi } from './settings-panel';
import { esc } from './svg';


export interface TableCallbacks {
  onMenu(): void;
  /** Restart / rematch: a fresh match with the same setup. */
  onRestart(): void;
  readonly settings: SettingsApi;
  /** Optional audio/haptics hooks. Presentation only: called after state changes, never awaited. */
  readonly audio?: TableAudio;
  /** A new app version is waiting (PWA). `apply` saves, hides every hand and reloads. */
  readonly update?: { ready(): boolean; apply(): void };
  /** Story hand (NO REST FOR COUSIN): one hand only; the results sheet continues the case instead of dealing again. */
  readonly story?: {
    onContinue(): void;
    faces?: Readonly<Partial<Record<number, string>>>;
    /** The chapter's explicit backdrop for this hand (STAGING handEnv); null = drawn, no photo. Never defaulted. */
    env: RuntimeAssetId | null;
  };
  /** The player used a table tool (sort, zoom): exploration achievements. Presentation only. */
  explore?(what: 'sort' | 'zoom'): void;
}

export interface TableAudio {
  scene(s: 'gameplay' | 'paused' | 'results'): void;
  sfx(id: 'place' | 'knock' | 'draw' | 'slam' | 'pickup' | 'invalid' | 'shuffle'): void;
  haptic(cue: 'place' | 'knock' | 'domino'): void;
  /** A short musical result cue for a hand that just resolved (presentation only, never awaited). */
  result?(kind: 'win' | 'other'): void;
}

const UNIT_MIN = 26;
/**
 * On short screens (≤ 400 CSS px tall: phones in landscape such as 667×375) the whole chain can only fit
 * at a slightly smaller tile: 22 px keeps pips ≈ 4.2 px (QA floor 3 px). Elsewhere the 26-px floor stays.
 */
const UNIT_MIN_SHORT = 22;
const unitFloor = () => (typeof innerHeight === 'number' && innerHeight <= 400 ? UNIT_MIN_SHORT : UNIT_MIN);
const UNIT_MAX = 60;
const BRANCH: Record<EndId, string> = { head: 'upper-left', tail: 'lower-right' };

export class TableScreen {
  #root: HTMLElement;
  #c: TableController;
  #s: GameSession;
  #cb: TableCallbacks;
  #selected: TileId | null = null;
  #sort: SortMode = 'value';
  #unit = 0;
  /** The player zoomed by hand: stop auto-fitting the board to its box. */
  #userZoom = false;
  #message = '';
  #mood: Mood = 'neutral';
  #quip: string | null = null;
  #banter: Banter;
  #host: HostView | null = null;
  #fx: Effects;
  #mqWide: MediaQueryList | null = null;
  #mqMotion: MediaQueryList | null = null;
  #status = '';
  #lastPlayed: TileId | null = null;
  #resultsShownFor = -1;
  #pendingConfirm: 'menu' | 'restart' | null = null;
  #unsub: (() => void)[] = [];
  #ro: ResizeObserver | null = null;
  #handTurnKey = '';
  /** The hand number whose resolution was observed live (its results sheet plays the result cue once). */
  #liveResult: number | null = null;

  constructor(root: HTMLElement, controller: TableController, cb: TableCallbacks) {
    this.#root = root;
    this.#c = controller;
    this.#s = controller.session;
    this.#cb = cb;
    const st = cb.settings.get();
    this.#banter = new Banter({ explicitLanguage: st.explicitLanguage, enabled: st.banter });
    this.#fx = new Effects(() => this.#reduce());
  }

  #reduce(): boolean {
    return reduceMotion(this.#cb.settings.get(), this.#mqMotion?.matches ?? false);
  }

  /** Re-read settings (called after they change). Presentation only. */
  applySettings(): void {
    const st = this.#cb.settings.get();
    this.#banter.configure({ explicitLanguage: st.explicitLanguage, enabled: st.banter });
    this.#s.setThinkingSpeed(AI_SPEED_FACTOR[st.aiSpeed]);
    this.#root.classList.toggle('reduce-motion', this.#reduce());
    if (this.#reduce() || !st.hostAnimation) this.#host?.cancel();
    this.render();
  }

  /** Privacy cover is up (pass-the-device or reveal step). */
  #covered(): boolean {
    const k = this.#c.state.kind;
    return k === 'covered' || k === 'revealing';
  }

  mount(): void {
    const r = this.#root;
    r.innerHTML = `
      <div class="privacy-cover" data-region="cover" hidden></div>
      <div class="table-screen" data-region="table">
        <h1 class="sr-only">STICKS &amp; BONES — the table</h1>
        <header class="hud">
          <button type="button" class="btn-ghost" data-act="pause" aria-label="Pause — rules, settings, restart, leave">❚❚<span class="pause-text"> Pause</span></button>
          <div class="scoreboard" data-region="scores"></div>
        </header>
        <aside class="side">
          <div class="host-card"><div class="host-avatar" data-region="host-art"></div><p class="bubble" data-region="bubble"></p></div>
          <div class="opponent" data-region="opponent"></div>
        </aside>
        <section class="play" aria-label="Table">
          <div class="turn-banner" data-region="turn"></div>
          <div class="board-wrap" data-region="board-wrap" tabindex="-1" aria-label="Board"><div class="board" data-region="board"></div></div>
          <div class="controls" data-region="controls"></div>
          <div class="hand" data-region="hand"></div>
        </section>
        <p class="sr-only" aria-live="polite" data-region="announce"></p>
        <dialog class="sheet results" data-region="results" aria-labelledby="results-title"></dialog>
        <dialog class="sheet confirm" data-region="confirm" aria-labelledby="confirm-title"></dialog>
        <dialog class="sheet pause" data-region="pause" aria-labelledby="pause-title"></dialog>
      </div>`;
    r.addEventListener('click', this.#onClick);
    r.addEventListener('keydown', this.#onKey);
    const results = this.#q<HTMLDialogElement>('results');
    results.addEventListener('cancel', (e) => e.preventDefault());
    this.#unsub.push(this.#c.subscribe((events) => this.#onEvents(events)));
    this.#unsub.push(onBackendChange(() => this.render()));
    // Layout depends only on the board's width; height changes (e.g. a status line) must not re-render it.
    let lastWidth = -1;
    // A hidden tab / app switch pauses the table and covers any hand; returning lands on the cover.
    const onHide = () => {
      this.#c.conceal('hidden');
      this.#c.pause('hidden');
    };
    const onVis = () => {
      if (document.hidden) onHide();
      else if (!this.#pendingConfirm) this.#c.resume();
    };
    // Orientation changes can recreate layout: treat them like a handoff risk.
    const onOrient = () => this.#c.conceal('orientation');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('orientationchange', onOrient);
    screen.orientation?.addEventListener?.('change', onOrient);
    this.#unsub.push(() => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('orientationchange', onOrient);
      screen.orientation?.removeEventListener?.('change', onOrient);
    });
    const confirmDlg = this.#q<HTMLDialogElement>('confirm');
    confirmDlg.addEventListener('cancel', () => {
      this.#pendingConfirm = null;
      this.#c.resume();
      this.#resumeScene();
    });
    let lastFit = -1;
    let rowsFrame = 0;
    this.#ro = new ResizeObserver(() => {
      // Next frame, outside the observer callback: the row change resizes the observed board.
      cancelAnimationFrame(rowsFrame);
      rowsFrame = requestAnimationFrame(() => this.#layoutHandRows());
      const w = this.#q('board-wrap')?.clientWidth ?? 0;
      // A height change re-renders only if it changes the fitted tile size (keeps focus on end targets).
      const fit = this.#userZoom ? this.#unit : this.#fitUnit();
      if (w === lastWidth && fit === lastFit) return;
      lastWidth = w;
      lastFit = fit;
      this.#renderBoard();
    });
    this.#ro.observe(this.#q('board-wrap'));
    // Cousin: compact bust on small screens, full figure on wide ones; same stable stage either way.
    this.#mqWide = window.matchMedia('(min-width: 900px)');
    this.#mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#host = new HostView(this.#q('host-art'), this.#mqWide.matches ? 'full' : 'bust', {
      reduceMotion: () => this.#reduce(),
      animations: () => this.#cb.settings.get().hostAnimation,
    });
    const onWide = () => this.#host?.setVariant(this.#mqWide!.matches ? 'full' : 'bust');
    const onMotion = () => this.applySettings();
    this.#mqWide.addEventListener('change', onWide);
    this.#mqMotion.addEventListener('change', onMotion);
    this.#unsub.push(() => {
      this.#mqWide?.removeEventListener('change', onWide);
      this.#mqMotion?.removeEventListener('change', onMotion);
      this.#host?.cancel();
    });
    initTileArt();
    void warm(['table.weathered'], { front: true });
    preloadEffects();
    const pauseDlg = this.#q<HTMLDialogElement>('pause');
    pauseDlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.#closePause();
    });
    this.#message = this.#openingLine(this.#c.view());
    // The opening line: a brand-new match (not a restored one) starts with Cousin's call.
    const fresh = this.#s.seq === 0 && this.#s.debugState().history.length === 0;
    this.#quip = fresh ? this.#banter.say('opening') : null;
    // Voice/subtitle consistency from the very first frame.
    this.#q('announce').textContent = [this.#quip, this.#message].filter(Boolean).join(' ');
    this.#root.classList.toggle('reduce-motion', this.#reduce());
    this.#s.setThinkingSpeed(AI_SPEED_FACTOR[this.#cb.settings.get().aiSpeed]);
    // The 3:4 crop on portrait screens; a story hand may name its own scene (never inferred from art).
    setEnvBackdrop(r, this.#cb.story ? this.#cb.story.env : 'env.neighborhood-patio');
    const table = assetUrl('table.weathered');
    if (table) r.style.setProperty('--table-image', `url("${table}")`);
    this.render();
  }

  destroy(): void {
    this.#fx.clear(this.#root);
    this.#unsub.forEach((u) => u());
    this.#ro?.disconnect();
    this.#root.removeEventListener('click', this.#onClick);
    this.#root.removeEventListener('keydown', this.#onKey);
    this.#root.innerHTML = '';
  }

  // ---------------------------------------------------------------------------

  #q<T extends HTMLElement = HTMLElement>(region: string): T {
    return this.#root.querySelector(`[data-region="${region}"]`) as T;
  }

  #name(seat: SeatIndex): string {
    return this.#s.seatName(seat);
  }

  render(): void {
    const v = this.#c.view();
    if (this.#selected && !v.legalMoves.some((m) => m.tile === this.#selected)) this.#selected = null;
    // Anything about a private hand (status hints, selection) goes away with the hand.
    if (this.#c.revealed() === null || !this.#c.canAct()) {
      if (this.#c.revealed() === null) this.#status = '';
      if (!this.#c.canAct()) this.#selected = null;
    }
    this.#renderScores(v);
    this.#renderHost();
    this.#renderOpponent(v);
    this.#renderTurn(v);
    this.#renderBoard();
    this.#renderControls(v);
    this.#renderHand(v);
    this.#renderCover();
    this.#renderResults(v);
  }

  #renderScores(v: SeatView): void {
    const teams = this.#s.rules.teams;
    const cells = teams
      .map((_, t) => {
        const score = v.scores[t] ?? 0;
        const pct = Math.min(100, (score / v.targetScore) * 100);
        return `<div class="score${t === v.myTeam ? ' is-mine' : ''}"><span class="score-name">${esc(this.#s.teamName(t))}</span><span class="score-val">${score}</span><span class="score-bar"><span style="width:${pct}%"></span></span></div>`;
      })
      .join('');
    this.#q('scores').innerHTML = `${cells}<div class="score-meta">${esc(this.#s.rules.name)} · to ${v.targetScore} · Hand ${v.handNumber}</div>`;
  }

  #renderHost(): void {
    this.#host?.setMood(this.#mood);
    const b = this.#q('bubble');
    const html = `${this.#quip ? `<strong class="quip">${esc(this.#quip)}</strong>` : ''}<span class="fact">${esc(this.#message)}</span>`;
    if (b.innerHTML !== html) b.innerHTML = html;
  }

  /** Other seats in table order from the viewer: left, top (partner in Partnership), right. */
  #otherSeats(v: SeatView): { seat: SeatIndex; pos: 'left' | 'top' | 'right' }[] {
    const n = v.seatCount;
    if (n === 2) return [{ seat: ((v.viewer + 1) % 2) as SeatIndex, pos: 'top' }];
    return [
      { seat: ((v.viewer + 3) % 4) as SeatIndex, pos: 'left' },
      { seat: ((v.viewer + 2) % 4) as SeatIndex, pos: 'top' },
      { seat: ((v.viewer + 1) % 4) as SeatIndex, pos: 'right' },
    ];
  }

  #renderOpponent(v: SeatView): void {
    const team = v.teams[v.myTeam]!;
    const chips = this.#otherSeats(v)
      .map(({ seat, pos }) => {
        const n = v.handSizes[seat] ?? 0;
        const shown = Math.min(n, 21);
        const backs = Array.from({ length: shown }, () => `<span class="mini-back">${faceHtml('back')}</span>`).join('');
        const role = v.seatCount === 4 ? (team.includes(seat) ? 'Partner' : 'Opponent') : 'Opponent';
        let last = '';
        for (let i = v.log.length - 1; i >= 0; i--) {
          const a = v.log[i]!;
          if (a.seat !== seat) continue;
          last = a.kind === 'pass' ? 'passed' : a.kind === 'draw' ? 'drew' : '';
          break;
        }
        const turn = v.phase === 'playing' && v.turn === seat;
        return `<div class="seat-chip seat-${pos}${turn ? ' is-turn' : ''}${role === 'Partner' ? ' is-partner' : ''}" data-seat-pos="${pos}" data-seat="${seat}">
          <div class="opp-head">${this.#cb.story?.faces?.[seat] ? `<span class="seat-face" aria-hidden="true" style="${esc(this.#cb.story.faces[seat]!)}"></span>` : ''}<strong>${esc(this.#name(seat))}</strong> <span class="role">${role}</span></div>
          <div class="opp-meta"><span>${n} tile${n === 1 ? '' : 's'}</span>${last ? `<span class="badge">${last}</span>` : ''}${turn && this.#s.aiThinking ? '<span class="badge think">thinking…</span>' : ''}</div>
          <div class="opp-backs" aria-hidden="true">${backs}</div>
        </div>`;
      })
      .join('');
    const stockKind = this.#s.rules.stock.kind;
    const stock =
      stockKind === 'boneyard'
        ? `<div class="stock"><span class="stock-pile" aria-hidden="true">${v.boneyardCount ? `<span class="mini-back">${faceHtml('back')}</span>` : ''}</span><span><strong>${v.boneyardCount}</strong> in the boneyard</span></div>`
        : stockKind === 'unused'
          ? `<div class="stock"><span>${this.#s.rules.stock.size} set aside (not used)</span></div>`
          : '';
    this.#q('opponent').innerHTML = `<div class="seats seats-${v.seatCount}">${chips}</div>${stock}<div class="my-count">${esc(this.#name(v.viewer))}: ${v.myHand.length} tile${v.myHand.length === 1 ? '' : 's'}</div>`;
  }

  #renderTurn(v: SeatView): void {
    let text: string;
    if (v.phase === 'match-over') text = 'Match over';
    else if (v.phase !== 'playing') text = 'Hand over';
    else if (this.#covered()) text = `Waiting for ${this.#name(v.turn)}`;
    else if (this.#c.canAct()) text = this.#s.opponent === 'ai' ? 'Your turn' : `${this.#name(v.turn)} — your turn`;
    else text = `${this.#name(v.turn)}’s turn${this.#s.aiThinking ? ' — thinking…' : ''}`;
    if (this.#s.paused && v.phase === 'playing') text = 'Paused';
    const el = this.#q('turn');
    el.textContent = text;
    el.classList.toggle('is-mine', this.#c.canAct());
  }

  #defaultUnit(): number {
    const w = this.#q('board-wrap').clientWidth || 360;
    return Math.max(UNIT_MIN, Math.min(46, Math.round(w / 13)));
  }

  /**
   * Largest tile unit (≤ the width-based default) at which the whole chain fits
   * the board box's height too, so short and landscape screens show every tile
   * and both open ends without scrolling. Never below UNIT_MIN (pips stay ≥ 4.5 px).
   */
  #fitUnit(): number {
    const wrap = this.#q('board-wrap');
    const base = this.#defaultUnit();
    const availH = (wrap?.clientHeight ?? 0) - 24;
    if (!wrap || availH <= 0) return base;
    const line = this.#c.view().line;
    const floor = unitFloor();
    for (let u = base; u > floor; u--) {
      if (layoutChain(line, Math.floor(Math.max(0, wrap.clientWidth - 24) / u)).heightUnits * u <= availH) return u;
    }
    return floor;
  }

  #renderBoard(): void {
    const wrap = this.#q('board-wrap');
    const board = this.#q('board');
    if (!wrap || !board) return;
    if (!this.#userZoom || !this.#unit) this.#unit = this.#fitUnit();
    const v = this.#c.view();
    const u = this.#unit;
    const widthUnits = Math.floor(Math.max(0, wrap.clientWidth - 24) / u);
    const L = layoutChain(v.line, widthUnits);
    board.style.width = `${L.widthUnits * u}px`;
    board.style.height = `${L.heightUnits * u}px`;
    board.dataset.unit = String(u);
    board.dataset.widthUnits = String(L.widthUnits);
    const tiles = L.tiles
      .map((t) => {
        const x = t.box.x * u + 1;
        const y = t.box.y * u + 1;
        const w = t.box.w * u - 2;
        const h = t.box.h * u - 2;
        const attrs = `data-tile="${t.tile}" data-head-pip="${t.placed.headPip}" data-tail-pip="${t.placed.tailPip}" data-head-dir="${t.headDir}" data-high-dir="${t.highDir}" data-rotation="${t.rotation}" role="img" aria-label="${esc(tileLabel(t.tile))}"`;
        const cls = `board-tile${t.tile === this.#lastPlayed ? ' is-new' : ''}${t.placed.crosswise ? ' is-double' : ''}`;
        return `<span class="${cls}" style="left:${x}px;top:${y}px">${tileBoxHtml(t.tile, w, h, t.rotation, attrs)}</span>`;
      })
      .join('');
    board.innerHTML = tiles + this.#slotsHtml(v, L);
    if (this.#lastPlayed) {
      board.querySelector('.board-tile.is-new')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  #slotsHtml(v: SeatView, L: BoardLayout): string {
    const u = this.#unit;
    const legalEnds = this.#selected ? v.legalMoves.filter((m) => m.tile === this.#selected).map((m) => m.end) : [];
    const one = (slot: EndSlot, lead: boolean) => {
      const style = `left:${slot.box.x * u + 1}px;top:${slot.box.y * u + 1}px;width:${slot.box.w * u - 2}px;height:${slot.box.h * u - 2}px`;
      const legal = lead ? legalEnds.length > 0 : legalEnds.includes(slot.end);
      const label = lead ? 'Lead here' : String(slot.pip);
      if (legal && this.#selected && this.#c.canAct()) {
        const aria = lead ? `Lead with ${tileLabel(this.#selected)}` : `Play ${tileLabel(this.#selected)} on the ${slot.pip} end (${BRANCH[slot.end]} branch)`;
        // Endpoint preview: a ghost of the selected tile, oriented exactly as it would land.
        const move = v.legalMoves.find((m) => m.tile === this.#selected && (lead || m.end === slot.end))!;
        const t = tileFromId(move.tile);
        const w = slot.box.w * u - 8;
        const h = slot.box.h * u - 8;
        const tall = h > w;
        let rotation: number;
        if (t.high === t.low || !slot.towardChain) rotation = tall ? 0 : 270;
        else {
          const inward = slot.end === 'head' ? move.tailPip : move.headPip; // the half that touches the chain
          rotation = rotationFor(t.high === inward ? slot.towardChain : opposite(slot.towardChain));
        }
        return `<button type="button" class="end-slot is-legal" data-act="place" data-end="${lead ? 'head' : slot.end}" style="${style}" aria-label="${esc(aria)}"><span class="ghost">${tileBoxHtml(move.tile, w, h, rotation)}</span><span class="slot-cue" aria-hidden="true">▼</span></button>`;
      }
      if (lead) return `<span class="end-slot is-marker is-lead" style="${style}" aria-hidden="true"><span>${v.phase === 'playing' ? 'Lead' : ''}</span></span>`;
      return `<span class="end-slot is-marker" data-end-marker="${slot.end}" style="${style}" aria-hidden="true"><span>${esc(label)}</span></span>`;
    };
    if (v.line.tiles.length === 0) return one(L.slots.head, true);
    return one(L.slots.head, false) + one(L.slots.tail, false);
  }

  #renderControls(v: SeatView): void {
    const waiting = this.#name(v.turn);
    const st = this.#c.state;
    const off = (reason: string) => ({ draw: { enabled: false, reason }, pass: { enabled: false, reason } });
    const c =
      st.kind === 'paused'
        ? off('Paused.')
        : this.#covered()
          ? off(`Waiting for ${waiting} to take the device.`)
          : this.#c.canAct()
            ? controlStates(v, this.#s.rules, waiting)
            : off(v.phase === 'playing' ? `Waiting for ${waiting}.` : 'The hand is over.');
    const hasDraw = this.#s.rules.noMove.kind === 'draw-until-playable';
    const reasons = c.draw.reason === c.pass.reason || !hasDraw ? [hasDraw ? c.draw.reason : c.pass.reason] : [c.draw.reason, c.pass.reason];
    const ends = v.openEnds
      ? `<button type="button" class="btn-ghost small" data-act="focus-end" data-end="head" aria-label="Show the ${v.openEnds.head} end (upper-left branch)">↖ ${v.openEnds.head}</button><button type="button" class="btn-ghost small" data-act="focus-end" data-end="tail" aria-label="Show the ${v.openEnds.tail} end (lower-right branch)">${v.openEnds.tail} ↘</button>`
      : '';
    this.#q('controls').innerHTML = `
      <div class="actions">
        ${hasDraw ? `<button type="button" class="btn" data-act="draw" ${c.draw.enabled ? '' : 'disabled'} aria-describedby="reason-0">Draw</button>` : ''}
        <button type="button" class="btn" data-act="pass" ${c.pass.enabled ? '' : 'disabled'} aria-describedby="reason-${hasDraw && reasons.length > 1 ? 1 : 0}">Pass</button>
        <div class="reasons">${reasons.map((r, i) => `<p id="reason-${i}" class="reason">${esc(r)}</p>`).join('')}${this.#status ? `<p class="status" role="status">${esc(this.#status)}</p>` : ''}</div>
      </div>
      <div class="view-tools">
        <button type="button" class="btn-ghost small" data-act="sort">${esc(SORT_LABELS[this.#sort])}</button>
        ${ends}
        <button type="button" class="btn-ghost small" data-act="zoom-out" aria-label="Zoom board out" ${this.#unit <= unitFloor() ? 'disabled' : ''}>−</button>
        <button type="button" class="btn-ghost small" data-act="zoom-in" aria-label="Zoom board in" ${this.#unit >= UNIT_MAX ? 'disabled' : ''}>+</button>
      </div>`;
  }

  #renderHand(v: SeatView): void {
    const el = this.#q('hand');
    const prevScroll = el.querySelector('.hand-scroll')?.scrollLeft ?? 0;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.tile;
    if (v.concealed || this.#c.revealed() === null) {
      // No hand in the DOM at all — not hidden with CSS, simply absent.
      const st = this.#c.state;
      const msg =
        st.kind === 'ai-turn'
          ? `${this.#name(st.seat)} is playing. Hands stay hidden.`
          : st.kind === 'round-results'
            ? 'Hand over.'
            : st.kind === 'paused'
              ? 'Paused — hands are hidden.'
              : `Hands hidden until ${this.#name(v.turn)} is ready.`;
      el.innerHTML = `<p class="hand-hidden">${esc(msg)}</p>`;
      return;
    }
    const tiles = sortHand(v.myHand, this.#sort);
    const myTurn = this.#c.canAct();
    const buttons = tiles
      .map((id) => {
        const legal = myTurn && v.legalMoves.some((m) => m.tile === id);
        const sel = this.#selected === id;
        const state = legal ? 'playable' : 'not playable now';
        return `<button type="button" class="hand-tile${legal ? ' is-legal' : ''}${sel ? ' is-selected' : ''}" data-act="select" data-tile="${id}" aria-pressed="${sel}" aria-label="${esc(`${tileLabel(id)}, ${pipTotal(tileFromId(id))} pips, ${state}`)}"${legal ? '' : ' aria-disabled="true"'}>${faceHtml(id)}</button>`;
      })
      .join('');
    el.innerHTML = `<div class="hand-head"><span>${esc(this.#s.opponent === 'ai' ? 'Your tiles' : `${this.#name(v.viewer)}’s tiles`)} (${tiles.length})</span><span class="hint">${myTurn ? (v.legalMoves.length ? 'Pick a glowing tile, then tap where it goes.' : '') : ''}</span></div><div class="hand-scroll" role="toolbar" aria-label="Your tiles">${buttons}</div>`;
    const scroller = el.querySelector('.hand-scroll') as HTMLElement;
    // Long hands: two rows when one row would scroll and the screen has the height for it
    // (portrait phones and tablets), so more tiles — and the playable ones — are in view at once.
    this.#layoutHandRows();
    scroller.scrollLeft = prevScroll;
    // A new turn with tiles off-screen: bring the first playable tile into view (once per turn,
    // so the player's own scrolling is never fought).
    const turnKey = myTurn ? `${v.viewer}:${v.line.tiles.length}:${tiles.length}:${v.handNumber}` : '';
    if (turnKey && turnKey !== this.#handTurnKey) {
      const legal = scroller.querySelector<HTMLElement>('.hand-tile.is-legal');
      if (legal && (legal.offsetLeft < scroller.scrollLeft || legal.offsetLeft + legal.offsetWidth > scroller.scrollLeft + scroller.clientWidth)) {
        scroller.scrollLeft = Math.max(0, legal.offsetLeft - 8);
      }
    }
    this.#handTurnKey = turnKey;
    this.#handEdges();
    scroller.addEventListener('scroll', () => this.#handEdges(), { passive: true });
    if (focused) (el.querySelector(`[data-tile="${focused}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Long hands: two rows when one row would scroll and the screen is tall (portrait phones, tablets).
   *  Re-run on every resize, so rotating never leaves a stale layout. */
  #layoutHandRows(): void {
    const scroller = this.#root.querySelector<HTMLElement>('.hand-scroll');
    if (!scroller) return;
    const n = scroller.children.length;
    const tileW = parseFloat(getComputedStyle(scroller).getPropertyValue('--hand-w')) || 42;
    const perRow = Math.max(1, Math.floor((scroller.clientWidth - 8 + 6) / (tileW + 6)));
    const two = n > perRow && window.innerHeight >= 640 && window.innerHeight > window.innerWidth * 0.9;
    scroller.classList.toggle('two-rows', two);
    if (two) scroller.style.setProperty('--hand-cols', String(Math.ceil(n / 2)));
    else scroller.style.removeProperty('--hand-cols');
    this.#handEdges();
  }

  /** More tiles off-screen: mark which edge(s) fade. */
  #handEdges(): void {
    const s = this.#root.querySelector<HTMLElement>('.hand-scroll');
    if (!s) return;
    const more = s.scrollWidth - s.clientWidth > 2;
    s.dataset.more = !more ? 'none' : s.scrollLeft < 2 ? 'right' : s.scrollLeft + s.clientWidth >= s.scrollWidth - 2 ? 'left' : 'both';
  }

  #renderCover(): void {
    const el = this.#q('cover');
    const table = this.#q('table');
    const st = this.#c.state;
    if (st.kind !== 'covered' && st.kind !== 'revealing') {
      if (!el.hidden) {
        el.hidden = true;
        el.innerHTML = '';
      }
      table.inert = false;
      table.removeAttribute('aria-hidden');
      return;
    }
    // While covered the whole table is inert: unreachable by focus and screen readers.
    table.inert = true;
    table.setAttribute('aria-hidden', 'true');
    const who = esc(this.#name(st.seat));
    const key = `${st.kind}:${st.seat}`;
    if (!el.hidden && el.dataset.key === key) return;
    el.dataset.key = key;
    el.hidden = false;
    el.innerHTML =
      st.kind === 'covered'
        ? `<div class="cover-card" role="dialog" aria-modal="true" aria-labelledby="cover-title" aria-describedby="cover-desc">
             <p class="cover-kicker">${st.reason === 'resume' || st.reason === 'restored' || st.reason === 'hidden' || st.reason === 'orientation' ? 'Hands hidden' : 'Your turn is next'}</p>
             <h2 id="cover-title">Pass the device to ${who}</h2>
             <p id="cover-desc">Only ${who} should look at the screen.</p>
             <button type="button" class="btn" data-act="cover-ready">I’m ${who} — ready</button>
             <p><button type="button" class="link-button" data-act="cover-menu">Save &amp; leave to menu</button></p>
           </div>`
        : `<div class="cover-card" role="dialog" aria-modal="true" aria-labelledby="cover-title">
             <h2 id="cover-title">${who}, reveal your hand?</h2>
             <p>Make sure nobody else can see the screen.</p>
             <div class="sheet-actions"><button type="button" class="btn-ghost dark" data-act="cover-back">Not ${who}</button><button type="button" class="btn" data-act="cover-reveal">Reveal hand</button></div>
           </div>`;
    (el.querySelector('[data-act="cover-ready"], [data-act="cover-reveal"]') as HTMLElement | null)?.focus();
  }

  #renderResults(v: SeatView): void {
    const dlg = this.#q<HTMLDialogElement>('results');
    const r = v.result;
    if (!r || (v.phase !== 'hand-resolved' && v.phase !== 'match-over')) {
      if (dlg.open) dlg.close();
      return;
    }
    if (this.#resultsShownFor === r.handNumber && dlg.open) return;
    this.#resultsShownFor = r.handNumber;
    const name = (s: SeatIndex) => this.#name(s);
    let title: string;
    let why: string;
    if (r.end.kind === 'out') {
      title = `${name(r.end.seat)} went out — ¡Dominó!`;
      why = 'First to empty their hand wins the hand.';
    } else if (r.winnerSeat !== null) {
      title = v.seatCount === 4 ? `¡Tranque! ${this.#s.teamName(r.winnerTeam!)} win the block` : `¡Tranque! ${name(r.winnerSeat)} win${this.#s.opponent === 'ai' && r.winnerSeat === 0 ? '' : 's'} the block`;
      why = v.seatCount === 4 ? 'Nobody could play, so the team with fewer pips wins.' : 'Nobody could play, so the lower pip count wins.';
    } else {
      title = '¡Tranque! It’s a tie';
      why = v.seatCount === 4 ? 'Nobody could play and both teams hold the same pips — no points.' : 'Nobody could play and both hands hold the same pips — no points.';
    }
    const hands = r.finalHands
      .map((h, seat) => {
        const faces = h.length ? h.map((id) => `<span class="result-tile" role="img" aria-label="${esc(tileLabel(id))}">${faceHtml(id)}</span>`).join('') : '<em>no tiles left</em>';
        // The pip sum is spelled out under the tiles (zero-pip tiles and empty hands included).
        const sum = handLine(name(seat as SeatIndex), h).replace(/^[^:]+: /, '');
        return `<div class="result-hand"><div class="result-who"><strong>${esc(name(seat as SeatIndex))}</strong><span>${r.seatTotals[seat]} pip${r.seatTotals[seat] === 1 ? '' : 's'}</span></div><div class="result-tiles">${faces}</div>${h.length ? `<p class="math-line">${esc(sum)}</p>` : ''}</div>`;
      })
      .join('');
    const ex = explainResult(r, this.#s.rules, name, (t) => this.#s.teamName(t));
    const teamLine = `<div class="how"><p class="kicker">How the points add up</p><ul class="math">${[...ex.teams, ex.decision, ex.points].map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
    const pts =
      r.winnerTeam === null
        ? 'No points this hand.'
        : r.points === 0
          ? `${esc(this.#s.teamName(r.winnerTeam))} take${(this.#s.opponent === 'ai' && r.winnerTeam === 0) || this.#s.teamName(r.winnerTeam).includes(' & ') ? '' : 's'} the hand — but there are no pips left to count.`
          : `+${r.points} for ${this.#s.opponent === 'ai' && r.winnerTeam === 0 ? 'you' : esc(this.#s.teamName(r.winnerTeam))}`;
    const before = r.scoresAfter.map((sc, t) => (t === r.winnerTeam ? sc - r.points : sc));
    const scores = this.#s.rules.teams
      .map((_, t) => `<span>${esc(this.#s.teamName(t))}: <strong class="tally" data-from="${before[t]}" data-to="${v.scores[t]}">${v.scores[t]}</strong></span>`)
      .join(' · ');
    const over = v.phase === 'match-over' && v.winnerTeam !== null;
    // Plural subjects ("You", "Ana & Luz") take "win"; a single player name takes "wins".
    const winnerName = over ? this.#s.teamName(v.winnerTeam!) : '';
    const plural = (this.#s.opponent === 'ai' && v.winnerTeam === 0) || winnerName.includes(' & ');
    const matchLine = over ? `<p class="match-line">${esc(winnerName)} ${plural ? 'win' : 'wins'} the match!</p>` : '';
    const buttons = this.#cb.story
      ? `<button type="button" class="btn primary" data-act="story-hand-done">Continue the case</button>`
      : over
        ? `<button type="button" class="btn" data-act="new-match">Rematch</button><button type="button" class="btn-ghost" data-act="menu-now">Menu</button>`
        : `<button type="button" class="btn" data-act="next-hand">Next hand</button>`;
    const mood: Mood = resultMood(this.#side(), r.winnerTeam === null ? 'tie' : this.#hostTeam() === r.winnerTeam ? 'host-won' : 'host-lost', over);
    dlg.innerHTML = `<div class="results-head"><div class="results-host" data-mood="${mood}">${hostFigureHtml(mood, 'full')}</div><div><h2 id="results-title">${esc(title)}</h2><p class="why">${esc(why)}</p></div></div>${hands}${teamLine}<p class="points">${pts}</p><p class="scores-line">${scores} · to ${v.targetScore}</p>${matchLine}<div class="sheet-actions">${buttons}</div>`;
    if (!dlg.open) dlg.showModal();
    this.#cb.audio?.scene('results');
    // The result cue, only for a hand that resolved live at this table (a results sheet restored after a reload
    // never replays it), and from the players' side: their team won, or, when two people play against each
    // other, someone at the table won. A blocked tie is "other".
    if (this.#liveResult === r.handNumber) {
      this.#liveResult = null;
      const humanTeams = new Set(this.#s.rules.teams.flatMap((tm, t) => (tm.some((x) => this.#s.isHuman(x)) ? [t] : [])));
      const won = r.winnerTeam !== null && (humanTeams.size === 1 ? humanTeams.has(r.winnerTeam) : true);
      this.#cb.audio?.result?.(won ? 'win' : 'other');
    }
    // Focus the primary action without scrolling: the sheet opens at its title (the actions are sticky).
    (dlg.querySelector('.btn') as HTMLElement).focus({ preventScroll: true });
    dlg.scrollTop = 0;
    this.#tally(dlg);
  }

  /** Count scores up from their pre-hand values (instant under reduced motion). Width is fixed via tabular numerals. */
  #tally(root: HTMLElement): void {
    const els = [...root.querySelectorAll<HTMLElement>('.tally')];
    if (this.#reduce()) return;
    const start = performance.now();
    const DURATION = 700;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / DURATION);
      const ease = 1 - (1 - k) ** 3;
      for (const el of els) {
        const from = Number(el.dataset.from);
        const to = Number(el.dataset.to);
        el.textContent = String(Math.round(from + (to - from) * ease));
      }
      if (k < 1 && root.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  #openPause(): void {
    const dlg = this.#q<HTMLDialogElement>('pause');
    this.#c.pause('dialog');
    const rules = this.#s.rules;
    dlg.innerHTML = `<h2 id="pause-title">Paused</h2>
      <div class="pause-actions"><button type="button" class="btn" data-act="pause-resume">Resume</button><button type="button" class="btn-ghost dark" data-act="restart">Restart match</button><button type="button" class="btn-ghost dark" data-act="menu">Leave to menu</button></div>
      <div class="update-banner" data-region="update" ${this.#cb.update?.ready() ? '' : 'hidden'}><p><strong>Update available.</strong> Your game is saved and the hands are hidden before the new version loads.</p><button type="button" class="btn-ghost dark" data-act="update-now">Update now</button></div>
      <details class="pause-more"><summary>Rules</summary>${rulesHtml(rules)}</details>
      <details class="pause-more"><summary>Settings</summary>${settingsPanelHtml(this.#cb.settings.get())}</details>`;
    bindSettingsPanel(dlg.querySelector('.settings-panel') as HTMLElement, {
      get: () => this.#cb.settings.get(),
      set: (p) => {
        this.#cb.settings.set(p);
        this.applySettings();
      },
    });
    if (!dlg.open) dlg.showModal();
    this.#cb.audio?.scene('paused');
    (dlg.querySelector('[data-act="pause-resume"]') as HTMLElement).focus();
  }

  #closePause(): void {
    const dlg = this.#q<HTMLDialogElement>('pause');
    if (dlg.open) dlg.close();
    this.#c.resume();
    this.#resumeScene();
  }

  /** Music scene to return to after a pause: results while a results sheet is up, else gameplay. */
  #resumeScene(): void {
    this.#cb.audio?.scene(this.#q<HTMLDialogElement>('results').open ? 'results' : 'gameplay');
  }

  #showConfirm(kind: 'menu' | 'restart'): void {
    this.#pendingConfirm = kind;
    this.#cb.audio?.scene('paused');
    this.#c.pause('dialog');
    const dlg = this.#q<HTMLDialogElement>('confirm');
    const text =
      kind === 'menu'
        ? ['Leave this match?', this.#s.opponent === 'dev-both' ? 'This developer match is not saved.' : 'It stays saved on this device — resume it from the menu.', 'Leave']
        : ['Restart the match?', 'Scores go back to zero and new tiles are dealt.', 'Restart'];
    dlg.innerHTML = `<h2 id="confirm-title">${text[0]}</h2><p>${text[1]}</p><div class="sheet-actions"><button type="button" class="btn-ghost" data-act="confirm-no">Keep playing</button><button type="button" class="btn danger" data-act="confirm-yes">${text[2]}</button></div>`;
    dlg.showModal();
    (dlg.querySelector('[data-act="confirm-no"]') as HTMLElement).focus();
  }

  // ---------------------------------------------------------------------------

  /** Whose side the host figure is on (src/ui/host-mood.ts). */
  #side(): HostSide {
    return this.#cb.story ? 'player' : this.#s.opponent === 'ai' ? 'opponent' : 'commentator';
  }
  #teamOf(seat: SeatIndex): number {
    return this.#s.rules.teams.findIndex((tm) => tm.includes(seat));
  }
  /**
   * The host's team: in Story, Roberto's (the human's); against the computer, Cousin's — the team without the
   * human (team 1 in every preset: the human is seat 0). Two humans: none (-1).
   */
  #hostTeam(): number {
    const humanTeams = this.#s.rules.teams.map((tm, t) => (tm.some((x) => this.#s.isHuman(x)) ? t : -1)).filter((t) => t >= 0);
    const side = this.#side();
    if (side === 'player') return humanTeams[0] ?? 0;
    if (side === 'opponent') return this.#s.rules.teams.findIndex((_, t) => !humanTeams.includes(t));
    return -1;
  }

  /** Who is "Cousin" for banter: the AI seat named Cousin. */
  #isCousin(seat: SeatIndex): boolean {
    return !this.#s.isHuman(seat) && this.#name(seat) === 'Cousin';
  }

  #onEvents(events: readonly GameEvent[]): void {
    const v = this.#c.view();
    let quip: string | null | undefined; // undefined = keep current quip
    let slam = false;
    let impact: { big: boolean } | null = null;
    const knocks: SeatIndex[] = [];
    let placed = false;
    let drew = false;
    let domino = false;
    let dealt = false;
    const say = (ctx: BanterContext) => {
      const line = this.#banter.say(ctx);
      if (line) quip = line;
      else if (quip === undefined) quip = null;
    };
    for (const e of events) {
      switch (e.type) {
        case 'hand-started':
          dealt = true;
          this.#lastPlayed = null;
          this.#message = this.#openingLine(v);
          this.#mood = 'explaining';
          say('hand-start');
          break;
        case 'tile-played': {
          this.#lastPlayed = e.tile;
          this.#message = `${this.#name(e.seat)} played ${tileShort(e.tile)}.`;
          this.#mood = playMood(this.#side(), this.#s.isHuman(e.seat) ? 'human' : this.#side() === 'player' ? (this.#teamOf(e.seat) === this.#hostTeam() ? 'partner' : 'other') : 'host');
          const t = tileFromId(e.tile);
          impact = { big: false };
          placed = true;
          if (t.high === t.low) {
            say('double');
            if (this.#isCousin(e.seat)) slam = true;
          } else say(this.#s.isHuman(e.seat) ? 'player-play' : this.#isCousin(e.seat) ? 'cousin-play' : 'other-play');
          break;
        }
        case 'tile-drawn':
          // The bubble and live region are public on a shared device: never name a drawn tile there.
          this.#message = e.tile && !this.#c.privacy ? `${this.#name(e.seat)} drew ${tileShort(e.tile)}${e.playable ? ' — it plays!' : '.'}` : `${this.#name(e.seat)} drew from the boneyard.`;
          if (e.tile && this.#c.privacy) this.#status = `You drew ${tileShort(e.tile)}${e.playable ? ' — it plays!' : '.'}`;
          this.#mood = 'thinking';
          drew = true;
          say('draw');
          break;
        case 'passed':
          this.#message = `${this.#name(e.seat)} ${this.#s.opponent === 'ai' && e.seat === 0 ? 'knock' : 'knocks'} — pass.`;
          this.#mood = 'explaining';
          knocks.push(e.seat);
          say(this.#s.isHuman(e.seat) ? 'player-pass' : 'cousin-pass');
          break;
        case 'hand-ended':
          this.#message = e.end.kind === 'out' ? `¡Dominó! ${this.#name(e.end.seat)} ${this.#s.opponent === 'ai' && e.end.seat === 0 ? 'are' : 'is'} out.` : '¡Tranque! Nobody can play.';
          this.#mood = endMood(this.#side(), e.end.kind === 'out' ? this.#teamOf(e.end.seat) === this.#hostTeam() : null);
          if (e.end.kind === 'out') {
            slam = true;
            impact = { big: true };
            domino = true;
            const seat = e.end.seat;
            const team = this.#s.rules.teams.find((tm) => tm.includes(seat))!;
            say(this.#s.isHuman(seat) ? 'player-out' : team.some((x) => this.#s.isHuman(x)) ? 'team-out' : 'cousin-out');
          } else say('tranque');
          break;
        case 'hand-resolved':
          this.#liveResult = e.result.handNumber; // observed live: the results sheet may play its cue once
          if (e.result.winnerTeam === null) say('tie');
          break;
        case 'match-won': {
          const humansWon = this.#s.rules.teams[e.team]!.some((x) => this.#s.isHuman(x));
          this.#mood = this.#s.opponent === 'ai' && !humansWon ? 'pumped' : 'delighted';
          say(this.#s.opponent === 'ai' && !humansWon ? 'match-lost' : 'match-won');
          break;
        }
        default:
          break;
      }
    }
    if (quip !== undefined && events.length) this.#quip = quip;
    if (events.length && !events.some((e) => e.type === 'tile-drawn' && e.tile)) this.#status = '';
    if (v.phase === 'playing' && !this.#s.isHuman(v.turn)) this.#mood = 'thinking';
    const err = this.#s.lastError;
    if (err) this.#status = err.message;
    // Voice/subtitle consistency: the live region announces exactly what the bubble shows.
    this.#q('announce').textContent = [this.#quip, this.#message].filter(Boolean).join(' ');
    if (this.#covered()) this.#fx.clear(this.#root);
    this.render();
    // Presentation only — fired after the state is already applied; nothing waits on these.
    const a = this.#cb.audio;
    if (a) {
      if (dealt) a.sfx('shuffle');
      if (domino) {
        a.sfx('slam');
        a.haptic('domino');
      } else if (placed) {
        a.sfx(slam ? 'slam' : 'place'); // Cousin slaps his doubles down
        a.haptic('place');
      }
      if (knocks.length) {
        a.sfx('knock');
        a.haptic('knock');
      }
      if (drew) a.sfx('draw');
    }
    if (slam) this.#host?.slam();
    if (impact) {
      const board = this.#q('board');
      const tile = board.querySelector<HTMLElement>('.board-tile.is-new');
      if (tile) this.#fx.impact(board, tile, this.#unit, impact.big);
    }
    for (const seat of knocks) {
      const target = seat === v.viewer && !v.concealed ? this.#q('hand') : this.#root.querySelector<HTMLElement>(`.seat-chip[data-seat="${seat}"]`);
      if (target) this.#fx.knock(target);
    }
    if (this.#c.canAct() && (events.length === 0 || events.some((e) => e.type === 'turn' || e.type === 'hand-started'))) this.#focusHand();
  }

  #openingLine(v: SeatView): string {
    const opener = this.#name(v.opener);
    if (v.requirement.kind === 'tile') return `Hand ${v.handNumber}. ${opener} lead${this.#s.opponent === 'ai' && v.opener === 0 ? '' : 's'} with ${tileShort(v.requirement.tile)}.`;
    if (v.requirement.kind === 'hidden-tile') return `Hand ${v.handNumber}. ${opener} holds the opening tile.`;
    return `Hand ${v.handNumber}. ${opener} ${this.#s.opponent === 'ai' && v.opener === 0 ? 'open' : 'opens'} — any tile.`;
  }

  #focusHand(): void {
    const first = this.#root.querySelector<HTMLElement>('.hand-tile.is-legal') ?? this.#root.querySelector<HTMLElement>('[data-act="draw"]:not([disabled]), [data-act="pass"]:not([disabled])');
    first?.focus({ preventScroll: true });
  }

  #select(id: TileId): void {
    const v = this.#c.view();
    const reason = whyNotPlayable(v, id);
    if (reason || !this.#c.canAct()) {
      this.#selected = null;
      this.#status = reason ?? 'Not your turn.';
      this.render();
      this.#cb.audio?.sfx('invalid'); // restrained: one soft low tone, the status line explains
      return;
    }
    this.#selected = this.#selected === id ? null : id;
    if (this.#selected) this.#cb.audio?.sfx('pickup');
    const ends = v.legalMoves.filter((m) => m.tile === id);
    this.#status = this.#selected ? (v.line.tiles.length === 0 ? 'Tap the glowing spot to lead.' : ends.length > 1 ? `${tileShort(id)} fits both ends — choose one.` : 'Tap the glowing end to place it.') : '';
    this.render();
    if (this.#selected) {
      const slot = this.#root.querySelector<HTMLElement>('.end-slot.is-legal');
      slot?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      slot?.focus({ preventScroll: true });
    }
  }

  #place(end: EndId): void {
    if (!this.#selected) return;
    const tile = this.#selected;
    this.#selected = null;
    if (!this.#c.play(tile, end)) {
      this.#status = this.#s.lastError?.message ?? 'That move was not accepted.';
      this.render();
    }
  }

  #onClick = (ev: MouseEvent): void => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    switch (target.dataset.act) {
      case 'select':
        this.#select(target.dataset.tile as TileId);
        break;
      case 'place':
        this.#place(target.dataset.end as EndId);
        break;
      case 'draw':
        this.#selected = null;
        this.#c.draw();
        break;
      case 'pass':
        this.#selected = null;
        this.#c.pass();
        break;
      case 'sort':
        this.#cb.explore?.('sort');
        this.#sort = SORT_MODES[(SORT_MODES.indexOf(this.#sort) + 1) % SORT_MODES.length]!;
        this.render();
        break;
      case 'zoom-in':
      case 'zoom-out':
        this.#userZoom = true;
        this.#cb.explore?.('zoom');
        this.#unit = Math.max(unitFloor(), Math.min(UNIT_MAX, this.#unit + (target.dataset.act === 'zoom-in' ? 4 : -4)));
        this.render();
        break;
      case 'focus-end': {
        const end = target.dataset.end;
        this.#root.querySelector<HTMLElement>(`[data-end-marker="${end}"], .end-slot[data-end="${end}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        break;
      }
      case 'cover-ready':
        this.#c.ready();
        break;
      case 'cover-back':
        // Back to "Pass the device": re-cover without revealing.
        this.#c.conceal('hidden');
        break;
      case 'cover-reveal':
        this.#c.reveal();
        break;
      case 'cover-menu':
        // The match stays saved; resuming later lands on this cover again.
        this.#cb.onMenu();
        break;
      case 'next-hand':
        this.#q<HTMLDialogElement>('results').close();
        this.#cb.audio?.scene('gameplay');
        this.#c.nextHand();
        break;
      case 'new-match':
        this.#q<HTMLDialogElement>('results').close();
        this.#cb.onRestart();
        break;
      case 'menu-now':
        this.#q<HTMLDialogElement>('results').close();
        this.#cb.onMenu();
        break;
      case 'pause':
        this.#openPause();
        break;
      case 'pause-resume':
        this.#closePause();
        break;
      case 'story-hand-done':
        this.#q<HTMLDialogElement>('results').close();
        this.#cb.story?.onContinue();
        break;
      case 'update-now':
        // Stable point: the table is paused behind the pause sheet; main saves, hides the hand and reloads.
        this.#cb.update?.apply();
        break;
      case 'menu':
      case 'restart': {
        const pauseDlg = this.#q<HTMLDialogElement>('pause');
        if (pauseDlg.open) pauseDlg.close(); // stays paused while confirming
        this.#showConfirm(target.dataset.act);
        break;
      }
      case 'confirm-no':
        this.#pendingConfirm = null;
        this.#q<HTMLDialogElement>('confirm').close();
        this.#c.resume();
        this.#resumeScene();
        break;
      case 'confirm-yes': {
        const kind = this.#pendingConfirm;
        this.#pendingConfirm = null;
        this.#q<HTMLDialogElement>('confirm').close();
        if (kind === 'menu') this.#cb.onMenu();
        else if (kind === 'restart') this.#cb.onRestart();
        break;
      }
    }
  };

  #onKey = (ev: KeyboardEvent): void => {
    const el = ev.target as HTMLElement;
    // Tab wraps inside whichever modal surface is open (confirm > results/pause > privacy cover).
    if (ev.key === 'Tab') {
      const surface =
        this.#root.querySelector('dialog.confirm[open]') ??
        this.#root.querySelector('dialog.results[open], dialog.pause[open]') ??
        this.#root.querySelector('.privacy-cover:not([hidden])');
      if (wrapTab(ev, surface)) return;
    }
    if (ev.key === 'Escape' && this.#selected) {
      const id = this.#selected;
      this.#selected = null;
      this.#status = '';
      this.render();
      this.#root.querySelector<HTMLElement>(`.hand-tile[data-tile="${id}"]`)?.focus();
      ev.preventDefault();
      return;
    }
    if (el.classList.contains('hand-tile') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
      const all = [...this.#root.querySelectorAll<HTMLElement>('.hand-tile')];
      const i = all.indexOf(el);
      const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? all.length - 1 : i + (ev.key === 'ArrowRight' ? 1 : -1);
      const t = all[Math.max(0, Math.min(all.length - 1, next))];
      t?.focus();
      t?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      ev.preventDefault();
    }
    if (el.classList.contains('end-slot') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
      const slots = [...this.#root.querySelectorAll<HTMLElement>('.end-slot.is-legal')];
      const i = slots.indexOf(el);
      slots[(i + 1) % slots.length]?.focus();
      ev.preventDefault();
    }
  };
}
