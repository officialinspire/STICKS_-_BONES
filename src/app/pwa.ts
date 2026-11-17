/**
 * Page side of the PWA: registers this app's service worker (scope = the app's
 * own directory, so it works under any GitHub Pages subpath), reports what is
 * ready offline (Quick Play / each story chapter / the whole story / optional
 * audio), runs the player's explicit downloads with measured sizes and progress,
 * surfaces a waiting update, and runs the targeted repair.
 *
 * Isolation: only `inspire:sticks-and-bones:*` caches and this app's own
 * registration are ever touched. Saves/settings live in localStorage and are
 * NOT affected by repair; erasing them is a separate, explicit action
 * (`eraseLocalData`), which removes only `sticks-and-bones.*` keys.
 */
import { readRecord, writeRecord, type KeyValueStore, type RecordSpec } from './storage';

export const CACHE_PREFIX = 'inspire:sticks-and-bones:';
export const LOCAL_PREFIX = 'sticks-and-bones.';
const UPDATED_FLAG = 'sticks-and-bones.updated';

export type Group = 'shell' | 'core' | 'story' | 'audio';
export interface GroupStatus {
  cached: number;
  total: number;
  bytes: number;
  totalBytes: number;
  error: 'quota' | 'network' | null;
  busy: boolean;
  /** story only: the files already saved (relative URLs) — used to tell which chapters are ready. */
  have?: string[];
}
export interface CacheStatus {
  build: string;
  shell: GroupStatus;
  core: GroupStatus;
  story: GroupStatus;
  audio: GroupStatus;
}
export interface Progress {
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

export type OfflineState =
  | { kind: 'unsupported' } // no service worker (old browser, private mode in some browsers, dev server)
  | { kind: 'installing'; progress?: Progress }
  | { kind: 'ready'; status: CacheStatus } // shell + core: Quick Play fully offline
  | { kind: 'partial'; status: CacheStatus } // shell cached, some core files not (the game still works offline with fallbacks)
  | { kind: 'quota'; status: CacheStatus | null }
  | { kind: 'error'; message: string };

/** A player-chosen download (whole story or offline audio) and how it is going. */
export type JobState =
  | { kind: 'idle' }
  | { kind: 'running'; progress: Progress }
  | { kind: 'done'; missing: number }
  | { kind: 'interrupted'; progress: Progress } // network failure or the browser stopped the worker: Retry continues
  | { kind: 'quota'; needed: number; available: number | null }
  | { kind: 'unavailable'; reason: string };

export interface PwaView {
  readonly offline: OfflineState;
  readonly updateReady: boolean;
  readonly jobs: Readonly<Record<'story' | 'audio', JobState>>;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export function describeOffline(s: OfflineState): { text: string; ready: boolean } {
  switch (s.kind) {
    case 'unsupported':
      return { text: 'Offline play isn’t available in this browser — the game works online.', ready: false };
    case 'installing':
      return { text: s.progress ? `Saving for offline play… ${s.progress.done} of ${s.progress.total} files` : 'Saving for offline play…', ready: false };
    case 'ready':
      return { text: `Quick Play is ready offline (${mb(s.status.shell.bytes + s.status.core.bytes)} on this device).`, ready: true };
    case 'partial':
      return {
        text: `Playable offline; ${s.status.core.total - s.status.core.cached} of ${s.status.core.total} table files still to download${s.status.core.error === 'network' ? ' (connection interrupted — Repair offline files to retry)' : ''}. Missing art is drawn by the game.`,
        ready: true,
      };
    case 'quota':
      return { text: 'Not enough storage on this device for the offline files. The game still works online; free up space, then Repair offline files.', ready: false };
    case 'error':
      return { text: `Offline files unavailable: ${s.message}`, ready: false };
  }
}

/** Which story chapters can be played offline right now (their images for this screen shape are saved). */
export function chaptersReady(have: readonly string[] | undefined, chapterFiles: Readonly<Record<string, readonly string[]>>): string[] {
  const got = new Set((have ?? []).map((u) => u.replace(/^\.?\//, '')));
  return Object.entries(chapterFiles)
    .filter(([, files]) => files.every((f) => got.has(f)))
    .map(([id]) => id);
}

export function describeStory(st: CacheStatus | null, job: JobState, readyChapters: number, chapters: number): string {
  if (!st) return 'Story chapters need a connection until offline files are available in this browser.';
  if (job.kind === 'running') return `Downloading the whole story… ${mb(job.progress.bytesDone)} of ${mb(job.progress.bytesTotal)}`;
  if (st.story.cached >= st.story.total) return `The whole story is ready offline (${mb(st.story.totalBytes)}).`;
  const base = readyChapters ? `${readyChapters} of ${chapters} story scenes are ready offline (the ones you have opened, and the next one).` : 'Only the app is ready offline; story scenes download as you play them.';
  if (job.kind === 'interrupted') return `${base} The story download was interrupted at ${mb(job.progress.bytesDone)} of ${mb(job.progress.bytesTotal)} — Retry continues where it stopped.`;
  if (job.kind === 'quota') return `${base} Not enough storage for the whole story: it needs ${mb(job.needed)}${job.available !== null ? `, about ${mb(job.available)} is free` : ''}.`;
  if (job.kind === 'unavailable') return `${base} ${job.reason}`;
  return base;
}

export function describeAudio(st: CacheStatus | null, job: JobState): string {
  if (!st) return 'Music and ambience stream online only in this browser.';
  if (job.kind === 'running') return `Downloading offline audio… ${mb(job.progress.bytesDone)} of ${mb(job.progress.bytesTotal)}`;
  if (st.audio.cached >= st.audio.total && st.audio.total > 0) return `Music and ambience are saved for offline play (${mb(st.audio.totalBytes)}).`;
  const off = `Offline, the game is silent apart from table and story sounds. Music and ambience are an optional ${mb(st.audio.totalBytes)} extra download.`;
  if (job.kind === 'done' && job.missing) return `${off} (${job.missing} audio file${job.missing === 1 ? ' was' : 's were'} unavailable and skipped.)`;
  if (job.kind === 'interrupted') return `${off} The download was interrupted at ${mb(job.progress.bytesDone)} — Retry continues.`;
  if (job.kind === 'quota') return `${off} Not enough storage: it needs ${mb(job.needed)}${job.available !== null ? `, about ${mb(job.available)} is free` : ''}.`;
  if (job.kind === 'unavailable') return `${off} ${job.reason}`;
  return off;
}

function classify(st: CacheStatus): OfflineState {
  if (st.shell.error === 'quota' && st.shell.cached < st.shell.total) return { kind: 'quota', status: st };
  if (st.shell.cached < st.shell.total) return st.core.busy ? { kind: 'installing' } : { kind: 'error', message: 'app files incomplete — Repair offline files' };
  if (st.core.cached < st.core.total) return st.core.error === 'quota' ? { kind: 'quota', status: st } : st.core.busy ? { kind: 'installing', progress: { done: st.core.cached, total: st.core.total, bytesDone: st.core.bytes, bytesTotal: st.core.totalBytes } } : { kind: 'partial', status: st };
  return { kind: 'ready', status: st };
}

function ask<T>(worker: ServiceWorker, msg: Record<string, unknown>, timeoutMs = 60_000): Promise<T | null> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data as T);
    };
    worker.postMessage(msg, [ch.port2]);
  });
}

