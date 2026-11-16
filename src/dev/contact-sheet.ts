/**
 * DEVELOPER-ONLY contact sheet (served by `npm run dev` at
 * /dev/contact-sheet.html; never part of the production build).
 * Shows every atlas face labelled by its manifest id, next to the SVG
 * fallback and at all four rotations, and asserts identity, bounds, alpha
 * padding and pip counts from the actual pixels.
 */
import { CANONICAL_TILE_IDS } from '../engine/tiles';
import type { TileId } from '../engine/types';
import { pipsOfId } from '../render/pips';
import { ATLAS_META } from '../render/tile-art';
import { dominoSvg } from '../ui/domino';
import { countBlobs } from '../../scripts/lib/raster';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function loadPixels(url: string): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function face(rect: { x: number; y: number; w: number; h: number }, rot: number): string {
  const { width, height, face: f, url } = ATLAS_META;
  const style = `background-image:url('${url}');background-size:${(width / f.width) * 100}% ${(height / f.height) * 100}%;background-position:${(rect.x / (width - f.width)) * 100}% ${(rect.y / (height - f.height)) * 100}%;transform:rotate(${rot}deg)`;
  return `<span class="f" style="${style}"></span>`;
}

async function main(): Promise<void> {
  const root = document.getElementById('sheet')!;
  type Entry = { id: string; rect: { x: number; y: number; w: number; h: number }; high?: number; low?: number };
  const { tiles, backs, url, width, height, face: f } = ATLAS_META;
  const entries: Entry[] = [...tiles, ...backs];
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });
  const ids = tiles.map((t) => t.id);
  add('28 faces', tiles.length === 28, `${tiles.length}`);
  add('unique ids', new Set([...ids, ...backs.map((b) => b.id)]).size === tiles.length + backs.length);
  add('canonical set', [...ids].sort().join() === [...CANONICAL_TILE_IDS].sort().join());
  for (const t of tiles) add(`${t.id} values`, t.id === `t${t.high}${t.low}` && t.high >= t.low && t.low >= 0 && t.high <= 6, `${t.high}|${t.low}`);
  const px = url ? await loadPixels(url) : null;
  add('atlas image loads with manifest dimensions', !!px && px.width === width && px.height === height, px ? `${px.width}×${px.height}` : 'missing');
  const perFace = new Map<string, string>();
  if (px) {
    const alpha = (x: number, y: number) => px.data[(y * px.width + x) * 4 + 3]!;
    const dark = (i: number) => px.data[i + 3]! > 200 && 0.299 * px.data[i]! + 0.587 * px.data[i + 1]! + 0.114 * px.data[i + 2]! < 110;
    for (const e of entries) {
      const r = e.rect;
      const inBounds = r.x - f.padding >= 0 && r.y - f.padding >= 0 && r.x + r.w + f.padding <= width && r.y + r.h + f.padding <= height;
      let padOk = inBounds;
      for (let x = r.x - f.padding; padOk && x < r.x + r.w + f.padding; x++)
        for (const y of [r.y - 1, r.y + r.h]) if (alpha(x, y) !== 0) padOk = false;
      for (let y = r.y - f.padding; padOk && y < r.y + r.h + f.padding; y++)
        for (const x of [r.x - 1, r.x + r.w]) if (alpha(x, y) !== 0) padOk = false;
      add(`${e.id} bounds + transparent padding`, inBounds && padOk);
      if (e.high !== undefined && e.low !== undefined) {
        const m = Math.round(r.w * 0.1);
        const band = Math.round(r.h * 0.04);
        const top = countBlobs(px, { x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h / 2 - m - band }, dark, 12);
        const bottom = countBlobs(px, { x: r.x + m, y: r.y + r.h / 2 + band, w: r.w - 2 * m, h: r.h / 2 - m - band }, dark, 12);
        const ok = top === e.high && bottom === e.low;
        perFace.set(e.id, `${top}|${bottom}`);
        add(`${e.id} pip pixels`, ok, `counted ${top}|${bottom}`);
      }
    }
  }
  const failed = checks.filter((c) => !c.ok);
  const cards = entries
    .map((e) => {
      const isFace = e.high !== undefined;
      const svg = isFace ? dominoSvg(pipsOfId(e.id as TileId).high, pipsOfId(e.id as TileId).low, { className: 'f' }) : '';
      const label = isFace ? `${e.id} · ${e.high}|${e.low}` : e.id;
      return `<figure data-id="${e.id}" data-counted="${perFace.get(e.id) ?? ''}"><figcaption><strong>${label}</strong><br><small>x${e.rect.x} y${e.rect.y} ${e.rect.w}×${e.rect.h}</small></figcaption>
        <div class="row">${face(e.rect, 0)}${svg}</div>
        <div class="row rot">${[90, 180, 270].map((r) => `<span class="cell">${face(e.rect, r)}<small>${r}°</small></span>`).join('')}</div></figure>`;
    })
    .join('');
  root.innerHTML = `
    <style>
      body{font:14px system-ui;background:#2b1a10;color:#f6ead2;margin:16px}
      h1{font-size:1.2rem}.summary{padding:8px 12px;border-radius:8px;background:${failed.length ? '#c8432b' : '#17807a'}}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
      figure{margin:0;background:#3a2414;border-radius:10px;padding:8px}
      .row{display:flex;gap:8px;align-items:center;margin-top:6px}
      .f{display:block;width:40px;height:80px;background-repeat:no-repeat}
      .rot .cell{display:grid;place-items:center;width:82px;height:82px}
      details{margin:12px 0}li.bad{color:#ffb4a8}
    </style>
    <h1>Double-six atlas — developer contact sheet</h1>
    <p class="summary" data-summary data-failed="${failed.length}" data-checks="${checks.length}">${failed.length ? `${failed.length} FAILED` : 'All checks passed'} · ${checks.length} checks · ${tiles.length} faces + ${backs.length} backs · identity from manifest ids</p>
    <details ${failed.length ? 'open' : ''}><summary>Checks</summary><ul>${checks.map((c) => `<li class="${c.ok ? '' : 'bad'}">${c.ok ? '✓' : '✗'} ${c.name} ${c.detail}</li>`).join('')}</ul></details>
    <div class="grid">${cards}</div>`;
}

void main();
