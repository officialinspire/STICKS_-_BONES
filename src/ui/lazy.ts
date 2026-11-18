/**
 * Lazy chunks that can fail (a flaky connection, a deploy that replaced the chunk) and must be retryable.
 *
 * - `retryable(load)` caches the in-flight or loaded promise, but forgets a REJECTED one, so the next call
 *   (a Retry button) really loads again instead of replaying the old failure forever.
 * - `loadFailureHtml` / `bindLoadFailure` render one honest failure panel with Retry and Back.
 */
import { esc } from './svg';

export function retryable<T>(load: () => Promise<T>): { get(): Promise<T>; reset(): void } {
  let p: Promise<T> | null = null;
  return {
    get() {
      const mine = (p ??= load());
      return mine.catch((e: unknown) => {
        if (p === mine) p = null; // a later call tries again
        throw e;
      });
    },
    reset() {
      p = null;
    },
  };
}

export interface LoadFailure {
  readonly title: string;
  readonly body: string;
  readonly back: string;
}

export function loadFailureHtml(f: LoadFailure): string {
  return `<section class="load-failed panel" role="alert" aria-labelledby="load-failed-h">
    <h2 id="load-failed-h">${esc(f.title)}</h2>
    <p>${esc(f.body)}</p>
    <div class="load-failed-actions">
      <button type="button" class="btn primary" data-act="load-retry">Retry</button>
      <button type="button" class="btn-ghost" data-act="load-back">${esc(f.back)}</button>
    </div>
  </section>`;
}

/** Fill `el` with the failure panel and wire its two buttons (each acts once). Focus goes to Retry. */
export function bindLoadFailure(el: HTMLElement, f: LoadFailure, on: { retry(): void; back(): void }): void {
  el.innerHTML = loadFailureHtml(f);
  let used = false;
  const once = (fn: () => void) => () => {
    if (used) return;
    used = true;
    fn();
  };
  el.querySelector('[data-act="load-retry"]')?.addEventListener('click', once(on.retry));
  el.querySelector('[data-act="load-back"]')?.addEventListener('click', once(on.back));
  (el.querySelector('[data-act="load-retry"]') as HTMLElement | null)?.focus();
}
