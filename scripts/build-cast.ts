/**
 * npm run assets:cast — runtime derivatives of the four story cast atlases (Vale, Luz, Marisol, Rafa).
 *
 * The originals in assets/art/characters/ are only READ. For each frame (searched inside its manifest
 * cell) this measures and repairs, in a NEW file:
 *   - stray specks: alpha islands outside the figure (8-connected, alpha > 8); only the largest
 *     component (the figure) is kept;
 *   - colour fringes: semi-transparent edge pixels whose colour differs from the nearby opaque body by
 *     more than FRINGE (the red/yellow lines along some bottom crop edges). Their colour is replaced by
 *     the local opaque colour (alpha untouched); orphan fringe with no opaque neighbour is cleared only
 *     when it is BRIGHT and saturated (max channel > 170) — dark hair wisps are kept;
 *   - anchors: the BASELINE (last row where the bust is ≥ 30% opaque across the tight rect — the crop
 *     line that sits on the panel edge), the head top, and the bust's centre x at the baseline.
 * Frames are repacked into uniform cells with baselines and centres aligned, so swapping expressions
 * never makes a figure jump. The WebP is gated against the CLEANED pixels (mean error, edge p99, exact
 * alpha). Output: assets/generated/web/cast-<who>.webp and src/assets/cast.json (verified by
 * `npm run assets:verify`).
 *
 * Expression MEANINGS were verified by visual inspection of every cropped cell (the generated cell order
 * was not trusted). They're recorded below as `meaning`. The runtime maps dialogue expressions to these
 * frames in src/story/expressions.ts, and an expression a character lacks falls back to e1 (their
 * composed default).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { IMAGE_ASSETS } from '../src/assets/manifest.ts';
import type { ImageAsset } from '../src/assets/types.ts';
import { cleanCell } from './lib/clean.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const CAST = [
  { who: 'vale', id: 'cast.vale.atlas', name: 'Tomás Vale', inspection: ['composed, level gaze', 'pleasant public smile', 'appraising, one brow raised', 'self-satisfied smile, chin up', 'cool, narrowed eyes', 'hard stare, brows down', 'startled, eyes wide', 'tight smirk'] },
  { who: 'luz', id: 'cast.luz.atlas', name: 'Luz Rivera', inspection: ['calm, attentive', 'warm smile', 'serious, brows drawn', 'speaking, open mouth', 'concerned, brows raised', 'firm, level', 'gentle closed smile', 'knowing soft smile, eyes narrowed'] },
  { who: 'marisol', id: 'cast.marisol.atlas', name: 'Marisol Vélez', inspection: ['composed, slight smile', 'wry half-smile, eyes squinted', 'worried, brows raised, lips parted', 'determined, set jaw', 'pained, brows tilted', 'warm smile', 'suspicious frown', 'broad laughing smile'] },
  { who: 'rafa', id: 'cast.rafa.atlas', name: 'Tío Rafa', inspection: ['calm, looking off', 'laughing', 'sly grin', 'looking up, wistful', 'sad, brows tilted', 'downcast, eyes lowered', 'proud, chin up', 'broad warm smile'] },
] as const;
const FRINGE = 64;
const RADIUS = 4;
const PAD = 8;
const QUALITY = 86;
const LIMITS = { meanErr: 3, edgeP99: 20 };

interface FrameOut {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  baselineY: number;
  headTopY: number;
  /** What the frame shows, verified by visual inspection. */
  meaning: string;
}

const report: Record<string, unknown>[] = [];
let failed = false;
mkdirSync(join(root, 'assets/generated/web'), { recursive: true });

