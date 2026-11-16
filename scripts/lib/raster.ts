/**
 * Minimal deterministic raster helpers (no native deps) for generating
 * derived assets. All operations are pure functions of their inputs.
 */
import type { Rect, RgbaImage } from './measure';

export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * Area-averaging (box filter) resample of `rect` from `src` to outW×outH,
 * computed in premultiplied alpha so transparent edges don't darken.
 */
export function cropResize(src: RgbaImage, rect: Rect, outW: number, outH: number): Raster {
  const out = createRaster(outW, outH);
  const sx = rect.w / outW;
  const sy = rect.h / outH;
  for (let oy = 0; oy < outH; oy++) {
    const y0 = rect.y + oy * sy;
    const y1 = y0 + sy;
    for (let ox = 0; ox < outW; ox++) {
      const x0 = rect.x + ox * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (y * src.width + x) * 4;
          const pa = (src.data[i + 3] ?? 0) / 255;
          r += (src.data[i] ?? 0) * pa * w;
          g += (src.data[i + 1] ?? 0) * pa * w;
          b += (src.data[i + 2] ?? 0) * pa * w;
          a += pa * w;
          wsum += w;
        }
      }
      const o = (oy * outW + ox) * 4;
      const alpha = a / wsum;
      out.data[o] = alpha > 0 ? Math.round(r / a) : 0;
      out.data[o + 1] = alpha > 0 ? Math.round(g / a) : 0;
      out.data[o + 2] = alpha > 0 ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/** Source-over composite of a solid colour with fractional coverage. */
function blendPixel(img: Raster, x: number, y: number, rgb: readonly [number, number, number], alpha: number): void {
  if (alpha <= 0 || x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const da = img.data[i + 3]! / 255;
  const oa = alpha + da * (1 - alpha);
  for (let c = 0; c < 3; c++) {
    const v = (rgb[c]! * alpha + img.data[i + c]! * da * (1 - alpha)) / (oa || 1);
    img.data[i + c] = Math.round(v);
  }
  img.data[i + 3] = Math.round(oa * 255);
}

/** Anti-aliased filled circle using 8×8 supersampling per pixel. */
export function fillCircle(img: Raster, cx: number, cy: number, r: number, rgb: readonly [number, number, number], opacity = 1): void {
  const SS = 8;
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        const py = y + (sy + 0.5) / SS - cy;
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - cx;
          if (px * px + py * py <= r2) hits++;
        }
      }
      blendPixel(img, x, y, rgb, (hits / (SS * SS)) * opacity);
    }
  }
}

export function blit(dst: Raster, src: Raster, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width * 4;
    const d = ((dy + y) * dst.width + dx) * 4;
    dst.data.set(src.data.subarray(s, s + src.width * 4), d);
  }
}

/** Count connected components (4-neighbour) of pixels matching `pred` inside `rect`, ignoring blobs smaller than `minSize`. */
export function countBlobs(img: RgbaImage, rect: Rect, pred: (i: number) => boolean, minSize = 4): number {
  const seen = new Uint8Array(rect.w * rect.h);
  let count = 0;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const k = y * rect.w + x;
      if (seen[k]) continue;
      const gi = ((rect.y + y) * img.width + rect.x + x) * 4;
      if (!pred(gi)) continue;
      let size = 0;
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        size++;
        const cx = cur % rect.w;
        const cy = (cur - cx) / rect.w;
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= rect.w || ny >= rect.h) continue;
          const nk = ny * rect.w + nx;
          if (seen[nk]) continue;
          if (!pred(((rect.y + ny) * img.width + rect.x + nx) * 4)) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      if (size >= minSize) count++;
    }
  }
  return count;
}
