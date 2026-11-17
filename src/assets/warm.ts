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
import { urlFor, type RuntimeAssetId, type WarmKey } from './index';
import { envKey } from './env';

export type WarmState = 'queued' | 'loading' | 'ready' | 'failed';

const state = new Map<WarmKey, WarmState>();
const waiters = new Map<WarmKey, Promise<boolean>>();
const queue: WarmKey[] = [];
let active = 0;
let limit = 2;
/**
 * Strong refs so decoded images are not collected before first use. Menu/table art is pinned; story
 * art (chapter backdrops, portrait crops, cast sheets) is kept for the most recent STORY_KEEP keys only,
 * so a long case never pins every decoded chapter (memory pressure on phones). An evicted key may be
 * warmed again later (the HTTP/offline cache makes that cheap).
 */
const keep = new Map<WarmKey, HTMLImageElement>();
export const STORY_KEEP = 4;
const PINNED: ReadonlySet<string> = new Set(['env.neighborhood-patio', 'env.neighborhood-patio@portrait', 'cousin.atlas.portrait', 'cousin.anim.slam', 'fx.sheet', 'tile.atlas', 'table.weathered']);
function retain(id: WarmKey, img: HTMLImageElement): void {
  keep.delete(id);
  keep.set(id, img);
  if (PINNED.has(id)) return;
  const story = [...keep.keys()].filter((k) => !PINNED.has(k));
  for (const k of story.slice(0, Math.max(0, story.length - STORY_KEEP))) {
    keep.delete(k);
    state.delete(k);
    waiters.delete(k);
    resolvers.delete(k);
  }
}
/** Decoded images currently held (tests and the leak check). */
export function retainedImages(): number {
  return keep.size;
}
const resolvers = new Map<WarmKey, (ok: boolean) => void>();

export function warmState(id: WarmKey): WarmState | undefined {
  return state.get(id);
}

function pump(): void {
  while (active < limit && queue.length) {
    const id = queue.shift()!;
    const url = urlFor(id);
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
      if (ok) retain(id, img);
      else img.src = '';
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
export function warm(ids: readonly WarmKey[], opts: { front?: boolean; concurrency?: number } = {}): Promise<boolean[]> {
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

/** Startup set: the menu backdrop (the portrait crop on portrait screens) and Cousin's portrait. */
export function essentialAssets(): WarmKey[] {
  return [envKey('env.neighborhood-patio'), 'cousin.atlas.portrait'];
}

/**
 * The same bounded queue, with retries: a failed image is re-queued after a short backoff
 * (attempts total, delays baseMs, 2×baseMs, …). `onSettle` reports each id once, with its final
 * result and how many attempts it took, so the caller can show truthful progress.
 * Resolves true only if every id loaded. Nothing here waits longer than the network does.
 */
export async function warmWithRetry(
  ids: readonly WarmKey[],
  o: { attempts?: number; baseMs?: number; front?: boolean; onSettle?: (id: WarmKey, ok: boolean, attempts: number) => void; wait?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const attempts = Math.max(1, o.attempts ?? 3);
  const base = o.baseMs ?? 400;
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const one = async (id: WarmKey): Promise<boolean> => {
    if (state.get(id) === 'failed') forget(id); // an explicit retry fetches again
    for (let n = 1; ; n++) {
      const [ok] = await warm([id], { front: o.front });
      if (ok || n >= attempts || !urlFor(id)) {
        o.onSettle?.(id, Boolean(ok), n);
        return Boolean(ok);
      }
      await wait(base * 2 ** (n - 1));
      if (state.get(id) === 'failed') forget(id); // a later caller may already have re-queued it
    }
  };
  return (await Promise.all(ids.map(one))).every(Boolean);
}

/** Drop a failed id so the next warm() fetches it again. */
function forget(id: WarmKey): void {
  state.delete(id);
  waiters.delete(id);
  resolvers.delete(id);
}
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
  keep.clear();
  active = 0;
  limit = 2;
}
