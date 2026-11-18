/**
 * The case file's Evidence list: the documentary evidence the player has actually seen, in the words they
 * saw it.
 *
 * - **Source:** each item is anchored to an exact stage direction of the approved script (verbatim,
 *   tested), and shown as that beat's on-screen caption (`playerCaption`). Nothing is rewritten or
 *   invented, and no dialogue is used.
 * - **Reached only:** an item appears once the case's saved position has reached its beat.
 *   - A scene the case has moved past shows all of its items.
 *   - The current scene shows its items up to the saved line (the pre-hand part; during or after the hand,
 *     every pre-hand item; after the hand, the post-hand items up to the saved line).
 *   - Later scenes show nothing, so the list never spoils what comes next.
 *   - Replays use no case progress, so they never add anything.
 * - **No save field:** the list is derived from the existing Story record, so a reload can't duplicate or
 *   lose an item.
 */
import { playerCaption } from './captions';
import { insertLines, segments } from './chapters';
import type { Scene } from './parse';
import { SCENE_IDS, type SceneId, type StoryProgress } from './progress';

export interface EvidenceItem {
  readonly id: string;
  readonly scene: SceneId;
  readonly part: 'pre' | 'post';
  /** The exact stage direction (verbatim from the script). */
  readonly at: string;
}

export const EVIDENCE: readonly EvidenceItem[] = [
  { id: 'gate-access', scene: 'chapter-2', part: 'post', at: '[Common continuation. The export shows nightly contractor access through the closed jungle gate.]' },
  { id: 'photo-statement', scene: 'chapter-4', part: 'post', at: '[Common continuation. Rafa leaves to deliver the photograph and statement to Luz. Marisol and Roberto stay on the bench.]' },
  { id: 'sketch-photo', scene: 'chapter-5', part: 'pre', at: '[Luz compares the dream sketch Roberto has chosen to bring with a photograph of the cave entrance. The threshold angle and waterfall match.]' },
  { id: 'water-record', scene: 'chapter-5', part: 'pre', at: '[She shows the dated water record, a pump invoice, and a new work notice supplied to the custodians.]' },
  { id: 'equipment', scene: 'chapter-6', part: 'pre', at: '[The group documents the equipment. Authorized maintenance isolates the pump and the speaker supply. Normal water sounds settle into the space.]' },
  { id: 'vale-directive', scene: 'chapter-6', part: 'pre', at: '[Readable evidence card, not a magical reveal: Vale wrote, No staff access before the channel is sealed. Keep using the recording. Repeated reports are creating a personnel issue.]' },
];

export interface ReachedEvidence {
  readonly id: string;
  readonly scene: SceneId;
  /** The caption exactly as the player saw it on screen. */
  readonly text: string;
}

/** Where an item sits among the beats the player steps through (null if the anchor is missing). */
export function evidenceBeat(scene: Scene, item: EvidenceItem, outcome: StoryProgress['outcome']): number | null {
  const seg = segments(scene);
  if (item.part === 'pre') {
    const i = seg.pre.findIndex((b) => b.raw === item.at);
    return i < 0 ? null : i;
  }
  const lead = outcome && seg.inserts[outcome] ? insertLines(seg.inserts[outcome]!).length : 0;
  const i = seg.post.findIndex((b) => b.raw === item.at);
  return i < 0 ? null : lead + i;
}

/** The evidence this case has actually reached, in story order. */
export function reachedEvidence(scenes: readonly Scene[], p: StoryProgress | null): ReachedEvidence[] {
  if (!p) return [];
  const at = SCENE_IDS.indexOf(p.sceneId);
  const out: ReachedEvidence[] = [];
  for (const item of EVIDENCE) {
    const scene = scenes.find((s) => s.id === item.scene);
    if (!scene) continue;
    const pos = SCENE_IDS.indexOf(item.scene);
    let reached = false;
    if (pos < at) reached = true;
    else if (pos === at) {
      const beat = evidenceBeat(scene, item, p.outcome);
      if (beat === null) continue;
      if (p.part === 'end') reached = true; // the scene's end card: all of it was read
      else if (item.part === 'pre') reached = p.part !== 'pre' || beat <= p.index;
      else reached = (p.part === 'post' || p.part === 'insert') && beat <= p.index;
    }
    if (!reached) continue;
    const text = playerCaption(item.at);
    if (text) out.push({ id: item.id, scene: item.scene, text });
  }
  return out;
}
