/**
 * Pure sprite-sheet measurement helpers used by `npm run assets:verify` and
 * `npm run assets:measure`.
 *
 * Nothing here assumes a sheet is evenly packed. The caller supplies only the
 * expected number of rows and columns; cut lines are found at the emptiest
 * row/column inside a search window around each nominal boundary, and every
 * frame rectangle is the tight bounding box of the content inside its cell.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array | Uint8ClampedArray | Buffer;
}

export type DetectMode =
  /** Content = alpha above `alphaThreshold`. */
  | { kind: 'alpha'; alphaThreshold: number }
  /** Content = RGB distance (sum of abs diffs) from the corner-sampled background above `distance`. */
  | { kind: 'background'; distance: number };

export interface MeasureLayout {
  rows: number;
  cols: number;
  detect: DetectMode;
}

export interface MeasuredFrame {
  /** Tight content bounding box inside the cell. */
  rect: Rect;
  /** The cell the frame was searched in (bounded by detected cut lines). */
  cell: Rect;
  /** True when content crosses a cut line, i.e. the frame bleeds into a neighbour cell. */
  touchesNeighbor: boolean;
}

export function buildMask(img: RgbaImage, detect: DetectMode): Uint8Array {
  const { width, height, data } = img;
  const mask = new Uint8Array(width * height);
  if (detect.kind === 'alpha') {
    for (let i = 0; i < width * height; i++) {
      mask[i] = (data[i * 4 + 3] ?? 0) > detect.alphaThreshold ? 1 : 0;
    }
    return mask;
  }
  const bg = sampleBackground(img);
  for (let i = 0; i < width * height; i++) {
    const d =
      Math.abs((data[i * 4] ?? 0) - bg[0]) +
      Math.abs((data[i * 4 + 1] ?? 0) - bg[1]) +
      Math.abs((data[i * 4 + 2] ?? 0) - bg[2]);
    mask[i] = d > detect.distance ? 1 : 0;
  }
  return mask;
}

/** Mean RGB of four 16x16 corner patches. */
export function sampleBackground(img: RgbaImage): [number, number, number] {
  const { width, height, data } = img;
  const s = Math.min(16, width, height);
  const sum = [0, 0, 0];
  let n = 0;
  for (const [ox, oy] of [
    [0, 0],
    [width - s, 0],
    [0, height - s],
    [width - s, height - s],
  ] as const) {
    for (let y = oy; y < oy + s; y++) {
      for (let x = ox; x < ox + s; x++) {
        const i = (y * width + x) * 4;
        sum[0]! += data[i] ?? 0;
        sum[1]! += data[i + 1] ?? 0;
        sum[2]! += data[i + 2] ?? 0;
        n++;
      }
    }
  }
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

/** Occupancy profile: count of mask pixels per row (axis 'y') or column (axis 'x') inside a region. */
function profile(mask: Uint8Array, width: number, region: Rect, axis: 'x' | 'y'): number[] {
  const len = axis === 'x' ? region.w : region.h;
  const out = new Array<number>(len).fill(0);
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (mask[y * width + x]) out[axis === 'x' ? x - region.x : y - region.y]!++;
    }
  }
  return out;
}

/**
 * Find `parts - 1` cut positions in a profile. Each cut is the centre of the
 * lowest-occupancy run inside ±30% of a part width around the nominal boundary.
 */
export function findCuts(prof: number[], parts: number): { at: number; occupancy: number }[] {
  const n = prof.length;
  const cuts: { at: number; occupancy: number }[] = [];
  for (let k = 1; k < parts; k++) {
    const nominal = (n * k) / parts;
    const half = (n / parts) * 0.3;
    const a = Math.max(0, Math.floor(nominal - half));
    const b = Math.min(n, Math.ceil(nominal + half));
    let min = Infinity;
    for (let i = a; i < b; i++) min = Math.min(min, prof[i]!);
    const idx: number[] = [];
    for (let i = a; i < b; i++) if (prof[i] === min) idx.push(i);
    // Choose the middle of the longest run of minima for stability.
    let bestStart = idx[0]!;
    let bestLen = 0;
    let runStart = idx[0]!;
    for (let j = 0; j < idx.length; j++) {
      if (j > 0 && idx[j] !== idx[j - 1]! + 1) runStart = idx[j]!;
      const runLen = idx[j]! - runStart + 1;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    }
    cuts.push({ at: bestStart + Math.floor(bestLen / 2), occupancy: min });
  }
  return cuts;
}

function bbox(mask: Uint8Array, width: number, region: Rect): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (mask[y * width + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Measure frames in row-major order. Throws if any cell is empty. */
export function measureFrames(img: RgbaImage, layout: MeasureLayout): MeasuredFrame[] {
  const { width, height } = img;
  const mask = buildMask(img, layout.detect);
  const full: Rect = { x: 0, y: 0, w: width, h: height };
  const rowCuts = findCuts(profile(mask, width, full, 'y'), layout.rows);
  const rowEdges = [0, ...rowCuts.map((c) => c.at), height];
  const frames: MeasuredFrame[] = [];
  for (let r = 0; r < layout.rows; r++) {
    const band: Rect = { x: 0, y: rowEdges[r]!, w: width, h: rowEdges[r + 1]! - rowEdges[r]! };
    const colCuts = findCuts(profile(mask, width, band, 'x'), layout.cols);
    const colEdges = [0, ...colCuts.map((c) => c.at), width];
    for (let c = 0; c < layout.cols; c++) {
      const cell: Rect = {
        x: colEdges[c]!,
        y: band.y,
        w: colEdges[c + 1]! - colEdges[c]!,
        h: band.h,
      };
      const rect = bbox(mask, width, cell);
      if (!rect) throw new Error(`Empty cell at row ${r}, col ${c}`);
      const touchesNeighbor =
        (c > 0 && colCuts[c - 1]!.occupancy > 0) ||
        (c < layout.cols - 1 && colCuts[c]!.occupancy > 0) ||
        (r > 0 && rowCuts[r - 1]!.occupancy > 0) ||
        (r < layout.rows - 1 && rowCuts[r]!.occupancy > 0);
      frames.push({ rect, cell, touchesNeighbor });
    }
  }
  return frames;
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function rectWithin(r: Rect, width: number, height: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= width && r.y + r.h <= height;
}
