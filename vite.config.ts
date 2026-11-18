import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Base path: defaults to './' so the build works from any GitHub Pages subpath
 * (e.g. https://owner.github.io/STICKS_-_BONES/) without rebuilding. Set
 * BASE_PATH=/some/path/ to emit absolute URLs instead.
 */
const base = process.env.BASE_PATH ?? './';

/** Make emitted asset names URL-safe (source files keep their original names). */
function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'asset'
  );
}

/**
 * PWA: writes dist/sw.js from src/pwa/sw.js with this build's complete offline pack: EVERY shipped runtime
 * file, each listed as [path, bytes, sha256] so the worker stores only complete, checksum-verified copies.
 *   shell — index.html, every emitted JS/CSS/font (including the lazy Story and achievements chunks), the
 *           web manifest, every icon and the font licences: the minimum to start. All-or-nothing at install.
 *   core  — menu/table art (both patio orientations, Cousin, tiles, table, effects), UI/table sounds and the
 *           two result cues: Quick Play complete offline. Best effort at install.
 *   story — chapter backdrops (both orientations), cast sheets, story sounds.
 *   media — music, ambience beds and the INSPIRE intro video (byte ranges are served from the cache).
 * core + story + media are saved by the whole-game download that starts after the menu is up while online.
 * Any other emitted file fails the build, so nothing ships without an offline copy; PNG source sheets
 * never ship (icons are the only PNGs, by the web-manifest spec). Paths are relative to sw.js, so the same
 * build works under any subpath. BUILD is a hash of every shipped file, so any change yields a new shell.
 */
export type OfflineGroup = 'shell' | 'core' | 'story' | 'media';
const CORE_IMAGE = /^assets\/(neighborhood-patio(-portrait)?|cousin-|double-six|weathered-tabletop|effects-sheet)/;
const CORE_SOUND = /^assets\/(ui-|tile-|pass-knock-|result-)/;
export function offlineGroup(file: string): OfflineGroup | null {
  if (/\.(js|css|woff2)$/.test(file) || file === 'index.html' || file === 'manifest.webmanifest' || /^icons\/[\w-]+\.png$/.test(file) || /^licenses\/[\w-]+\.txt$/.test(file)) return 'shell';
  if (/\.webp$/.test(file)) return CORE_IMAGE.test(file) ? 'core' : 'story';
  if (/\.wav$/.test(file)) return CORE_SOUND.test(file) ? 'core' : 'story';
  if (/\.mp3$/.test(file)) return CORE_SOUND.test(file) ? 'core' : 'media';
  if (/\.mp4$/.test(file)) return 'media';
  return null;
}
/**
 * The asset manifest's documentation prose (`proposedUse`, `originalName`) is for people and for
 * `npm run assets:verify`; no runtime code reads it. Drop those lines from the shipped bundle only
 * (the source file is unchanged; a test proves nothing at runtime depends on them).
 */
export function stripManifestProse(): Plugin {
  return {
    name: 'sticks-strip-manifest-prose',
    apply: 'build',
    transform(code, id) {
      const path = id.replace(/\\/g, '/');
      if (path.endsWith('/src/assets/manifest.ts')) return { code: code.replace(/^[ \t]*(proposedUse|originalName): ".*",?\r?\n/gm, ''), map: null };
      // The music manifest's `notes` (selection reasons, measurements) are for people and the docs; drop them too.
      if (path.endsWith('/src/assets/audio-manifest.ts')) return { code: code.replace(/^[ \t]*notes:[ \t]*(?:\r?\n[ \t]*)?(['"])(?:\\.|(?!\1).)*\1,?\r?\n/gm, ''), map: null };
      return null;
    },
  };
}

/** Files Vite copies verbatim from public/ (outside the bundle), relative to it. */
function publicFiles(dir = new URL('./public/', import.meta.url), prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? publicFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
}

export function pwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sticks-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    // writeBundle, not generateBundle: Vite's own post plugins still rewrite chunks (preload lists) after
    // generateBundle, so the sizes and checksums are taken from the files exactly as written.
    writeBundle(_options, bundle) {
      const files = [...new Set([...Object.keys(bundle), ...publicFiles()])].filter((f) => f !== 'sw.js' && f !== 'build.json').sort();
      const pngs = files.filter((f) => /\.png$/.test(f) && !/^icons\//.test(f));
      if (pngs.length) this.error(`a PNG source sheet would ship (${pngs.join(', ')}); only WebP derivatives may`);
      if (!files.includes('index.html')) this.error('index.html missing from the bundle');
      const groups: Record<OfflineGroup, [string, number, string][]> = { shell: [], core: [], story: [], media: [] };
      const h = createHash('sha256');
      const seen = new Map<string, string>();
      for (const f of files) {
        const g = offlineGroup(f);
        if (!g) this.error(`${f} would ship without an offline copy: give it an offline group in vite.config.ts`);
        const body = readFileSync(join(outDir, f));
        const sha = createHash('sha256').update(body).digest('hex');
        // Duplicate uploads (byte-identical files under two names) are never shipped twice.
        if (seen.has(sha)) this.error(`${f} is byte-identical to ${seen.get(sha)}: ship one copy`);
        seen.set(sha, f);
        groups[g!].push([f, body.length, sha]);
        h.update(f).update(sha);
      }
      const build = h.digest('hex').slice(0, 12);
      const src = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
        .replace('__SB_BUILD__;', `${JSON.stringify(build)};`)
        .replace('__SB_GROUPS__;', `${JSON.stringify(groups)};`);
      if (/__SB_(BUILD|GROUPS)__;/.test(src)) this.error('sw.js placeholders were not replaced');
      writeFileSync(join(outDir, 'sw.js'), src);
      const sum = (g: [string, number, string][]) => g.reduce((s, [, b]) => s + b, 0);
      const bytes = { shell: sum(groups.shell), core: sum(groups.core), story: sum(groups.story), media: sum(groups.media) };
      writeFileSync(join(outDir, 'build.json'), JSON.stringify({ build, bytes, total: bytes.shell + bytes.core + bytes.story + bytes.media, groups }, null, 1));
    },
  };
}

export default defineConfig({
  base,
  plugins: [stripManifestProse(), pwaPlugin()],
  define: { __SB_BUILD_TAG__: JSON.stringify(process.env.SB_BUILD_TAG ?? 'local') },
  build: {
    target: 'es2022',
    // Audio is never inlined into JS (decoded on demand after the first gesture); small images still may be.
    assetsInlineLimit: (file: string) => (/\.(wav|mp3)$/.test(file) ? false : undefined),
    rolldownOptions: {
      output: {
        assetFileNames: (info) => {
          const original = info.names?.[0] ?? 'asset';
          const dot = original.lastIndexOf('.');
          const stem = dot > 0 ? original.slice(0, dot) : original;
          return `assets/${slug(stem)}-[hash][extname]`;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
