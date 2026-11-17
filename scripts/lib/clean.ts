/**
 * Edge cleaning for transparent character sprites (used by build-cast.ts and build-derivatives.ts). Works on
 * one frame's cell in place (RGBA, premultiplied NOT assumed), only ever in a NEW derivative:
 *   1. stray specks — alpha islands outside the figure (8-connected, alpha > 8): only the largest is kept;
 *   2. colour fringes — semi-transparent pixels whose colour differs from the nearby opaque body by more
 *      than `fringe` are recoloured from it; orphan fringe with no opaque neighbour is cleared only when it
 *      is BRIGHT and saturated (the red/yellow lines), never dark hair wisps.
 */
export interface CleanStats {
  specks: number;
  speckPixels: number;
  fringeBefore: number;
  fringeAfter: number;
  orphanCleared: number;
}

export function cleanCell(buf: Buffer, cw: number, ch: number, FRINGE = 64, RADIUS = 4): CleanStats {
  let specks = 0;
  let speckPixels = 0;
  let fringeBefore = 0;
  let fringeAfter = 0;
  let orphanCleared = 0;
  const a = (x: number, y: number) => buf[(y * cw + x) * 4 + 3]!;
  // 1. Connected components (alpha > 8, 8-connected): keep the largest.
  const label = new Int32Array(cw * ch).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < cw * ch; i++) {
    if (label[i] !== -1 || buf[i * 4 + 3]! <= 8) continue;
    const id = sizes.length;
    let n = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      n++;
      const x = p % cw;
      const y = (p - x) / cw;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const q = ny * cw + nx;
          if (label[q] === -1 && buf[q * 4 + 3]! > 8) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    sizes.push(n);
  }
  const keep = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < cw * ch; i++) {
    if (label[i] !== -1 && label[i] !== keep) {
      buf[i * 4 + 3] = 0;
      speckPixels++;
    } else if (label[i] === -1) buf[i * 4 + 3] = 0; // alpha ≤ 8 haze outside the figure
  }
  specks += sizes.length - 1;
  // 2. Fringe: semi-transparent pixels whose colour clashes with the local opaque body.
  const localOpaque = (x: number, y: number): [number, number, number] | null => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -RADIUS; dy <= RADIUS; dy++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || a(nx, ny) < 250) continue;
        const o = (ny * cw + nx) * 4;
        r += buf[o]!;
        g += buf[o + 1]!;
        b += buf[o + 2]!;
        n++;
      }
    return n ? [r / n, g / n, b / n] : null;
  };
  const fringe = (count: boolean) => {
    let k = 0;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const al = a(x, y);
        if (al <= 8 || al >= 250) continue;
        const o = (y * cw + x) * 4;
        const m = localOpaque(x, y);
        if (!m) {
          const mx = Math.max(buf[o]!, buf[o + 1]!, buf[o + 2]!);
          const mn = Math.min(buf[o]!, buf[o + 1]!, buf[o + 2]!);
          // Only BRIGHT saturated colour (the red/yellow fringe lines); dark hair wisps are saturated too but never bright.
          if (mx > 170 && (mx - mn) / mx > 0.6) {
            k++;
            if (!count) {
              buf[o + 3] = 0;
              orphanCleared++;
            }
          }
          continue;
        }
        const d = Math.max(Math.abs(buf[o]! - m[0]), Math.abs(buf[o + 1]! - m[1]), Math.abs(buf[o + 2]! - m[2]));
        if (d > FRINGE) {
          k++;
          if (!count) [buf[o], buf[o + 1], buf[o + 2]] = [Math.round(m[0]), Math.round(m[1]), Math.round(m[2])];
        }
      }
    return k;
  };
  fringeBefore += fringe(true);
  fringe(false);
  fringeAfter += fringe(true);
  return { specks, speckPixels, fringeBefore, fringeAfter, orphanCleared };
}
