/**
 * Page side of the PWA: registers this app's service worker (scope = the app's
 * own directory, so it works under any GitHub Pages subpath), starts the
 * whole-game offline download once the menu is up (online only, Data Saver
 * respected), reports progress, storage and what is ready offline honestly,
 * offers installation, surfaces a waiting update, and runs the app-only repair.
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

export type Group = 'shell' | 'core' | 'story' | 'media';
export interface GroupStatus {
  /** Files present (a retained older-format copy counts: it still plays). */
  cached: number;
  total: number;
  bytes: number;
  totalBytes: number;
}
export type DownloadError = 'quota' | 'network' | 'missing' | 'corrupt' | 'storage';
/** What the service worker reports (cheap: presence and checksum headers; no re-hashing). */
export interface CacheStatus {
  build: string;
  busy: boolean;
  progress: Progress | null;
  last: { error: DownloadError | null; missing: number; corrupt: number; failed: number };
  totalBytes: number;
  totalFiles: number;
  shell: GroupStatus;
  core: GroupStatus;
  story: GroupStatus;
  media: GroupStatus;
  /** Relative paths present — used to tell which story scenes are ready. */
  have: string[];
  /** Files stored complete and checksum-verified for this build, and their bytes. */
  good: number;
  goodBytes: number;
  /** The build whose whole pack was last verified (re-hashed) on this device, if any. */
  verifiedBuild: string | null;
  /** True only when this build's pack was verified AND every file is still present. */
  verified: boolean;
  /** Files missing since this build was verified (evicted or removed by the browser). */
  damaged: number;
  /** Older builds' entries kept usable until this build's pack is verified. */
  retained: number;
  /** Set when storage can't be opened at all (private mode, site data blocked). */
  storage: string | null;
}
export interface Progress {
  phase?: 'install' | 'download' | 'verify';
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

export type OfflineState =
  | { kind: 'unsupported' } // no service worker (old browser, some private modes, dev server)
  | { kind: 'unavailable'; reason: string } // a worker, but storage refused (private mode, site data blocked)
  | { kind: 'installing'; progress?: Progress }
  | { kind: 'ready'; status: CacheStatus } // shell + core: Quick Play fully offline
  | { kind: 'partial'; status: CacheStatus } // shell saved, some core files not (the game still works with fallbacks)
  | { kind: 'quota'; status: CacheStatus | null }
  | { kind: 'error'; message: string };

/** The whole-game download and how it is going. */
export type FullJob =
  | { kind: 'idle' }
  | { kind: 'running'; progress: Progress }
  | { kind: 'verified' }
  | { kind: 'waiting' } // offline: starts by itself once a connection is back
  | { kind: 'save-data' } // the browser's Data Saver is on: waits for the player's Download
  | { kind: 'interrupted'; progress: Progress | null } // connection lost or the browser stopped the worker: resumes / Retry
  | { kind: 'missing'; count: number } // the server didn't have some files
  | { kind: 'corrupt'; count: number } // files arrived damaged twice and were discarded
  | { kind: 'quota'; needed: number; available: number | null }
  | { kind: 'unavailable'; reason: string };

export interface StorageInfo {
  /** The browser's estimate of free space for this site (shared by every app on the origin), if it gives one. */
  free: number | null;
  /** Whether the browser promised to keep this site's storage (navigator.storage.persisted). */
  persisted: boolean | null;
}

export interface PwaView {
  readonly offline: OfflineState;
  readonly status: CacheStatus | null;
  readonly full: FullJob;
  readonly storage: StorageInfo;
  readonly updateReady: boolean;
  /** "available": the browser offered installation; "installed": running as the installed app. */
  readonly install: 'available' | 'installed' | 'none';
  /** This device had a verified offline copy that the browser has since cleared. */
  readonly evicted: boolean;
}

export const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/**
 * The one offline line (menu and settings). "Full game ready offline" appears ONLY when the worker reports
 * this build's pack verified (re-hashed) and every file still present.
 */
export function describeOffline(v: Pick<PwaView, 'offline' | 'status' | 'full' | 'evicted'>): { text: string; ready: boolean } {
  const s = v.offline;
  const st = v.status;
  if (s.kind === 'unsupported') return { text: 'Offline play isn’t available in this browser — the game works online.', ready: false };
  if (s.kind === 'unavailable' || v.full.kind === 'unavailable') return { text: `This browser isn’t storing offline files right now (${s.kind === 'unavailable' ? s.reason : v.full.kind === 'unavailable' ? v.full.reason : ''}). The game works online.`, ready: false };
  if (st?.verified && v.full.kind !== 'running') return { text: `Full game ready offline (${mb(st.totalBytes)} on this device).`, ready: true };
  const j = v.full;
  if (j.kind === 'running') {
    const p = j.progress;
    return { text: p.phase === 'verify' ? `Checking the saved files… ${p.done} of ${p.total}` : `Saving the full game for offline play… ${mb(p.bytesDone)} of ${mb(p.bytesTotal)}`, ready: false };
  }
  if (s.kind === 'installing') return { text: s.progress ? `Getting the game ready for offline play… ${s.progress.done} of ${s.progress.total} files` : 'Getting the game ready for offline play…', ready: false };
  if (s.kind === 'error') return { text: v.evicted ? 'The browser cleared this game’s offline files (storage ran low or site data was cleared). They download again while you’re online.' : `Offline files unavailable: ${s.message}`, ready: false };
  const quick = s.kind === 'ready' ? 'Quick Play is ready offline.' : s.kind === 'partial' ? `Quick Play works offline; ${s.status.core.total - s.status.core.cached} table files are still missing (the game draws them).` : '';
  const left = st ? mb(Math.max(0, st.totalBytes - st.goodBytes)) : '';
  const kept = st && st.retained > 0 ? ' Your previous version’s music and art stay usable until the new files are checked.' : '';
  const lead = [v.evicted ? 'The browser cleared this game’s offline files (storage ran low or site data was cleared).' : st && st.damaged > 0 ? `${st.damaged} offline file${st.damaged === 1 ? ' was' : 's were'} removed by the browser.` : '', quick].filter(Boolean).join(' ');
  const tail = (t: string) => ({ text: `${lead ? `${lead} ` : ''}${t}${kept}`, ready: false });
  switch (j.kind) {
    case 'quota':
      return tail(`Not enough storage for the full game: it needs ${mb(j.needed)} more${j.available !== null ? `, about ${mb(Math.max(0, j.available))} is free` : ''}. Free up space, then Retry.`);
    case 'interrupted':
      return tail(`The full-game download stopped${j.progress ? ` at ${mb(j.progress.bytesDone)} of ${mb(j.progress.bytesTotal)}` : ''}. It continues by itself while you’re online, or tap Retry.`);
    case 'missing':
      return tail(`${j.count} file${j.count === 1 ? '' : 's'} couldn’t be downloaded from the server; everything else is saved. Retry later.`);
    case 'corrupt':
      return tail(`${j.count} file${j.count === 1 ? '' : 's'} arrived damaged and ${j.count === 1 ? 'was' : 'were'} discarded. Retry downloads ${j.count === 1 ? 'it' : 'them'} again.`);
    case 'waiting':
      return tail(`The rest of the game (${left}) saves when you’re next online.`);
    case 'save-data':
      return tail(`Data Saver is on, so the full game (${left}) waits for you to tap Download.`);
    default:
      if (s.kind === 'quota') return tail('Not enough storage on this device for the offline files. The game still works online; free up space, then Retry.');
      return tail(st ? `The full game (${left} still to save) downloads while you’re online.` : '');
  }
}

/** How much this game keeps on the device, the browser's free-space estimate, and whether it may be cleared. */
export function describeStorage(st: CacheStatus | null, info: StorageInfo): string {
  if (!st) return '';
  const parts = [`This game keeps ${mb(st.goodBytes)} of ${mb(st.totalBytes)} on this device.`];
  if (info.free !== null) parts.push(`About ${mb(Math.max(0, info.free))} free for this site.`);
  if (info.persisted === true) parts.push('The browser keeps these files until you clear them.');
  else if (info.persisted === false) parts.push('If the device runs low on space the browser may clear them; they download again while you’re online.');
  return parts.join(' ');
}

/** The settings button for the whole-game download (null = no button: done, running unseen, unsupported). */
export function fullButton(v: Pick<PwaView, 'status' | 'full'>): { label: string; disabled: boolean } | null {
  const st = v.status;
  if (!st) return null;
  if (v.full.kind === 'running') return { label: 'Saving…', disabled: true };
  if (st.verified) return null;
  const left = mb(Math.max(0, st.totalBytes - st.goodBytes));
  if (['interrupted', 'missing', 'corrupt', 'quota', 'unavailable'].includes(v.full.kind)) return { label: `Retry (${left} left)`, disabled: false };
  return { label: `Download the full game (${left}${st.good > 0 ? ' left' : ''})`, disabled: false };
}

/** Which story chapters can be played offline right now (their images for this screen shape are saved). */
export function chaptersReady(have: readonly string[] | undefined, chapterFiles: Readonly<Record<string, readonly string[]>>): string[] {
  const got = new Set((have ?? []).map((u) => u.replace(/^\.?\//, '')));
  return Object.entries(chapterFiles)
    .filter(([, files]) => files.every((f) => got.has(f)))
    .map(([id]) => id);
}

export function classify(st: CacheStatus): OfflineState {
  if (st.storage) return { kind: 'unavailable', reason: 'private browsing or blocked site data' };
  if (st.shell.cached < st.shell.total) return st.busy ? { kind: 'installing' } : st.last.error === 'quota' ? { kind: 'quota', status: st } : { kind: 'error', message: 'app files incomplete — Repair offline files' };
  if (st.core.cached < st.core.total) return st.last.error === 'quota' && !st.busy ? { kind: 'quota', status: st } : { kind: 'partial', status: st };
  return { kind: 'ready', status: st };
}

/** The outcome of a whole-game download, from the worker's final status. */
export function jobFrom(st: CacheStatus, free: number | null): FullJob {
  if (st.verified) return { kind: 'verified' };
  const l = st.last;
  if (l.error === 'quota') return { kind: 'quota', needed: Math.max(0, st.totalBytes - st.goodBytes), available: free };
  if (l.error === 'storage' || st.storage) return { kind: 'unavailable', reason: 'private browsing or blocked site data' };
  if (l.error === 'missing') return { kind: 'missing', count: l.missing };
  if (l.error === 'corrupt') return { kind: 'corrupt', count: l.corrupt };
  return { kind: 'interrupted', progress: { done: st.good, total: st.totalFiles, bytesDone: st.goodBytes, bytesTotal: st.totalBytes } };
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

/**
 * Which build this device last held a verified offline copy of — so a later empty cache can be reported
 * honestly as cleared by the browser. v1 (the retired story/audio choices) migrates to "none recorded".
 */
export interface OfflineRecord {
  readonly verifiedBuild: string | null;
}
export const OFFLINE_RECORD_SPEC: RecordSpec<OfflineRecord> = {
  key: 'sticks-and-bones.offline',
  format: 'sticks-and-bones/offline',
  version: 2,
  validate: (d) => (typeof d === 'object' && d !== null && (typeof (d as OfflineRecord).verifiedBuild === 'string' || (d as OfflineRecord).verifiedBuild === null) ? { verifiedBuild: (d as OfflineRecord).verifiedBuild } : null),
  migrate: (from) => (from === 1 ? { verifiedBuild: null } : null),
};

/** No progress for this long while downloading = the worker was stopped (or the connection hangs). */
const STALL_MS = 45_000;
/** Automatic attempts per page session before the download waits for the player's Retry. */
const AUTO_TRIES = 3;

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export class PwaController {
  #reg: ServiceWorkerRegistration | null = null;
  #view: PwaView = { offline: { kind: 'installing' }, status: null, full: { kind: 'idle' }, storage: { free: null, persisted: null }, updateReady: false, install: 'none', evicted: false };
  #listeners = new Set<(v: PwaView) => void>();
  #reloading = false;
  #store: KeyValueStore | null;
  #autoAllowed = false;
  #autoTries = 0;
  #lastProgress = 0;
  #installPrompt: InstallPrompt | null = null;
  #settling = false;
  #downloading = false;

  constructor(store: KeyValueStore | null = null) {
    this.#store = store;
    if (typeof window === 'undefined') return;
    const standalone = () => matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone()) this.#view = { ...this.#view, install: 'installed' };
    // Registered at once: browsers fire this early. Our own Install button replaces the mini-infobar.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.#installPrompt = e as InstallPrompt;
      this.#set({ install: 'available' });
    });
    window.addEventListener('appinstalled', () => {
      this.#installPrompt = null;
      this.#set({ install: 'installed' });
    });
    window.addEventListener('online', () => void this.#maybeAuto());
    window.addEventListener('offline', () => {
      if (this.#view.full.kind === 'idle') this.#set({ full: { kind: 'waiting' } });
    });
  }

  get view(): PwaView {
    return this.#view;
  }
  get status(): CacheStatus | null {
    return this.#view.status;
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
      const blocked = e instanceof Error && /security|denied|insecure|storage/i.test(`${e.name} ${e.message}`);
      this.#set({ offline: blocked ? { kind: 'unavailable', reason: 'private browsing or blocked site data' } : { kind: 'error', message: e instanceof Error ? e.message : String(e) } });
      return;
    }
    const reg = this.#reg;
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data as ({ type?: string; finished?: boolean; error?: string } & Partial<Progress>) | null;
      if (d?.type === 'SB_INSTALL_FAILED') {
        this.#set({ offline: d.error === 'quota' ? { kind: 'quota', status: null } : { kind: 'error', message: 'the download was interrupted — it will retry on your next visit, or use Repair offline files' } });
        return;
      }
      if (d?.type !== 'SB_PROGRESS') return;
      this.#lastProgress = Date.now();
      const progress: Progress = { phase: d.phase, done: d.done ?? 0, total: d.total ?? 0, bytesDone: d.bytesDone ?? 0, bytesTotal: d.bytesTotal ?? 0 };
      if (d.phase === 'install') this.#set({ offline: { kind: 'installing', progress } });
      else if (!d.finished) this.#set({ full: { kind: 'running', progress } });
      else if (!this.#downloading) void this.#adoptOutcome(); // a run this page didn't start (e.g. before a reload)
    });
    const watch = (w: ServiceWorker | null) => {
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) this.#set({ updateReady: !!reg.waiting });
        if (w.state === 'activated' || w.state === 'redundant') void this.refresh();
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
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void reg.update().catch(() => undefined);
      void this.#maybeAuto();
    });
    setInterval(() => void reg.update().catch(() => undefined), 30 * 60_000);
    await this.refresh();
  }

