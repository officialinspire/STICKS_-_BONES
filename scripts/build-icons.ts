/**
 * npm run icons:build — PWA icons from approved runtime art.
 *
 * Source: Cousin's "neutral" frame in the approved portrait atlas
 * (`cousin.atlas.portrait`), cropped with the same stable bust box the game
 * uses (src/render/stage.ts), composited over a full-bleed teal field. The
 * original sheet is only READ.
 *
 * Maskable safe area (W3C "maskable" icons): launchers may crop to any shape
 * that contains the centred circle of radius 40% of the icon size. Every
 * foreground pixel (alpha > 8) of a maskable icon must lie inside that circle;
 * the script shrinks the art until it does and records the measured worst
 * radius. Purpose "any" icons use the same art slightly larger (inside 46%).
 *
 * Output: public/icons/*.png (copied verbatim by Vite to the site root) and
 * src/assets/icons.json (bytes, sha256, measured safe-area radius), which
 * `npm run assets:verify` re-checks.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { IMAGE_ASSETS } from '../src/assets/manifest.ts';
import { bustBox, stageFor } from '../src/render/stage.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = IMAGE_ASSETS.find((a) => a.id === 'cousin.atlas.portrait')!;
const BG = { inner: '#1b7a74', outer: '#0b3f3c' };

export const ICONS = [
  { file: 'icon-192.png', size: 192, purpose: 'any', radius: 0.46 },
  { file: 'icon-512.png', size: 512, purpose: 'any', radius: 0.46 },
  { file: 'icon-maskable-192.png', size: 192, purpose: 'maskable', radius: 0.4 },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable', radius: 0.4 },
  { file: 'apple-touch-icon-180.png', size: 180, purpose: 'apple', radius: 0.4 },
] as const;

const box = bustBox(stageFor(SRC), 'neutral', 1.05);
const sheet = readFileSync(join(root, SRC.path));
const crop = await sharp(sheet).extract({ left: Math.round(box.x), top: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/** Worst normalised distance from the centre of any foreground pixel (alpha > 8). */
function worstRadius(fg: Buffer, size: number): number {
  let worst = 0;
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (fg[(y * size + x) * 4 + 3]! <= 8) continue;
      // Farthest corner of the pixel from the centre.
      const dx = Math.max(Math.abs(x - c), Math.abs(x + 1 - c));
      const dy = Math.max(Math.abs(y - c), Math.abs(y + 1 - c));
      worst = Math.max(worst, Math.hypot(dx, dy) / size);
    }
  return worst;
}

async function foreground(size: number, scale: number): Promise<Buffer> {
  const h = Math.max(1, Math.round(size * scale));
  const w = Math.max(1, Math.round((h * crop.info.width) / crop.info.height));
  const art = await sharp(crop.data, { raw: crop.info }).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
  // Centre horizontally; sit slightly below centre so the hat clears the top of the circle.
  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2 + size * 0.02);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, left, top }])
    .raw()
    .toBuffer();
}

const background = (size: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${BG.inner}"/><stop offset="1" stop-color="${BG.outer}"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.36}" fill="#f6ead2" fill-opacity="0.12"/></svg>`,
  );

mkdirSync(join(root, 'public/icons'), { recursive: true });
const out: Record<string, unknown>[] = [];
for (const icon of ICONS) {
  // Largest scale whose foreground fits the required circle (measured, not assumed).
  let scale = 0.95;
  let fg = await foreground(icon.size, scale);
  let r = worstRadius(fg, icon.size);
  while (r > icon.radius - 1 / icon.size && scale > 0.2) {
    scale -= 0.01;
    fg = await foreground(icon.size, scale);
    r = worstRadius(fg, icon.size);
  }
  const png = await sharp(background(icon.size))
    .composite([{ input: fg, raw: { width: icon.size, height: icon.size, channels: 4 } }])
    .flatten({ background: BG.outer })
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toBuffer();
  writeFileSync(join(root, 'public/icons', icon.file), png);
  out.push({
    file: `icons/${icon.file}`,
    size: icon.size,
    purpose: icon.purpose,
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
    safeRadiusLimit: icon.radius,
    measuredForegroundRadius: +r.toFixed(4),
    opaque: true,
  });
  console.log(`✓ ${icon.file}: ${icon.size}px, foreground within r=${r.toFixed(3)} (limit ${icon.radius}), ${png.length} B`);
}
writeFileSync(
  join(root, 'src/assets/icons.json'),
  JSON.stringify({ generator: 'scripts/build-icons.ts', source: { id: SRC.id, sha256: SRC.sha256, frame: 'neutral', crop: box }, icons: out }, null, 1) + '\n',
);