/** The player's offline choices (re-applied by Repair). A versioned local record; repair never touches it. */
export interface OfflinePrefs {
  readonly story: boolean;
  readonly audio: boolean;
}
export const OFFLINE_PREFS_SPEC: RecordSpec<OfflinePrefs> = {
  key: 'sticks-and-bones.offline',
  format: 'sticks-and-bones/offline',
  version: 1,
  validate: (d) => (typeof d === 'object' && d !== null && typeof (d as OfflinePrefs).story === 'boolean' && typeof (d as OfflinePrefs).audio === 'boolean' ? { story: (d as OfflinePrefs).story, audio: (d as OfflinePrefs).audio } : null),
};

export class PwaController {
  #reg: ServiceWorkerRegistration | null = null;
  #view: PwaView = { offline: { kind: 'installing' }, updateReady: false, jobs: { story: { kind: 'idle' }, audio: { kind: 'idle' } } };
  #status: CacheStatus | null = null;
  #listeners = new Set<(v: PwaView) => void>();
  #reloading = false;
  #store: KeyValueStore | null;

  constructor(store: KeyValueStore | null = null) {
    this.#store = store;
  }

  get view(): PwaView {
    return this.#view;
  }
  get status(): CacheStatus | null {
    return this.#status;
  }
  get prefs(): OfflinePrefs {
    return readRecord(this.#store, OFFLINE_PREFS_SPEC).value ?? { story: false, audio: false };
  }

  subscribe(fn: (v: PwaView) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #set(p: Partial<PwaView>): void {
    this.#view = { ...this.#view, ...p };
    this.#listeners.forEach((f) => f(this.#view));
  }
  #job(g: 'story' | 'audio', j: JobState): void {
    this.#set({ jobs: { ...this.#view.jobs, [g]: j } });
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
      const d = e.data as { type?: string; group?: Group; finished?: boolean; error?: string | null; missing?: number } & Partial<Progress>;
      if (d?.type === 'SB_INSTALL_FAILED') {
        this.#set({ offline: d.error === 'quota' ? { kind: 'quota', status: null } : { kind: 'error', message: 'the download was interrupted — it will retry on your next visit, or use Repair offline files' } });
        return;
      }
      if (d?.type !== 'SB_PROGRESS') return;
      const progress: Progress = { done: d.done ?? 0, total: d.total ?? 0, bytesDone: d.bytesDone ?? 0, bytesTotal: d.bytesTotal ?? 0 };
      if (d.group === 'story' || d.group === 'audio') {
        if (!d.finished) this.#job(d.group, { kind: 'running', progress });
        else this.#job(d.group, d.error === 'quota' ? { kind: 'quota', needed: progress.bytesTotal - progress.bytesDone, available: null } : d.error === 'network' || progress.done + (d.missing ?? 0) < progress.total ? { kind: 'interrupted', progress } : { kind: 'done', missing: d.missing ?? 0 });
        if (d.finished) void this.refresh();
        return;
      }
      if (d.finished || d.error === 'quota') void this.refresh();
      else this.#set({ offline: { kind: 'installing', progress } });
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
    const st = await ask<CacheStatus>(active, { type: 'SB_STATUS' }, 10_000);
    this.#status = st;
    const s = st ? classify(st) : ({ kind: 'error', message: 'the offline helper did not answer' } as OfflineState);
    this.#set({ offline: s, updateReady: !!reg.waiting && !!navigator.serviceWorker.controller });
    return s;
  }

