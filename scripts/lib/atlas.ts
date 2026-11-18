/**
 * Deterministic generator for the double-six face atlas.
 *
 * Inputs: the owner's material sheet (read-only) and the VERIFIED frame rects
 * from src/assets/manifest.ts. Output: a new PNG plus a JSON rectangle
 * manifest. Identity lives in the JSON (`id`, `high`, `low` per rect); it is
 * never inferred from a cell's position.
 */
import { PNG } from 'pngjs';
import { IMAGE_ASSETS } from '../../src/assets/manifest.ts';
import { CANONICAL_TILE_IDS } from '../../src/engine/tiles.ts';
import { FACE_H, FACE_W, facePips, PIP_GEOMETRY_VERSION, pipsOfId } from '../../src/render/pips.ts';
import type { Rect, RgbaImage } from './measure.ts';
import { blit, createRaster, cropResize, fillCircle, type Raster } from './raster.ts';

export const ATLAS_FORMAT = 'sticks-and-bones/tile-atlas@1';
export const FACE_PX_W = 96;
export const FACE_PX_H = 192;
export const PADDING = 4;
export const COLS = 6;
export const BACK_FRAMES = ['back-teal-weave', 'back-walnut-inlay'] as const;
const FACE_FRAME = 'face-ivory-divided';
const PIP_RING: [number, number, number] = [74, 50, 32];
const PIP_CORE: [number, number, number] = [24, 15, 9];

export interface AtlasEntry {
  readonly id: string;
  readonly rect: Rect;
}
export interface AtlasTile extends AtlasEntry {
  readonly high: number;
  readonly low: number;
}
export interface AtlasJson {
  readonly format: typeof ATLAS_FORMAT;
  readonly pipGeometryVersion: number;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly face: { readonly width: number; readonly height: number; readonly padding: number; readonly orientation: string };
  readonly order: string;
  readonly source: {
    readonly assetId: string;
    readonly sha256: string;
    readonly frames: Readonly<Record<string, Rect>>;
  };
  readonly tiles: readonly AtlasTile[];
  readonly backs: readonly AtlasEntry[];
}

function sourceAsset() {
  const a = IMAGE_ASSETS.find((x) => x.id === 'tile.materials');
  if (!a || !('frames' in a)) throw new Error('tile.materials missing from manifest');
  return a;
}

function frameRect(id: string): Rect {
  const f = sourceAsset().frames.find((x) => x.id === id);
  if (!f) throw new Error(`tile.materials frame ${id} missing`);
  return f.rect;
}

function drawPips(face: Raster, id: string): void {
  const { high, low } = pipsOfId(id as never);
  const sx = face.width / FACE_W;
  const sy = face.height / FACE_H;
  for (const p of facePips(high, low)) {
    const cx = p.cx * sx;
    const cy = p.cy * sy;
    const r = p.r * Math.min(sx, sy);
    fillCircle(face, cx, cy, r, PIP_RING);
    fillCircle(face, cx, cy, r * 0.78, PIP_CORE);
  }
}

export function renderAtlas(source: RgbaImage, sourceSha256: string): { raster: Raster; json: AtlasJson } {
  if (sourceSha256 !== sourceAsset().sha256) throw new Error('source sheet hash does not match the verified manifest');
  const cellW = FACE_PX_W + PADDING * 2;
  const cellH = FACE_PX_H + PADDING * 2;
  const ids = [...CANONICAL_TILE_IDS, ...BACK_FRAMES];
  const rows = Math.ceil(ids.length / COLS);
  const atlas = createRaster(cellW * COLS, cellH * rows);
  const blank = cropResize(source, frameRect(FACE_FRAME), FACE_PX_W, FACE_PX_H);
  const tiles: AtlasTile[] = [];
  const backs: AtlasEntry[] = [];
  ids.forEach((id, i) => {
    const rect = { x: (i % COLS) * cellW + PADDING, y: Math.floor(i / COLS) * cellH + PADDING, w: FACE_PX_W, h: FACE_PX_H };
    let img: Raster;
    if (id.startsWith('back-')) {
      img = cropResize(source, frameRect(id), FACE_PX_W, FACE_PX_H);
      backs.push({ id, rect });
    } else {
      img = { width: blank.width, height: blank.height, data: blank.data.slice() };
      drawPips(img, id);
      const { high, low } = pipsOfId(id as never);
      tiles.push({ id, high, low, rect });
    }
    blit(atlas, img, rect.x, rect.y);
  });
  const json: AtlasJson = {
    format: ATLAS_FORMAT,
    pipGeometryVersion: PIP_GEOMETRY_VERSION,
    image: 'double-six-atlas.png',
    width: atlas.width,
    height: atlas.height,
    face: {
      width: FACE_PX_W,
      height: FACE_PX_H,
      padding: PADDING,
      orientation: 'portrait; top half shows the high pip, bottom half the low pip',
    },
    order: 'canonical tile order t00, t10, t11, t20 … t66 (high ascending, then low ascending), then backs; identity is the id field, never the cell position',
    source: {
      assetId: 'tile.materials',
      sha256: sourceSha256,
      frames: Object.fromEntries([FACE_FRAME, ...BACK_FRAMES].map((f) => [f, frameRect(f)])),
    },
    tiles,
    backs,
  };
  return { raster: atlas, json };
}

export function encodePng(r: Raster): Buffer {
  const png = new PNG({ width: r.width, height: r.height });
  png.data = Buffer.from(r.data);
  return PNG.sync.write(png, { colorType: 6 });
}
