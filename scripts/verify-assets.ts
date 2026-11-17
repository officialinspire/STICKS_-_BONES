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
import { MUSIC } from '../src/assets/audio-manifest.ts';
import { RUNTIME_ASSET_URLS } from '../src/assets/urls.ts';
import { measureFrames, rectsEqual, rectWithin } from './lib/measure.ts';
import sharp from 'sharp';
import derivativesJson from '../src/assets/derivatives.json' with { type: 'json' };
import iconsJson from '../src/assets/icons.json' with { type: 'json' };
import soundJson from '../src/assets/sound-manifest.json' with { type: 'json' };
import castJson from '../src/assets/cast.json' with { type: 'json' };
import { ENV_FOCUS, ENV_IDS, portraitCrop } from '../src/assets/focal.ts';
import { PORTRAIT_URLS } from '../src/assets/urls.ts';

interface SoundEntry {
  id: string;
  file: string;
  creator: string;
  license: string;
  source: string;
  edits: string;
  bytes: number;
  sha256: string;
  final: boolean;
  auditioned?: boolean;
}
const SOUNDS = [...soundJson.sfx, ...soundJson.ambience] as SoundEntry[];

interface Derivative {
  id: string;
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  sourceSha256: string;
  alphaExact: boolean;
}
const DERIVATIVES = derivativesJson.derivatives as Derivative[];

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
const PORTRAITS = (derivativesJson as unknown as { portrait: { id: string; of: string; path: string; bytes: number; sha256: string; sourceSha256: string; crop: { x: number; y: number; w: number; h: number }; width: number; height: number }[] }).portrait ?? [];
const CAST = castJson.cast as { id: string; of: string; path: string; bytes: number; sha256: string; sourceSha256: string; width: number; height: number; alphaExact: boolean; frames: { id: string; x: number; y: number; w: number; h: number }[] }[];
const registered = new Set<string>([...IMAGE_ASSETS.map((a) => a.path), ...DERIVATIVES.map((d) => d.path), ...PORTRAITS.map((d) => d.path), ...CAST.map((d) => d.path)]);
for (const file of walk(join(repoRoot, 'assets'))) {
  const rel = relative(repoRoot, file).split('\\').join('/');
  if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(rel) && !registered.has(rel))
    errors.push(`unregistered image ${rel} — add it to src/assets/manifest.ts`);
  if (/\.(mp3|ogg|wav|m4a|aac|flac|mp4|webm|mov)$/i.test(rel) && !MUSIC.some((m) => m.path === rel) && !SOUNDS.some((x) => x.file === rel) && rel !== 'assets/video/inspiresoftwareintro.mp4')
    errors.push(`uncatalogued media ${rel} — add it to src/assets/audio-manifest.ts (music) or rebuild src/assets/sound-manifest.json (scripts/build-audio.py)`);
}

