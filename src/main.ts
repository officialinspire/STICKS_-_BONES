import './ui/menu-pages-element';
import './styles.css';
import { createWorkerRunner, inlineRunner, type AiRunner } from './ai/runner';
import { TableController } from './app/controller';
import { browserStore, clearSave, newMatchId, readSave, writeSave, type SavedGame } from './app/save';
import { RECORD_LABEL, WriteHealth, type RecordName } from './app/write-health';
import { secureSeed } from './app/seed';
import { loadSettingsResult, reduceMotion, saveSettings, type Settings } from './app/settings';
import { DEFAULT_TIMING, GameSession, realScheduler, type Timing } from './app/session';
import { loadStats, recordAbandoned, recordCompleted, resetStats, saveStats, type Stats } from './app/stats';
import type { ReadStatus } from './app/storage';
import type { ModeId, SeatIndex } from './engine/types';
import { initTileArt, setForceSvg } from './render/tile-art';
import { deferredAssets, warm, warmWithRetry } from './assets/warm';
import { envKey, onViewportShape, setEnvBackdrop } from './assets/env';
import { urlFor, type RuntimeAssetId } from './assets';
import { MUSIC } from './assets/audio-manifest';
import { introVideoUrl, musicUrl } from './assets/media-urls';
import { AudioManager, type ResultCue, type Scene, type SfxId, type TrackId } from './audio/manager';
import { WebAudioBackend } from './audio/webaudio';
import { haptic, type HapticCue } from './audio/haptics';
import { showStart } from './ui/intro-screen';
import { renderMenu, type MenuChoice, type MenuScreen, type ResumeOffer, type StoryOffer } from './ui/menu';
import { readStory } from './story/progress';
import { achievements, achievementsReady, configureAchievements } from './ui/achievements-bridge';
import { bindLoadFailure, retryable } from './ui/lazy';
import { esc } from './ui/svg';
import { TableScreen } from './ui/table';
import { chaptersReady, consumeUpdatedFlag, consumeUpdateResume, describeOffline, describeStorage, eraseLocalData, fullButton, PwaController, setUpdateResume, type ResumeTarget } from './app/pwa';
import { SCENE_IMAGES } from './story/scene-images';
import { Analytics, winnerLabel, type AnalyticsEvent, type MatchInfo, type StartKind } from './app/analytics';
import { ANALYTICS_CONFIG } from './app/analytics-config';

const DEV = import.meta.env.DEV;
document.documentElement.dataset.build = __SB_BUILD_TAG__; // support/diagnostics: which build is running
const root = document.getElementById('app')!;
const store = browserStore();
/** Which records failed to save (per record; see write-health.ts). Rendered as the persistent "Not saved" alert. */
const health = new WriteHealth((failing) => renderSaveAlert(failing));

/** Messages for the next menu render (recovered or set-aside data). */
const notices: string[] = [];
const noticeFor = (what: string, status: ReadStatus): string | null =>
  status === 'corrupt'
    ? `Your ${what} couldn’t be read (the data was damaged), so ${what === 'settings' ? 'defaults are in use' : 'it was set aside'}.`
    : status === 'incompatible'
      ? `Your ${what} came from a different version of the game, so ${what === 'settings' ? 'defaults are in use' : 'it was set aside'}.`
      : status === 'unavailable'
        ? null
        : null;

const loadedSettings = loadSettingsResult(store);
let settings: Settings = loadedSettings.settings;
// Settings v2 → v3: the Story text size used to be chosen on the dialogue controls and saved with the
// Story record; carry it over once, so nobody's preference is lost when the control moved to Settings.
if (loadedSettings.status === 'migrated') {
  const kept = readStory(store).value?.textScale;
  if (kept && kept !== 1 && kept !== settings.storyTextScale) settings = { ...settings, storyTextScale: kept };
  persistSettings();
}
const sn = noticeFor('settings', loadedSettings.status);
if (sn) notices.push(sn);
const loadedStats = loadStats(store);
let stats: Stats = loadedStats.stats;
const stn = noticeFor('statistics', loadedStats.status);
if (stn) notices.push(stn);
if (!store) notices.push('This browser isn’t letting the game save. Settings, statistics and games last only until you close the page.');

// ---- audio: one manager for the whole app ---------------------------------------
const backend = new WebAudioBackend(
  Object.fromEntries(MUSIC.map((m) => [m.id, musicUrl(m.id) ?? undefined]).filter(([, u]) => u)) as Partial<Record<TrackId, string>>,
  Object.fromEntries(MUSIC.map((m) => [m.id, m.gainDb])),
);
const audio = new AudioManager({
  backend,
  scheduler: realScheduler,
  levels: settings.audio,
  gapSec: Object.fromEntries(MUSIC.map((m) => [m.id, m.loop.gapSec])) as Record<TrackId, number>,
});
// Any later gesture re-unlocks if the browser suspended audio (iOS, focus loss).
const regesture = () => {
  if (!audio.unlocked || (audio.wantsMusic && audio.scene !== 'intro' && audio.scene !== 'init')) void audio.unlock();
  // A gesture is also the moment to retry media that failed for a temporary reason (bounded, current scene only).
  else audio.recover();
};
// Back online: the same bounded recovery (music needs no new gesture once the context is unlocked).
window.addEventListener('online', () => audio.recover());
document.addEventListener('pointerdown', regesture, { capture: true, passive: true });
document.addEventListener('keydown', regesture, { capture: true });
document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));
// Rotation / split screen: the menu and table backdrops swap between their scene's 3:4 crop and full frame.
// Each element keeps the place it shows (data-env-id: the patio, or a story hand's own scene), so a
// rotation never swaps the corporate terrace for the patio. One app-wide listener (never per screen).
onViewportShape(() => {
  // Only elements that name their place; nothing is ever re-pointed at a default (patio or otherwise).
  const els = [...document.querySelectorAll<HTMLElement>('[data-env-id]')].filter((el) => el.dataset.envId !== 'none');
  const ids = [...new Set(els.map((el) => el.dataset.envId as RuntimeAssetId))];
  void warm(ids.map((id) => envKey(id)), { front: true }).then(() => {
    for (const el of els) if (el.isConnected) setEnvBackdrop(el, el.dataset.envId as RuntimeAssetId);
  });
});
window.addEventListener('pagehide', () => audio.setHidden(true));
window.addEventListener('pageshow', () => audio.setHidden(document.hidden));

