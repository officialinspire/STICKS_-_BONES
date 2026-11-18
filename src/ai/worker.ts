/// <reference lib="webworker" />
/**
 * AI decision worker: runs policies off the main thread. Receives only the
 * sanitized observation and the AI's own RNG state.
 */
import { decide } from './policy';
import type { DecisionRequest } from './runner';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<{ id: number; req: DecisionRequest }>) => {
  const { id, req } = e.data;
  try {
    ctx.postMessage({ id, ok: true, decision: decide(req.difficulty, req.obs, req.rng) });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: String(err) });
  }
};
