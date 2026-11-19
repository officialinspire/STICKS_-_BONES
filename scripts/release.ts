/**
 * npm run release — the repeatable release workflow (docs/QA.md "Release workflow").
 *
 *   npm run release                       every suite, every installed engine (chromium, firefox, webkit)
 *   npm run release -- --engines firefox  one engine        --suites smoke,e2e   some suites
 *   npm run release -- --resume           keep suites that already passed in test-results/release/report.json
 *
 * Steps: `check` once (typecheck, lint, unit tests, assets:verify, production build + budgets) and `audio:report`
 * (engine-independent measurement), then each browser suite once PER ENGINE with SB_BROWSER set
 * (scripts/lib/engine.ts). Each suite's full log goes to test-results/release/<engine>/<suite>.log.
 *
 * The report (test-results/release/report.json and report.md) records the exact browser builds (name + version
 * from the launched browser), Playwright, Node, OS, the git SHA and the build tag, every suite's exit code and time,
 * and every check a suite could NOT perform in an engine (`unsupported()`), separately from failures. An engine that
 * cannot launch is reported as such. Exit code 1 if anything failed or could not run. Emulation is not a device.
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform, release as osRelease } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'test-results/release');
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const ENGINES = ['chromium', 'firefox', 'webkit'] as const;
type Engine = (typeof ENGINES)[number];
/** Browser suites, run in every engine. */
export const BROWSER_SUITES = ['smoke', 'release:sweep', 'e2e', 'qa', 'a11y', 'story:e2e', 'story:route', 'story:sweep', 'faults', 'audio', 'matches', 'pwa', 'offline:tour'] as const;
const engines = (opt('engines')?.split(',') ?? [...ENGINES]) as Engine[];
const suites = opt('suites')?.split(',') ?? [...BROWSER_SUITES];
const resume = args.includes('--resume');

interface Result { readonly suite: string; readonly engine: Engine | 'none'; readonly exit: number | null; readonly seconds: number; readonly status: 'pass' | 'fail' | 'not run'; readonly note?: string; readonly unsupported: { check: string; why: string }[] }
interface Report { readonly started: string; finished?: string; readonly sha: string; readonly dirty: boolean; readonly playwright: string; readonly node: string; readonly os: string; readonly browsers: Record<string, string>; readonly results: Result[] }

mkdirSync(out, { recursive: true });
const prev: Report | null = resume && existsSync(join(out, 'report.json')) ? (JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as Report) : null;
const sh = (c: string) => execSync(c, { cwd: root, encoding: 'utf8' }).trim();
const report: Report = {
  started: new Date().toISOString(),
  sha: sh('git rev-parse HEAD'),
  dirty: sh('git status --porcelain --untracked-files=no') !== '',
  playwright: (require('playwright/package.json') as { version: string }).version,
  node: process.version,
  os: `${platform()} ${osRelease()} ${arch()}`,
  browsers: { ...(prev?.browsers ?? {}) },
  results: [],
};
const kept = (suite: string, engine: Engine | 'none') => prev?.results.find((r) => r.suite === suite && r.engine === engine && r.status === 'pass');

function run(cmd: string, env: Record<string, string>, log: string): Promise<{ exit: number | null; seconds: number }> {
  const t = Date.now();
  return new Promise((done) => {
    const p = spawn('npm', ['run', cmd], { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const f = createWriteStream(log);
    p.stdout.pipe(f, { end: false });
    p.stderr.pipe(f, { end: false });
    p.on('close', (exit) => {
      f.end();
      done({ exit, seconds: Math.round((Date.now() - t) / 1000) });
    });
  });
}
const unsupportedOf = (engine: Engine, suite: string) => {
  const f = join(out, `unsupported-${engine}.jsonl`);
  if (!existsSync(f)) return [];
  const seen = new Set<string>();
  return readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { suite: string; check: string; why: string })
    .filter((u) => u.suite === suite && !seen.has(u.check) && seen.add(u.check)).map(({ check, why }) => ({ check, why }));
};
function save() {
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
  const rows = report.results.map((r) => `| ${r.engine} | \`${r.suite}\` | ${r.status === 'pass' ? 'pass' : r.status === 'fail' ? `**FAIL** (exit ${r.exit})` : `**not run**${r.note ? `: ${r.note}` : ''}`} | ${r.seconds} s | ${r.unsupported.length ? r.unsupported.map((u) => `${u.check} (${u.why})`).join('; ') : '—'} |`);
  writeFileSync(join(out, 'report.md'), [
    `# Release run ${report.started}`, '',
    `- Commit: \`${report.sha}\`${report.dirty ? ' (with uncommitted changes)' : ''}`,
    `- Playwright ${report.playwright}, Node ${report.node}, ${report.os}`,
    `- Browsers: ${Object.entries(report.browsers).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`,
    '- Headless engines under emulation (viewports, touch, reduced motion, text size). **Not real devices.**', '',
    '| Engine | Suite | Result | Time | Checks this engine could not perform (recorded, not passed) |', '| --- | --- | --- | ---: | --- |', ...rows, '',
  ].join('\n'));
}

async function main() {
  // Engine-independent: check (incl. the production build every browser suite serves) and the audio measurements.
  for (const s of ['check', 'audio:report']) {
    const k = kept(s, 'none');
    if (k) { report.results.push(k); continue; }
    const r = await run(s, {}, join(out, `${s.replace(':', '-')}.log`));
    report.results.push({ suite: s, engine: 'none', exit: r.exit, seconds: r.seconds, status: r.exit === 0 ? 'pass' : 'fail', unsupported: [] });
    save();
    if (s === 'check' && r.exit !== 0) return; // no build to test
  }
  for (const engine of engines) {
    const dir = join(out, engine);
    mkdirSync(dir, { recursive: true });
    if (!resume) rmSync(join(out, `unsupported-${engine}.jsonl`), { force: true });
    try {
      const pw = require('playwright') as Record<Engine, { launch(): Promise<{ version(): string; close(): Promise<void> }> }>;
      const b = await pw[engine].launch();
      report.browsers[engine] = b.version();
      await b.close();
    } catch (e) {
      for (const s of suites) report.results.push({ suite: s, engine, exit: null, seconds: 0, status: 'not run', note: `${engine} could not launch here: ${(e as Error).message.split('\n')[0]}`, unsupported: [] });
      save();
      continue;
    }
    for (const s of suites) {
      const k = kept(s, engine);
      if (k) { report.results.push(k); continue; }
      console.log(`[${engine}] ${s} …`);
      const r = await run(s, { SB_BROWSER: engine }, join(dir, `${s.replace(':', '-')}.log`));
      const res: Result = { suite: s, engine, exit: r.exit, seconds: r.seconds, status: r.exit === 0 ? 'pass' : 'fail', unsupported: unsupportedOf(engine, s) };
      report.results.push(res);
      console.log(`[${engine}] ${s}: ${res.status} (${r.seconds} s)${res.unsupported.length ? `, ${res.unsupported.length} unsupported check(s)` : ''}`);
      save();
    }
  }
}
await main();
report.finished = new Date().toISOString();
save();
const bad = report.results.filter((r) => r.status !== 'pass');
console.log(`\nrelease: ${report.results.length - bad.length}/${report.results.length} passed → ${join(out, 'report.md')}`);
if (bad.length) {
  for (const r of bad) console.log(`  ✗ ${r.engine} ${r.suite}: ${r.status}${r.note ? ` (${r.note})` : ''}`);
  process.exit(1);
}
