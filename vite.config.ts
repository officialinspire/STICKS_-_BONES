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

export default defineConfig({
  base,
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
