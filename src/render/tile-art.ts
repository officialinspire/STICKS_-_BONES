/**
 * Tile face rendering with two interchangeable backends behind one API:
 *   - 'atlas': the generated double-six atlas (looked up by tile id in its
 *     JSON manifest — never by cell position);
 *   - 'svg':   vector faces using the same pip geometry (src/render/pips.ts).
 * SVG is used until the atlas image has loaded, if it fails, or when forced.
 * Faces are portrait (high pip on top); rotation is applied by the caller.
 */
import atlas from '../../assets/generated/tiles/double-six-atlas.json';
import { assetUrl } from '../assets';
import { warm } from '../assets/warm';
import type { TileId } from '../engine/types';
import { dominoSvg } from '../ui/domino';
import { esc } from '../ui/svg';
import { pipsOfId } from './pips';

export type Backend = 'atlas' | 'svg';
export type FaceId = TileId | 'back';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BY_ID = new Map<string, Rect>([...atlas.tiles, ...atlas.backs].map((e) => [e.id, e.rect]));
const BACK_ID = 'back-teal-weave';
const ATLAS_URL = assetUrl('tile.atlas');

let loaded = false;
let forceSvg = false;
const listeners = new Set<() => void>();

export function backend(): Backend {
  return loaded && !forceSvg && ATLAS_URL ? 'atlas' : 'svg';
}

export function onBackendChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setForceSvg(on: boolean): void {
  forceSvg = on;
  listeners.forEach((f) => f());
}

let requested = false;
/**
 * Fetch + decode the atlas (ahead of other background warm-up); switches to the
 * atlas backend once it decodes. Safe to call repeatedly. Until then (or if it
 * fails) faces render as vector SVG with identical pip geometry.
 */
export function initTileArt(): void {
  if (loaded || requested || !ATLAS_URL || typeof Image === 'undefined') return;
  requested = true;
  void warm(['tile.atlas'], { front: true }).then(([ok]) => {
    if (!ok) return;
    loaded = true;
    listeners.forEach((f) => f());
  });
}

function atlasFace(id: FaceId): string {
  const rect = BY_ID.get(id === 'back' ? BACK_ID : id);
  if (!rect || !ATLAS_URL) return svgFace(id);
  const fw = atlas.face.width;
  const fh = atlas.face.height;
  const style = [
    `background-image:url("${esc(ATLAS_URL)}")`,
    `background-size:${((atlas.width / fw) * 100).toFixed(4)}% ${((atlas.height / fh) * 100).toFixed(4)}%`,
    `background-position:${((rect.x / (atlas.width - fw)) * 100).toFixed(4)}% ${((rect.y / (atlas.height - fh)) * 100).toFixed(4)}%`,
  ].join(';');
  return `<span class="face face-atlas" style='${style}'></span>`;
}

function svgFace(id: FaceId): string {
  if (id === 'back')
    return `<svg class="face face-svg" viewBox="0 0 100 200" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="97" height="197" rx="12" fill="#0f5a57" stroke="#08302e" stroke-width="3"/><rect x="12" y="12" width="76" height="176" rx="6" fill="none" stroke="#2c8a83" stroke-width="3"/></svg>`;
  const { high, low } = pipsOfId(id);
  return dominoSvg(high, low, { className: 'face face-svg' });
}

/** A portrait face filling its container. */
export function faceHtml(id: FaceId): string {
  return backend() === 'atlas' ? atlasFace(id) : svgFace(id);
}

/**
 * A tile box of `w`×`h` CSS pixels whose portrait face is rotated by
 * `rotation` degrees (0/180 for tall boxes, 90/270 for wide ones).
 */
export function tileBoxHtml(id: FaceId, w: number, h: number, rotation: number, attrs = ''): string {
  const tall = rotation === 0 || rotation === 180;
  const pw = tall ? w : h;
  const ph = tall ? h : w;
  return (
    `<span class="tile-box" style="width:${w}px;height:${h}px" ${attrs}>` +
    `<span class="face-rot" style="width:${pw}px;height:${ph}px;transform:translate(-50%,-50%) rotate(${rotation}deg)">${faceHtml(id)}</span>` +
    `</span>`
  );
}

export const ATLAS_META = { width: atlas.width, height: atlas.height, face: atlas.face, tiles: atlas.tiles, backs: atlas.backs, url: ATLAS_URL };
