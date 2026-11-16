/**
 * Table screen. Renders ONLY from TableController.view() — one revealed
 * human's view or a concealed public table — and changes the game ONLY through
 * controller intents. On a shared device, hands are never in the DOM unless
 * the controller is in 'human-turn' for that human.
 */
import { assetUrl, getAsset, getFrame } from '../assets';
import { layoutChain, type BoardLayout, type EndSlot } from '../board/layout';
import type { GameEvent } from '../engine/events';
import type { EndId } from '../engine/line';
import { pipTotal, tileFromId } from '../engine/tiles';
import type { SeatIndex, TileId } from '../engine/types';
import type { SeatView } from '../engine/view';
import { controlStates, SORT_LABELS, SORT_MODES, sortHand, tileLabel, tileShort, whyNotPlayable, type SortMode } from '../app/helpers';
import type { TableController } from '../app/controller';
import type { GameSession } from '../app/session';
import { faceHtml, onBackendChange, tileBoxHtml } from '../render/tile-art';
import { spriteSvg } from './sprite';
import { esc } from './svg';

type Mood = 'neutral' | 'smirk' | 'thinking' | 'explaining' | 'laughing' | 'surprised' | 'delighted' | 'pumped';

export interface TableCallbacks {
  onMenu(): void;
  onRestart(): void;
}

