/**
 * Save / restore. A save is the full MatchState as JSON, including hidden hands
 * and RNG state, so it is SECRET: store it locally only; never put it in a URL,
 * analytics or logs. Restore re-validates everything before accepting it.
 */
import { checkInvariants } from './invariants';
import type { MatchState } from './state';

export function serializeMatch(state: MatchState): string {
  return JSON.stringify(state);
}

export type RestoreResult = { readonly ok: true; readonly state: MatchState } | { readonly ok: false; readonly errors: readonly string[] };

export function restoreMatch(saved: string | unknown): RestoreResult {
  let data: unknown = saved;
  if (typeof saved === 'string') {
    try {
      data = JSON.parse(saved);
    } catch {
      return { ok: false, errors: ['save is not valid JSON'] };
    }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, errors: ['save is not an object'] };
  const s = data as Partial<MatchState>;
  if (!s.hand || !s.config || !Array.isArray(s.scores) || !Array.isArray(s.history))
    return { ok: false, errors: ['save is missing required fields'] };
  const h = s.hand;
  if (!Array.isArray(h.hands) || !Array.isArray(h.stock) || !h.line || !Array.isArray(h.line.tiles))
    return { ok: false, errors: ['save hand is malformed'] };
  let problems: string[];
  try {
    problems = checkInvariants(s as MatchState);
  } catch (e) {
    problems = [`save failed validation: ${(e as Error).message}`];
  }
  return problems.length ? { ok: false, errors: problems } : { ok: true, state: s as MatchState };
}
