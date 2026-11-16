/**
 * Image warm-up with bounded concurrency.
 *
 * Startup loads only what the first screens need (`essentials`); everything
 * else is warmed in the background, at most `concurrency` downloads at a time,
 * so it never competes with the essentials or with a player's first tap.
 * Each image is fetched AND decoded (`img.decode()` decodes off the main thread
 * where supported), so its first on-screen use is a cache hit. Failures are
 * ignored: every image has a drawn fallback. Timings are recorded as
 * `performance` measures named `asset:<id>` for profiling.
 */
import { assetUrl, type RuntimeAssetId } from './index';

export type WarmState = 'queued' | 'loading' | 'ready' | 'failed';

const state = new Map<RuntimeAssetId, WarmState>();
const waiters = new Map<RuntimeAssetId, Promise<boolean>>();
const queue: RuntimeAssetId[] = [];
let active = 0;
let limit = 2;
/** Strong refs so decoded images are not collected before first use. */
const keep: HTMLImageElement[] = [];
const resolvers = new Map<RuntimeAssetId, (ok: boolean) => void>();

export function warmState(id: RuntimeAssetId): WarmState | undefined {
  return state.get(id);
}

function pump(): void {
  while (active < limit && queue.length) {
    const id = queue.shift()!;
    const url = assetUrl(id);
    if (!url || typeof Image === 'undefined') {
      state.set(id, 'failed');
      resolvers.get(id)?.(false);
      continue;
    }
    active++;
    state.set(id, 'loading');
    const t0 = performance.now();
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const done = (ok: boolean) => {
      active--;
      state.set(id, ok ? 'ready' : 'failed');
      if (ok) keep.push(img);
      try {
        performance.measure(`asset:${id}`, { start: t0, end: performance.now() });
      } catch {
        /* measure() options unsupported */
      }
      resolvers.get(id)?.(ok);
      pump();
    };
    (img.decode ? img.decode() : new Promise<void>((res, rej) => ((img.onload = () => res()), (img.onerror = rej)))).then(
      () => done(true),
      () => done(false),
    );
  }
}

/**
 * Queue images for warm-up (already queued/loaded ids are ignored).
 * `front` puts them ahead of queued background work. Resolves per id with success.
 */
export function warm(ids: readonly RuntimeAssetId[], opts: { front?: boolean; concurrency?: number } = {}): Promise<boolean[]> {
  if (opts.concurrency) limit = Math.max(1, opts.concurrency);
  const fresh = ids.filter((id) => !state.has(id));
  for (const id of fresh) {
    state.set(id, 'queued');
    waiters.set(id, new Promise<boolean>((r) => resolvers.set(id, r)));
  }
  if (opts.front) {
    // Promote: move these ids (fresh or already queued) to the head of the queue.
    for (const id of [...ids].reverse()) {
      const i = queue.indexOf(id);
      if (i >= 0) queue.splice(i, 1);
      if (state.get(id) === 'queued') queue.unshift(id);
    }
  } else queue.push(...fresh);
  pump();
  return Promise.all(ids.map((id) => waiters.get(id) ?? Promise.resolve(state.get(id) === 'ready')));
}

/** Startup set: the menu backdrop and Cousin's portrait. */
export const ESSENTIAL_ASSETS: readonly RuntimeAssetId[] = ['env.neighborhood-patio', 'cousin.atlas.portrait'];
/** Everything that may be warmed after the menu is up, in the order a first game needs them. */
export const DEFERRED_ASSETS: readonly RuntimeAssetId[] = ['tile.atlas', 'table.weathered', 'fx.sheet', 'cousin.anim.slam'];

/**
 * The deferred set for this device and these settings: effects only when motion
 * is allowed; the slam strip only where it can actually play (full-figure host
 * on wide screens, motion and host animation on). Anything skipped still loads
 * on first use.
 */
export function deferredAssets(o: { reduceMotion: boolean; wide: boolean; hostAnimation: boolean }): RuntimeAssetId[] {
  return DEFERRED_ASSETS.filter((id) => (id === 'fx.sheet' ? !o.reduceMotion : id === 'cousin.anim.slam' ? o.wide && !o.reduceMotion && o.hostAnimation : true));
}

/** Test hook. */
export function _resetWarm(): void {
  state.clear();
  waiters.clear();
  resolvers.clear();
  queue.length = 0;
  keep.length = 0;
  active = 0;
  limit = 2;
}
