/**
 * GameSession owns the MatchState and is the ONLY place commands are applied.
 * The UI reads redacted SeatViews and calls intent methods; it never edits
 * rules state.
 *
 * AI turns: the session builds a sanitized observation for the AI seat, asks
 * the runner for a decision (asynchronously), waits out a presentation-only
 * "thinking" delay, then submits the decision through the same validated
 * applyCommand path as a human. Every request carries a token
 * {epoch, seq, seat}; reset, exit, pause, load and hand completion bump the
 * epoch or advance seq, so stale decisions are discarded and can never place
 * a ghost tile or move twice.
 */
import { buildObservation } from '../ai/observation';
import { toCommand } from '../ai/policy';
import { fallbackDecision, inlineRunner, type AiRunner } from '../ai/runner';
import type { Decision, Difficulty } from '../ai/types';
import type { Command, CommandError } from '../engine/commands';
import { createMatchConfig, type MatchConfig } from '../engine/config';
import type { GameEvent } from '../engine/events';
import { checkInvariants } from '../engine/invariants';
import type { EndId } from '../engine/line';
import { applyCommand, createMatch, rulesOf } from '../engine/match';
import { isRngState, seedRng, type RngState } from '../engine/rng';
import type { ModeRules } from '../engine/rules/presets';
import type { MatchState } from '../engine/state';
import type { ModeId, SeatIndex, TargetScore, TileId } from '../engine/types';
import { concealedView, seatView, type SeatView } from '../engine/view';

/** 'ai' = solo vs AI seats; 'local' = two humans pass-and-play; 'dev-both' = developer controls both seats, no handoff. */
export type OpponentKind = 'ai' | 'local' | 'dev-both';

export interface SessionOptions {
  readonly mode: ModeId;
  readonly opponent: OpponentKind;
  /** Seats for the local humans in slot order. Defaults: solo [0]; two humans [0, 1]. Partnership allows [0, 1], [0, 2] or [0, 3]. */
  readonly humanSeats?: readonly SeatIndex[];
  /** Display names by human slot (Player 1, Player 2). */
  readonly names?: readonly string[];
  /** Display names by seat for any seat, including computer seats (Story: Tío Rafa, Marisol, Vale…). Names only; never rules. */
  readonly seatNames?: Readonly<Partial<Record<SeatIndex, string>>>;
  readonly targetScore?: TargetScore;
  readonly difficulty?: Difficulty;
  /** Shuffle seed (secret). */
  readonly seed: number | string;
  /** AI decision seed — a separate stream from the shuffle seed. */
  readonly aiSeed: number | string;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Timing {
  readonly aiPlay: Readonly<Record<Difficulty, number>>;
  readonly aiForced: number;
  readonly resolve: number;
}
export const DEFAULT_TIMING: Timing = { aiPlay: { easy: 650, normal: 800, hard: 950 }, aiForced: 380, resolve: 900 };

export interface SessionDeps {
  readonly scheduler?: Scheduler;
  readonly timing?: Timing;
  readonly runner?: AiRunner;
}

export type SessionListener = (events: readonly GameEvent[]) => void;

interface AiToken {
  readonly epoch: number;
  readonly seq: number;
  readonly seat: SeatIndex;
}
interface PendingAi {
  readonly token: AiToken;
  decision: Decision | null;
  delayDone: boolean;
}

const PARTNERSHIP_NAMES = ['You', 'Cousin', 'Luz', 'Tío Rafa'];

/** Sanitize a typed player name: printable, trimmed, at most 20 characters. */
export function cleanName(raw: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 20);
}

export class GameSession {
  readonly opponent: OpponentKind;
  readonly difficulty: Difficulty;
  readonly config: MatchConfig;
  readonly rules: ModeRules;
  readonly stats = { aiDecisions: 0, staleDiscarded: 0 };
  /** Seats controlled by local humans, in slot order. */
  readonly humanSeats: readonly SeatIndex[];
  #state: MatchState;
  #listeners = new Set<SessionListener>();
  #timer: unknown = null;
  #pending: PendingAi | null = null;
  #epoch = 0;
  #paused = false;
  #lastError: CommandError | null = null;
  #disposed = false;
  #aiRng: RngState[];
  #speed = 1;
  /** Human seats the player has handed to the AI ("Finish hand with AI"); presentation-level control only. */
  #assisted = new Set<SeatIndex>();
  #assistUsed = false;
  readonly #scheduler: Scheduler;
  readonly #timing: Timing;
  readonly #runner: AiRunner;