// UI feedback sounds: ONE delegated listener (capture phase, so the scene is judged before a button's own
// handler changes it). The manager refuses SFX in the init/intro scenes, so the start tap never leaks into
// the studio credit. Table moves, story advance and intro controls are silent here (they have their own sounds
// or none); everything else gets a quiet select/confirm/back.
const SILENT_ACTS = new Set(['draw', 'pass', 'place', 'select', 'story-next', 'story-back', 'story-skip', 'focus-end', 'intro-skip', 'intro-mute', 'start', 'zoom-in', 'zoom-out']);
const BACK_ACTS = new Set(['home', 'story-home', 'story-file', 'menu', 'menu-now', 'cover-back', 'cover-menu', 'confirm-no', 'discard']);
const CONFIRM_ACTS = new Set(['confirm-yes', 'story-deal', 'story-onward', 'story-new', 'story-continue', 'new-match', 'next-hand', 'restart', 'update-now', 'resume', 'pause-resume']);
document.addEventListener(
  'click',
  (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('button, [role="button"], a[href], summary, input[type="checkbox"], input[type="radio"]');
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    const act = el.dataset.act ?? '';
    const tag = el.dataset.sfx;
    if (tag === 'none' || SILENT_ACTS.has(act) || el.closest('.hand, .board')) return;
    const id: SfxId = tag === 'back' || BACK_ACTS.has(act) || el.classList.contains('back') || /^back\b/i.test(el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '') ? 'back' : tag === 'confirm' || CONFIRM_ACTS.has(act) || el.classList.contains('primary') ? 'confirm' : 'select';
    audio.playSfx(id);
  },
  { capture: true },
);

const audioApi = {
  scene: (s: Scene) => audio.setScene(s),
  sfx: (id: SfxId) => void audio.playSfx(id),
  haptic: (cue: HapticCue) => void haptic(cue, settings.haptics),
  result: (kind: ResultCue) => void audio.resultCue(kind),
};

const settingsApi = {
  get: () => settings,
  set: (p: Partial<Settings>, o?: { quiet?: boolean }) => {
    settings = { ...settings, ...p };
    persistSettings();
    audio.setLevels(settings.audio);
    if (o?.quiet) return; // the game's own change (tips off after a hand): not the player exploring Settings
    achievements.note('explore.settings');
    if ('storyTextScale' in p || 'instantText' in p) achievements.note('explore.storyText');
  },
};

