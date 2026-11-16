/**
 * Story progress — a versioned local record, separate from Quick Play saves
 * (`sticks-and-bones.save`). It holds only reading position and completed
 * chapters: never presentation state, never hands or seeds. Chapter hands
 * (next stage) will add their own guarded state in a new version with a migration.
 */
import { readRecord, removeRecord, writeRecord, type KeyValueStore, type ReadResult, type RecordSpec } from '../app/storage';

export const STORY_KEY = 'sticks-and-bones.story';
export const TEXT_SCALES = [1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export const SCENE_IDS = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export interface StoryProgress {
  /** Scene being read and the index of the current block within its playable blocks. */
  readonly sceneId: SceneId;
  readonly index: number;
  /** Scenes read to their end (the prologue), and chapters whose hand resolved (next stage). */
  readonly completed: readonly SceneId[];
  readonly textScale: TextScale;
  readonly startedAt: number;
}

export function newProgress(now: number): StoryProgress {
  return { sceneId: 'prologue', index: 0, completed: [], textScale: 1, startedAt: now };
}

function validate(d: unknown): StoryProgress | null {
  if (typeof d !== 'object' || d === null) return null;
  const p = d as Partial<StoryProgress>;
  if (!SCENE_IDS.includes(p.sceneId as SceneId)) return null;
  if (!Number.isInteger(p.index) || (p.index as number) < 0 || (p.index as number) > 10_000) return null;
  if (!Array.isArray(p.completed) || !p.completed.every((c) => SCENE_IDS.includes(c as SceneId))) return null;
  if (!TEXT_SCALES.includes(p.textScale as TextScale)) return null;
  return { sceneId: p.sceneId as SceneId, index: p.index as number, completed: [...new Set(p.completed as SceneId[])], textScale: p.textScale as TextScale, startedAt: typeof p.startedAt === 'number' ? p.startedAt : 0 };
}

export const STORY_SPEC: RecordSpec<StoryProgress> = { key: STORY_KEY, format: 'sticks-and-bones/story', version: 1, validate };

export const readStory = (store: KeyValueStore | null): ReadResult<StoryProgress> => readRecord(store, STORY_SPEC);
/** Returns false when storage refused the write — callers must say so, never claim "saved". */
export const writeStory = (store: KeyValueStore | null, p: StoryProgress): boolean => writeRecord(store, STORY_SPEC, p);
export const clearStory = (store: KeyValueStore | null): void => removeRecord(store, STORY_KEY);
