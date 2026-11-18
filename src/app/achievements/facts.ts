/**
 * Achievement facts: pure functions from APPLIED engine events (as the TableController forwards them,
 * already redacted for the revealed seat) to counter increments. No DOM, no storage, no clock.
 *
 * Privacy:
 * - Only public information is used: plays, draws/passes by seat (the tile only for the player's own
 *   draws), hand sizes, open ends, and the hands revealed on the results sheet.
 * - Nothing ever reads a hidden hand or the stock.
 *
 * Scope (set by the caller, see tracker.ts):
 * - `hand` facts: solo games against the computer and first-time Story hands.
 * - `match` facts: Quick Play solo matches.
 * - `local` facts: completions only (two people share the device, so per-hand play can't be credited
 *   to one of them).
 * - Replays and developer modes produce nothing.
 *
 * Observation: a hand resumed after a reload lacks its earlier events. Its result still counts, but
 * facts that depend on the whole hand (never drew, forced passes, …) are only produced when the hand
 * was observed from its first event.
 */
import type { GameEvent } from '../../engine/events';
import type { HandResult } from '../../engine/state';
import type { ModeId, Pip, SeatIndex, TileId } from '../../engine/types';

export type Facts = Record<string, number>;

const pips = (id: TileId): [Pip, Pip] => [Number(id[1]) as Pip, Number(id[2]) as Pip];
const isDouble = (id: TileId) => id[1] === id[2];
const fits = (id: TileId, p: Pip) => pips(id).includes(p);
function add(f: Facts, k: string, n = 1): void {
  if (n > 0) f[k] = (f[k] ?? 0) + n;
}

export interface HandContext {
  readonly mode: ModeId;
  readonly me: SeatIndex;
  readonly teams: readonly (readonly SeatIndex[])[];
  readonly seatCount: number;
}

/**
 * Follows one hand from the player's seat. Feed it every event batch; `resolve` returns the facts for
 * the finished hand. Live counters (tiles, doubles, draws, passes, …) come back from `feed` as they
 * happen.
 */
export class HandObserver {
  readonly #c: HandContext;
  /** Saw the hand-started event (the whole hand is known). */
  observed = false;
  #ends: { head: Pip; tail: Pip } | null = null;
  #board: TileId[] = [];
  #sizes: number[] = [];
  #myDraws = 0;
  #myPasses = 0;
  #myDoubles = 0;
  #forced = 0;
  #lastPlayer: SeatIndex | null = null;
  #lastWasMine = false;
  #lastMineDouble = false;
  #oppPassedSinceMine = new Set<SeatIndex>();
  #iLed66 = false;
  #played: Set<TileId> = new Set();
  #stockEmptied = false;
  #outFitBoth = false;
  #outDouble = false;
  #outOppSizes: number[] = [];

  constructor(c: HandContext) {
    this.#c = c;
  }

