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
if (errors.length) {
  console.error('dist check failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`dist check passed: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB, base "${base}".`);
