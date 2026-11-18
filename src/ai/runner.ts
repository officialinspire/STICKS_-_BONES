/**
 * Where AI decisions are computed. The browser uses a Web Worker so Hard's
 * sampling never blocks the main thread; tests and worker-less environments
 * use the inline runner. Both are asynchronous, so callers must always guard
 * against stale results (see GameSession: `{epoch, seq, seat}` tokens).
 *
 * The worker runner never leaves a request hanging, and never accepts an answer it can't trust:
 * - Every request settles exactly once: with the worker's validated decision, or with the cheap
 *   observation-only fallback (worker error, `messageerror`, malformed or illegal answer,
 *   `postMessage` failure, or no answer within `timeoutMs`). On dispose it is rejected.
 * - A late or duplicate answer for an already-settled request is dropped (counted, never applied).
 * - A hung or crashed worker is replaced at most `maxRestarts` times; after that every request
 *   uses the fallback.
 * - The fallback uses ONLY the request's AiObservation and the AI's own RNG. It is cheap (a forced
 *   move, or the one-ply Normal heuristic in place of Hard's sampling) so it never blocks the UI.
 */
import { SHUFFLE_CONTRACT, type RngState } from '../engine/rng';
import type { AiObservation } from './observation';
import { decide } from './policy';
import type { Decision, Difficulty } from './types';

export interface DecisionRequest {
  readonly difficulty: Difficulty;
  readonly obs: AiObservation;
  readonly rng: RngState;
}

export interface RunnerStats {
  workerDecisions: number;
  fallbacks: number;
  timeouts: number;
  malformed: number;
  postFailures: number;
  workerErrors: number;
  lateIgnored: number;
  restarts: number;
}

export interface AiRunner {
  readonly kind: 'inline' | 'worker';
  decide(req: DecisionRequest): Promise<Decision>;
  dispose(): void;
  readonly stats?: RunnerStats;
}

export function inlineRunner(): AiRunner {
  return {
    kind: 'inline',
    decide: (req) => Promise.resolve().then(() => decide(req.difficulty, req.obs, req.rng)),
    dispose: () => {},
  };
}

/**
 * The cheap, observation-only fallback: Easy and Normal run their own (cheap) policies; Hard degrades to
 * the one-ply Normal heuristic instead of sampling worlds on the main thread. Same fair inputs either way.
 */
export function fallbackDecision(req: DecisionRequest): Decision {
  const d = decide(req.difficulty === 'hard' ? 'normal' : req.difficulty, req.obs, req.rng);
  return { ...d, method: `${d.method} (fallback)` };
}

const isRng = (r: unknown): r is RngState => {
  const o = r as RngState | null;
  return !!o && o.contract === SHUFFLE_CONTRACT && Array.isArray(o.s) && o.s.length === 4 && o.s.every((n) => Number.isInteger(n));
};

/** A decision from outside this thread is used only if it is well-formed AND legal for this observation. */
export function validDecision(d: unknown, obs: AiObservation): d is Decision {
  const x = d as Decision | null;
  if (!x || typeof x !== 'object' || !isRng(x.rng) || typeof x.method !== 'string' || !x.action || typeof x.action !== 'object') return false;
  const a = x.action;
  if (a.type === 'play') return obs.legal.some((m) => m.tile === a.tile && m.end === a.end);
  if (a.type === 'draw') return obs.legal.length === 0 && obs.mustDraw;
  if (a.type === 'pass') return obs.legal.length === 0 && !obs.mustDraw;
  return false;
}

/** The parts of a Worker the runner uses (a fake in tests). */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown): void;
  terminate(): void;
}

export interface WorkerRunnerOptions {
  /** Longest wait for one decision before the fallback answers (the session's thinking delay runs alongside). */
  readonly timeoutMs?: number;
  /** How many times a crashed or hung worker is replaced before the runner stays on the fallback. */
  readonly maxRestarts?: number;
  readonly createWorker?: () => WorkerLike;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (h: unknown) => void;
}

const defaultWorker = (): WorkerLike => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