  #team(seat: SeatIndex): number {
    return this.#c.teams.findIndex((t) => t.includes(seat));
  }
  #opponents(): SeatIndex[] {
    const mine = this.#team(this.#c.me);
    return ([0, 1, 2, 3] as SeatIndex[]).slice(0, this.#c.seatCount).filter((s) => this.#team(s) !== mine);
  }

  /**
   * A fresh deal that happened before anyone subscribed: the hand is still observed from its start.
   * `sizes` are the public hand sizes from the player's own view.
   */
  prime(sizes: readonly number[]): void {
    this.observed = true;
    this.#sizes = [...sizes];
  }

  /** Live facts from one batch of applied events. */
  feed(events: readonly GameEvent[]): Facts {
    const f: Facts = {};
    const me = this.#c.me;
    for (const e of events) {
      switch (e.type) {
        case 'hand-started':
          this.observed = true;
          this.#sizes = [...e.handSizes];
          break;
        case 'tile-played': {
          const prev = this.#ends;
          const mine = e.seat === me;
          this.#board.push(e.tile);
          this.#sizes[e.seat] = e.handSize;
          if (mine) {
            add(f, 'tiles');
            if (isDouble(e.tile)) {
              add(f, 'doubles');
              this.#myDoubles++;
              if (this.#myDoubles === 4 && this.observed) add(f, 'doubles4');
              if (this.#lastMineDouble) add(f, 'doubleRun');
            }
            this.#lastMineDouble = isDouble(e.tile);
            this.#played.add(e.tile);
            if (this.observed && this.#played.has('t66') && this.#played.has('t65') && (e.tile === 't66' || e.tile === 't65')) add(f, 'heavy');
            if (e.placed.playIndex === 0) {
              add(f, 'opens');
              if (e.tile === 't66') {
                this.#iLed66 = true;
                if (this.#c.mode === 'partnership4') add(f, 'p4.open66');
              }
            }
            const both = prev !== null && fits(e.tile, prev.head) && fits(e.tile, prev.tail);
            if (both) add(f, 'bothEnds');
            if (prev !== null && e.openEnds.head === e.openEnds.tail) add(f, 'sameEnds');
            // All seven tiles of a number on the table, completed by this play (board fully observed).
            if (this.observed) for (const p of new Set(pips(e.tile))) if (this.#board.filter((t) => fits(t, p)).length === 7) add(f, 'closeSuit');
            if (e.handSize === 0) {
              this.#outFitBoth = both;
              this.#outDouble = isDouble(e.tile);
              this.#outOppSizes = this.#opponents().map((s) => this.#sizes[s] ?? 0);
            }
            this.#oppPassedSinceMine.clear();
          }
          this.#lastPlayer = e.seat;
          this.#lastWasMine = mine;
          this.#ends = { head: e.openEnds.head, tail: e.openEnds.tail };
          break;
        }
        case 'tile-drawn':
          this.#sizes[e.seat] = e.handSize;
          if (e.stockCount === 0) {
            this.#stockEmptied = true;
            if (e.seat === me) add(f, 'draw2.lastTile');
          }
          if (e.seat === me) {
            add(f, 'draws');
            this.#myDraws++;
          }
          break;
        case 'passed': {
          if (e.seat === me) {
            add(f, 'passes');
            this.#myPasses++;
            break;
          }
          // A pass straight after the player's own play is one the player forced.
          if (this.#lastWasMine && this.#lastPlayer === me && this.#team(e.seat) !== this.#team(me)) {
            this.#forced++;
            if (this.observed && this.#forced === 3 && this.#c.mode === 'block2') add(f, 'block2.forced3');
            if (this.observed && this.#forced === 5) add(f, 'forced5');
          }
          if (this.#team(e.seat) !== this.#team(me)) {
            this.#oppPassedSinceMine.add(e.seat);
            if (this.#c.mode === 'partnership4' && this.#oppPassedSinceMine.size === 2) {
              add(f, 'p4.bothPass');
              this.#oppPassedSinceMine.clear();
            }
          }
          this.#lastWasMine = false;
          break;
        }
        default:
          break;
      }
    }
    return f;
  }

  /** Facts for the finished hand (call once, on the hand-resolved event). */
  resolve(r: HandResult): Facts {
    const f: Facts = {};
    const { mode, me } = this.#c;
    const myTeam = this.#team(me);
    const won = r.winnerTeam === myTeam;
    const out = r.end.kind === 'out' ? r.end.seat : null;
    const blocked = r.end.kind === 'blocked';
    const full = this.observed;
    add(f, 'hands');
    if (!won) return f;
    add(f, 'handsWon');
    add(f, `${mode}.handsWon`);
    add(f, 'points', r.points);
    if (out === me) {
      add(f, 'dominoes');
      add(f, `${mode}.domino`);
      if (mode === 'partnership4') add(f, 'p4.selfOut');
      if (full && this.#outFitBoth) add(f, 'capicua');
      if (full && this.#outDouble) add(f, 'outDouble');
      if (full && this.#outOppSizes.length && this.#outOppSizes.every((n) => n >= 4)) add(f, 'fastOut');
      if (full && this.#outOppSizes.some((n) => n === 1)) add(f, 'closeCall');
      if (full && this.#myDraws === 0 && this.#myPasses === 0) add(f, 'cleanWin');
    }
    if (out !== null && out !== me && mode === 'partnership4') add(f, 'p4.partnerOut');
    if (blocked) {
      add(f, 'tranques');
      add(f, `${mode}.tranque`);
      if (full && this.#lastPlayer === me) add(f, 'selfBlockWin');
      if ((r.seatTotals[me] ?? 99) <= 5) add(f, 'lowTranque');
      const mine = r.finalHands[me]?.length ?? 0;
      if (this.#opponents().every((s) => mine > (r.finalHands[s]?.length ?? 0))) add(f, 'tranqueMoreTiles');
    }
    if (full && this.#iLed66) add(f, 'open66Win');
    if (full && this.#myPasses >= 2) add(f, 'win2Pass');
    if (mode === 'draw2') {
      if (full && this.#myDraws === 0) add(f, 'draw2.noDrawWin');
      if (full && this.#myDraws >= 5) add(f, 'draw2.drew5Win');
      if (full && this.#stockEmptied) add(f, 'draw2.dryWin');
      if (r.points >= 50) add(f, 'draw2.hand50');
    }
    if (mode === 'block2') {
      if (full && this.#myPasses === 0) add(f, 'block2.noPassWin');
      if (r.points >= 40) add(f, 'block2.hand40');
    }
    if (mode === 'partnership4') {
      if (full && this.#myPasses >= 1) add(f, 'p4.passWin');
      if (r.points >= 60) add(f, 'p4.hand60');
    }
    return f;
  }
}

/** Follows a match's score from hand to hand (for comebacks; needs the match observed from its start). */
export class MatchObserver {
  #worst = 0;
  readonly observedFromStart: boolean;
  constructor(observedFromStart: boolean) {
    this.observedFromStart = observedFromStart;
  }
  hand(scores: readonly number[], myTeam: number): void {
    const mine = scores[myTeam] ?? 0;
    const best = Math.max(...scores.filter((_, i) => i !== myTeam));
    this.#worst = Math.max(this.#worst, best - mine);
  }
  /** Facts for a finished Quick Play match against the computer. */
  won(o: { mode: ModeId; difficulty: string; target: number; myTeam: number; winnerTeam: number; scores: readonly number[] }): Facts {
    const f: Facts = {};
    add(f, 'matches');
    if (o.winnerTeam !== o.myTeam) return f;
    add(f, 'matchesWon');
    add(f, `modeWon.${o.mode}`);
    add(f, `${o.mode}.win.${o.difficulty}`);
    if (o.target === 200 && o.mode !== 'partnership4') add(f, `${o.mode}.win200`);
    if (o.scores.every((s, i) => i === o.myTeam || s === 0)) add(f, `${o.mode}.shutout`);
    if (this.observedFromStart && this.#worst >= (o.mode === 'partnership4' ? 50 : 40)) add(f, `${o.mode}.comeback`);
    return f;
  }
}

/** Facts for a finished two-player (one device) match. */
export function localMatchFacts(o: { mode: ModeId; humansArePartners: boolean; humansWon: boolean }): Facts {
  const f: Facts = { 'local.finished': 1, [`local.${o.mode}`]: 1 };
  if (o.mode === 'partnership4' && o.humansArePartners && o.humansWon) f['p4.localWin'] = 1;
  return f;
}