// Stray art at the repo root (where uploads land) should be moved under assets/art.
for (const name of readdirSync(repoRoot)) {
  if (/\.(png|jpe?g|webp|mp3|ogg|wav|mp4|webm|mov)$/i.test(name))
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

// Runtime derivatives (assets/generated/web): same pixels as the current source, recorded bytes/hash,
// and urls.ts must serve the derivative — never the multi-megabyte original — for those ids.
{
  const urlsSrc = readFileSync(join(repoRoot, 'src/assets/urls.ts'), 'utf8');
  const served = new Map([...urlsSrc.matchAll(/'([\w.@-]+)':\s*new URL\(\s*'\.\.\/\.\.\/([^']+)'/g)].map((m) => [m[1]!, m[2]!]));
  for (const id of RUNTIME_ASSET_IDS) if (!served.has(id)) errors.push(`[${id}] could not read its URL literal in urls.ts`);
  for (const d of DERIVATIVES) {
    const tag = `[${d.id} → ${d.path}]`;
    const src = IMAGE_ASSETS.find((a) => a.id === d.id);
    const full = join(repoRoot, d.path);
    if (!src) {
      errors.push(`${tag} derivative of unknown asset`);
      continue;
    }
    if (!existsSync(full)) {
      errors.push(`${tag} missing — run npm run assets:derive`);
      continue;
    }
    const buf = readFileSync(full);
    if (buf.length !== d.bytes || createHash('sha256').update(buf).digest('hex') !== d.sha256) errors.push(`${tag} bytes/sha256 differ from derivatives.json — rebuild with npm run assets:derive`);
    if (d.sourceSha256 !== src.sha256) errors.push(`${tag} was built from a different source file — rebuild with npm run assets:derive`);
    const meta = await sharp(buf).metadata();
    if (meta.width !== src.width || meta.height !== src.height) errors.push(`${tag} is ${meta.width}x${meta.height}, source is ${src.width}x${src.height} (frame rects would be wrong)`);
    if (!d.alphaExact) errors.push(`${tag} alpha is not exact`);
    if (src.status === 'runtime' && served.get(d.id) !== d.path) errors.push(`${tag} urls.ts serves ${served.get(d.id)} instead of the derivative`);
  }
  // Portrait crops: one per environment, the crop matches the focal table, hash-locked, served by PORTRAIT_URLS.
  for (const env of ENV_IDS) {
    const d = PORTRAITS.find((p) => p.of === env);
    const src = IMAGE_ASSETS.find((a) => a.id === env)!;
    if (!d) {
      errors.push(`[${env}] no portrait crop — run npm run assets:derive`);
      continue;
    }
    const tag = `[${d.id} → ${d.path}]`;
    const want = portraitCrop(src.width, src.height, ENV_FOCUS[env].x);
    if (JSON.stringify(want) !== JSON.stringify(d.crop)) errors.push(`${tag} crop ${JSON.stringify(d.crop)} ≠ focal table ${JSON.stringify(want)} — rebuild`);
    const full = join(repoRoot, d.path);
    if (!existsSync(full)) {
      errors.push(`${tag} missing`);
      continue;
    }
    const buf = readFileSync(full);
    if (buf.length !== d.bytes || createHash('sha256').update(buf).digest('hex') !== d.sha256) errors.push(`${tag} bytes/sha256 drift — rebuild with npm run assets:derive`);
    if (d.sourceSha256 !== src.sha256) errors.push(`${tag} built from a different source`);
    const meta = await sharp(buf).metadata();
    if (meta.width !== d.width || meta.height !== d.height) errors.push(`${tag} is ${meta.width}x${meta.height}, recorded ${d.width}x${d.height}`);
    if (served.get(d.id) !== d.path) errors.push(`${tag} PORTRAIT_URLS serves ${served.get(d.id)}`);
    if (!(d.id in PORTRAIT_URLS)) errors.push(`${tag} not in PORTRAIT_URLS`);
  }
  // Cast portraits: repacked derivatives (scripts/build-cast.ts); urls.ts serves them for the cast ids.
  for (const d of CAST) {
    const tag = `[${d.of} → ${d.path}]`;
    const src = IMAGE_ASSETS.find((a) => a.id === d.of) as { status: string; sha256: string; frames?: readonly unknown[] } | undefined;
    if (!src) {
      errors.push(`${tag} derivative of unknown asset`);
      continue;
    }
    const full = join(repoRoot, d.path);
    if (!existsSync(full)) {
      errors.push(`${tag} missing — run npm run assets:cast`);
      continue;
    }
    const buf = readFileSync(full);
    if (buf.length !== d.bytes || createHash('sha256').update(buf).digest('hex') !== d.sha256) errors.push(`${tag} bytes/sha256 drift — rebuild with npm run assets:cast`);
    if (d.sourceSha256 !== src.sha256) errors.push(`${tag} built from a different source`);
    const meta = await sharp(buf).metadata();
    if (meta.width !== d.width || meta.height !== d.height) errors.push(`${tag} is ${meta.width}x${meta.height}, recorded ${d.width}x${d.height}`);
    if (!d.alphaExact) errors.push(`${tag} alpha is not exact`);
    if (d.frames.length !== (src.frames?.length ?? 0)) errors.push(`${tag} has ${d.frames.length} frames, source has ${src.frames?.length}`);
    for (const f of d.frames) if (f.x + f.w > d.width || f.y + f.h > d.height) errors.push(`${tag} frame ${f.id} outside the image`);
    if (src.status === 'runtime' && served.get(d.of) !== d.path) errors.push(`${tag} urls.ts serves ${served.get(d.of)} instead of the cast derivative`);
  }
  for (const a of IMAGE_ASSETS.filter((x) => x.id.startsWith('cast.') && x.status === 'runtime')) if (!CAST.some((c) => c.of === a.id)) errors.push(`[${a.id}] runtime cast atlas without a cast derivative`);
  notes.push(`portrait crops: ${PORTRAITS.length}, ${(PORTRAITS.reduce((s, d) => s + d.bytes, 0) / 1024).toFixed(0)} KB · cast derivatives: ${CAST.length}, ${(CAST.reduce((s, d) => s + d.bytes, 0) / 1024).toFixed(0)} KB`);
  notes.push(`runtime derivatives: ${DERIVATIVES.length}, ${(DERIVATIVES.reduce((s, d) => s + d.bytes, 0) / 1024).toFixed(0)} KB (sources ${(DERIVATIVES.reduce((s, d) => s + (IMAGE_ASSETS.find((a) => a.id === d.id)?.bytes ?? 0), 0) / 1024).toFixed(0)} KB)`);
}

// PWA icons (public/icons): generated from the approved portrait, hash-locked, maskable safe area measured.
{
  const src = IMAGE_ASSETS.find((a) => a.id === iconsJson.source.id);
  if (!src || src.sha256 !== iconsJson.source.sha256) errors.push('[icons] built from a different portrait sheet — run npm run icons:build');
  for (const icon of iconsJson.icons) {
    const full = join(repoRoot, 'public', icon.file);
    if (!existsSync(full)) {
      errors.push(`[icons] missing public/${icon.file} — run npm run icons:build`);
      continue;
    }
    const buf = readFileSync(full);
    if (buf.length !== icon.bytes || createHash('sha256').update(buf).digest('hex') !== icon.sha256) errors.push(`[icons] public/${icon.file} differs from icons.json`);
    const meta = await sharp(buf).metadata();
    if (meta.width !== icon.size || meta.height !== icon.size) errors.push(`[icons] ${icon.file} is ${meta.width}x${meta.height}, expected ${icon.size}`);
    if (icon.measuredForegroundRadius > icon.safeRadiusLimit) errors.push(`[icons] ${icon.file} art reaches r=${icon.measuredForegroundRadius} beyond the ${icon.safeRadiusLimit} safe circle`);
  }
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'public/manifest.webmanifest'), 'utf8')) as { icons: { src: string; purpose: string; sizes: string }[]; start_url: string; scope: string };
  for (const i of manifest.icons) if (!iconsJson.icons.some((x) => x.file === i.src && `${x.size}x${x.size}` === i.sizes && x.purpose === i.purpose)) errors.push(`[manifest] icon ${i.src} (${i.purpose}) is not a verified generated icon`);
  if (!manifest.icons.some((i) => i.purpose === 'maskable')) errors.push('[manifest] no maskable icon');
  if (manifest.start_url.startsWith('/') || manifest.scope.startsWith('/')) errors.push('[manifest] start_url/scope must be relative (GitHub Pages subpath)');
  notes.push(`PWA icons: ${iconsJson.icons.length}, maskable foreground within r=${Math.max(...iconsJson.icons.filter((i) => i.purpose !== 'any').map((i) => i.measuredForegroundRadius))} (limit 0.4)`);
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

// Approved music: bytes and hash must match (files are never re-encoded in place).
for (const m of MUSIC) {
  const full = join(repoRoot, m.path);
  if (!existsSync(full)) {
    errors.push(`[music:${m.id}] missing ${m.path}`);
    continue;
  }
  const buf = readFileSync(full);
  if (buf.length !== m.bytes) errors.push(`[music:${m.id}] size ${buf.length} != manifest ${m.bytes}`);
  if (createHash('sha256').update(buf).digest('hex') !== m.sha256) errors.push(`[music:${m.id}] sha256 changed — the approved file was altered or replaced`);
  if (m.loop.candidates.some((c) => c.auditioned)) notes.push(`[music:${m.id}] has an auditioned loop candidate — runtime still uses restart-after-ending until the policy is changed`);
}
if (!existsSync(join(repoRoot, 'assets/video/inspiresoftwareintro.mp4'))) notes.push('intro video assets/video/inspiresoftwareintro.mp4 not supplied — start screen fades straight to the menu');

for (const m of MISSING_ASSETS) notes.push(`missing (${m.kind}) ${m.id}: fallback = ${m.fallback}`);

console.log(`Checked ${IMAGE_ASSETS.length} image assets.`);
for (const n of notes) console.log(`  note: ${n}`);
// Sound bank (scripts/build-audio.py): every file catalogued with provenance, CC0 only, bytes + sha256 exact.
// Nothing is marked final or auditioned without a person's sign-off recorded in the manifest.
{
  const ids = new Set<string>();
  for (const x of SOUNDS) {
    if (ids.has(x.id)) errors.push(`[sound ${x.id}] duplicate id`);
    ids.add(x.id);
    for (const k of ['creator', 'license', 'source', 'edits'] as const) if (!x[k]) errors.push(`[sound ${x.id}] missing provenance field "${k}"`);
    if (!/^CC0 1\.0/.test(x.license)) errors.push(`[sound ${x.id}] license "${x.license}" is not CC0 1.0 — check its terms before shipping`);
    if (!/^https:\/\//.test(x.source)) errors.push(`[sound ${x.id}] source must be an https URL`);
    const path = join(repoRoot, x.file);
    if (!existsSync(path)) {
      errors.push(`[sound ${x.id}] missing file ${x.file}`);
      continue;
    }
    const buf = readFileSync(path);
    if (buf.length !== x.bytes) errors.push(`[sound ${x.id}] bytes ${buf.length} ≠ manifest ${x.bytes}`);
    const h = createHash('sha256').update(buf).digest('hex');
    if (h !== x.sha256) errors.push(`[sound ${x.id}] sha256 drift — rebuild with scripts/build-audio.py, never edit by hand`);
  }
  console.log(`sound bank: ${soundJson.sfx.length} SFX + ${soundJson.ambience.length} beds verified (final: ${SOUNDS.filter((x) => x.final).length}, seams auditioned: ${soundJson.ambience.filter((x) => x.auditioned).length})`);
}

if (errors.length) {
  console.error(`\n${errors.length} asset error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('All asset checks passed: files present, bytes/sha256/dimensions unchanged, frame rects re-measured exactly.');
