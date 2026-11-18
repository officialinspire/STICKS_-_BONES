/**
 * npm run atlas:build — regenerate assets/generated/tiles/double-six-atlas.{png,json}
 * from the verified material sheet. Never modifies source art. After running,
 * update the manifest entry with `npm run assets:measure` if the bytes changed.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { IMAGE_ASSETS } from '../src/assets/manifest.ts';
import { encodePng, renderAtlas } from './lib/atlas.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = IMAGE_ASSETS.find((a) => a.id === 'tile.materials')!;
const buf = readFileSync(join(root, src.path));
const sha = createHash('sha256').update(buf).digest('hex');
const { raster, json } = renderAtlas(PNG.sync.read(buf), sha);
const outDir = join(root, 'assets/generated/tiles');
mkdirSync(outDir, { recursive: true });
const png = encodePng(raster);
writeFileSync(join(outDir, json.image), png);
writeFileSync(join(outDir, 'double-six-atlas.json'), JSON.stringify(json, null, 2) + '\n');
console.log(
  `Wrote ${json.image} (${raster.width}×${raster.height}, ${png.length} bytes, sha256 ${createHash('sha256').update(png).digest('hex')}) with ${json.tiles.length} faces + ${json.backs.length} backs.`,
);