  /**
   * The player's explicit download of the whole story or the optional audio. Checks storage first
   * (needed vs. the browser's estimate), asks to keep the files (persistent storage, if offered), then
   * downloads with progress. Interrupted downloads keep what finished; Retry continues.
   */
  async download(group: 'story' | 'audio'): Promise<JobState> {
    const active = this.#reg?.active;
    if (!active || !this.#status) {
      const j: JobState = { kind: 'unavailable', reason: 'Offline files aren’t available in this browser right now.' };
      this.#job(group, j);
      return j;
    }
    const g = this.#status[group];
    const needed = g.totalBytes - g.bytes;
    try {
      const est = await navigator.storage?.estimate?.();
      const free = est && typeof est.quota === 'number' && typeof est.usage === 'number' ? est.quota - est.usage : null;
      if (free !== null && free < needed * 1.1) {
        const j: JobState = { kind: 'quota', needed, available: free };
        this.#job(group, j);
        return j;
      }
      await navigator.storage?.persist?.().catch(() => false);
    } catch {
      /* no estimate: try anyway; a quota error is reported by the worker */
    }
    writeRecord(this.#store, OFFLINE_PREFS_SPEC, { ...this.prefs, [group]: true });
    this.#job(group, { kind: 'running', progress: { done: g.cached, total: g.total, bytesDone: g.bytes, bytesTotal: g.totalBytes } });
    const st = await ask<CacheStatus>(active, { type: 'SB_CACHE_GROUP', group }, 30 * 60_000);
    if (!st) {
      // The worker went away mid-download (browser stopped it, tab closed): what finished is kept.
      await this.refresh();
      const now = this.#status?.[group];
      const j: JobState = now && now.cached >= now.total ? { kind: 'done', missing: 0 } : { kind: 'interrupted', progress: { done: now?.cached ?? 0, total: g.total, bytesDone: now?.bytes ?? 0, bytesTotal: g.totalBytes } };
      this.#job(group, j);
      return j;
    }
    this.#status = st;
    this.#set({ offline: classify(st) });
    return this.#view.jobs[group];
  }

  /** Remove a downloaded group (e.g. offline audio). Only that one cache of this app is deleted. */
  async drop(group: 'story' | 'audio'): Promise<void> {
    writeRecord(this.#store, OFFLINE_PREFS_SPEC, { ...this.prefs, [group]: false });
    const active = this.#reg?.active;
    if (active) this.#status = await ask<CacheStatus>(active, { type: 'SB_DROP_GROUP', group }, 30_000);
    this.#job(group, { kind: 'idle' });
    await this.refresh();
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

  /** Targeted repair: re-download this app's offline files (and the groups the player chose). Saves and settings are untouched. */
  async repair(): Promise<OfflineState> {
    const active = this.#reg?.active;
    this.#set({ offline: { kind: 'installing' } });
    if (!active) {
      // No worker yet: clear only our caches; the next online visit rebuilds them.
      await clearOwnCaches();
      return this.refresh();
    }
    const p = this.prefs;
    const groups = (['story', 'audio'] as const).filter((g) => p[g]);
    const st = await ask<CacheStatus>(active, { type: 'SB_REPAIR', groups }, 30 * 60_000);
    this.#status = st;
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

/** Where to return after an update reload: written once before the reload, consumed once after. */
/** story: back to the case file, or (run) straight into the saved scene, line or hand. */
export type ResumeTarget = { readonly to: 'story'; readonly run?: boolean } | { readonly to: 'quick' } | { readonly to: 'menu' };
const RESUME_KEY = 'sticks-and-bones.update-resume';
export function setUpdateResume(t: ResumeTarget, ss: Pick<Storage, 'setItem'> | null = safeSession()): void {
  try {
    ss?.setItem(RESUME_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: the player lands on the menu, with the saved game offered */
  }
}
export function consumeUpdateResume(ss: Pick<Storage, 'getItem' | 'removeItem'> | null = safeSession()): ResumeTarget | null {
  try {
    const raw = ss?.getItem(RESUME_KEY) ?? null;
    ss?.removeItem(RESUME_KEY); // once: a second reload never repeats it
    const v = raw ? (JSON.parse(raw) as ResumeTarget) : null;
    return v && (v.to === 'story' || v.to === 'quick' || v.to === 'menu') ? v : null;
  } catch {
    return null;
  }
}
function safeSession(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
