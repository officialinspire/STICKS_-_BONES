/**
 * Story progress — a versioned local record, separate from Quick Play saves
 * (`sticks-and-bones.save`). Holds the reading position (scene, part, index),
 * the chapter outcome, completed scenes, text size, and — during a chapter
 * hand — the engine state and AI streams so a refresh resumes the SAME hand.
 * Never presentation state. A chapter is marked complete in the same write
 * that records its outcome, so a reload can't replay the completion.
 *
 * v1 (Stage 12: prologue only) migrates to v2 on read; v2 migrates to v3 (Stage 2 of the release plan:
 * each completed scene's actual outcome, for the reached-only transcript, and which hands were finished with
 * AI assistance). Outcomes from before v3 were never stored, so they stay unknown — never guessed.
 */
import { isRngState, type RngState } from '../engine/rng';
import { restoreMatch } from '../engine/serialize';
import type { MatchState } from '../engine/state';
import { readRecord, removeRecord, writeRecord, type KeyValueStore, type ReadResult, type RecordSpec } from '../app/storage';
import type { Outcome } from './chapters';

export const STORY_KEY = 'sticks-and-bones.story';
export const TEXT_SCALES = [1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export const SCENE_IDS = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'] as const;
export type SceneId = (typeof SCENE_IDS)[number];
/** pre: dialogue before the hand · hand: the hand is in play · insert: the matching outcome insert · post: the common continuation · end: scene finished. */
export const PARTS = ['pre', 'hand', 'insert', 'post', 'end'] as const;
export type Part = (typeof PARTS)[number];

export interface StoryHand {
  readonly state: MatchState;
  readonly aiRng: readonly RngState[];
  /** The assistant has already played in this hand (its label survives a reload; control does not). */
  readonly assisted: boolean;
}

export interface StoryProgress {
  readonly sceneId: SceneId;
  readonly part: Part;
  readonly index: number;
  readonly outcome: Outcome | null;
  readonly completed: readonly SceneId[];
  readonly textScale: TextScale;
  readonly startedAt: number;
  readonly hand: StoryHand | null;
  /** The actual result of each scene's hand in this case (first play only; replays never write it). */
  readonly outcomes: Readonly<Partial<Record<SceneId, Outcome>>>;
  /** Scenes whose hand was finished with AI assistance in this case. */
  readonly assisted: readonly SceneId[];
}

export function newProgress(now: number): StoryProgress {
  return { sceneId: 'prologue', part: 'pre', index: 0, outcome: null, completed: [], textScale: 1, startedAt: now, hand: null, outcomes: {}, assisted: [] };
}

const OUTCOMES: readonly Outcome[] = ['win', 'loss', 'tie'];
function validOutcomes(o: unknown): Partial<Record<SceneId, Outcome>> {
  const out: Partial<Record<SceneId, Outcome>> = {};
  if (typeof o !== 'object' || o === null) return out;
  for (const [k, v] of Object.entries(o)) if (SCENE_IDS.includes(k as SceneId) && OUTCOMES.includes(v as Outcome)) out[k as SceneId] = v as Outcome;
  return out;
}

function validHand(h: unknown): StoryHand | null {
  if (h === null || h === undefined) return null;
  const x = h as Partial<StoryHand>;
  if (!Array.isArray(x.aiRng) || !x.aiRng.every(isRngState)) return null;
  const r = restoreMatch(x.state);
  if (!r.ok || r.state.phase !== 'playing') return null;
  return { state: r.state, aiRng: x.aiRng, assisted: x.assisted === true };
}

function validate(d: unknown): StoryProgress | null {
  if (typeof d !== 'object' || d === null) return null;
  const p = d as Partial<StoryProgress>;
  if (!SCENE_IDS.includes(p.sceneId as SceneId)) return null;
  if (!PARTS.includes(p.part as Part)) return null;
  if (!Number.isInteger(p.index) || (p.index as number) < 0 || (p.index as number) > 10_000) return null;
  if (!Array.isArray(p.completed) || !p.completed.every((c) => SCENE_IDS.includes(c as SceneId))) return null;
  if (!TEXT_SCALES.includes(p.textScale as TextScale)) return null;
  if (p.outcome !== null && p.outcome !== undefined && !['win', 'loss', 'tie'].includes(p.outcome)) return null;
  const hand = validHand(p.hand);
  // A saved hand only makes sense while the hand part is active; anything else is dropped (the hand restarts cleanly).
  return {
    sceneId: p.sceneId as SceneId,
    part: p.part as Part,
    index: p.index as number,
    outcome: (p.outcome ?? null) as Outcome | null,
    completed: [...new Set(p.completed as SceneId[])],
    textScale: p.textScale as TextScale,
    startedAt: typeof p.startedAt === 'number' ? p.startedAt : 0,
    hand: p.part === 'hand' ? hand : null,
    outcomes: validOutcomes(p.outcomes),
    assisted: Array.isArray(p.assisted) ? [...new Set(p.assisted.filter((x) => SCENE_IDS.includes(x as SceneId)) as SceneId[])] : [],
  };
}

export const STORY_SPEC: RecordSpec<StoryProgress> = {
  key: STORY_KEY,
  format: 'sticks-and-bones/story',
  version: 3,
  validate,
  migrate(from, data) {
    if (from === 1) {
      const v1 = data as { sceneId?: unknown; index?: unknown; completed?: unknown; textScale?: unknown; startedAt?: unknown };
      return { ...v1, part: 'pre', outcome: null, hand: null, outcomes: {}, assisted: [] };
    }
    if (from === 2) {
      // The current scene's outcome is the only one v2 kept; earlier ones are unknown (never guessed).
      const v2 = data as { sceneId?: unknown; outcome?: unknown; hand?: unknown };
      const outcomes = typeof v2.sceneId === 'string' && OUTCOMES.includes(v2.outcome as Outcome) ? { [v2.sceneId]: v2.outcome } : {};
      const hand = v2.hand && typeof v2.hand === 'object' ? { ...(v2.hand as object), assisted: false } : v2.hand;
      return { ...(data as object), hand, outcomes, assisted: [] };
    }
    return null;
  },
};

export const readStory = (store: KeyValueStore | null): ReadResult<StoryProgress> => readRecord(store, STORY_SPEC);
/** Returns false when storage refused the write — callers must say so, never claim "saved". */
export const writeStory = (store: KeyValueStore | null, p: StoryProgress): boolean => writeRecord(store, STORY_SPEC, p);
export const clearStory = (store: KeyValueStore | null): void => removeRecord(store, STORY_KEY);
