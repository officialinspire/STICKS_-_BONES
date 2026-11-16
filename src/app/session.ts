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
import { decide, toCommand } from '../ai/policy';
import { inlineRunner, type AiRunner } from '../ai/runner';
import type { Decision, Difficulty } from '../ai/types';
import type { Command, CommandError } from '../engine/commands';
import { createMatchConfig, type MatchConfig } from '../engine/config';
import { redactEventsForSeat, type GameEvent } from '../engine/events';
import { checkInvariants } from '../engine/invariants';
import type { EndId } from '../engine/line';
import { applyCommand, createMatch, rulesOf } from '../engine/match';
import { seedRng, type RngState } from '../engine/rng';
import type { ModeRules } from '../engine/rules/presets';
import type { MatchState } from '../engine/state';
import type { ModeId, SeatIndex, TargetScore, TileId } from '../engine/types';
import { seatView, type SeatView } from '../engine/view';

/** 'ai' = solo vs AI seats; 'local' = two humans pass-and-play; 'dev-both' = developer controls both seats, no handoff. */
export type OpponentKind = 'ai' | 'local' | 'dev-both';

export interface SessionOptions {
  readonly mode: ModeId;
  readonly opponent: OpponentKind;
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

export class GameSession {
  readonly opponent: OpponentKind;
  readonly difficulty: Difficulty;
  readonly config: MatchConfig;
  readonly rules: ModeRules;
  readonly stats = { aiDecisions: 0, staleDiscarded: 0 };
  #state: MatchState;
  #listeners = new Set<SessionListener>();
  #timer: unknown = null;
  #pending: PendingAi | null = null;
  #epoch = 0;
  #paused = false;
  #viewer: SeatIndex = 0;
  #handoffPending = false;
  #lastError: CommandError | null = null;
  #disposed = false;
  #aiRng: RngState[];
  readonly #scheduler: Scheduler;
  readonly #timing: Timing;
  readonly #runner: AiRunner;

  constructor(
    opts: SessionOptions | { readonly state: MatchState; readonly opponent: OpponentKind; readonly difficulty?: Difficulty; readonly aiSeed: number | string },
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
      const humanSeats: SeatIndex[] = opts.opponent === 'ai' ? [0] : [0, opts.mode === 'partnership4' ? 2 : 1];
      const cfg = createMatchConfig({ mode: opts.mode, humanSeats, ...(opts.targetScore ? { targetScore: opts.targetScore } : {}) });
      if (!cfg.ok) throw new Error(cfg.errors.map((e) => e.message).join('; '));
      const created = createMatch(cfg.config, opts.seed);
      if (!created.ok) throw new Error(created.errors.join('; '));
      this.#state = created.state;
      this.config = cfg.config;
    }
    this.rules = rulesOf(this.config);
    // One independent AI stream per seat, never derived from the shuffle RNG.
    this.#aiRng = Array.from({ length: this.rules.seatCount }, (_, s) => seedRng(`ai:${String(opts.aiSeed)}:${s}`));
    this.#syncViewer(true);
    this.#schedule();
  }

  // ---- reading --------------------------------------------------------------

  get viewer(): SeatIndex {
    return this.#viewer;
  }
  get handoffPending(): boolean {
    return this.#handoffPending;
  }
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
  view(): SeatView {
    return seatView(this.#state, this.#viewer);
  }
  isHuman(seat: SeatIndex): boolean {
    return this.config.seats[seat]?.controller.kind === 'human';
  }
  seatName(seat: SeatIndex): string {
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
  /** True when the viewer may act right now (their turn, no handoff screen, not paused). */
  canAct(): boolean {
    const v = this.view();
    return v.phase === 'playing' && v.turn === this.#viewer && this.isHuman(this.#viewer) && !this.#handoffPending && !this.#paused;
  }

  /** Dev/test hook: the full secret state. Never call from production UI. */
  debugState(): MatchState {
    return this.#state;
  }

  subscribe(fn: SessionListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- intents ----------------------------------------------------------------

  play(tile: TileId, end: EndId): boolean {
    return this.#humanCommand({ type: 'play', seq: this.#state.seq, seat: this.#viewer, tile, end });
  }
  draw(): boolean {
    return this.#humanCommand({ type: 'draw', seq: this.#state.seq, seat: this.#viewer });
  }
  pass(): boolean {
    return this.#humanCommand({ type: 'pass', seq: this.#state.seq, seat: this.#viewer });
  }
  nextHand(): boolean {
    if (this.#state.phase !== 'hand-resolved' || this.#paused) return false;
    return this.#apply({ type: 'start-next-hand', seq: this.#state.seq });
  }
  confirmHandoff(): void {
    if (!this.#handoffPending) return;
    this.#handoffPending = false;
    this.#emit([]);
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
    this.#state = state;
    this.#syncViewer(true);
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

  #humanCommand(cmd: Command): boolean {
    if (!this.canAct()) return false;
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
    this.#syncViewer(cmd.type === 'start-next-hand');
    this.#emit(r.events);
    this.#schedule();
    return true;
  }

  /** Pick which seat's private view is shown, raising a handoff screen between two humans. */
  #syncViewer(newHand: boolean): void {
    const s = this.#state;
    if (s.phase !== 'playing') return;
    const turn = s.hand.turn;
    if (!this.isHuman(turn)) return;
    if (this.opponent === 'local') {
      if (turn !== this.#viewer || newHand) {
        this.#viewer = turn;
        this.#handoffPending = true;
      }
    } else {
      this.#viewer = turn;
    }
  }

  #emit(events: readonly GameEvent[]): void {
    const visible = redactEventsForSeat(events, this.#viewer);
    for (const fn of this.#listeners) fn(visible);
  }

  #cancelAutomation(): void {
    this.#epoch++;
    if (this.#timer !== null) this.#scheduler.clear(this.#timer);
    this.#timer = null;
    this.#pending = null;
  }

  #valid(t: AiToken): boolean {
    const s = this.#state;
    return !this.#disposed && !this.#paused && t.epoch === this.#epoch && s.seq === t.seq && s.phase === 'playing' && s.hand.turn === t.seat && !this.isHuman(t.seat);
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
    if (s.phase !== 'playing' || this.isHuman(s.hand.turn)) return;
    const seat = s.hand.turn;
    const token: AiToken = { epoch: this.#epoch, seq: s.seq, seat };
    const obs = buildObservation(seatView(s, seat), this.rules);
    const pending: PendingAi = { token, decision: null, delayDone: false };
    this.#pending = pending;
    const thinking = obs.legal.length > 1 ? this.#timing.aiPlay[this.difficulty] : this.#timing.aiForced;
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
        pending.decision = decide(req.difficulty, req.obs, req.rng);
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
    this.#apply(toCommand(p.decision.action, p.token.seat, p.token.seq));
  }
}
