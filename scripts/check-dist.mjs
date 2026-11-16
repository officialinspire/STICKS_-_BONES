// Post-build check: the bundle must be base-path safe for GitHub Pages subpaths.
// With the default relative base ('./'), index.html and CSS must not reference
// root-absolute URLs ("/..."), and every local reference must exist in dist/.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const base = process.env.BASE_PATH ?? './';
const errors = [];

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !/^(data:|https?:|#)/.test(r));
for (const ref of refs) {
  if (base === './' && ref.startsWith('/')) errors.push(`index.html has root-absolute URL ${ref}`);
  const rel = ref.startsWith(base) ? ref.slice(base.length) : ref.replace(/^\.\//, '');
  if (!existsSync(join(dist, decodeURIComponent(rel)))) errors.push(`index.html references missing file ${ref}`);
}

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = walk(dist);
for (const f of files.filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(f, 'utf8');
  for (const m of css.matchAll(/url\(\s*["']?(\/[^"')]+)/g))
    if (base === './') errors.push(`${f.slice(dist.length)} has root-absolute url(${m[1]})`);
}
for (const f of files) {
  if (/\s|[^\x20-\x7e]/.test(f.slice(dist.length))) errors.push(`emitted file name is not URL-safe: ${f.slice(dist.length)}`);
}

const bytes = files.reduce((s, f) => s + statSync(f).size, 0);

// Byte budget (docs/PERFORMANCE.md). Set from measured Stage 9 assets with headroom;
// raise it only on purpose, with a measurement, in the same change.
const KB = 1024;
export const BUDGET = {
  codeKB: 260, // all JS + CSS + HTML (measured 188 KB raw / ~52 KB gzip)
  imagesKB: 1700, // every runtime image (measured 1,451 KB as WebP; 9,857 KB as the PNG originals)
  singleImageKB: 400, // largest single image (measured 301 KB)
  startupKB: 760, // start screen + first menu, raw bytes: code + backdrop + portrait (measured 702 KB raw, 579 KB on the wire)
  mediaKB: 8000, // music, streamed on demand only (measured 7,331 KB)
  iconsKB: 140, // PWA icons (PNG by spec), generated from approved art (measured 113 KB)
  swKB: 16, // service worker + build manifest (measured 8 KB)
  totalKB: 9800, // whole dist (measured 9.1 MB)
};
const size = (f) => statSync(f).size;
const rel = (f) => f.slice(dist.length);
const isCode = (f) => /\.(js|css|html)$/.test(f);
const isImage = (f) => /\.(webp|png|avif|jpe?g|svg|gif)$/.test(f);
const isMedia = (f) => /\.(mp3|ogg|m4a|mp4|webm)$/.test(f);
const sumKB = (fs) => fs.reduce((s, f) => s + size(f), 0) / KB;
const code = sumKB(files.filter(isCode));
const isIcon = (f) => rel(f).startsWith('icons/');
const images = files.filter((f) => isImage(f) && !isIcon(f));
const iconsKB = sumKB(files.filter(isIcon));
const swKB = sumKB(files.filter((f) => /(^|\/)(sw\.js|build\.json)$/.test(rel(f))));
const imagesKB = sumKB(images);
const biggest = images.reduce((m, f) => (size(f) > (m ? size(m) : 0) ? f : m), null);
// Startup set: code + the two essential images (src/assets/warm.ts ESSENTIAL_ASSETS).
const startupKB = code + sumKB(images.filter((f) => /neighborhood-patio|cousin-portrait-atlas/.test(f)));
const mediaKB = sumKB(files.filter(isMedia));
const over = [];
const gate = (name, value, limit) => {
  const line = `${name} ${value.toFixed(0)} KB / ${limit} KB`;
  if (value > limit) over.push(line);
  return line;
};
const budgetLines = [
  gate('code', code, BUDGET.codeKB),
  gate('images', imagesKB, BUDGET.imagesKB),
  gate(`largest image (${biggest ? rel(biggest) : '-'})`, biggest ? size(biggest) / KB : 0, BUDGET.singleImageKB),
  gate('startup', startupKB, BUDGET.startupKB),
  gate('media', mediaKB, BUDGET.mediaKB),
  gate('icons', iconsKB, BUDGET.iconsKB),
  gate('service worker', swKB, BUDGET.swKB),
  gate('total', bytes / KB, BUDGET.totalKB),
];
if (images.some((f) => /\.png$/.test(f))) errors.push(`a PNG original was bundled (${images.filter((f) => /\.png$/.test(f)).map(rel).join(', ')}) — serve the WebP derivative`);
for (const o of over) errors.push(`over budget: ${o}`);
if (errors.length) {
  console.error('dist check failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`dist check passed: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB, base "${base}".`);
console.log(`byte budget: ${budgetLines.join(' · ')}`);