  constructor(
    opts:
      | SessionOptions
      | {
          readonly state: MatchState;
          readonly opponent: OpponentKind;
          readonly difficulty?: Difficulty;
          readonly aiSeed?: number | string;
          /** Restored AI streams (from a save). */
          readonly aiRng?: readonly RngState[];
          /** The restored hand had already been played on by the assistant (its label stays). */
          readonly assistUsed?: boolean;
        },
    deps: SessionDeps = {},
  ) {
    this.#scheduler = deps.scheduler ?? realScheduler;
    this.#timing = deps.timing ?? DEFAULT_TIMING;
    this.#runner = deps.runner ?? inlineRunner();
    this.difficulty = opts.difficulty ?? 'normal';
    if ('state' in opts) {
      this.#state = opts.state;
      this.opponent = opts.opponent;
      this.config = opts.state.config;
    } else {
      this.opponent = opts.opponent;
      const humanSeats: readonly SeatIndex[] = opts.opponent === 'ai' ? [0] : (opts.humanSeats ?? [0, 1]);
      const displayNames: Record<number, string> = {};
      for (const [seat, n] of Object.entries(opts.seatNames ?? {})) {
        const c = cleanName(n);
        if (c) displayNames[Number(seat)] = c;
      }
      humanSeats.forEach((seat, slot) => {
        const n = cleanName(opts.names?.[slot]);
        if (n && opts.opponent !== 'ai') displayNames[seat] = n;
      });
      const cfg = createMatchConfig({ mode: opts.mode, humanSeats, displayNames, ...(opts.targetScore ? { targetScore: opts.targetScore } : {}) });
      if (!cfg.ok) throw new Error(cfg.errors.map((e) => e.message).join('; '));
      const created = createMatch(cfg.config, opts.seed);
      if (!created.ok) throw new Error(created.errors.join('; '));
      this.#state = created.state;
      this.config = cfg.config;
    }
    this.rules = rulesOf(this.config);
    // One independent AI stream per seat, never derived from the shuffle RNG.
    const restored = 'state' in opts ? opts.aiRng : undefined;
    this.#aiRng =
      restored && restored.length === this.rules.seatCount && restored.every(isRngState)
        ? [...restored]
        : Array.from({ length: this.rules.seatCount }, (_, s) => seedRng(`ai:${String(opts.aiSeed ?? 0)}:${s}`));
    this.humanSeats = this.config.seats.filter((x) => x.controller.kind === 'human').map((x) => x.seat);
    this.#assistUsed = 'state' in opts && opts.assistUsed === true;
    this.#schedule();
  }

  // ---- reading --------------------------------------------------------------

