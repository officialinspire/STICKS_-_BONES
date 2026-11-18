/**
 * SceneDirector — the story's presentation state machine.
 *
 *   idle → preparing → entering → presenting ⇄ (text reveal)
 *                                  presenting → entering-hand → in-hand → leaving-hand → presenting
 *                                  presenting → exiting → idle
 *
 * Guarantees:
 *   - Every async continuation (preload, fades, reveals) carries the token that was
 *     current when it started; reset, skip, chapter replay, navigation, backgrounding
 *     or a new scene bump the token, so stale callbacks do nothing.
 *   - Every transitional state has a scheduled exit (and preparing has a timeout), so
 *     input can never be blocked permanently. `settle()` completes the current
 *     transition immediately (backgrounding, skip).
 *   - Input is single-step: the first `advance()` on a revealing line finishes the
 *     reveal; the next advances ONE beat; advances closer together than
 *     `minBeatMs` are ignored (accidental double taps). Advances during transitions
 *     and hands are ignored, never queued.
 *   - `enterHand()` only works from `presenting` and only once per scene (no double
 *     start). The director never touches rules or tiles; a hand resolves on its own,
 *     with or without any animation.
 */
import type { Scheduler } from '../app/session';

export type DirectorState = 'idle' | 'preparing' | 'entering' | 'presenting' | 'entering-hand' | 'in-hand' | 'leaving-hand' | 'exiting';

export interface Timings {
  /** Scene entrance/exit: fade through a colour (≈ 400–700 ms). */
  readonly sceneFadeMs: number;
  /** Character entrance/exit (≈ 180–350 ms). */
  readonly actorMs: number;
  /** Expression change: a stable swap, never a double-face dissolve. */
  readonly exprMs: number;
  /** Text reveal speed (characters per second; Infinity = instant). */
  readonly revealCps: number;
  /** Longest reveal regardless of length. */
  readonly revealMaxMs: number;
  /** Ignore advances closer together than this (double-tap guard). */
  readonly minBeatMs: number;
  /** Give up waiting for images after this long (fallback art is shown). */
  readonly prepareTimeoutMs: number;
}

export const DEFAULT_TIMINGS: Timings = { sceneFadeMs: 550, actorMs: 260, exprMs: 140, revealCps: 70, revealMaxMs: 900, minBeatMs: 180, prepareTimeoutMs: 4000 };
/** Reduced motion: immediate swaps, simple short fades, no text reveal. */
export const REDUCED_TIMINGS: Timings = { sceneFadeMs: 120, actorMs: 0, exprMs: 0, revealCps: Infinity, revealMaxMs: 0, minBeatMs: 180, prepareTimeoutMs: 4000 };

/** What the director needs from the screen (DOM in the app, a fake in tests). */
export interface StageView<B> {
  /** Load + decode the scene's essential images. Resolves (true = all ready, false = using fallbacks). */
  prepare(): Promise<boolean>;
  /** Fade the curtain: 'closed' = the coherent colour/black, 'open' = the scene. */
  curtain(to: 'closed' | 'open', ms: number): void;
  /** Optional establishing move during the entrance. */
  establishing(ms: number): void;
  /** Show a beat; `revealMs` 0 = whole text at once. */
  showBeat(beat: B, index: number, revealMs: number): void;
  /** Complete an in-progress text reveal immediately. */
  finishReveal(): void;
  /** Interaction state for controls (busy = transition in progress). */
  setState(s: DirectorState): void;
}

export interface DirectorHooks<B> {
  /** Text length used for reveal timing. */
  textOf(beat: B): string;
  /** Advancing past the last beat. */
  onEnd(): void;
  /** The curtain is closed: mount the hand now. */
  onHandStart(): void;
  /** The curtain is closed after the scene: navigate away / load the next scene. */
  onExit(): void;
  now(): number;
}

