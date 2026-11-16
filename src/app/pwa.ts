/**
 * Page side of the PWA: registers this app's service worker (scope = the app's
 * own directory, so it works under any GitHub Pages subpath), reports offline
 * readiness, surfaces a waiting update, and runs the targeted repair.
 *
 * Isolation: only `inspire:sticks-and-bones:*` caches and this app's own
 * registration are ever touched. Saves/settings live in localStorage and are
 * NOT affected by repair; erasing them is a separate, explicit action
 * (`eraseLocalData`), which removes only `sticks-and-bones.*` keys.
 */
export const CACHE_PREFIX = 'inspire:sticks-and-bones:';
export const LOCAL_PREFIX = 'sticks-and-bones.';
const UPDATED_FLAG = 'sticks-and-bones.updated';

export interface CacheStatus {
  build: string;
  shell: { cached: number; total: number };
  assets: { cached: number; total: number };
  bytes: number;
  error: 'quota' | 'network' | null;
  busy: boolean;
}

export type OfflineState =
  | { kind: 'unsupported' } // no service worker (old browser, private mode in some browsers, dev server)
  | { kind: 'installing'; done?: number; total?: number }
  | { kind: 'ready'; status: CacheStatus }
  | { kind: 'partial'; status: CacheStatus } // shell cached, some images not (the game still works offline with fallbacks)
  | { kind: 'quota'; status: CacheStatus | null }
  | { kind: 'error'; message: string };

export interface PwaView {
  readonly offline: OfflineState;
  readonly updateReady: boolean;
}

export function describeOffline(s: OfflineState): { text: string; ready: boolean } {
  const kb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  switch (s.kind) {
    case 'unsupported':
      return { text: 'Offline play isn’t available in this browser — the game works online.', ready: false };
    case 'installing':
      return { text: s.total ? `Saving for offline play… ${s.done ?? 0} of ${s.total} images` : 'Saving for offline play…', ready: false };
    case 'ready':
      return { text: `Ready to play offline (${kb(s.status.bytes)} saved on this device). Music needs a connection.`, ready: true };
    case 'partial':
      return {
        text: `Playable offline; ${s.status.assets.total - s.status.assets.cached} of ${s.status.assets.total} images still to download${s.status.error === 'network' ? ' (connection interrupted — Repair offline files to retry)' : ''}. Missing art is drawn by the game.`,
        ready: true,
      };
    case 'quota':
      return { text: 'Not enough storage on this device for the offline files. The game still works online; free up space, then Repair offline files.', ready: false };
    case 'error':
      return { text: `Offline files unavailable: ${s.message}`, ready: false };
  }
}

function classify(st: CacheStatus): OfflineState {
  if (st.error === 'quota' && st.shell.cached < st.shell.total) return { kind: 'quota', status: st };
  if (st.shell.cached < st.shell.total) return st.busy ? { kind: 'installing' } : { kind: 'error', message: 'app files incomplete — Repair offline files' };
  if (st.assets.cached < st.assets.total) return st.error === 'quota' ? { kind: 'quota', status: st } : st.busy ? { kind: 'installing', done: st.assets.cached, total: st.assets.total } : { kind: 'partial', status: st };
  return { kind: 'ready', status: st };
}

function ask(worker: ServiceWorker, type: string, timeoutMs = 60_000): Promise<CacheStatus | null> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data as CacheStatus);
    };
    worker.postMessage({ type }, [ch.port2]);
  });
}

export class PwaController {
  #reg: ServiceWorkerRegistration | null = null;
  #view: PwaView = { offline: { kind: 'installing' }, updateReady: false };
  #listeners = new Set<(v: PwaView) => void>();
  #reloading = false;

  get view(): PwaView {
    return this.#view;
  }

  subscribe(fn: (v: PwaView) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #set(p: Partial<PwaView>): void {
    this.#view = { ...this.#view, ...p };
    this.#listeners.forEach((f) => f(this.#view));
  }

  /** The app's root URL (one level above the hashed entry chunk in assets/). */
  static appRoot(): URL {
    // Intentionally resolved at runtime (the entry chunk lives in assets/, one level below the app
    // root), so the same build works under any GitHub Pages subpath. Verified by npm run pwa / smoke.
    return new URL(/* @vite-ignore */ '../', import.meta.url);
  }