// ---- analytics: disabled adapter (no contract supplied; see docs/ANALYTICS.md) ------
const analytics = new Analytics(ANALYTICS_CONFIG);
if (DEV) {
  // Dev/test only: observe what WOULD be sent (already sanitised). Never in production builds.
  const seen: AnalyticsEvent[] = [];
  (window as unknown as { __sbAnalytics: AnalyticsEvent[] }).__sbAnalytics = seen;
  analytics.record((e) => seen.push(e));
}
const errorArea = (): 'boot' | 'menu' | 'table' | 'unknown' => (active ? 'table' : root.classList.contains('is-start') ? 'boot' : root.querySelector('.scene') ? 'menu' : 'unknown');
window.addEventListener('error', (e) => analytics.error('error', errorArea(), e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => analytics.error('unhandledrejection', errorArea(), e.reason));

function matchInfo(session: GameSession, matchId: string): MatchInfo {
  const opponent = session.opponent === 'ai' ? 'ai' : 'local';
  return {
    matchId,
    mode: session.config.mode,
    opponent,
    difficulty: opponent === 'ai' ? session.difficulty : null,
    humansPartnered: opponent === 'local' ? session.rules.teams.some((t) => session.humanSeats.every((h) => t.includes(h))) : null,
  };
}

// ---- PWA: offline files, updates, repair (production builds only) -------------------
const pwa = new PwaController(store);
/** Where an update reload asked to return to (read once, before anything renders). */
const resumeAfterUpdate: ResumeTarget | null = consumeUpdateResume();
if (consumeUpdatedFlag()) notices.push('Updated to the latest version. Your game was saved first — tap Resume to carry on.');
const ERASED_FLAG = 'sticks-and-bones.erased';
try {
  if (sessionStorage.getItem(ERASED_FLAG)) {
    sessionStorage.removeItem(ERASED_FLAG);
    notices.push('Saved game, settings and statistics erased. Offline files were kept.');
  }
} catch {
  /* storage blocked */
}
const pwaView = () => {
  const d = describeOffline(pwa.view);
  return { ...d, updateReady: pwa.view.updateReady };
};
/** App-relative paths of each story scene's images for this screen shape (what "ready offline" checks). */
function sceneFiles(): Record<string, string[]> {
  const base = PwaController.appRoot().href;
  const rel = (u: string | null) => (u && u.startsWith(base) ? u.slice(base.length) : (u ?? ''));
  return Object.fromEntries(Object.entries(SCENE_IMAGES).map(([id, m]) => [id, [...m.env.map((e) => rel(urlFor(envKey(e)))), ...m.cast.map((c) => rel(urlFor(c)))]]));
}
function readyScenes(): string[] {
  const st = pwa.status;
  return st ? chaptersReady(st.have, sceneFiles()) : [];
}
const storageLine = () => describeStorage(pwa.status, pwa.view.storage);
/** The live status line is announced at most once per 10% of a download (not on every file). */
let announced = '';
/** Keep every status line / progress bar / button on screen current (menu, settings). */
pwa.subscribe((pv) => {
  const v = pwaView();
  const p = pv.full.kind === 'running' ? pv.full.progress : null;
  const bucket = p ? `${p.phase}:${Math.floor(((p.phase === 'verify' ? p.done / (p.total || 1) : p.bytesDone / (p.bytesTotal || 1)) * 10))}` : v.text;
  if (bucket !== announced || !p) {
    announced = bucket;
    document.querySelectorAll<HTMLElement>('[data-region="offline-status"]').forEach((el) => {
      el.textContent = (v.ready ? '✓ ' : '') + v.text;
      el.classList.toggle('is-ready', v.ready);
    });
  }
  document.querySelectorAll<HTMLElement>('[data-region="update"]').forEach((el) => (el.hidden = !v.updateReady));
  document.querySelectorAll<HTMLProgressElement>('progress[data-region="offline-progress"]').forEach((el) => {
    el.hidden = !p;
    if (p) {
      el.max = (p.phase === 'verify' ? p.total : p.bytesTotal) || 1;
      el.value = p.phase === 'verify' ? p.done : p.bytesDone;
    }
  });
  const btn = fullButton(pv);
  document.querySelectorAll<HTMLButtonElement>('[data-act="offline-full"]').forEach((b) => {
    b.hidden = !btn;
    b.disabled = !btn || btn.disabled;
    b.textContent = btn?.label ?? '';
  });
  document.querySelectorAll<HTMLElement>('[data-region="offline-storage"]').forEach((el) => (el.textContent = storageLine()));
  document.querySelectorAll<HTMLElement>('[data-region="install"]').forEach((el) => (el.hidden = pv.install !== 'available'));
  document.querySelectorAll<HTMLElement>('[data-region="install-note"]').forEach((el) => (el.textContent = installNote()));
});
function installNote(): string {
  const i = pwa.view.install;
  if (i === 'installed') return 'Installed: the game opens from your home screen or app list.';
  if (i === 'available') return 'Install the game to open it like an app, offline too.';
  return 'To install, use your browser’s Install or Add to Home Screen option.';
}
/** The Story layer's hooks while a story run is open: write its position now, and stop it. */
let storyHooks: { flush(): boolean; stop(): void } | null = null;
/**
 * Apply a waiting update only from a stable point: write the current state (a Quick Play match exactly
 * as the engine has it, or the story position including an in-progress hand) and check that the write
 * succeeded. If it failed, say so and let the player choose (never claim it saved). Then stop the table
 * (no AI move can land after the save), replace the screen so no hand is visible while the new version
 * loads, and reload. After the reload the player returns ONCE to the same chapter, line or encounter;
 * a two-player match reopens behind the privacy cover.
 */
function applyUpdate(force = false): void {
  if (!pwa.view.updateReady) return;
  let saved = true;
  let to: ResumeTarget = { to: 'menu' };
  const a = active;
  if (a && a.controller.session.opponent !== 'dev-both') {
    saved = persistMatch(a.controller.session, a.matchId);
    to = { to: 'quick' };
  } else if (storyHooks) {
    saved = storyHooks.flush();
    to = { to: 'story', run: true };
  } else if (storyOpen) to = { to: 'story', run: false }; // on the case file: progress is already saved
  // Best effort for anything else still unsaved (settings, statistics, achievements) before reloading.
  health.retryAll();
  // The stable point itself must be stored: a place that is still failing counts as unsaved.
  if (to.to === 'story' && health.has('story')) saved = false;
  if (!saved && !force) return void confirmUnsavedUpdate();
  pwa.applyUpdate(() => {
    setUpdateResume(saved ? to : { to: 'menu' });
    storyHooks?.stop();
    storyHooks = null;
    endStoryHand();
    teardown();
    active = null;
    document.documentElement.classList.remove('table-lock');
    root.className = 'is-start';
    root.innerHTML = `<p class="loading" role="status">${saved ? 'Updating — your place is saved…' : 'Updating…'}</p>`;
  });
}
/** Storage refused the write: the player decides; the update never pretends it saved. */
function confirmUnsavedUpdate(): void {
  document.querySelector('dialog.update-unsaved')?.remove();
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet update-unsaved';
  dlg.setAttribute('aria-labelledby', 'upd-h');
  dlg.innerHTML = `<h2 id="upd-h" class="section-h">Your place couldn’t be saved</h2><p>This browser refused to save right now. If you update anyway, you’ll return to your last saved point instead of exactly here.</p><div class="row"><button type="button" class="btn" data-act="upd-later">Not now — keep playing</button><button type="button" class="btn-ghost dark" data-act="upd-anyway">Update anyway</button></div>`;
  document.body.append(dlg);
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.querySelector('[data-act="upd-later"]')!.addEventListener('click', close);
  dlg.querySelector('[data-act="upd-anyway"]')!.addEventListener('click', () => {
    close();
    applyUpdate(true);
  });
  dlg.addEventListener('cancel', close);
  dlg.showModal();
  (dlg.querySelector('[data-act="upd-later"]') as HTMLElement).focus();
}
const menuPwa = {
  view: pwaView,
  storageLine,
  fullButton: () => fullButton(pwa.view),
  install: () => pwa.view.install,
  installNote,
  onDownload: () => void pwa.downloadAll(true),
  onInstall: () => void pwa.install(),
  onUpdate: applyUpdate,
  onRepair: () => void pwa.repair(),
  onErase: () => {
    // Only this app's keys (saves, settings, statistics and their quarantined copies). Offline files stay.
    eraseLocalData(store ? globalThis.localStorage : null);
    try {
      sessionStorage.setItem(ERASED_FLAG, '1');
    } catch {
      /* storage blocked */
    }
    location.reload();
  },
};
const tableUpdate = { ready: () => pwa.view.updateReady, apply: applyUpdate };

// ---- persistent save feedback ----------------------------------------------------------
/**
 * Shown whenever storage refuses a write (quota, private mode, blocked storage) and kept
 * on screen until a later write succeeds. The game never claims "saved" in that state.
 */
function renderSaveAlert(failing: readonly RecordName[]): void {
  let el = document.querySelector<HTMLElement>('.save-alert');
  const html = document.documentElement;
  if (!failing.length) {
    if (el) el.hidden = true;
    html.classList.remove('has-save-alert');
    html.style.removeProperty('--save-alert-h');
    window.dispatchEvent(new Event('resize')); // the story stage re-measures its room
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'save-alert';
    el.setAttribute('role', 'alert');
    document.body.append(el);
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="save-retry"]')) health.retryAll();
    });
  }
  const what = failing.map((n) => RECORD_LABEL[n]);
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : what[0]!;
  el.innerHTML = `<p><strong>Not saved:</strong> ${esc(list)}. This browser refused to store it (storage full or blocked). It is kept on this page meanwhile.</p><button type="button" class="btn small" data-act="save-retry">Try again</button>`;
  el.dataset.failing = failing.join(' ');
  el.hidden = false;
  // Reserve the alert's height so it never covers Continue or the table's controls.
  html.style.setProperty('--save-alert-h', `${el.offsetHeight + 8}px`);
  html.classList.add('has-save-alert');
  window.dispatchEvent(new Event('resize'));
}
// Leaving or backgrounding the page is a last chance to store what is still unsaved.
document.addEventListener('visibilitychange', () => document.hidden && health.retryAll());
window.addEventListener('pagehide', () => health.retryAll());