export class SceneDirector<B> {
  #state: DirectorState = 'idle';
  #token = 0;
  #beats: readonly B[] = [];
  #index = 0;
  #revealing = false;
  /** The current beat's reveal timer and its sequence number: a reveal callback only ever ends ITS beat's reveal. */
  #revealTimer: unknown = null;
  #revealSeq = 0;
  #lastAdvance = -Infinity;
  #handStarted = false;
  #timers = new Set<unknown>();
  /** Completion for the transition in flight (run by its timer or by settle()). */
  #pending: (() => void) | null = null;
  readonly stats = { staleDropped: 0, ignoredInputs: 0, prepareTimeouts: 0, staleReveals: 0 };

  constructor(
    private readonly view: StageView<B>,
    private readonly hooks: DirectorHooks<B>,
    private readonly sched: Scheduler,
    private timings: Timings,
  ) {}

  get state(): DirectorState {
    return this.#state;
  }
  get index(): number {
    return this.#index;
  }
  get token(): number {
    return this.#token;
  }
  get revealing(): boolean {
    return this.#revealing;
  }
  setTimings(t: Timings): void {
    this.timings = t;
  }

  #set(s: DirectorState): void {
    this.#state = s;
    this.view.setState(s);
  }

  #clear(): void {
    for (const t of this.#timers) this.sched.clear(t);
    this.#timers.clear();
  }

  #after(token: number, ms: number, fn: () => void): void {
    const h = this.sched.set(() => {
      this.#timers.delete(h);
      if (token !== this.#token) return void this.stats.staleDropped++;
      fn();
    }, ms);
    this.#timers.add(h);
  }

  /**
   * End the current beat's reveal state (finished early, replaced by another beat, Back, Skip, settle,
   * cancel or exit). Its timer is cleared and its sequence retired, so it can never touch a newer line.
   */
  #stopReveal(): void {
    if (this.#revealTimer !== null) {
      this.sched.clear(this.#revealTimer);
      this.#timers.delete(this.#revealTimer);
      this.#revealTimer = null;
    }
    this.#revealSeq++;
    this.#revealing = false;
  }

  /** Start a transition whose completion runs after `ms` (or immediately via settle()). */
  #transition(token: number, ms: number, done: () => void): void {
    const run = () => {
      if (this.#pending !== run) return;
      this.#pending = null;
      done();
    };
    this.#pending = run;
    if (ms <= 0) run();
    else this.#after(token, ms, run);
  }

  /** Invalidate everything in flight (reset, navigation, new scene, replay). */
  cancel(): void {
    this.#token++;
    this.#stopReveal();
    this.#clear();
    this.#pending = null;
    this.#set('idle');
  }

  /** Complete the transition or reveal in flight right now (backgrounding, skip). Never leaves a blocker. */
  settle(): void {
    if (this.#revealing) {
      this.#stopReveal();
      this.view.finishReveal();
    }
    const p = this.#pending;
    if (p) {
      this.#clear();
      p();
    }
  }

  /** Load a scene's beats and enter it at `startIndex` (resume / replay land exactly where saved). */
  async load(beats: readonly B[], startIndex = 0, opts: { handAlreadyDone?: boolean } = {}): Promise<void> {
    this.cancel();
    const token = this.#token;
    this.#beats = beats;
    this.#index = Math.max(0, Math.min(startIndex, beats.length));
    this.#handStarted = !!opts.handAlreadyDone;
    this.#set('preparing');
    this.view.curtain('closed', 0);
    let timedOut = false;
    let timeout: unknown = null;
    const ready = await Promise.race([
      this.view.prepare().catch(() => false),
      new Promise<boolean>((resolve) => {
        timeout = this.sched.set(() => {
          this.#timers.delete(timeout);
          timedOut = true;
          resolve(false);
        }, this.timings.prepareTimeoutMs);
        this.#timers.add(timeout);
      }),
    ]);
    // Images ready first: the deadline is no longer needed (never left pending into the scene).
    if (!timedOut && timeout !== null) {
      this.sched.clear(timeout);
      this.#timers.delete(timeout);
    }
    if (token !== this.#token) return void this.stats.staleDropped++;
    if (timedOut) this.stats.prepareTimeouts++;
    void ready;
    this.#set('entering');
    this.view.curtain('open', this.timings.sceneFadeMs);
    if (this.timings.actorMs > 0) this.view.establishing(this.timings.sceneFadeMs * 4);
    this.#transition(token, this.timings.sceneFadeMs, () => {
      this.#set('presenting');
      this.#show();
    });
  }

  #show(): void {
    this.#stopReveal(); // the previous beat's reveal (if any) is over, whatever its timer thinks
    if (this.#index >= this.#beats.length) return;
    const beat = this.#beats[this.#index]!;
    const len = this.hooks.textOf(beat).length;
    const ms = Number.isFinite(this.timings.revealCps) ? Math.min(this.timings.revealMaxMs, Math.round((len / this.timings.revealCps) * 1000)) : 0;
    this.view.showBeat(beat, this.#index, ms);
    this.#lastAdvance = this.hooks.now();
    if (ms > 0) {
      this.#revealing = true;
      const token = this.#token;
      const seq = this.#revealSeq;
      const h = this.sched.set(() => {
        this.#timers.delete(h);
        if (token !== this.#token || seq !== this.#revealSeq) return void this.stats.staleReveals++;
        this.#revealTimer = null;
        this.#revealing = false;
      }, ms);
      this.#timers.add(h);
      this.#revealTimer = h;
    }
  }

  /** Player input (tap, click, Enter, →). One step at most. */
  advance(): void {
    if (this.#state !== 'presenting') return void this.stats.ignoredInputs++;
    if (this.#revealing) {
      this.#stopReveal();
      this.view.finishReveal();
      return;
    }
    if (this.hooks.now() - this.#lastAdvance < this.timings.minBeatMs) return void this.stats.ignoredInputs++;
    if (this.#index + 1 >= this.#beats.length) {
      this.#index = this.#beats.length;
      this.#lastAdvance = this.hooks.now();
      this.hooks.onEnd();
      return;
    }
    this.#index++;
    this.#show();
  }

  /** Step back one beat (no transitions). */
  back(): void {
    if (this.#state !== 'presenting' || this.#index === 0) return;
    this.#index = Math.min(this.#index, this.#beats.length) - 1;
    this.#show();
    this.settle();
  }

  /** Jump to the end of the current beats (Skip). Settles any transition first. */
  skipToEnd(): void {
    this.settle();
    if (this.#state !== 'presenting') return;
    this.#index = this.#beats.length;
    this.hooks.onEnd();
  }

  /** Fade out of the scene and hand control to the table. Only once per scene. */
  enterHand(): boolean {
    if (this.#state !== 'presenting' || this.#handStarted) return false;
    this.#handStarted = true;
    const token = this.#token;
    this.#set('entering-hand');
    this.view.curtain('closed', this.timings.sceneFadeMs);
    this.#transition(token, this.timings.sceneFadeMs, () => {
      this.#set('in-hand');
      this.hooks.onHandStart();
    });
    return true;
  }

  /** Back from the table with new beats (the outcome insert and what follows). */
  leaveHand(beats: readonly B[]): void {
    if (this.#state !== 'in-hand') return;
    const token = this.#token;
    this.#beats = beats;
    this.#index = 0;
    this.#set('leaving-hand');
    this.view.curtain('open', this.timings.sceneFadeMs);
    this.#transition(token, this.timings.sceneFadeMs, () => {
      this.#set('presenting');
      this.#show();
    });
  }

  /** Fade out and leave (next scene, case file, menu). */
  exit(): void {
    if (this.#state === 'exiting' || this.#state === 'idle') return;
    this.#stopReveal();
    this.#clear();
    this.#pending = null;
    const token = this.#token;
    this.#set('exiting');
    this.view.curtain('closed', this.timings.sceneFadeMs);
    this.#transition(token, this.timings.sceneFadeMs, () => {
      this.#set('idle');
      this.hooks.onExit();
    });
  }
}
