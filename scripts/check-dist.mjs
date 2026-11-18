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
  codeKB: 330, // core JS + CSS + HTML, excluding the lazy Story chunks. 322 KB after the hardening pass (+8 KB: AI worker validation/fallback, media recovery, per-record save health, chunk-failure Retry/Back, image deadlines; these handle the lazy chunks' own failures, so they can't be lazy); 310.3 KB after the startup stage; the inline wordmark SVGs are ~29 KB of it
  achievementsKB: 45, // lazy achievements chunk (catalog, tracker, page, badges + its stylesheet), loaded after the menu is up: measured 35 KB
  storyKB: 130, // lazy Story chunks, loaded only when Story opens: the approved script (76 KB) + player/director/staging/cast frames (36 KB) = 112 KB measured
  fontsKB: 100, // self-hosted DM Sans + Bricolage Grotesque WOFF2 subsets (measured 82 KB)
  imagesKB: 3300, // CORE images: menu, table, Cousin, effects, tiles + the seven full-frame backdrops (measured ~3,050 KB; unchanged)
  storyImagesKB: 1600, // Story-only additions, on demand per chapter: 7 portrait crops + 4 cleaned cast sheets = 1,474 KB measured
  chapterImagesKB: 1000, // the most ONE chapter downloads (full-frame backdrop + its cast sheets); measured max 923 KB (Chapter 3)
  singleImageKB: 450, // largest single image (Stage 13: jungle backdrop 428 KB at q84 — q80 failed the derivative quality gate)
  startupKB: 960, // initialization, raw bytes: core code + fonts + ONE patio variant (the larger: landscape) + Cousin's portrait + the tile atlas (startup stage: the tiles are decoded before the start prompt; measured ~931 KB, was 900 without the atlas)
  mediaKB: 13500, // music, streamed on demand only, never at startup: 12,757 KB measured = the two approved songs 7,331 + the owner's two scene beds 5,335 (stream-copied, audio bit-identical to the uploads; cover art removed saved 1.9 MB) + two result cues 90. Re-encoding the owner's masters lower was rejected (generation loss; the briefs ask ≥ 192 kbps)
  videoKB: 400, // the INSPIRE studio credit (272 KB measured, 1080×720 H.264 + AAC, 5.8 s): fetched only after the essentials, at the start prompt; never cached offline yet
  sfxKB: 720, // short CC0 SFX (WAV, decoded once after the first gesture; measured ~600 KB)
  ambienceKB: 2200, // five CC0 ambience beds (MP3, fetched per scene on demand; measured ~1,900 KB)
  iconsKB: 140, // PWA icons (PNG by spec), generated from approved art (measured 113 KB)
  swKB: 22, // service worker + build manifest: 19 KB measured (per-file sizes for truncation checks and four offline groups; was 8 KB)
  totalKB: 21000, // whole dist: 20,147 KB measured after the owner audio stage (+5.4 MB of on-demand scene music and cues). Nothing in the increase loads at startup; offline it is only in the optional, size-disclosed audio download
};
const size = (f) => statSync(f).size;
const rel = (f) => f.slice(dist.length);
const isStory = (f) => /assets\/(script|story-ui)-[\w-]+\.js$/.test(rel(f)); // lazy Story chunks: the script text and the player
const isAchievements = (f) => /assets\/achievements-[\w-]+\.(js|css)$/.test(rel(f)); // lazy: after the menu is up
const isCode = (f) => /\.(js|css|html)$/.test(f) && !isStory(f) && !isAchievements(f);
const isFont = (f) => /\.woff2$/.test(f);
const isImage = (f) => /\.(webp|png|avif|jpe?g|svg|gif)$/.test(f);
const isAmbience = (f) => /\/amb-[a-z]+-[\w-]+\.mp3$/.test(f);
const isSfx = (f) => /\.wav$/.test(f);
const isVideo = (f) => /\.(mp4|webm)$/.test(f);
const isMedia = (f) => /\.(mp3|ogg|m4a)$/.test(f) && !isAmbience(f);
const sumKB = (fs) => fs.reduce((s, f) => s + size(f), 0) / KB;
const code = sumKB(files.filter(isCode));
const storyKB = sumKB(files.filter(isStory));
const achievementsKB = sumKB(files.filter(isAchievements));
if (files.filter(isAchievements).length !== 2) errors.push(`expected the lazy achievements chunk + stylesheet, found ${files.filter(isAchievements).length}`);
const fontsKB = sumKB(files.filter(isFont));
if (files.filter(isStory).length !== 2) errors.push(`expected the two lazy Story chunks (script, story-ui), found ${files.filter(isStory).length}`);
const isIcon = (f) => rel(f).startsWith('icons/');
const images = files.filter((f) => isImage(f) && !isIcon(f));
// Story-only images: the portrait crops and the cast sheets (src/assets/urls.ts PORTRAIT_URLS + cast.*).
const isStoryImage = (f) => /-portrait-[\w-]{8}\.webp$/.test(f) || /\/cast-[a-z]+-[\w-]+\.webp$/.test(f);
const coreImages = images.filter((f) => !isStoryImage(f));
const storyImagesKB = sumKB(images.filter(isStoryImage));
const iconsKB = sumKB(files.filter(isIcon));
const swKB = sumKB(files.filter((f) => /(^|\/)(sw\.js|build\.json)$/.test(rel(f))));
const imagesKB = sumKB(coreImages);
const biggest = images.reduce((m, f) => (size(f) > (m ? size(m) : 0) ? f : m), null);
// Startup set: code + fonts + what initialization decodes (main.ts startup(): patio, Cousin's portrait, tile atlas).
// One patio variant per device: count the larger (full frame, landscape) so the limit holds for both.
const startupKB = code + fontsKB + sumKB(coreImages.filter((f) => /neighborhood-patio|cousin-portrait-atlas|double-six-atlas/.test(f)));
// Per chapter: its backdrops (full frame, the larger variant) + the cast sheets it uses (src/ui/story-assets.ts).
const CHAPTER_IMAGES = {
  'chapter-1': ['neighborhood-patio', 'rafa', 'marisol'],
  'chapter-2': ['back-alley', 'marisol', 'vale'],
  'chapter-3': ['executive-terrace', 'vale', 'marisol', 'rafa'],
  'chapter-4': ['moonlit-promenade', 'rafa', 'marisol'],
  'chapter-5': ['jungle-camp', 'luz', 'marisol'],
  'chapter-6': ['cave-waterfall', 'marisol', 'luz'],
  'chapter-7': ['executive-terrace', 'vale', 'marisol', 'rafa'],
  epilogue: ['neighborhood-patio', 'marisol'],
};
const imgKB = (stem) => sumKB(images.filter((f) => new RegExp(`/(cast-)?${stem}-[\\w-]{8}\\.webp$`).test(f) && !/-portrait-/.test(f)));
const chapters = Object.entries(CHAPTER_IMAGES).map(([id, stems]) => [id, stems.reduce((s, x) => s + imgKB(x), 0)]);
const [worstChapter, chapterImagesKB] = chapters.reduce((m, c) => (c[1] > m[1] ? c : m), ['-', 0]);
const mediaKB = sumKB(files.filter(isMedia));
const sfxKB = sumKB(files.filter(isSfx));
const videoKB = sumKB(files.filter(isVideo));
const ambienceKB = sumKB(files.filter(isAmbience));
const over = [];
const gate = (name, value, limit) => {
  const line = `${name} ${value.toFixed(0)} KB / ${limit} KB`;
  if (value > limit) over.push(line);
  return line;
};
const budgetLines = [
  gate('code', code, BUDGET.codeKB),
  gate('story script', storyKB, BUDGET.storyKB),
  gate('achievements (lazy)', achievementsKB, BUDGET.achievementsKB),
  gate('fonts', fontsKB, BUDGET.fontsKB),
  gate('images (core)', imagesKB, BUDGET.imagesKB),
  gate('story images (on demand)', storyImagesKB, BUDGET.storyImagesKB),
  gate(`largest chapter (${worstChapter})`, chapterImagesKB, BUDGET.chapterImagesKB),
  gate(`largest image (${biggest ? rel(biggest) : '-'})`, biggest ? size(biggest) / KB : 0, BUDGET.singleImageKB),
  gate('startup', startupKB, BUDGET.startupKB),
  gate('music', mediaKB, BUDGET.mediaKB),
  gate('sfx', sfxKB, BUDGET.sfxKB),
  gate('video', videoKB, BUDGET.videoKB),
  gate('ambience', ambienceKB, BUDGET.ambienceKB),
  gate('icons', iconsKB, BUDGET.iconsKB),
  gate('service worker', swKB, BUDGET.swKB),
  gate('total', bytes / KB, BUDGET.totalKB),
];
if (images.some((f) => /\.png$/.test(f))) errors.push(`a PNG original was bundled (${images.filter((f) => /\.png$/.test(f)).map(rel).join(', ')}) — serve the WebP derivative`);
// Retired by owner direction (the resort scenes use the corporate executive terrace): never bundled again.
const RETIRED = /(^|\/)resort-patio[-.]/;
if (files.some((f) => RETIRED.test(rel(f)))) errors.push(`a retired backdrop was bundled (${files.filter((f) => RETIRED.test(rel(f))).map(rel).join(', ')})`);
for (const o of over) errors.push(`over budget: ${o}`);
if (errors.length) {
  console.error('dist check failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`dist check passed: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB, base "${base}".`);
console.log(`byte budget: ${budgetLines.join(' · ')}`);