// ---- Story: NO REST FOR COUSIN (case file + scene player + chapter hands) ----------------
/** A story hand's table: separate from Quick Play (no Quick Play save, no statistics, no analytics). */
let storyTable: { table: TableScreen; controller: TableController } | null = null;
function endStoryHand(): void {
  storyTable?.table.destroy();
  storyTable?.controller.dispose();
  storyTable = null;
  document.documentElement.classList.remove('table-lock');
  // Back to the scene's dialogue (its profile stays), or the case file's menu music.
  audio.setScene(audio.profile ? 'story' : 'menu');
}
/** Story tables never show Quick Play banter: Roberto is the player here, and serious scenes stay serious. */
const storySettingsApi = { get: () => ({ ...settings, banter: false }), set: (p: Partial<Settings>, o?: { quiet?: boolean }) => settingsApi.set(p, o) };
/** Set by an update reload: the case file reopens the saved scene once, without a tap. */
let autoContinueOnce = false;
/** The Story screens are open (case file or a run). */
let storyOpen = false;
function openStory(): void {
  teardown();
  storyOpen = true;
  active = null;
  audio.setScene('menu');
  const fast = DEV && Boolean((window as unknown as { __sbStoryFast?: boolean }).__sbStoryFast);
  // Dev/test only: a fixed deal for story hands (never in production builds; the rules are unchanged).
  const storySeed = DEV ? (window as unknown as { __sbStorySeed?: string }).__sbStorySeed : undefined;
  const nav = navSeq;
  const isCurrent = () => nav === navSeq && storyOpen;
  root.className = 'is-story';
  root.innerHTML = '<div class="story-shell"><header class="story-head"><button type="button" class="btn-ghost back" data-act="story-load-back">← Menu</button></header><div data-region="story-load"><p class="note-dark" role="status">Opening the case file…</p></div></div>';
  // The player may leave a slow load; the chunk arriving later then changes nothing (isCurrent).
  root.querySelector('[data-act="story-load-back"]')?.addEventListener('click', () => showMenu(), { once: true });
  // The whole Story layer (player, director, staging, script) is a lazy chunk: nothing of it loads at startup.
  // A failed chunk shows Retry / Back (never a blank screen); a late one never remounts an abandoned screen.
  storyUi.get().then(
    ({ renderStoryHome }) => isCurrent() && void renderStoryHome({
    root,
    isCurrent,
    reload: () => reloadInto({ to: 'story' }),
    store,
    fast,
    onBack: () => {
      endStoryHand();
      root.onclick = null;
      root.onkeydown = null;
      root.style.removeProperty('--scene-image');
      showMenu();
    },
    reduceMotion: () => reduceMotion(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
    prefs: () => ({ textScale: settings.storyTextScale, instantText: settings.instantText }),
    onSaveFailed: () => health.report('story', false, () => false),
    onSaveResult: (ok, retry) => health.report('story', ok, retry),
    cue: (c) => void audio.cue(c),
    registerRun: (hooks) => (storyHooks = hooks),
    // Story analytics: separate events from Quick Play; disabled adapter until the owner's contract.
    track: {
      chapterComplete: (scene, outcome, replay, key, assisted) => {
        analytics.storyChapterComplete(scene, outcome, replay, key);
        // An assisted hand completes the chapter for achievements, but its result is not the player's own win.
        achievements.storyChapter(scene, assisted ? 'none' : outcome, replay, key);
      },
      caseComplete: (key) => analytics.storyCaseComplete(key),
      resume: (scene, part, via, key) => analytics.storyResume(scene, part, via, key),
      assist: (scene, key) => {
        analytics.storyAssist(scene, 'skip_scene', key);
        // key = `<caseKey>:<scene>:<pre|post>`; only first-play cases ("case:<start>") are tracked.
        if (key.startsWith('case:')) achievements.storyAssist(key.split(':').slice(0, 2).join(':'));
      },
    },
    offlineNote: (id) => {
      if (pwa.view.offline.kind === 'unsupported' || !pwa.status) return null;
      return readyScenes().includes(id) ? 'Saved for offline play.' : 'Needs a connection until the full game has saved for offline play.';
    },
    update: tableUpdate,
    takeAutoContinue: () => {
      const v = autoContinueOnce;
      autoContinueOnce = false;
      return v;
    },
    audioScene: (id) => {
      audio.setStoryProfile(id);
      audio.setScene(id ? 'story' : 'menu');
    },
    beat: () => audio.beat(),
    caseComplete: () => void audio.caseComplete(),
    endHand: endStoryHand,
    playHand: (req) => {
      endStoryHand();
      const timing = fast ? FAST_TIMING : DEFAULT_TIMING;
      const session = req.restore
        ? new GameSession({ state: req.restore.state, opponent: 'ai', difficulty: 'normal', aiRng: req.restore.aiRng, assistUsed: req.restore.assisted }, { runner, timing })
        : new GameSession({ mode: req.setup.mode, opponent: 'ai', humanSeats: [0], seatNames: req.setup.seatNames, difficulty: 'normal', seed: storySeed ?? secureSeed(), aiSeed: storySeed ? `${storySeed}-ai` : secureSeed() }, { runner, timing });
      const controller = new TableController(session, req.restore ? { restored: true } : {});
      const table = new TableScreen(req.host, controller, {
        onMenu: () => req.onLeave(),
        onRestart: () => playStoryAgain(),
        settings: storySettingsApi,
        audio: audioApi,
        update: tableUpdate,
        story: { onContinue: () => req.onContinue(), faces: req.faces, env: req.env },
        explore: (w) => achievements.note(`explore.${w}`),
      });
      const playerTeam = session.rules.teams.findIndex((t) => t.includes(0));
      // Achievements: a first-time chapter hand counts once per case and scene; a replay never does.
      const caseStart = readStory(store).value?.startedAt ?? 0;
      achievements.watch(controller, { kind: req.replay ? 'none' : 'story', gameKey: `story:${caseStart}:${req.sceneId}`, restored: Boolean(req.restore) });
      root.classList.add('is-table');
      document.documentElement.classList.add('table-lock');
      audio.setScene('gameplay');
      table.mount();
      if (!req.restore) audio.playSfx('shuffle');
      // The encounter really starts on its first accepted move (a restored hand never counts). Local token only.
      const encounter = req.restore ? null : `${req.sceneId}:${performance.now()}`;
      controller.subscribe((events) => {
        if (!events.length) return;
        if (encounter && events.some((e) => e.type === 'tile-played' || e.type === 'tile-drawn' || e.type === 'passed')) analytics.storyEncounter(req.sceneId, req.setup.mode, req.replay, encounter);
        const resolved = events.find((e) => e.type === 'hand-resolved');
        if (resolved && resolved.type === 'hand-resolved') req.onResolved(resolved.result.winnerTeam, playerTeam, session.assistUsed);
        else if (session.phase === 'playing') req.onSnapshot({ state: session.debugState(), aiRng: session.exportAiRng(), assisted: session.assistUsed });
      });
      storyTable = { table, controller };
      // Save the deal itself: a refresh before the first move resumes this exact hand too.
      if (session.phase === 'playing') req.onSnapshot({ state: session.debugState(), aiRng: session.exportAiRng(), assisted: session.assistUsed });
      // "Restart match" in a story hand returns to the case file; Continue Case deals the chapter hand again.
      function playStoryAgain() {
        req.onLeave();
      }
      if (DEV) (window as unknown as { __sb: unknown }).__sb = { session, controller, runnerKind: runner.kind, matchId: `story:${req.sceneId}`, stats: () => stats };
    },
  }),
    () => {
      if (!isCurrent()) return;
      bindLoadFailure(root.querySelector('[data-region="story-load"]') as HTMLElement, { title: 'The Story didn’t load', body: 'Check your connection and try again. Your place in the case is saved on this device.', back: 'Back to menu' }, {
        // Try again; if the browser still refuses the chunk, reload and come straight back to the Story.
        retry: () => void storyUi.get().then(() => isCurrent() && openStory(), () => isCurrent() && reloadInto({ to: 'story' })),
        back: () => showMenu(),
      });
    },
  );
}
/** The Story chunk: a failed load is forgotten so Retry really loads again. */
const storyUi = retryable(() => import('./ui/story-ui'));
// ---- the active match ----------------------------------------------------------------
interface Active {
  table: TableScreen;
  controller: TableController;
  matchId: string;
  /** Statistics apply (not developer fixtures / both-seats mode). */
  counted: boolean;
}
let active: Active | null = null;
let last: MenuChoice | null = null;
// One worker for the page; Hard sampling never runs on the main thread.
const runner: AiRunner = createWorkerRunner() ?? inlineRunner();
const FAST_TIMING: Timing = { aiPlay: { easy: 60, normal: 60, hard: 60 }, aiForced: 40, resolve: 250 };
const SEATING: Record<NonNullable<MenuChoice['seating']>, SeatIndex> = { across: 2, right: 1, left: 3 };

// Missing optional art: drop the broken image and reveal the code-drawn placeholder (menus, table, results).
document.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (!(t instanceof SVGImageElement)) return;
    t.closest('.host-figure-art')?.classList.add('art-missing');
    t.remove();
  },
  true,
);

