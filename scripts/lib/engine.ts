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

/**
 * WebKit reports a SAME-ORIGIN request that a navigation (reload, goto) cancelled as "… due to access control
 * checks." This app makes no cross-origin requests, so on our own localhost origin that message can only be such a
 * cancellation. True (and recorded with unsupported(), never dropped silently) only for exactly that, in WebKit;
 * any other message, any other engine or origin stays a failure.
 */
export function isWebkitNavigationCancel(suite: string, message: string): boolean {
  if (ENGINE !== 'webkit') return false;
  const m = /(?:^|\s)(?:Cannot load |Failed to load resource: )?(?:https?:)?\/{1,2}localhost:\d+(\/\S*) due to access control checks\.?$/.exec(message.trim());
  if (!m) return false;
  unsupported(suite, 'a clean console while a navigation cancels in-flight requests', `WebKit reports a cancelled same-origin request as an access-control error (e.g. ${m[1]})`);
  return true;
}

/**
 * WebKit (under Playwright) reports a resource load that a SERVICE WORKER could not satisfy — the origin unreachable,
 * a file missing — as a "page error" with no JavaScript stack ("TypeError: Load failed", "Connection terminated
 * unexpectedly", "Cannot load …", or the bare URL), where Chromium reports a console resource error. A real exception
 * thrown by page code has a stack, so it never matches. Recorded with unsupported(); any other error still fails.
 */
export function isWebkitFailedLoadReport(suite: string, e: { message: string; stack?: string }): boolean {
  if (ENGINE !== 'webkit') return false;
  const stack = (e.stack ?? '').replace(e.message, '').trim();
  if (stack) return false;
  const m = e.message.trim();
  if (!/^(TypeError: Load failed|Connection terminated unexpectedly|Cannot load .*|\/{0,2}(?:https?:\/\/)?localhost:\d+\/\S+\.)$/.test(m)) return false;
  unsupported(suite, 'no page errors while loads fail (origin unreachable or a file missing)', 'WebKit reports a failed service-worker load as a stackless page error (Chromium: a console resource error)');
  return true;
}
