/**
 * The case transcript and the recap after Skip — both derived, never stored, never a spoiler.
 *
 * Transcript (`reachedTranscript`): every beat the case has actually reached, verbatim — spoken lines as the
 * script writes them, stage directions only as their on-screen player captions (`playerCaption`), and each
 * hand's ACTUAL result with its matching insert (from `StoryProgress.outcomes`, v3). The same reached-only
 * rule as the Evidence list: scenes the case has moved past in full, the current scene up to its saved beat,
 * nothing later. A result recorded before v3 is unknown and said to be so — never guessed. Replays use no
 * case progress, so they add nothing.
 *
 * Recap (`skipRecap`): when the player skips the rest of a segment, only the already-approved Evidence
 * excerpts whose beats lie INSIDE the skipped range (after the current beat, up to the segment's end) — so it
 * reveals nothing beyond what was skipped. The notebook entry is not repeated: the end card shows it.
 */
import { playerCaption } from './captions';
import { insertLines, segments, type Outcome } from './chapters';
import { EVIDENCE, evidenceBeat } from './evidence';
import type { Block, Scene } from './parse';
import { SCENE_IDS, type SceneId, type StoryProgress } from './progress';

export type TranscriptEntry =
  | { readonly scene: SceneId; readonly kind: 'line'; readonly speaker: string; readonly text: string }
  | { readonly scene: SceneId; readonly kind: 'caption'; readonly text: string }
  | { readonly scene: SceneId; readonly kind: 'result'; readonly outcome: Outcome | null; readonly assisted: boolean };

function entries(scene: SceneId, blocks: readonly Block[]): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const b of blocks) {
    if (b.kind === 'line' && b.speaker && b.text !== undefined) out.push({ scene, kind: 'line', speaker: b.speaker, text: b.text });
    else {
      const c = playerCaption(b.raw);
      if (c) out.push({ scene, kind: 'caption', text: c });
    }
  }
  return out;
}

/** Everything the case has reached, in story order. */
export function reachedTranscript(scenes: readonly Scene[], p: StoryProgress | null): TranscriptEntry[] {
  if (!p) return [];
  const at = SCENE_IDS.indexOf(p.sceneId);
  const out: TranscriptEntry[] = [];
  for (const id of SCENE_IDS.slice(0, at + 1)) {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) continue;
    const seg = segments(scene);
    const current = id === p.sceneId;
    const part = current ? p.part : 'end';
    if (part === 'pre') {
      out.push(...entries(id, seg.pre.slice(0, p.index + 1)));
      continue;
    }
    out.push(...entries(id, seg.pre));
    if (!seg.deal || part === 'hand') continue; // no hand in this scene, or it is being played now
    const outcome = (current ? p.outcome : null) ?? p.outcomes[id] ?? null;
    out.push({ scene: id, kind: 'result', outcome, assisted: p.assisted.includes(id) });
    const after = [...(outcome && seg.inserts[outcome] ? insertLines(seg.inserts[outcome]!) : []), ...seg.post];
    // Without a known outcome the insert can't be placed; the shared continuation still was reached.
    const reached = part === 'end' ? after : after.slice(0, p.index + 1);
    out.push(...entries(id, outcome ? reached : part === 'end' ? seg.post : []));
  }
  return out;
}

/**
 * The Evidence excerpts inside a skipped range: beats after `fromIndex` to the end of `part` ('pre', or 'post'
 * counted with the outcome's insert lines first, as the player steps through them).
 */
export function skipRecap(scene: Scene, part: 'pre' | 'post', fromIndex: number, outcome: Outcome | null): string[] {
  const out: string[] = [];
  for (const item of EVIDENCE) {
    if (item.scene !== scene.id || item.part !== part) continue;
    const beat = evidenceBeat(scene, item, outcome);
    if (beat === null || beat <= fromIndex) continue;
    const text = playerCaption(item.at);
    if (text) out.push(text);
  }
  return out;
}