const UNIT_MIN = 26;
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
  #message = '';
  #mood: Mood = 'neutral';
  #status = '';
  #lastPlayed: TileId | null = null;
  #resultsShownFor = -1;
  #pendingConfirm: 'menu' | 'restart' | null = null;
  #unsub: (() => void)[] = [];
  #ro: ResizeObserver | null = null;

  constructor(root: HTMLElement, controller: TableController, cb: TableCallbacks) {
    this.#root = root;
    this.#c = controller;
    this.#s = controller.session;
    this.#cb = cb;
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
        <header class="hud">
          <button type="button" class="btn-ghost" data-act="menu">Menu</button>
          <div class="scoreboard" data-region="scores"></div>
          <button type="button" class="btn-ghost" data-act="restart">Restart</button>
        </header>
        <aside class="side">
          <div class="host-card" data-region="host"></div>
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
    });
    this.#ro = new ResizeObserver(() => {
      const w = this.#q('board-wrap')?.clientWidth ?? 0;
      if (w === lastWidth) return;
      lastWidth = w;
      this.#renderBoard();
    });
    this.#ro.observe(this.#q('board-wrap'));
    this.#message = this.#openingLine(this.#c.view());
    const env = assetUrl('env.neighborhood-patio');
    const table = assetUrl('table.weathered');
    if (env) r.style.setProperty('--env-image', `url("${env}")`);
    if (table) r.style.setProperty('--table-image', `url("${table}")`);
    this.render();
  }

  destroy(): void {
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
    const sheet = getAsset('cousin.atlas.portrait');
    const portrait = spriteSvg({
      url: assetUrl('cousin.atlas.portrait'),
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
      rect: getFrame('cousin.atlas.portrait', this.#mood).rect,
      label: 'Cousin',
      className: 'host-portrait',
    });
    this.#q('host').innerHTML = `<div class="host-avatar"><span class="host-fallback" aria-hidden="true">R</span>${portrait}</div><p class="bubble">${esc(this.#message)}</p>`;
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
        return `<div class="seat-chip seat-${pos}${turn ? ' is-turn' : ''}${role === 'Partner' ? ' is-partner' : ''}" data-seat-pos="${pos}">
          <div class="opp-head"><strong>${esc(this.#name(seat))}</strong> <span class="role">${role}</span></div>
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

  #renderBoard(): void {
    const wrap = this.#q('board-wrap');
    const board = this.#q('board');
    if (!wrap || !board) return;
    if (!this.#unit) this.#unit = this.#defaultUnit();
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
        return `<button type="button" class="end-slot is-legal" data-act="place" data-end="${lead ? 'head' : slot.end}" style="${style}" aria-label="${esc(aria)}"><span>${esc(label)}</span></button>`;
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
        <button type="button" class="btn-ghost small" data-act="zoom-out" aria-label="Zoom board out" ${this.#unit <= UNIT_MIN ? 'disabled' : ''}>−</button>
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
    scroller.scrollLeft = prevScroll;
    if (focused) (el.querySelector(`[data-tile="${focused}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
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
        return `<div class="result-hand"><div class="result-who"><strong>${esc(name(seat as SeatIndex))}</strong><span>${r.seatTotals[seat]} pip${r.seatTotals[seat] === 1 ? '' : 's'}</span></div><div class="result-tiles">${faces}</div></div>`;
      })
      .join('');
    const teamLine =
      v.seatCount === 4 ? `<p class="scores-line">Team pips: ${this.#s.rules.teams.map((_, t) => `${esc(this.#s.teamName(t))} ${r.teamTotals[t]}`).join(' · ')}</p>` : '';
    const pts =
      r.winnerTeam === null
        ? 'No points this hand.'
        : r.points === 0
          ? `${esc(this.#s.teamName(r.winnerTeam))} take${this.#s.opponent === 'ai' && r.winnerTeam === 0 ? '' : 's'} the hand — but there are no pips left to count.`
          : `+${r.points} for ${this.#s.opponent === 'ai' && r.winnerTeam === 0 ? 'you' : esc(this.#s.teamName(r.winnerTeam))}`;
    const scores = this.#s.rules.teams.map((_, t) => `<span>${esc(this.#s.teamName(t))}: <strong>${v.scores[t]}</strong></span>`).join(' · ');
    const over = v.phase === 'match-over' && v.winnerTeam !== null;
    const matchLine = over ? `<p class="match-line">${esc(this.#s.teamName(v.winnerTeam!))} ${this.#s.opponent === 'ai' && v.winnerTeam === 0 ? 'win' : 'wins'} the match!</p>` : '';
    const buttons = over
      ? `<button type="button" class="btn" data-act="new-match">Play again</button><button type="button" class="btn-ghost" data-act="menu-now">Menu</button>`
      : `<button type="button" class="btn" data-act="next-hand">Next hand</button>`;
    dlg.innerHTML = `<h2 id="results-title">${esc(title)}</h2><p class="why">${esc(why)}</p>${hands}${teamLine}<p class="points">${pts}</p><p class="scores-line">${scores} · to ${v.targetScore}</p>${matchLine}<div class="sheet-actions">${buttons}</div>`;
    if (!dlg.open) dlg.showModal();
    (dlg.querySelector('.btn') as HTMLElement).focus();
  }

  #showConfirm(kind: 'menu' | 'restart'): void {
    this.#pendingConfirm = kind;
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

  #onEvents(events: readonly GameEvent[]): void {
    const v = this.#c.view();
    for (const e of events) {
      switch (e.type) {
        case 'hand-started':
          this.#lastPlayed = null;
          this.#message = this.#openingLine(v);
          this.#mood = 'explaining';
          break;
        case 'tile-played':
          this.#lastPlayed = e.tile;
          this.#message = `${this.#name(e.seat)} played ${tileShort(e.tile)}.`;
          this.#mood = this.#s.isHuman(e.seat) ? 'neutral' : 'smirk';
          break;
        case 'tile-drawn':
          // The bubble and live region are public on a shared device: never name a drawn tile there.
          this.#message = e.tile && !this.#c.privacy ? `${this.#name(e.seat)} drew ${tileShort(e.tile)}${e.playable ? ' — it plays!' : '.'}` : `${this.#name(e.seat)} drew from the boneyard.`;
          if (e.tile && this.#c.privacy) this.#status = `You drew ${tileShort(e.tile)}${e.playable ? ' — it plays!' : '.'}`;
          this.#mood = 'thinking';
          break;
        case 'passed':
          this.#message = `${this.#name(e.seat)} ${this.#s.opponent === 'ai' && e.seat === 0 ? 'pass' : 'passes'}. ¡Paso!`;
          this.#mood = 'explaining';
          break;
        case 'hand-ended':
          this.#message = e.end.kind === 'out' ? `¡Dominó! ${this.#name(e.end.seat)} ${this.#s.opponent === 'ai' && e.end.seat === 0 ? 'are' : 'is'} out.` : '¡Tranque! Nobody can play.';
          this.#mood = e.end.kind === 'out' && !this.#s.isHuman(e.end.seat) ? 'laughing' : 'surprised';
          break;
        case 'match-won':
          this.#mood = this.#s.opponent === 'ai' && e.team !== 0 ? 'pumped' : 'delighted';
          break;
        default:
          break;
      }
    }
    if (events.length && !events.some((e) => e.type === 'tile-drawn' && e.tile)) this.#status = '';
    if (v.phase === 'playing' && !this.#s.isHuman(v.turn)) this.#mood = 'thinking';
    const err = this.#s.lastError;
    if (err) this.#status = err.message;
    this.#q('announce').textContent = this.#message;
    this.render();
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
      return;
    }
    this.#selected = this.#selected === id ? null : id;
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
        this.#sort = SORT_MODES[(SORT_MODES.indexOf(this.#sort) + 1) % SORT_MODES.length]!;
        this.render();
        break;
      case 'zoom-in':
      case 'zoom-out':
        this.#unit = Math.max(UNIT_MIN, Math.min(UNIT_MAX, this.#unit + (target.dataset.act === 'zoom-in' ? 4 : -4)));
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
      case 'next-hand':
        this.#q<HTMLDialogElement>('results').close();
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
      case 'menu':
        this.#showConfirm('menu');
        break;
      case 'restart':
        this.#showConfirm('restart');
        break;
      case 'confirm-no':
        this.#pendingConfirm = null;
        this.#q<HTMLDialogElement>('confirm').close();
        this.#c.resume();
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