  /** Re-read what is saved from the active worker (and the browser's storage estimate). */
  async refresh(): Promise<OfflineState> {
    const reg = this.#reg;
    const active = reg?.active;
    if (!reg || !active) {
      const s: OfflineState = reg?.installing || reg?.waiting ? { kind: 'installing' } : this.#view.offline.kind === 'installing' ? { kind: 'error', message: 'offline files not saved yet — they download on your next online visit, or use Repair offline files' } : this.#view.offline;
      this.#set({ offline: s });
      return s;
    }
    const st = await ask<CacheStatus>(active, { type: 'SB_STATUS' }, 10_000);
    const s = st ? classify(st) : ({ kind: 'error', message: 'the offline helper did not answer' } as OfflineState);
    const storage = await this.#estimate();
    let full = this.#view.full;
    let evicted = false;
    if (st) {
      if (st.verified) {
        full = { kind: 'verified' };
        if (this.#record() !== st.build) writeRecord(this.#store, OFFLINE_RECORD_SPEC, { verifiedBuild: st.build });
      } else {
        if (full.kind === 'verified') full = { kind: 'idle' };
        if (full.kind === 'running' && !st.busy && !this.#settling && !this.#downloading) full = { kind: 'idle' };
        // A verified copy existed on this device, and now nothing of it is there: the browser cleared it.
        evicted = !!this.#record() && !st.verifiedBuild && st.good < st.totalFiles;
        if (st.busy && full.kind !== 'running') full = { kind: 'running', progress: st.progress ?? { done: st.good, total: st.totalFiles, bytesDone: st.goodBytes, bytesTotal: st.totalBytes } };
      }
    }
    this.#set({ offline: s, status: st, full, storage, evicted, updateReady: !!reg.waiting && !!navigator.serviceWorker.controller });
    void this.#maybeAuto();
    return s;
  }

  /** Another page (or this one before a reload) ran the download: take its outcome from the worker. */
  async #adoptOutcome(): Promise<void> {
    this.#settling = true;
    try {
      await this.refresh();
    } finally {
      this.#settling = false;
    }
    const st = this.#view.status;
    if (!st || this.#downloading) return;
    const j = jobFrom(st, this.#view.storage.free);
    this.#set({ full: j.kind === 'interrupted' && !navigator.onLine ? { kind: 'waiting' } : j });
  }

  #record(): string | null {
    return readRecord(this.#store, OFFLINE_RECORD_SPEC).value?.verifiedBuild ?? null;
  }

  async #estimate(): Promise<StorageInfo> {
    try {
      const est = await navigator.storage?.estimate?.();
      const free = est && typeof est.quota === 'number' && typeof est.usage === 'number' ? est.quota - est.usage : null;
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      return { free, persisted };
    } catch {
      return { free: null, persisted: null };
    }
  }

  /**
   * The startup sequence is done (the menu is up): the whole-game download may start in the background
   * while online. It runs at most 2 files at a time, never before the menu, and stops for quota.
   */
  allowBackgroundDownload(): void {
    this.#autoAllowed = true;
    void this.#maybeAuto();
  }

  async #maybeAuto(): Promise<void> {
    const v = this.#view;
    if (!this.#autoAllowed || this.#settling || !this.#reg?.active || !v.status || v.status.verified || v.full.kind === 'running') return;
    if (v.offline.kind === 'unavailable' || v.offline.kind === 'unsupported') return;
    // These need the player: free space, a server that lacks files, or storage that refuses.
    if (v.full.kind === 'quota' || v.full.kind === 'missing' || v.full.kind === 'unavailable' || v.full.kind === 'corrupt') return;
    if (!navigator.onLine) {
      this.#set({ full: { kind: 'waiting' } });
      return;
    }
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
      this.#set({ full: { kind: 'save-data' } });
      return;
    }
    if (this.#autoTries >= AUTO_TRIES) return;
    this.#autoTries++;
    await this.downloadAll(false);
  }

  /**
   * Save the whole game (Download / Retry, or the automatic background run). Checks the browser's free
   * space first, asks to keep the files (persistent storage) only on the player's own tap, then lets the
   * worker download, verify and mark the pack. Already-saved files are kept, so a later run resumes.
   */
  async downloadAll(explicit = true): Promise<FullJob> {
    if (this.#view.full.kind === 'running') return this.#view.full;
    const active = this.#reg?.active;
    const st = this.#view.status;
    if (!active || !st) {
      const j: FullJob = { kind: 'unavailable', reason: 'offline files aren’t available in this browser right now' };
      this.#set({ full: j });
      return j;
    }
    if (explicit) this.#autoTries = 0;
    const needed = Math.max(0, st.totalBytes - st.goodBytes);
    const storage = await this.#estimate();
    if (storage.free !== null && storage.free < needed * 1.1) {
      const j: FullJob = { kind: 'quota', needed, available: storage.free };
      this.#set({ full: j, storage });
      return j;
    }
    if (explicit) await navigator.storage?.persist?.().catch(() => false);
    this.#lastProgress = Date.now();
    this.#downloading = true;
    this.#set({ full: { kind: 'running', progress: { phase: 'download', done: st.good, total: st.totalFiles, bytesDone: st.goodBytes, bytesTotal: st.totalBytes } } });
    // The worker may be stopped by the browser mid-download: no progress for a while = interrupted.
    let stallTimer = 0;
    const stalled = new Promise<null>((resolve) => {
      const check = () => {
        if (Date.now() - this.#lastProgress > STALL_MS) resolve(null);
        else stallTimer = window.setTimeout(check, 5_000);
      };
      stallTimer = window.setTimeout(check, 5_000);
    });
    const res = await Promise.race([ask<CacheStatus>(active, { type: 'SB_CACHE_ALL' }, 60 * 60_000), stalled]);
    clearTimeout(stallTimer);
    this.#downloading = false;
    // Still "running" while the outcome is read, so nothing starts a second run in between.
    this.#settling = true;
    try {
      await this.refresh();
    } finally {
      this.#settling = false;
    }
    const now = this.#view.status;
    let j: FullJob;
    if (!res || !now) j = now?.verified ? { kind: 'verified' } : { kind: 'interrupted', progress: now ? { done: now.good, total: now.totalFiles, bytesDone: now.goodBytes, bytesTotal: now.totalBytes } : null };
    else j = jobFrom(now, this.#view.storage.free);
    if (j.kind === 'interrupted' && !navigator.onLine) j = { kind: 'waiting' };
    this.#set({ full: j });
    // Interrupted while online: try again by itself after a pause (bounded); Retry is always available.
    if (j.kind === 'interrupted' && this.#autoAllowed && this.#autoTries < AUTO_TRIES) setTimeout(() => void this.#maybeAuto(), 15_000 * Math.max(1, this.#autoTries));
    return j;
  }

  /** Ask the browser to install the app (only after it offered to). */
  async install(): Promise<boolean> {
    const p = this.#installPrompt;
    if (!p) return false;
    this.#installPrompt = null;
    try {
      await p.prompt();
      const choice = await p.userChoice;
      this.#set({ install: choice.outcome === 'accepted' ? 'installed' : 'none' });
      return choice.outcome === 'accepted';
    } catch {
      this.#set({ install: 'none' });
      return false;
    }
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

  /** App-only repair: re-check every saved file, replace bad copies, download what is missing. Saves and settings are untouched. */
  async repair(): Promise<OfflineState> {
    const active = this.#reg?.active;
    this.#set({ offline: { kind: 'installing' }, full: { kind: 'idle' } });
    if (!active) {
      // No worker yet: clear only our caches; the next online visit rebuilds them.
      await clearOwnCaches();
      return this.refresh();
    }
    this.#autoTries = 0;
    this.#lastProgress = Date.now();
    const st = await ask<CacheStatus>(active, { type: 'SB_REPAIR' }, 60 * 60_000);
    await this.refresh();
    const now = this.#view.status;
    if (now) this.#set({ full: st ? jobFrom(now, this.#view.storage.free) : { kind: 'interrupted', progress: null } });
    else this.#set({ offline: { kind: 'error', message: 'repair did not finish' } });
    return this.#view.offline;
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
/** Where a reload returns to once (an update, or a Retry that had to reload a chunk the browser refused). */
export type ResumeTarget = { readonly to: 'story'; readonly run?: boolean } | { readonly to: 'quick' } | { readonly to: 'menu' } | { readonly to: 'achievements' };
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
    return v && (v.to === 'story' || v.to === 'quick' || v.to === 'menu' || v.to === 'achievements') ? v : null;
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
