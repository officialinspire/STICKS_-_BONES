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
  codeKB: 300, // core JS + CSS + HTML, excluding the lazy story-script chunk (Stage 12 measured 266 KB raw: +29 KB inlined wordmark vectors, story UI)
  storyKB: 100, // the approved script as a lazy chunk, loaded only when Story opens (measured 76 KB raw / 18 KB gzip)
  fontsKB: 100, // self-hosted DM Sans + Bricolage Grotesque WOFF2 subsets (measured 82 KB)
  imagesKB: 3300, // every runtime image (Stage 13 measured ~3,050 KB: +five story backdrops, all loaded per scene on demand, none at startup)
  singleImageKB: 450, // largest single image (Stage 13: jungle backdrop 428 KB at q84 — q80 failed the derivative quality gate)
  startupKB: 900, // start screen + first menu, raw bytes: core code + fonts + backdrop + portrait (Stage 12 measured ~868 KB raw)
  mediaKB: 8000, // music, streamed on demand only (measured 7,331 KB)
  iconsKB: 140, // PWA icons (PNG by spec), generated from approved art (measured 113 KB)
  swKB: 16, // service worker + build manifest (measured 8 KB)
  totalKB: 11200, // whole dist (Stage 13 measured ~10.9 MB: music 7.3 MB + images 3.0 MB)
};
const size = (f) => statSync(f).size;
const rel = (f) => f.slice(dist.length);
const isStory = (f) => /assets\/script-[\w-]+\.js$/.test(rel(f));
const isCode = (f) => /\.(js|css|html)$/.test(f) && !isStory(f);
const isFont = (f) => /\.woff2$/.test(f);
const isImage = (f) => /\.(webp|png|avif|jpe?g|svg|gif)$/.test(f);
const isMedia = (f) => /\.(mp3|ogg|m4a|mp4|webm)$/.test(f);
const sumKB = (fs) => fs.reduce((s, f) => s + size(f), 0) / KB;
const code = sumKB(files.filter(isCode));
const storyKB = sumKB(files.filter(isStory));
const fontsKB = sumKB(files.filter(isFont));
if (files.filter(isStory).length !== 1) errors.push(`expected exactly one lazy story-script chunk, found ${files.filter(isStory).length}`);
const isIcon = (f) => rel(f).startsWith('icons/');
const images = files.filter((f) => isImage(f) && !isIcon(f));
const iconsKB = sumKB(files.filter(isIcon));
const swKB = sumKB(files.filter((f) => /(^|\/)(sw\.js|build\.json)$/.test(rel(f))));
const imagesKB = sumKB(images);
const biggest = images.reduce((m, f) => (size(f) > (m ? size(m) : 0) ? f : m), null);
// Startup set: code + the two essential images (src/assets/warm.ts ESSENTIAL_ASSETS).
const startupKB = code + fontsKB + sumKB(images.filter((f) => /neighborhood-patio|cousin-portrait-atlas/.test(f)));
const mediaKB = sumKB(files.filter(isMedia));
const over = [];
const gate = (name, value, limit) => {
  const line = `${name} ${value.toFixed(0)} KB / ${limit} KB`;
  if (value > limit) over.push(line);
  return line;
};
const budgetLines = [
  gate('code', code, BUDGET.codeKB),
  gate('story script', storyKB, BUDGET.storyKB),
  gate('fonts', fontsKB, BUDGET.fontsKB),
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