function updateStats(next: Stats): void {
  stats = next;
  health.report('stats', saveStats(store, stats), () => saveStats(store, stats));
}
/** Settings write, reported per record; the retry writes whatever the settings are by then. */
function persistSettings(): void {
  health.report('settings', saveSettings(store, settings), () => saveSettings(store, settings));
}
/** The Quick Play save, reported per record; the retry writes this session's state as it is then. */
function persistMatch(session: GameSession, matchId: string): boolean {
  const ok = writeSave(store, session, matchId);
  health.report('save', ok, () => writeSave(store, session, matchId));
  return ok;
}

/** A match given up before its end counts as abandoned — never as a loss. */
function abandon(matchId: string, mode: ModeId): void {
  updateStats(recordAbandoned(stats, matchId, mode));
}

/** Stop the current table: cancels AI work, timers, effects and sounds. */
/**
 * Navigation generation: bumped whenever the player leaves for another screen. Work started for an older
 * screen (a lazy chunk, the script) checks it and never remounts a screen the player has abandoned.
 */
let navSeq = 0;
function teardown(): void {
  navSeq++;
  storyOpen = false;
  audio.reset();
  audio.setStoryProfile(null); // Quick Play, menus and the case file use the default mix
  active?.table.destroy();
  active?.controller.dispose();
  active = null;
  root.className = '';
}

