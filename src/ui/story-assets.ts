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
  /** The VISIBLE bounds inside the uniform cell (head top to baseline, padding trimmed): what the stage scales. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
/**
 * The frame shown on a character's lines: e1, each sheet's composed default (expression labels are not
 * supplied). Cropped to the visible figure — the head top (a few px of hair margin) to just below the
 * baseline, side padding trimmed — and identical for every frame of a sheet (cells are baseline-aligned),
 * so an expression change can never alter scale or footing.
 */
export function castFrame(id: RuntimeAssetId): CastFrame | null {
  const c = castJson.cast.find((x) => x.of === id);
  const f = c?.frames.find((x) => x.id === c.defaultFrame);
  if (!c || !f) return null;
  const top = Math.max(0, f.headTopY - 6);
  const bottom = Math.min(f.h, f.baselineY + 3);
  const inset = 4;
  return { sheetW: c.width, sheetH: c.height, x: f.x + inset, y: f.y + top, w: f.w - 2 * inset, h: bottom - top };
}

/** CSS background for a sprite region scaled to fill its box exactly (the box must share the region's aspect). */
export function regionStyle(url: string, f: CastFrame): string {
  return `background-image:url("${url}");background-size:${(f.sheetW / f.w) * 100}% ${(f.sheetH / f.h) * 100}%;background-position:${(f.x / (f.sheetW - f.w)) * 100}% ${(f.y / (f.sheetH - f.h)) * 100}%`;
}

/** A square head-and-shoulders crop for compact portraits at the table (well under the source resolution). */
export function castFace(id: RuntimeAssetId): CastFrame | null {
  const c = castJson.cast.find((x) => x.of === id);
  const f = c?.frames.find((x) => x.id === c.defaultFrame);
  if (!c || !f) return null;
  const side = Math.round((f.baselineY - f.headTopY) * 0.62);
  const x = Math.max(0, Math.min(f.w - side, Math.round(f.anchorX - side / 2)));
  return { sheetW: c.width, sheetH: c.height, x: f.x + x, y: f.y + Math.max(0, f.headTopY - 6), w: side, h: side };
}

/** Seat display names in the story hands → cast sheets (for compact table portraits). */
export const CAST_BY_SEAT_NAME: Readonly<Record<string, RuntimeAssetId>> = {
  'Tío Rafa': 'cast.rafa.atlas',
  Rafa: 'cast.rafa.atlas',
  Marisol: 'cast.marisol.atlas',
  Vale: 'cast.vale.atlas',
  Luz: 'cast.luz.atlas',
};

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
