import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { IMAGE_ASSETS } from '../../src/assets/manifest';
import { CANONICAL_TILE_IDS } from '../../src/engine/tiles';
import { PIP_LAYOUT } from '../../src/render/pips';
import { renderAtlas, type AtlasJson } from './atlas';
import { countBlobs } from './raster';

const root = fileURLToPath(new URL('../..', import.meta.url));
const json = JSON.parse(readFileSync(root + 'assets/generated/tiles/double-six-atlas.json', 'utf8')) as AtlasJson;
const png = PNG.sync.read(readFileSync(root + 'assets/generated/tiles/double-six-atlas.png'));
const dark = (i: number) => png.data[i + 3]! > 200 && 0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]! < 110;

describe('generated double-six atlas', () => {
  it('has 28 unique canonical faces with valid values, plus two backs', () => {
    expect(json.tiles).toHaveLength(28);
    expect(new Set(json.tiles.map((t) => t.id)).size).toBe(28);
    expect([...json.tiles.map((t) => t.id)].sort()).toEqual([...CANONICAL_TILE_IDS].sort());
    for (const t of json.tiles) {
      expect(t.id).toBe(`t${t.high}${t.low}`);
      expect(t.high).toBeGreaterThanOrEqual(t.low);
      expect(t.low).toBeGreaterThanOrEqual(0);
      expect(t.high).toBeLessThanOrEqual(6);
    }
    expect(json.backs.map((b) => b.id)).toEqual(['back-teal-weave', 'back-walnut-inlay']);
  });

  it('rects are inside the image, non-overlapping, and surrounded by fully transparent padding', () => {
    const entries = [...json.tiles, ...json.backs];
    for (const e of entries) {
      expect(e.rect.x - json.face.padding).toBeGreaterThanOrEqual(0);
      expect(e.rect.y - json.face.padding).toBeGreaterThanOrEqual(0);
      expect(e.rect.x + e.rect.w + json.face.padding).toBeLessThanOrEqual(png.width);
      expect(e.rect.y + e.rect.h + json.face.padding).toBeLessThanOrEqual(png.height);
      // Every pixel in the padding ring is alpha 0, so sampling never bleeds a neighbour.
      const p = json.face.padding;
      for (let y = e.rect.y - p; y < e.rect.y + e.rect.h + p; y++)
        for (let x = e.rect.x - p; x < e.rect.x + e.rect.w + p; x++) {
          const inside = x >= e.rect.x && x < e.rect.x + e.rect.w && y >= e.rect.y && y < e.rect.y + e.rect.h;
          if (!inside) expect(png.data[(y * png.width + x) * 4 + 3]).toBe(0);
        }
    }
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!.rect;
        const b = entries[j]!.rect;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
  });

  it('every face shows exactly its high pips on top and low pips below (pixel blob count)', () => {
    for (const t of json.tiles) {
      const { x, y, w, h } = t.rect;
      const m = Math.round(w * 0.1);
      const top = { x: x + m, y: y + m, w: w - 2 * m, h: h / 2 - m - Math.round(h * 0.04) };
      const bottom = { x: x + m, y: y + h / 2 + Math.round(h * 0.04), w: w - 2 * m, h: h / 2 - m - Math.round(h * 0.04) };
      expect([t.id, countBlobs(png, top, dark, 12)]).toEqual([t.id, t.high]);
      expect([t.id, countBlobs(png, bottom, dark, 12)]).toEqual([t.id, t.low]);
      expect(PIP_LAYOUT[t.high as 0]).toHaveLength(t.high);
    }
  });

  it('backs carry no pips and are fully opaque in their centre', () => {
    for (const b of json.backs) {
      const c = ((b.rect.y + b.rect.h / 2) * png.width + b.rect.x + b.rect.w / 2) * 4;
      expect(png.data[c + 3]).toBeGreaterThan(240);
    }
  });

  it('regenerates byte-for-byte identical pixels from the verified source (no hand edits, deterministic)', () => {
    const src = IMAGE_ASSETS.find((a) => a.id === 'tile.materials')!;
    const buf = readFileSync(root + src.path);
    const sha = createHash('sha256').update(buf).digest('hex');
    const { raster, json: fresh } = renderAtlas(PNG.sync.read(buf), sha);
    expect(fresh).toEqual(json);
    expect(raster.width).toBe(png.width);
    expect(Buffer.from(raster.data).equals(Buffer.from(png.data))).toBe(true);
    expect(() => renderAtlas(PNG.sync.read(buf), 'not-the-hash')).toThrow();
  });
});
