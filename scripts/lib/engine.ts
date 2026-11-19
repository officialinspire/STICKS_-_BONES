/**
 * Which browser engine a release suite drives: `SB_BROWSER=chromium|firefox|webkit` (default chromium).
 *
 * Every suite launches through `engine` so the same assertions run in each engine. Where the HARNESS (not the
 * app) has no way to do something in an engine — a DevTools-only emulation such as safe-area insets, a quota
 * override or stopping service workers — the suite calls `unsupported()`. That records the gap explicitly in
 * test-results/release/unsupported-<engine>.jsonl and in the suite's output; it is never counted as a pass and
 * never silently skipped (`npm run release` lists every one in its report).
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = require('playwright') as typeof import('playwright');

export type EngineName = 'chromium' | 'firefox' | 'webkit';
const wanted = (process.env.SB_BROWSER ?? 'chromium').toLowerCase();
if (!['chromium', 'firefox', 'webkit'].includes(wanted)) throw new Error(`SB_BROWSER must be chromium, firefox or webkit (got ${wanted})`);
export const ENGINE = wanted as EngineName;
export const IS_CHROMIUM = ENGINE === 'chromium';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const engine: any = (pw as unknown as Record<EngineName, unknown>)[ENGINE];

/**
 * Harness capabilities by engine (Playwright's API surface, verified by running it — not app behaviour).
 *  - cdp: DevTools protocol sessions (Chromium only): safe-area insets, quota override, stopping workers,
 *    installability, browser default font size.
 *  - offlineNavigation: `context.setOffline(true)` while NAVIGATING. Playwright's WebKit fails every navigation
 *    with "WebKit encountered an internal error" under it, even when the service worker would serve the page
 *    (measured 2026-11-19, WebKit 26.6: the same reload with the server unreachable but emulation off loads from
 *    the worker). In WebKit, offline restarts therefore make the ORIGIN unreachable instead (the app still gets no
 *    network) and the emulation gap is recorded with `unsupported()`.
 */
export const HARNESS = { cdp: IS_CHROMIUM, offlineNavigation: ENGINE !== 'webkit' } as const;

/** Launch options for the selected engine. Firefox: the browser's default text size via its preference. */
export function launchOptions(o: { textScalePct?: number } = {}): Record<string, unknown> {
  if (ENGINE === 'firefox' && o.textScalePct) return { firefoxUserPrefs: { 'font.size.variable.x-western': Math.round((16 * o.textScalePct) / 100), 'font.size.monospace.x-western': Math.round((13 * o.textScalePct) / 100) } };
  return {};
}

const out = fileURLToPath(new URL('../../test-results/release/', import.meta.url));
/** Record a check the harness cannot perform in this engine (explicit, reported, never a pass). */
export function unsupported(suite: string, check: string, why: string): void {
  mkdirSync(out, { recursive: true });
  appendFileSync(join(out, `unsupported-${ENGINE}.jsonl`), JSON.stringify({ suite, check, why, at: new Date().toISOString() }) + '\n');
  console.log(`  ⚠ UNSUPPORTED in ${ENGINE} (${suite}): ${check} — ${why}`);
}