  get lastError(): CommandError | null {
    return this.#lastError;
  }
  get paused(): boolean {
    return this.#paused;
  }
  get runnerKind(): AiRunner['kind'] {
    return this.#runner.kind;
  }
  /** True while an AI decision or its thinking delay is outstanding. */
  get aiThinking(): boolean {
    return this.#pending !== null;
  }
  /** Private view for one seat. Only the TableController decides when this may be shown. */
  viewFor(seat: SeatIndex): SeatView {
    return seatView(this.#state, seat);
  }
  /** Public table with every hand concealed, laid out from `perspective`. */
  concealedView(perspective: SeatIndex): SeatView {
    return concealedView(this.#state, perspective);
  }
  get phase(): MatchState['phase'] {
    return this.#state.phase;
  }
  get turn(): SeatIndex {
    return this.#state.hand.turn;
  }
  get seq(): number {
    return this.#state.seq;
  }
  isHuman(seat: SeatIndex): boolean {
    return this.config.seats[seat]?.controller.kind === 'human';
  }
  seatName(seat: SeatIndex): string {
    const custom = this.config.seats[seat]?.displayName;
    if (custom) return custom;
    if (this.rules.seatCount === 4) {
      const c = this.config.seats[seat]!.controller;
      if (c.kind === 'human' && this.opponent !== 'ai') return `Player ${c.slot + 1}`;
      return PARTNERSHIP_NAMES[seat]!;
    }
    if (this.opponent === 'ai') return seat === 0 ? 'You' : 'Cousin';
    return `Player ${seat + 1}`;
  }
  teamName(team: number): string {
    const seats = this.rules.teams[team]!;
    return seats.map((s) => this.seatName(s)).join(' & ');
  }
  /** True when `seat` is a human on turn, not handed to the assistant, and the session is not paused. */
  canAct(seat: SeatIndex): boolean {
    const s = this.#state;
    return s.phase === 'playing' && s.hand.turn === seat && this.isHuman(seat) && !this.#assisted.has(seat) && !this.#paused && !this.#disposed;
  }
  /** Seats the assistant is currently playing for. */
  isAssisted(seat: SeatIndex): boolean {
    return this.#assisted.has(seat);
  }
  /** True once the assistant has made at least one move in this hand (the result is labelled assisted). */
  get assistUsed(): boolean {
    return this.#assistUsed;
  }
  /** Presentation-only multiplier for AI thinking delays (settings). Never affects decisions or rules. */
  setThinkingSpeed(factor: number): void {
    this.#speed = Math.min(3, Math.max(0.2, factor));
  }
  /** AI RNG streams, for saving. */
  exportAiRng(): RngState[] {
    return [...this.#aiRng];
  }

  /** The full secret state — for saves, tests and dev tools only. Never render from it. */
  debugState(): MatchState {
    return this.#state;
  }

  /**
   * Raw (unredacted) engine events. Only the TableController may subscribe; it
   * redacts them for whichever seat, if any, is currently revealed.
   */
  subscribe(fn: SessionListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- intents ----------------------------------------------------------------

  play(seat: SeatIndex, tile: TileId, end: EndId): boolean {
    return this.#humanCommand(seat, { type: 'play', seq: this.#state.seq, seat, tile, end });
  }
  draw(seat: SeatIndex): boolean {
    return this.#humanCommand(seat, { type: 'draw', seq: this.#state.seq, seat });
  }
  pass(seat: SeatIndex): boolean {
    return this.#humanCommand(seat, { type: 'pass', seq: this.#state.seq, seat });
  }
  nextHand(): boolean {
    if (this.#state.phase !== 'hand-resolved' || this.#paused) return false;
    return this.#apply({ type: 'start-next-hand', seq: this.#state.seq });
  }
  /**
   * "Finish hand with AI": the same observation-only AI plays this human seat through normal commands until
   * the hand ends or the player takes over. Only while a hand is in play. Never changes rules or other seats.
   */
  assist(seat: SeatIndex): boolean {
    if (this.#disposed || !this.isHuman(seat) || this.#assisted.has(seat) || this.#state.phase !== 'playing') return false;
    this.#assisted.add(seat);
    this.#schedule(); // a pending decision for another seat restarts with a fresh token: nothing is lost
    this.#emit([]);
    return true;
  }
  /** Take back control: any decision in flight for the seat becomes stale and is discarded. */
  stopAssist(seat: SeatIndex): boolean {
    if (!this.#assisted.delete(seat)) return false;
    if (!this.#disposed) {
      this.#schedule();
      this.#emit([]);
    }
    return true;
  }
  /** Stop all automation (AI thinking, auto-resolve). Outstanding decisions become stale. */
  pause(): void {
    if (this.#paused || this.#disposed) return;
    this.#paused = true;
    this.#cancelAutomation();
    this.#emit([]);
  }
  resume(): void {
    if (!this.#paused || this.#disposed) return;
    this.#paused = false;
    this.#schedule();
    this.#emit([]);
  }
  /** Replace the match (e.g. a restored save). Any in-flight AI decision is discarded. */
  load(state: MatchState): boolean {
    if (this.#disposed || checkInvariants(state).length || state.config.mode !== this.config.mode) return false;
    this.#cancelAutomation();
    this.#assisted.clear();
    this.#state = state;
    this.#emit([]);
    this.#schedule();
    return true;
  }
  dispose(): void {
    this.#disposed = true;
    this.#cancelAutomation();
    this.#listeners.clear();
  }

  // ---- internals --------------------------------------------------------------

  #humanCommand(seat: SeatIndex, cmd: Command): boolean {
    if (!this.canAct(seat)) return false;
    return this.#apply(cmd);
  }

  #apply(cmd: Command): boolean {
    if (this.#disposed) return false;
    const r = applyCommand(this.#state, cmd);
    if (!r.ok) {
      this.#lastError = r.error;
      this.#emit([]);
      return false;
    }
    this.#lastError = null;
    this.#state = r.state;
    this.#emit(r.events);
    this.#schedule();
    return true;
  }

  #emit(events: readonly GameEvent[]): void {
    for (const fn of this.#listeners) fn(events);
  }

  #cancelAutomation(): void {
    this.#epoch++;
    if (this.#timer !== null) this.#scheduler.clear(this.#timer);
    this.#timer = null;
    this.#pending = null;
  }

  #valid(t: AiToken): boolean {
    const s = this.#state;
    return !this.#disposed && !this.#paused && t.epoch === this.#epoch && s.seq === t.seq && s.phase === 'playing' && s.hand.turn === t.seat && this.#aiDriven(t.seat);
  }

  /** A computer seat, or a human seat handed to the assistant. */
  #aiDriven(seat: SeatIndex): boolean {
    return !this.isHuman(seat) || this.#assisted.has(seat);
  }

  #schedule(): void {
    this.#cancelAutomation();
    if (this.#disposed || this.#paused) return;
    const s = this.#state;
    if (s.phase === 'hand-ended') {
      const epoch = this.#epoch;
      const seq = s.seq;
      this.#timer = this.#scheduler.set(() => {
        this.#timer = null;
        if (this.#epoch === epoch && this.#state.seq === seq && !this.#paused) this.#apply({ type: 'resolve-hand', seq });
      }, this.#timing.resolve);
      return;
    }
    if (s.phase !== 'playing' || !this.#aiDriven(s.hand.turn)) return;
    const seat = s.hand.turn;
    const token: AiToken = { epoch: this.#epoch, seq: s.seq, seat };
    const obs = buildObservation(seatView(s, seat), this.rules);
    const pending: PendingAi = { token, decision: null, delayDone: false };
    this.#pending = pending;
    const thinking = Math.round((obs.legal.length > 1 ? this.#timing.aiPlay[this.difficulty] : this.#timing.aiForced) * this.#speed);
    this.#timer = this.#scheduler.set(() => {
      pending.delayDone = true;
      this.#tryApplyAi(pending);
    }, thinking);
    const req = { difficulty: this.difficulty, obs, rng: this.#aiRng[seat]! };
    this.#runner.decide(req).then(
      (d) => {
        pending.decision = d;
        this.#tryApplyAi(pending);
      },
      () => {
        // The runner gave up (disposed, or its own fallback threw). Nothing to do for a stale turn; otherwise
        // the cheap observation-only fallback, never Hard's full search on the main thread.
        if (this.#pending !== pending || !this.#valid(pending.token)) return;
        pending.decision = fallbackDecision(req);
        this.#tryApplyAi(pending);
      },
    );
  }

  #tryApplyAi(p: PendingAi): void {
    if (this.#pending !== p || !this.#valid(p.token)) {
      if (p.decision) this.stats.staleDiscarded++;
      return;
    }
    if (!p.delayDone || !p.decision) return;
    this.#pending = null;
    this.#timer = null;
    this.stats.aiDecisions++;
    this.#aiRng[p.token.seat] = p.decision.rng;
    const assisted = this.isHuman(p.token.seat);
    const before = this.#assistUsed;
    if (assisted) this.#assistUsed = true; // set first: listeners see the move's own events as assisted
    const ok = this.#apply(toCommand(p.decision.action, p.token.seat, p.token.seq));
    if (assisted && !ok) this.#assistUsed = before;
    if (assisted && ok && this.#state.phase !== 'playing') this.#assisted.clear(); // the hand is over: control returns
  }
}