/** Public summary of a saved game for the menu (no hidden information). */
function resumeOffer(game: SavedGame): ResumeOffer {
  const s = new GameSession({ state: game.state, opponent: game.opponent, difficulty: game.difficulty, aiRng: game.aiRng }, { scheduler: { set: () => 0, clear: () => {} } });
  const phase = game.state.phase === 'playing' ? `Hand ${game.state.hand.number}` : `Hand ${game.state.hand.number} finished`;
  const summary = `${s.rules.name} · ${s.rules.teams.map((_, t) => `${s.teamName(t)} ${game.state.scores[t]}`).join(' – ')} · ${phase}`;
  s.dispose();
  return { summary, twoHumans: game.opponent === 'local' };
}

/** The home Story card: where the case stands (read-only; never touches the record). */
function storyOffer(): StoryOffer | null {
  const p = readStory(store).value;
  if (!p) return null;
  if (p.completed.includes('epilogue')) return { label: 'Replay any chapter from the case file', closed: true };
  const at = p.sceneId === 'prologue' ? 'Prologue' : p.sceneId === 'epilogue' ? 'Epilogue' : `Chapter ${p.sceneId.slice(8)} of 7`;
  return { label: `${at}${p.part === 'hand' ? ' · hand in play' : ''}`, closed: false };
}

/**
 * Retry for a chunk the browser refused: Chromium caches a failed dynamic import for the page's lifetime,
 * so when a second attempt fails too, reload the app and come back (once) to the same screen.
 */
function reloadInto(t: ResumeTarget): void {
  setUpdateResume(t);
  location.reload();
}

