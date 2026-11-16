/**
 * Where AI decisions are computed. The browser uses a Web Worker so Hard's
 * sampling never blocks the main thread; tests and worker-less environments
 * use the inline runner. Both are asynchronous, so callers must always guard
 * against stale results (see GameSession).
 */
import type { RngState } from '../engine/rng';
import type { AiObservation } from './observation';
import { decide } from './policy';
import type { Decision, Difficulty } from './types';

export interface DecisionRequest {
  readonly difficulty: Difficulty;
  readonly obs: AiObservation;
  readonly rng: RngState;
}

export interface AiRunner {
  readonly kind: 'inline' | 'worker';
  decide(req: DecisionRequest): Promise<Decision>;
  dispose(): void;
}

export function inlineRunner(): AiRunner {
  return {
    kind: 'inline',
    decide: (req) => Promise.resolve().then(() => decide(req.difficulty, req.obs, req.rng)),
    dispose: () => {},
  };
}

/** Worker-backed runner, or null where workers are unavailable. Falls back inline if the worker errors. */
export function createWorkerRunner(): AiRunner | null {
  if (typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  let nextId = 1;
  let broken = false;
  const pending = new Map<number, { resolve: (d: Decision) => void; req: DecisionRequest }>();
  const fallback = inlineRunner();
  const failAll = () => {
    broken = true;
    for (const [id, p] of pending) {
      pending.delete(id);
      void fallback.decide(p.req).then(p.resolve);
    }
  };
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; decision?: Decision }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok && e.data.decision) p.resolve(e.data.decision);
    else void fallback.decide(p.req).then(p.resolve);
  };
  worker.onerror = failAll;
  return {
    kind: 'worker',
    decide(req) {
      if (broken) return fallback.decide(req);
      return new Promise<Decision>((resolve) => {
        const id = nextId++;
        pending.set(id, { resolve, req });
        worker.postMessage({ id, req });
      });
    },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}
