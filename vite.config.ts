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
 * PWA: writes dist/sw.js from src/pwa/sw.js with this build's exact file lists.
 *   shell  — index.html, every emitted JS/CSS file (entry + AI worker), the
 *            manifest and the 192-px icons: the minimum to start and play.
 *   assets — the optimized runtime images (WebP derivatives) only. Never the PNG
 *            source sheets (the build fails if one is bundled), never music/video.
 * All paths are relative to sw.js, so the same build works under any subpath.
 * BUILD is a hash of every emitted file, so any change yields a new shell cache.
 */
export function pwaPlugin(): Plugin {
  return {
    name: 'sticks-pwa',
    apply: 'build',
    enforce: 'post', // after Vite's HTML plugin, so index.html is in the bundle and in the hash
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).sort();
      const shell = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-maskable-192.png', ...files.filter((f) => /\.(js|css|woff2)$/.test(f))];
      const assets = files.filter((f) => /\.webp$/.test(f));
      if (files.some((f) => /\.png$/.test(f))) this.error('a PNG source sheet is in the bundle; only WebP derivatives may be cached');
      const h = createHash('sha256');
      for (const f of files) {
        const item = bundle[f]!;
        h.update(f).update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      // Public files (manifest, icons) are copied verbatim, outside the bundle: hash them too.
      for (const f of shell.filter((x) => !files.includes(x))) h.update(f).update(readFileSync(new URL(`./public/${f}`, import.meta.url)));
      if (!files.includes('index.html')) this.error('index.html missing from the bundle at generateBundle time');
      const build = h.digest('hex').slice(0, 12);
      const src = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
        .replace('__SB_BUILD__;', `${JSON.stringify(build)};`)
        .replace('__SB_SHELL__;', `${JSON.stringify(shell)};`)
        .replace('__SB_ASSETS__;', `${JSON.stringify(assets)};`);
      if (/__SB_(BUILD|SHELL|ASSETS)__;/.test(src)) this.error('sw.js placeholders were not replaced');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ build, shell, assets }, null, 1) });
    },
  };
}

export default defineConfig({
  base,
  plugins: [pwaPlugin()],
  define: { __SB_BUILD_TAG__: JSON.stringify(process.env.SB_BUILD_TAG ?? 'local') },
  build: {
    target: 'es2022',
    assetsInlineLimit: 4096,
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