function showMenu(screen?: MenuScreen): void {
  document.documentElement.classList.remove('table-lock');
  // Leaving Story: drop the scene player's handlers and backdrop.
  root.onclick = null;
  root.onkeydown = null;
  root.style.removeProperty('--scene-image');
  delete root.dataset.scene;
  // Background warm-up (≤ 2 downloads at a time) for the first table: atlas, tabletop, then the
  // optional art this device will actually show (see deferredAssets).
  initTileArt();
  void warm(
    deferredAssets({
      reduceMotion: reduceMotion(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
      wide: matchMedia('(min-width: 900px)').matches,
      hostAnimation: settings.hostAnimation,
    }),
  );
  teardown();
  // Achievements load after the menu is up (their own chunk), and award once what existing records prove.
  void achievementsReady().catch(() => undefined);
  const saved = readSave(store);
  const sv = noticeFor('saved game', saved.status);
  if (sv) notices.push(sv);
  audio.setScene('menu');
  renderMenu(root, last ?? {}, {
    screen,
    dev: DEV,
    settings: settingsApi,
    resume: saved.value ? resumeOffer(saved.value) : null,
    story: storyOffer(),
    notices: notices.splice(0),
    stats: () => stats,
    onResetStats: () => updateStats(resetStats(store)),
    onStart: (c) => void start(c),
    onResume: () => resume(),
    onStory: () => openStory(),
    renderAchievements: (el, back) => achievements.renderPage(el, back, () => reloadInto({ to: 'achievements' })),
    onExplore: (s) => achievements.note(`explore.${s}`),
    pwa: import.meta.env.PROD ? menuPwa : undefined,
    onDiscard: () => {
      const g = readSave(store).value;
      if (g) abandon(g.matchId, g.state.config.mode);
      clearSave(store);
      health.resolve('save'); // removed on purpose: no pending retry may bring it back
      notices.push('Saved game discarded.');
      showMenu();
    },
  });
}

function mount(controller: TableController, matchId: string, counted: boolean, onRestart: () => void, how: { kind: StartKind; restored: boolean } = { kind: 'fresh', restored: false }): void {
  root.className = 'is-table';
  document.documentElement.classList.add('table-lock'); // no page scroll / rubber-band under the table
  const session = controller.session;
  const table = new TableScreen(root, controller, {
    onMenu: () => showMenu(), // the save is kept: Resume from the menu (not abandoned)
    onRestart,
    settings: settingsApi,
    audio: audioApi,
    update: tableUpdate,
    explore: (w) => achievements.note(`explore.${w}`),
  });
  active = { table, controller, matchId, counted };
  // Achievements follow applied events from this controller: solo vs the computer in full; two people
  // on one device only as finished shared matches; developer fixtures never.
  achievements.watch(controller, { kind: !counted ? 'none' : session.opponent === 'ai' ? 'quick-solo' : session.opponent === 'local' ? 'local' : 'none', gameKey: matchId, restored: how.restored });
  audio.setScene('gameplay');
  audio.preload('gameplay');
  table.mount();
  // The first deal happened before the table subscribed: shuffle once for a fresh match (never on restore).
  if (!how.restored) audio.playSfx('shuffle');
  const info = matchInfo(session, matchId);
  const tracked = session.opponent !== 'dev-both';
  const humanTeam = session.rules.teams.findIndex((t) => t.includes(session.humanSeats[0] ?? 0));
  let lastHand = 0;
  controller.subscribe((events) => {
    if (!events.length) return;
    // Autosave after every change (local only; see save.ts for what this is and isn't).
    // A refused write is surfaced persistently (never silently ignored).
    if (session.opponent !== 'dev-both') persistMatch(session, matchId);
    // Analytics from applied engine events only (never from renders): the first accepted
    // command of a new match is its real start; a restored match never "starts" again.
    if (tracked) {
      // A real move (play, draw or pass) — not the deal — marks the actual start.
      if (events.some((e) => e.type === 'tile-played' || e.type === 'tile-drawn' || e.type === 'passed')) analytics.matchActivity(info, how.kind, how.restored);
      for (const e of events) {
        if (e.type === 'hand-resolved') {
          lastHand = e.result.handNumber;
          analytics.roundEnd(info, {
            handNumber: e.result.handNumber,
            ending: e.result.end.kind === 'out' ? 'domino' : e.result.winnerTeam === null ? 'blocked_tie' : 'blocked',
            winner: winnerLabel(e.result.winnerTeam, info.opponent, humanTeam),
            points: e.result.points,
          });
        }
        if (e.type === 'match-won') analytics.matchEnd(info, lastHand || session.debugState().hand.number, winnerLabel(e.team, info.opponent, humanTeam));
      }
    }
    const won = events.find((e) => e.type === 'match-won');
    if (won && won.type === 'match-won' && counted && session.opponent !== 'dev-both') {
      const p1 = session.humanSeats[0] ?? 0;
      updateStats(
        recordCompleted(stats, {
          matchId,
          mode: session.config.mode,
          opponent: session.opponent,
          difficulty: session.difficulty,
          player1Won: session.rules.teams[won.team]!.includes(p1),
          humansArePartners: session.humanSeats.length === 2 && session.rules.teams.some((t) => session.humanSeats.every((h) => t.includes(h))),
        }),
      );
    }
  });
  // The initial save is checked like every other (a refused first write is reported, not ignored).
  if (session.opponent !== 'dev-both') persistMatch(session, matchId);
  if (DEV) (window as unknown as { __sb: unknown }).__sb = { session, controller, runnerKind: runner.kind, matchId, stats: () => stats };
}

/** Restart / rematch from a table: an unfinished match is abandoned first. */
function restartFrom(c: MenuChoice): void {
  const a = active;
  const over = a?.controller.session.phase === 'match-over';
  if (a && a.counted && !over) abandon(a.matchId, a.controller.session.config.mode);
  void start(c, over ? 'rematch' : 'restart');
}

async function start(c: MenuChoice, kind: StartKind = 'fresh'): Promise<void> {
  last = c;
  // Starting fresh replaces any saved game: that match is abandoned (unless it's this one, already handled).
  const saved = readSave(store).value;
  if (saved && saved.matchId !== active?.matchId) abandon(saved.matchId, saved.state.config.mode);
  teardown();
  clearSave(store);
  health.resolve('save');
  setForceSvg(Boolean(c.devForceSvg));
  const timing = DEV && c.devFastAi ? FAST_TIMING : DEFAULT_TIMING;
  let session: GameSession;
  let counted = true;
  if (DEV && c.devFixture) {
    const { FIXTURES } = await import('./dev/fixtures');
    const fx = FIXTURES[c.devFixture as keyof typeof FIXTURES];
    const opponent = fx.opponent ?? 'dev-both';
    counted = opponent !== 'dev-both';
    session = new GameSession({ state: fx.build(), opponent, difficulty: c.difficulty, aiSeed: secureSeed() }, { runner, timing });
  } else {
    const local = c.opponent === 'local' || c.opponent === 'dev-both';
    counted = c.opponent !== 'dev-both';
    session = new GameSession(
      {
        mode: c.mode,
        opponent: c.opponent,
        humanSeats: local ? [0, c.mode === 'partnership4' ? SEATING[c.seating ?? 'across'] : 1] : [0],
        names: c.names,
        targetScore: c.targetScore,
        difficulty: c.difficulty,
        seed: DEV && c.devSeed ? c.devSeed : secureSeed(),
        // A separate secret stream: AI choices never share randomness with the shuffle.
        aiSeed: DEV && c.devAiSeed ? c.devAiSeed : secureSeed(),
      },
      { runner, timing },
    );
  }
  const next: MenuChoice = { ...c, devFixture: undefined };
  mount(new TableController(session), newMatchId(), counted, () => restartFrom(next), { kind, restored: false });
}

/** Rebuild the setup of a (possibly resumed) match for a rematch: same mode, seats, names, target, skill. */
function choiceFromSession(s: GameSession): MenuChoice {
  const humans = s.humanSeats;
  const seat2 = humans[1];
  return {
    mode: s.config.mode,
    opponent: s.opponent,
    targetScore: s.config.targetScore,
    difficulty: s.difficulty,
    names: humans.map((h) => s.config.seats[h]?.displayName ?? ''),
    seating: seat2 === 1 ? 'right' : seat2 === 3 ? 'left' : 'across',
  };
}

function resume(): void {
  const r = readSave(store);
  if (!r.value) {
    const n = noticeFor('saved game', r.status) ?? 'There’s no saved game to resume.';
    notices.push(n);
    return showMenu();
  }
  const saved = r.value;
  teardown();
  // Engine state only: no animation, timer or AI request is restored. The session
  // re-derives what happens next (an AI turn asks afresh; a finished hand resolves once).
  const session = new GameSession({ state: saved.state, opponent: saved.opponent, difficulty: saved.difficulty, aiRng: saved.aiRng }, { runner });
  // A restored game always opens covered when two humans share the device.
  if (saved.opponent !== ('dev-both' as string)) analytics.resume(matchInfo(session, saved.matchId), saved.state.hand.number);
  mount(new TableController(session, { restored: true }), saved.matchId, true, () => restartFrom(choiceFromSession(session)), { kind: 'fresh', restored: true });
}

// ---- boot: start screen → studio intro (if supplied) → fade through black → menu ----
function boot(): void {
  audio.setScene('init');
  const devOverride = DEV ? (window as unknown as { __sbIntroVideo?: string | null }).__sbIntroVideo : undefined;
  showStart({
    root,
    videoUrl: devOverride !== undefined ? devOverride : introVideoUrl(),
    reduceMotion: () => reduceMotion(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
    onGesture: () => {
      // Inside the user gesture: unlock audio, but play nothing — the credit has its own sound.
      audio.setScene('intro');
      void audio.unlock();
    },
    videoVolume: () => ({ muted: settings.audio.muted, volume: Math.max(0, Math.min(1, settings.audio.master * Math.max(settings.audio.music, settings.audio.voice))) }),
    setMuted: (muted) => settingsApi.set({ audio: { ...settings.audio, muted } }),
    // Initialization: what the first menu and the first table need, fetched AND decoded through the one
    // bounded loader (with retries). Fonts load through the FontFace API. Later scenes stay lazy.
    startup: () => {
      const img = (id: Parameters<typeof warmWithRetry>[0][number]) => () => warmWithRetry([id], { front: true, attempts: 3 });
      const font = (spec: string) => document.fonts.load(spec).then((f) => f.length > 0);
      return [
        { label: 'the fonts', run: () => Promise.all([font('800 1em "Bricolage Grotesque"'), font('400 1em "DM Sans"'), font('700 1em "DM Sans"')]).then((r) => r.every(Boolean)) },
        { label: 'the menu backdrop', run: img(envKey('env.neighborhood-patio')) },
        { label: 'Cousin’s portrait', run: img('cousin.atlas.portrait') },
        { label: 'the domino tiles', run: img('tile.atlas') },
      ];
    },
    afterStartup: () => audio.preload('menu', 'metadata'),
    // After an update reload: return once to the same place (story scene or encounter, or the saved match).
    onMenu: () => {
      // Essential startup is over: the whole-game offline download may now start (online only), a moment
      // after the menu reveal so it never competes with it.
      setTimeout(() => pwa.allowBackgroundDownload(), 1500);
      if (resumeAfterUpdate?.to === 'story') {
        autoContinueOnce = resumeAfterUpdate.run === true;
        openStory();
      } else if (resumeAfterUpdate?.to === 'quick' && readSave(store).value) resume();
      else if (resumeAfterUpdate?.to === 'achievements') showMenu('achievements');
      else showMenu();
    },
  });
  if (DEV) (window as unknown as { __sbAudio: unknown }).__sbAudio = { audio, backend };
}

if (DEV) (window as unknown as { __sbAchievements: unknown }).__sbAchievements = achievements; // tests: trigger notes
configureAchievements({
  store,
  stats: () => stats,
  storyCompleted: () => readStory(store).value?.completed ?? [],
  onSaveFailed: () => health.report('achievements', false, () => false),
  onSaveResult: (ok, retry) => health.report('achievements', ok, retry),
  reduceMotion: () => reduceMotion(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
});
boot();
analytics.launch(matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone ? 'standalone' : 'browser', __SB_BUILD_TAG__);
// Register after the first screen is up, so the worker's downloads never compete with it.
if (document.readyState === 'complete') void pwa.start();
else window.addEventListener('load', () => void pwa.start(), { once: true });
