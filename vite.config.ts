import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
 * PWA: writes dist/sw.js from src/pwa/sw.js with this build's exact file groups and byte sizes.
 *   shell — index.html, every emitted JS/CSS/font (including the lazy Story chunks), the manifest and
 *           the 192-px icons: the minimum to start and play.
 *   core  — menu/table art (both patio variants, Cousin, tiles, table, effects) and UI/table sounds.
 *   story — chapter backdrops (full + portrait), cast sheets, story accents: per chapter or on request.
 *   audio — music and ambience beds: OPTIONAL offline audio, only on the player's request.
 * Never PNG source sheets (the build fails if one is bundled) and never the intro video.
 * All paths are relative to sw.js, so the same build works under any subpath.
 * BUILD is a hash of every emitted file, so any change yields a new shell cache.
 */
const CORE_IMAGE = /^assets\/(neighborhood-patio(-portrait)?|cousin-|double-six|weathered-tabletop|effects-sheet)/;
const CORE_SOUND = /^assets\/(ui-|tile-|pass-knock-)/;
export function offlineGroup(file: string): 'shell' | 'core' | 'story' | 'audio' | null {
  if (/\.(js|css|woff2)$/.test(file) || file === 'index.html') return 'shell';
  if (/\.webp$/.test(file)) return CORE_IMAGE.test(file) ? 'core' : 'story';
  if (/\.wav$/.test(file)) return CORE_SOUND.test(file) ? 'core' : 'story';
  if (/\.mp3$/.test(file)) return 'audio';
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

export function pwaPlugin(): Plugin {
  return {
    name: 'sticks-pwa',
    apply: 'build',
    enforce: 'post', // after Vite's HTML plugin, so index.html is in the bundle and in the hash
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).sort();
      if (files.some((f) => /\.png$/.test(f))) this.error('a PNG source sheet is in the bundle; only WebP derivatives may be cached');
      const sizeOf = (f: string): number => {
        const item = bundle[f];
        if (!item) return readFileSync(new URL(`./public/${f}`, import.meta.url)).length;
        return item.type === 'chunk' ? Buffer.byteLength(item.code) : typeof item.source === 'string' ? Buffer.byteLength(item.source) : item.source.length;
      };
      const groups: Record<'shell' | 'core' | 'story' | 'audio', [string, number][]> = { shell: [], core: [], story: [], audio: [] };
      for (const f of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-maskable-192.png']) groups.shell.push([f, sizeOf(f)]);
      for (const f of files) {
        const g = offlineGroup(f);
        if (g) groups[g].push([f, sizeOf(f)]);
      }
      const h = createHash('sha256');
      for (const f of files) {
        const item = bundle[f]!;
        h.update(f).update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      // Public files (manifest, icons) are copied verbatim, outside the bundle: hash them too.
      for (const [f] of groups.shell.filter(([x]) => !files.includes(x))) h.update(f).update(readFileSync(new URL(`./public/${f}`, import.meta.url)));
      if (!files.includes('index.html')) this.error('index.html missing from the bundle at generateBundle time');
      const build = h.digest('hex').slice(0, 12);
      const src = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
        .replace('__SB_BUILD__;', `${JSON.stringify(build)};`)
        .replace('__SB_GROUPS__;', `${JSON.stringify(groups)};`);
      if (/__SB_(BUILD|GROUPS)__;/.test(src)) this.error('sw.js placeholders were not replaced');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
      const sum = (g: [string, number][]) => g.reduce((s, [, b]) => s + b, 0);
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ build, bytes: { shell: sum(groups.shell), core: sum(groups.core), story: sum(groups.story), audio: sum(groups.audio) }, groups }, null, 1) });
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