for (const c of CAST) {
  const src = IMAGE_ASSETS.find((a) => a.id === c.id)! as unknown as ImageAsset;
  const input = readFileSync(join(root, src.path));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const px = (x: number, y: number) => (y * W + x) * 4;
  const frames = src.frames!;
  const cleaned: { buf: Buffer; w: number; h: number; base: number; top: number; cx: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = [];
  let specks = 0;
  let speckPixels = 0;
  let fringeBefore = 0;
  let fringeAfter = 0;
  let orphanCleared = 0;
  for (const f of frames) {
    const { x: cx0, y: cy0, w: cw, h: ch } = f.cell;
    // Copy the cell.
    const buf = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) data.copy(buf, y * cw * 4, px(cx0, cy0 + y), px(cx0, cy0 + y) + cw * 4);
    const a = (x: number, y: number) => buf[(y * cw + x) * 4 + 3]!;
    const st = cleanCell(buf, cw, ch, FRINGE, RADIUS);
    specks += st.specks;
    speckPixels += st.speckPixels;
    fringeBefore += st.fringeBefore;
    fringeAfter += st.fringeAfter;
    orphanCleared += st.orphanCleared;
    // 3. Anchors and tight bbox.
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        if (a(x, y) > 8) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    const bw = x1 - x0 + 1;
    let base = y1;
    for (let y = y1; y >= y0; y--) {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (a(x, y) >= 250) n++;
      if (n >= 0.3 * bw) {
        base = y;
        break;
      }
    }
    let top = y0;
    for (let y = y0; y <= y1; y++) {
      let any = false;
      for (let x = x0; x <= x1 && !any; x++) any = a(x, y) > 128;
      if (any) {
        top = y;
        break;
      }
    }
    let sx = 0, sn = 0;
    for (let y = Math.max(y0, base - 40); y <= base; y++)
      for (let x = x0; x <= x1; x++)
        if (a(x, y) >= 250) {
          sx += x;
          sn++;
        }
    cleaned.push({ buf, w: cw, h: ch, base, top, cx: sn ? sx / sn : (x0 + x1) / 2, bbox: { x0, y0, x1, y1 } });
  }
  // Uniform cells: baselines and centres aligned.
  const left = Math.max(...cleaned.map((f) => f.cx - f.bbox.x0));
  const right = Math.max(...cleaned.map((f) => f.bbox.x1 - f.cx));
  const above = Math.max(...cleaned.map((f) => f.base - f.bbox.y0));
  const below = Math.max(...cleaned.map((f) => f.bbox.y1 - f.base));
  const cellW = Math.ceil(left + right) + 2 * PAD;
  const cellH = Math.ceil(above + below) + 2 * PAD + 1;
  const cols = 4;
  const rows = Math.ceil(cleaned.length / cols);
  const out = Buffer.alloc(cellW * cols * cellH * rows * 4);
  const OW = cellW * cols;
  const outFrames: FrameOut[] = [];
  cleaned.forEach((f, i) => {
    const gx = (i % cols) * cellW;
    const gy = Math.floor(i / cols) * cellH;
    const ox = Math.round(gx + PAD + left - f.cx);
    const oy = gy + PAD + above - f.base;
    for (let y = f.bbox.y0; y <= f.bbox.y1; y++)
      for (let x = f.bbox.x0; x <= f.bbox.x1; x++) {
        const s = (y * f.w + x) * 4;
        if (f.buf[s + 3] === 0) continue;
        const d = ((oy + y) * OW + ox + x) * 4;
        f.buf.copy(out, d, s, s + 4);
      }
    outFrames.push({ id: frames[i]!.id, x: gx, y: gy, w: cellW, h: cellH, anchorX: Math.round(PAD + left), baselineY: PAD + above, headTopY: PAD + above - (f.base - f.top), meaning: c.inspection[i]! });
  });
  // Placement drift in the ORIGINAL sheet (how much frames would jump without the repack).
  const baseRel = cleaned.map((f) => f.base); // cell-relative
  const drift = {
    baselinePx: Math.max(...baseRel) - Math.min(...baseRel),
    centerPx: +(Math.max(...cleaned.map((f) => f.cx)) - Math.min(...cleaned.map((f) => f.cx))).toFixed(1),
    figureHeightPx: Math.max(...cleaned.map((f) => f.base - f.top)) - Math.min(...cleaned.map((f) => f.base - f.top)),
  };
  const png = await sharp(out, { raw: { width: OW, height: cellH * rows, channels: 4 } }).png().toBuffer();
  const webp = await sharp(out, { raw: { width: OW, height: cellH * rows, channels: 4 } }).webp({ quality: QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
  const path = `assets/generated/web/cast-${c.who}.webp`;
  writeFileSync(join(root, path), webp);
  // Gate against the cleaned pixels.
  const dec = await sharp(webp).ensureAlpha().raw().toBuffer();
  let sum = 0;
  let alphaDiff = 0;
  const edge: number[] = [];
  for (let i = 0; i < out.length; i += 4) {
    const aa = out[i + 3]!;
    const ba = dec[i + 3]!;
    if (aa !== ba) alphaDiff++;
    let e = 0;
    for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs((out[i + k]! * aa) / 255 - (dec[i + k]! * ba) / 255));
    sum += e;
    if (aa > 0 && aa < 255) edge.push(e);
  }
  edge.sort((x, y) => x - y);
  const meanErr = sum / (out.length / 4);
  const edgeP99 = edge.length ? edge[Math.floor(edge.length * 0.99)]! : 0;
  const ok = meanErr <= LIMITS.meanErr && edgeP99 <= LIMITS.edgeP99 && alphaDiff === 0;
  if (!ok) failed = true;
  report.push({
    id: `${c.id}.web`,
    of: c.id,
    who: c.who,
    name: c.name,
    path,
    format: 'webp',
    encoder: `q${QUALITY} alphaQuality100 smartSubsample`,
    width: OW,
    height: cellH * rows,
    bytes: webp.length,
    sha256: createHash('sha256').update(webp).digest('hex'),
    sourceBytes: input.length,
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    cleanedPngSha256: createHash('sha256').update(png).digest('hex'),
    meanErr: +meanErr.toFixed(2),
    edgeP99: +edgeP99.toFixed(1),
    alphaExact: alphaDiff === 0,
    repairs: { specksRemoved: specks, speckPixels, fringePixelsBefore: fringeBefore, fringePixelsAfter: fringeAfter, orphanFringeCleared: orphanCleared },
    sourceDrift: drift,
    defaultFrame: 'e1',
    expressionLabels: 'verified by visual inspection of every frame (src/story/expressions.ts maps dialogue expressions to them)',
    frames: outFrames,
  });
  console.log(`${ok ? '✓' : '✗'} ${c.id}: ${(input.length / 1024).toFixed(0)} KB → ${(webp.length / 1024).toFixed(0)} KB (${OW}×${cellH * rows}), mean err ${meanErr.toFixed(2)}, edge p99 ${edgeP99.toFixed(1)}, alpha ${alphaDiff ? `${alphaDiff} px differ` : 'exact'} · specks ${specks} (${speckPixels} px) · fringe ${fringeBefore} → ${fringeAfter} (orphans cleared ${orphanCleared}) · source drift baseline ${drift.baselinePx}px centre ${drift.centerPx}px height ${drift.figureHeightPx}px`);
}
writeFileSync(join(root, 'src/assets/cast.json'), JSON.stringify({ generator: 'scripts/build-cast.ts', sharp: sharp.versions.sharp, limits: { ...LIMITS, fringe: FRINGE, radius: RADIUS }, cast: report }, null, 1) + '\n');
if (failed) {
  console.error('cast derivative quality gate failed');
  process.exit(1);
}
