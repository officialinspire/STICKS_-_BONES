/**
 * npm run assets:verify   — re-measure every source image and fail on any drift
 *                           from src/assets/manifest.ts (bytes, sha256, PNG
 *                           dimensions, alpha, frame rectangles), unregistered
 *                           files, or runtime URL gaps.
 * npm run assets:measure  — print freshly measured values as JSON (for updating
 *                           the manifest after the owner supplies new art).
 *
 * This script only READS source art. It never rewrites, re-encodes or moves it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { IMAGE_ASSETS, MISSING_ASSETS } from '../src/assets/manifest.ts';
import { RUNTIME_ASSET_URLS } from '../src/assets/urls.ts';
import { measureFrames, rectsEqual, rectWithin } from './lib/measure.ts';

const RUNTIME_ASSET_IDS: readonly string[] = Object.keys(RUNTIME_ASSET_URLS);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const measureOnly = process.argv.includes('--measure');

const errors: string[] = [];
const notes: string[] = [];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function pngHeader(buf: Buffer): { width: number; height: number; colorType: number } {
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('not a PNG signature');
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') throw new Error('missing IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf.readUInt8(25) };
}

const measured: Record<string, unknown>[] = [];
const ids = new Set<string>();

for (const asset of IMAGE_ASSETS) {
  const tag = `[${asset.id}]`;
  if (ids.has(asset.id)) errors.push(`${tag} duplicate asset id`);
  ids.add(asset.id);

  const full = join(repoRoot, asset.path);
  if (!existsSync(full)) {
    errors.push(`${tag} missing file ${asset.path}`);
    continue;
  }
  const buf = readFileSync(full);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  let header: ReturnType<typeof pngHeader>;
  try {
    header = pngHeader(buf);
  } catch (e) {
    errors.push(`${tag} ${(e as Error).message}`);
    continue;
  }
  const hasAlpha = header.colorType === 4 || header.colorType === 6;
  const record: Record<string, unknown> = {
    id: asset.id,
    path: asset.path,
    bytes: buf.length,
    sha256,
    width: header.width,
    height: header.height,
    hasAlpha,
  };

  if (!measureOnly) {
    if (buf.length !== asset.bytes) errors.push(`${tag} size ${buf.length} != manifest ${asset.bytes}`);
    if (sha256 !== asset.sha256) errors.push(`${tag} sha256 changed — source art was altered or replaced`);
    if (header.width !== asset.width || header.height !== asset.height)
      errors.push(`${tag} dimensions ${header.width}x${header.height} != manifest ${asset.width}x${asset.height}`);
    if (hasAlpha !== asset.hasAlpha) errors.push(`${tag} alpha ${hasAlpha} != manifest ${asset.hasAlpha}`);
    if ('duplicateOf' in asset) {
      const orig = IMAGE_ASSETS.find((a) => a.id === asset.duplicateOf);
      if (!orig) errors.push(`${tag} duplicateOf unknown id ${asset.duplicateOf}`);
      else if (orig.sha256 !== sha256) errors.push(`${tag} is no longer identical to ${orig.id}`);
    }
  }

  if ('layout' in asset && asset.layout) {
    const png = PNG.sync.read(buf);
    const frames = measureFrames(png, asset.layout);
    record.frames = frames;
    if (!measureOnly) {
      const declared = asset.frames;
      if (frames.length !== declared.length) {
        errors.push(`${tag} measured ${frames.length} frames, manifest has ${declared.length}`);
      } else {
        const frameIds = new Set<string>();
        declared.forEach((f, i) => {
          const m = frames[i]!;
          if (frameIds.has(f.id)) errors.push(`${tag} duplicate frame id ${f.id}`);
          frameIds.add(f.id);
          if (!rectWithin(f.rect, asset.width, asset.height)) errors.push(`${tag}/${f.id} rect out of bounds`);
          if (!rectWithin(f.cell, asset.width, asset.height)) errors.push(`${tag}/${f.id} cell out of bounds`);
          if (!rectsEqual(f.rect, m.rect))
            errors.push(`${tag}/${f.id} rect ${JSON.stringify(f.rect)} != measured ${JSON.stringify(m.rect)}`);
          if (!rectsEqual(f.cell, m.cell))
            errors.push(`${tag}/${f.id} cell ${JSON.stringify(f.cell)} != measured ${JSON.stringify(m.cell)}`);
          if (f.touchesNeighbor !== m.touchesNeighbor)
            errors.push(`${tag}/${f.id} touchesNeighbor ${f.touchesNeighbor} != measured ${m.touchesNeighbor}`);
          if (m.touchesNeighbor && asset.status === 'runtime')
            notes.push(`${tag}/${f.id} touches a neighbour cell; draw with care`);
        });
      }
    }
  }
  measured.push(record);
}

if (measureOnly) {
  console.log(JSON.stringify(measured, null, 2));
  process.exit(0);
}

// Every image under assets/ must be registered (no silently added or renamed art).
const registered = new Set<string>(IMAGE_ASSETS.map((a) => a.path));
for (const file of walk(join(repoRoot, 'assets'))) {
  const rel = relative(repoRoot, file).split('\\').join('/');
  if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(rel) && !registered.has(rel))
    errors.push(`unregistered image ${rel} — add it to src/assets/manifest.ts`);
  if (/\.(mp3|ogg|wav|m4a|aac|flac|mp4|webm|mov)$/i.test(rel))
    notes.push(`media file present but not yet catalogued: ${rel}`);
}

// Stray art at the repo root (where uploads land) should be moved under assets/art.
for (const name of readdirSync(repoRoot)) {
  if (/\.(png|jpe?g|webp|mp3|ogg|wav|mp4|webm)$/i.test(name))
    errors.push(`uncatalogued upload at repository root: ${name}`);
}

// Runtime URL registry must match manifest status.
const runtimeInManifest = IMAGE_ASSETS.filter((a) => a.status === 'runtime').map((a) => a.id);
for (const id of runtimeInManifest)
  if (!RUNTIME_ASSET_IDS.includes(id)) errors.push(`[${id}] status runtime but no URL in src/assets/urls.ts`);
for (const id of RUNTIME_ASSET_IDS) {
  const a = IMAGE_ASSETS.find((x) => x.id === id);
  if (!a) errors.push(`urls.ts references unknown asset ${id}`);
  else if (a.status !== 'runtime') errors.push(`[${id}] bundled in urls.ts but status is ${a.status}`);
}

// Generated atlas: its JSON rectangle manifest must agree with the verified
// manifest frames and must reference the current source sheet.
{
  const atlas = IMAGE_ASSETS.find((a) => a.id === 'tile.atlas');
  const source = IMAGE_ASSETS.find((a) => a.id === 'tile.materials');
  const jsonPath = join(repoRoot, 'assets/generated/tiles/double-six-atlas.json');
  if (!atlas || !source || !existsSync(jsonPath)) errors.push('tile atlas or its JSON is missing — run npm run atlas:build');
  else {
    const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      source: { sha256: string };
      tiles: { id: string; high: number; low: number; rect: { x: number; y: number; w: number; h: number } }[];
      backs: { id: string; rect: { x: number; y: number; w: number; h: number } }[];
    };
    if (json.source.sha256 !== source.sha256) errors.push('[tile.atlas] JSON was built from a different source sheet');
    const frames = 'frames' in atlas ? atlas.frames : [];
    const ids = new Set<string>();
    for (const e of [...json.tiles, ...json.backs]) {
      if (ids.has(e.id)) errors.push(`[tile.atlas] duplicate id ${e.id}`);
      ids.add(e.id);
      const f = frames.find((x) => x.id === e.id);
      if (!f) errors.push(`[tile.atlas] JSON id ${e.id} has no manifest frame`);
      else if (!rectsEqual(f.rect, e.rect)) errors.push(`[tile.atlas] ${e.id} JSON rect differs from measured frame`);
    }
    for (const t of json.tiles) if (t.id !== `t${t.high}${t.low}` || t.low > t.high || t.high > 6) errors.push(`[tile.atlas] bad values for ${t.id}`);
    if (json.tiles.length !== 28) errors.push(`[tile.atlas] expected 28 faces, found ${json.tiles.length}`);
  }
}

for (const m of MISSING_ASSETS) notes.push(`missing (${m.kind}) ${m.id}: fallback = ${m.fallback}`);

console.log(`Checked ${IMAGE_ASSETS.length} image assets.`);
for (const n of notes) console.log(`  note: ${n}`);
if (errors.length) {
  console.error(`\n${errors.length} asset error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('All asset checks passed: files present, bytes/sha256/dimensions unchanged, frame rects re-measured exactly.');
