/**
 * npm run assets:derive — build runtime WebP derivatives of the runtime art.
 *
 * Originals in assets/art/ (and the generated tile atlas PNG) are only READ.
 * Each derivative is a NEW file under assets/generated/web/ with the SAME pixel
 * dimensions as its source, so every frame rectangle in the manifest stays
 * valid. Output metadata (bytes, sha256, encoder settings, measured edge error)
 * is written to src/assets/derivatives.json, which `npm run assets:verify`
 * re-checks.
 *
 * Quality gates, measured per file (premultiplied RGBA, 0–255):
 *   - mean absolute error over all pixels;
 *   - p99 error over EDGE pixels (0 < alpha < 255) — a lossy encoder that
 *     smears colour into semi-transparent edges is what produces halos;
 *   - alpha must be bit-exact (alphaQuality 100 / lossless).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { IMAGE_ASSETS } from '../src/assets/manifest.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Encoder settings per runtime asset. Lossless for the tile atlas: pip geometry must be exact. */
export const DERIVE: Record<string, { file: string; lossless?: boolean; quality?: number; maxMeanErr?: number }> = {
  // Opaque backdrops, always shown under a darkening gradient: a slightly looser mean-error gate.
  'env.neighborhood-patio': { file: 'neighborhood-patio.webp', quality: 82, maxMeanErr: 6 },
  'table.weathered': { file: 'weathered-tabletop.webp', quality: 82, maxMeanErr: 6 },
  'cousin.atlas.portrait': { file: 'cousin-portrait-atlas.webp', quality: 88 },
  'cousin.anim.slam': { file: 'cousin-slam-strip.webp', quality: 86 },
  'fx.sheet': { file: 'effects-sheet.webp', quality: 88 },
  'tile.atlas': { file: 'double-six-atlas.webp', lossless: true },
};

const LIMITS = { meanErr: 3, edgeP99: 20 };

async function rgba(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const out: Record<string, unknown>[] = [];
let failed = false;
for (const [id, cfg] of Object.entries(DERIVE)) {
  const src = IMAGE_ASSETS.find((a) => a.id === id);
  if (!src) throw new Error(`unknown asset ${id}`);
  const input = readFileSync(join(root, src.path));
  const path = `assets/generated/web/${cfg.file}`;
  mkdirSync(dirname(join(root, path)), { recursive: true });
  const enc = cfg.lossless
    ? sharp(input).webp({ lossless: true, effort: 6, exact: true })
    : sharp(input).webp({ quality: cfg.quality, alphaQuality: 100, effort: 6, smartSubsample: true });
  const webp = await enc.toBuffer();
  writeFileSync(join(root, path), webp);

  const a = await rgba(input);
  const b = await rgba(webp);
  if (a.w !== b.w || a.h !== b.h) throw new Error(`${id}: derivative changed dimensions`);
  let sum = 0;
  let alphaDiff = 0;
  const edge: number[] = [];
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3]!;
    const ba = b.data[i + 3]!;
    if (aa !== ba) alphaDiff++;
    let e = 0;
    for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs((a.data[i + c]! * aa) / 255 - (b.data[i + c]! * ba) / 255));
    sum += e;
    if (aa > 0 && aa < 255) edge.push(e);
  }
  edge.sort((x, y) => x - y);
  const meanErr = sum / (a.data.length / 4);
  const edgeP99 = edge.length ? edge[Math.floor(edge.length * 0.99)]! : 0;
  const ok = meanErr <= (cfg.maxMeanErr ?? LIMITS.meanErr) && edgeP99 <= LIMITS.edgeP99 && alphaDiff === 0;
  if (!ok) failed = true;
  out.push({
    id,
    of: id,
    path,
    format: 'webp',
    encoder: cfg.lossless ? 'lossless' : `q${cfg.quality} alphaQuality100 smartSubsample`,
    width: b.w,
    height: b.h,
    bytes: webp.length,
    sha256: createHash('sha256').update(webp).digest('hex'),
    sourceBytes: input.length,
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    maxMeanErr: cfg.maxMeanErr ?? LIMITS.meanErr,
    meanErr: +meanErr.toFixed(2),
    edgeP99: +edgeP99.toFixed(1),
    edgePixels: edge.length,
    alphaExact: alphaDiff === 0,
  });
  console.log(`${ok ? '✓' : '✗'} ${id}: ${(input.length / 1024).toFixed(0)} KB → ${(webp.length / 1024).toFixed(0)} KB, mean err ${meanErr.toFixed(2)}, edge p99 ${edgeP99.toFixed(1)}, alpha ${alphaDiff === 0 ? 'exact' : `${alphaDiff} px differ`}`);
}
writeFileSync(join(root, 'src/assets/derivatives.json'), JSON.stringify({ generator: 'scripts/build-derivatives.ts', sharp: sharp.versions.sharp, libwebp: sharp.versions.webp, limits: LIMITS, derivatives: out }, null, 1) + '\n');
if (failed) {
  console.error('derivative quality gate failed');
  process.exit(1);
}