/** Worker-backed runner, or null where workers are unavailable. */
export function createWorkerRunner(opts: WorkerRunnerOptions = {}): AiRunner | null {
  if (!opts.createWorker && typeof Worker === 'undefined') return null;
  const make = opts.createWorker ?? defaultWorker;
  const timeoutMs = opts.timeoutMs ?? 6000;
  const maxRestarts = opts.maxRestarts ?? 2;
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const stats: RunnerStats = { workerDecisions: 0, fallbacks: 0, timeouts: 0, malformed: 0, postFailures: 0, workerErrors: 0, lateIgnored: 0, restarts: 0 };

  type Pending = { req: DecisionRequest; resolve: (d: Decision) => void; reject: (e: Error) => void; timer: unknown };
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let worker: WorkerLike | null = null;
  let broken = false;
  let disposed = false;
  let made = 0;

  /** Settle a request once: later answers for the same id find nothing and are dropped. */
  const take = (id: number): Pending | null => {
    const p = pending.get(id);
    if (!p) return null;
    pending.delete(id);
    clearTimer(p.timer);
    return p;
  };
  /** The fallback runs on a later task, so a burst of failures never stacks work into one event. */
  const fallbackFor = (p: Pending) => {
    stats.fallbacks++;
    setTimer(() => {
      try {
        p.resolve(fallbackDecision(p.req));
      } catch (e) {
        p.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, 0);
  };
  const failAllPending = () => {
    for (const id of [...pending.keys()]) {
      const p = take(id);
      if (p) fallbackFor(p);
    }
  };
  const retire = () => {
    if (!worker) return;
    const w = worker;
    worker = null;
    w.onmessage = w.onerror = w.onmessageerror = null;
    try {
      w.terminate();
    } catch {
      /* already gone */
    }
  };
  /** The worker crashed, garbled a message, or hung: every waiting request gets the fallback; replace it (bounded). */
  const replace = () => {
    failAllPending();
    retire();
    if (stats.restarts >= maxRestarts) broken = true;
  };
  const ensure = (): WorkerLike | null => {
    if (worker || broken || disposed) return worker;
    try {
      const w = make();
      if (made++ > 0) stats.restarts++;
      w.onmessage = (e: MessageEvent) => {
        if (worker !== w) return; // a retired worker's message
        const data = e.data as { id?: unknown; ok?: unknown; decision?: unknown } | null;
        const id = data && typeof data.id === 'number' ? data.id : NaN;
        const p = Number.isFinite(id) ? take(id) : null;
        if (!p) {
          if (Number.isFinite(id)) stats.lateIgnored++;
          else stats.malformed++;
          return;
        }
        if (data!.ok === true && validDecision(data!.decision, p.req.obs)) {
          stats.workerDecisions++;
          p.resolve(data!.decision);
        } else {
          stats.malformed++;
          fallbackFor(p);
        }
      };
      w.onerror = (e: Event) => {
        if (worker !== w) return;
        e.preventDefault?.();
        stats.workerErrors++;
        replace();
      };
      w.onmessageerror = () => {
        if (worker !== w) return;
        stats.workerErrors++;
        replace();
      };
      worker = w;
    } catch {
      broken = true;
    }
    return worker;
  };

  if (!opts.createWorker && !ensure()) return null; // the browser refused to start the worker at all

  return {
    kind: 'worker',
    stats,
    decide(req) {
      if (disposed) return Promise.reject(new Error('AI runner disposed'));
      return new Promise<Decision>((resolve, reject) => {
        const id = nextId++;
        const p: Pending = { req, resolve, reject, timer: null };
        pending.set(id, p);
        const w = ensure();
        if (!w) {
          take(id);
          return fallbackFor(p);
        }
        p.timer = setTimer(() => {
          if (!pending.has(id)) return;
          stats.timeouts++;
          // A silent worker is presumed hung: this request (and any other waiting) falls back; replace it.
          replace();
        }, timeoutMs);
        try {
          w.postMessage({ id, req });
        } catch {
          // e.g. a DataCloneError: this request can't be sent; the worker itself is fine.
          stats.postFailures++;
          const q = take(id);
          if (q) fallbackFor(q);
        }
      });
    },
    dispose() {
      disposed = true;
      for (const id of [...pending.keys()]) take(id)?.reject(new Error('AI runner disposed'));
      retire();
    },
  };
}
