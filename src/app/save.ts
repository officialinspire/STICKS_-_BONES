/**
 * Local save/resume. A save holds the full match state (including hidden
 * hands) in this browser's storage so a game survives a reload. That is
 * ordinary shared-device convenience: anyone with devtools can read it. It is
 * never sent anywhere, and the UI never renders from it directly — a resumed
 * two-human game always opens behind the privacy cover.
 */
import type { Difficulty } from '../ai/types';
import { DIFFICULTIES } from '../ai/types';
import { isRngState, type RngState } from '../engine/rng';
import { restoreMatch } from '../engine/serialize';
import type { MatchState } from '../engine/state';
import type { OpponentKind } from './session';
import type { GameSession } from './session';

export const SAVE_KEY = 'sticks-and-bones.save';
export const SAVE_FORMAT = 'sticks-and-bones-save@1';

export interface SavedGame {
  readonly format: typeof SAVE_FORMAT;
  readonly opponent: OpponentKind;
  readonly difficulty: Difficulty;
  readonly state: MatchState;
  readonly aiRng: readonly RngState[];
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser storage if usable (private modes can throw), otherwise null. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    const probe = `${SAVE_KEY}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function writeSave(store: KeyValueStore | null, session: GameSession): boolean {
  if (!store || session.opponent === 'dev-both') return false;
  const state = session.debugState();
  try {
    if (state.phase === 'match-over') {
      store.removeItem(SAVE_KEY);
      return true;
    }
    const game: SavedGame = { format: SAVE_FORMAT, opponent: session.opponent, difficulty: session.difficulty, state, aiRng: session.exportAiRng() };
    store.setItem(SAVE_KEY, JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: KeyValueStore | null): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read and fully re-validate a save. Anything malformed is discarded. */
export function readSave(store: KeyValueStore | null): SavedGame | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as Partial<SavedGame>;
    if (g.format !== SAVE_FORMAT) return null;
    if (g.opponent !== 'ai' && g.opponent !== 'local') return null;
    if (!DIFFICULTIES.includes(g.difficulty as Difficulty)) return null;
    if (!Array.isArray(g.aiRng) || !g.aiRng.every(isRngState)) return null;
    const restored = restoreMatch(g.state);
    if (!restored.ok || restored.state.phase === 'match-over') return null;
    return { format: SAVE_FORMAT, opponent: g.opponent, difficulty: g.difficulty as Difficulty, state: restored.state, aiRng: g.aiRng };
  } catch {
    return null;
  }
}
