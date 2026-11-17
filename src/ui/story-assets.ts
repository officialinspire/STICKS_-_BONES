/**
 * Images a story scene needs: its backdrop(s) for this viewport and the portraits of the cast who
 * speak in it. Used to decode before the reveal and to prefetch the NEXT chapter in the background
 * (bounded by the warm queue), never at startup.
 */
import castJson from '../assets/cast.json';
import { envKey } from '../assets/env';
import type { RuntimeAssetId, WarmKey } from '../assets/index';
import type { Scene } from '../story/parse';
import type { SceneId } from '../story/progress';
import { STAGING } from '../story/staging';

/** Script speaker tag → cast sheet. Speakers without art (Worker, Representative, Speaker, Voice) keep name tags. */
export const CAST_BY_SPEAKER: Readonly<Record<string, RuntimeAssetId>> = {
  VALE: 'cast.vale.atlas',
  LUZ: 'cast.luz.atlas',
  MARISOL: 'cast.marisol.atlas',
  RAFA: 'cast.rafa.atlas',
};

export interface CastFrame {
  readonly sheetW: number;
  readonly sheetH: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
/** The frame shown on a character's lines: e1, each sheet's composed default (expression labels are not supplied). */
export function castFrame(id: RuntimeAssetId): CastFrame | null {
  const c = castJson.cast.find((x) => x.of === id);
  const f = c?.frames.find((x) => x.id === c.defaultFrame);
  return c && f ? { sheetW: c.width, sheetH: c.height, x: f.x, y: f.y, w: f.w, h: f.h } : null;
}

export const speakerKey = (tag: string): RuntimeAssetId | null => CAST_BY_SPEAKER[tag.split(',')[0]!.trim()] ?? null;

export function sceneCast(scene: Scene): RuntimeAssetId[] {
  const ids = new Set<RuntimeAssetId>();
  for (const b of scene.blocks) if (b.kind === 'line' && b.speaker) {
    const k = speakerKey(b.speaker);
    if (k) ids.add(k);
  }
  return [...ids];
}

/** Backdrops (opening + mid-scene cuts) for this viewport, then the cast. */
export function sceneAssets(scene: Scene): WarmKey[] {
  const st = STAGING[scene.id as SceneId];
  const envs = new Set<RuntimeAssetId>();
  if (st.env) envs.add(st.env);
  if (st.handEnv) envs.add(st.handEnv);
  for (const c of st.cues) for (const k of c.cues) if (k.kind === 'backdrop' && k.env) envs.add(k.env);
  return [...[...envs].map((e) => envKey(e)), ...sceneCast(scene)];
}