  async start(): Promise<void> {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
      this.#set({ offline: { kind: 'unsupported' } });
      return;
    }
    const root = PwaController.appRoot();
    try {
      this.#reg = await navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname, updateViaCache: 'none' });
    } catch (e) {
      this.#set({ offline: { kind: 'error', message: e instanceof Error ? e.message : String(e) } });
      return;
    }
    const reg = this.#reg;
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data as { type?: string; done?: number; total?: number; error?: string | null };
      if (d?.type === 'SB_INSTALL_FAILED') {
        this.#set({ offline: d.error === 'quota' ? { kind: 'quota', status: null } : { kind: 'error', message: 'the download was interrupted — it will retry on your next visit, or use Repair offline files' } });
        return;
      }
      if (d?.type !== 'SB_PROGRESS') return;
      if (d.error === 'quota') void this.refresh();
      else if ((d.done ?? 0) >= (d.total ?? 0)) void this.refresh();
      else this.#set({ offline: { kind: 'installing', done: d.done, total: d.total } });
    });
    const watch = (w: ServiceWorker | null) => {
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) this.#set({ updateReady: !!reg.waiting });
        if (w.state === 'activated') void this.refresh();
        if (w.state === 'redundant') void this.refresh();
      });
    };
    reg.addEventListener('updatefound', () => watch(reg.installing));
    watch(reg.installing);
    if (reg.waiting && navigator.serviceWorker.controller) this.#set({ updateReady: true });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.#reloading) location.reload();
      else void this.refresh();
    });
    // Look for a new build when the player comes back to the tab, and every 30 minutes.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => undefined));
    setInterval(() => void reg.update().catch(() => undefined), 30 * 60_000);
    await this.refresh();
  }

  /** Re-read offline readiness from the active worker. */
  async refresh(): Promise<OfflineState> {
    const reg = this.#reg;
    const active = reg?.active;
    if (!reg || !active) {
      const s: OfflineState = reg?.installing || reg?.waiting ? { kind: 'installing' } : this.#view.offline.kind === 'installing' ? { kind: 'error', message: 'offline files not saved yet — they download on your next online visit, or use Repair offline files' } : this.#view.offline;
      this.#set({ offline: s });
      return s;
    }
    const st = await ask(active, 'SB_STATUS', 10_000);
    const s = st ? classify(st) : ({ kind: 'error', message: 'the offline helper did not answer' } as OfflineState);
    this.#set({ offline: s, updateReady: !!reg.waiting && !!navigator.serviceWorker.controller });
    return s;
  }

  /**
   * Apply a waiting update. `beforeReload` must leave the game in a stable,
   * saved state with no hand showing (the caller covers the table and writes
   * the save); only then does the new worker take over and the page reload.
   */
  applyUpdate(beforeReload: () => void): boolean {
    const w = this.#reg?.waiting;
    if (!w) return false;
    beforeReload();
    try {
      sessionStorage.setItem(UPDATED_FLAG, '1');
    } catch {
      /* storage blocked: the notice is just skipped */
    }
    this.#reloading = true;
    w.postMessage({ type: 'SB_SKIP_WAITING' });
    return true;
  }

  /** Targeted repair: re-download this app's offline files. Saves and settings are untouched. */
  async repair(): Promise<OfflineState> {
    const active = this.#reg?.active;
    this.#set({ offline: { kind: 'installing' } });
    if (!active) {
      // No worker yet: clear only our caches; the next online visit rebuilds them.
      await clearOwnCaches();
      return this.refresh();
    }
    const st = await ask(active, 'SB_REPAIR', 120_000);
    const s = st ? classify(st) : ({ kind: 'error', message: 'repair did not finish' } as OfflineState);
    this.#set({ offline: s });
    return s;
  }
}

/** Delete only this app's caches (never another app's on the same origin). */
export async function clearOwnCaches(store: Pick<CacheStorage, 'keys' | 'delete'> | undefined = globalThis.caches): Promise<string[]> {
  if (!store) return [];
  const removed: string[] = [];
  for (const name of await store.keys()) {
    if (name.startsWith(CACHE_PREFIX)) {
      await store.delete(name);
      removed.push(name);
    }
  }
  return removed;
}

/** Erase saves, settings, statistics and their quarantined copies — only this app's keys. */
export function eraseLocalData(store: Pick<Storage, 'length' | 'key' | 'removeItem'> | null): string[] {
  if (!store) return [];
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(LOCAL_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => store.removeItem(k));
  return keys;
}

/** True once, right after a reload that applied an update. */
export function consumeUpdatedFlag(): boolean {
  try {
    const v = sessionStorage.getItem(UPDATED_FLAG) === '1';
    sessionStorage.removeItem(UPDATED_FLAG);
    return v;
  } catch {
    return false;
  }
}
