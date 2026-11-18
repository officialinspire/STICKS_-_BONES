/**
 * Startup: initialization → start prompt → studio credit → fade through black → menu reveal.
 *
 * - **Initialization:** the essentials (fonts, menu backdrop, Cousin's portrait, tile faces) are fetched
 *   and decoded through the app's one bounded loader (src/assets/warm.ts), with retries.
 *   - Progress is truthful: "n of N", which item failed, and a Retry button.
 *   - The start prompt is enabled the moment everything has settled. Nothing waits on a timer, except
 *     that a very slow network may start anyway after INIT_PATIENCE_MS, and the screen says so.
 *   - Failed art never blocks play: every image has a drawn stand-in.
 * - **Start:** one gesture (tap, click or Enter/any key) unlocks audio and plays NO sound of its own.
 *   - The audio manager stays in its silent 'intro' scene through the credit.
 *   - The video element is released before menu music can start.
 * - **Credit:**
 *   - The INSPIRE studio video (a local file: assets/video/inspiresoftwareintro.mp4). It's skippable (button,
 *     Escape), paused while the app is in the background, and ends once on any failure.
 *   - Skip and Mute arm only after the starting input is released (the tap's pointerup, the key's keyup) and at
 *     least SKIP_ARM_MS later, so the start gesture itself (a tap landing on Skip, a held or repeating Enter)
 *     can never skip the credit by accident.
 *   - A refused play() is retried muted (the Mute button then reads "Unmute"; the player's saved mute is not
 *     changed). Skip fades the soundtrack out with the picture, and the menu waits until the media is released.
 *   - Otherwise, a short typeset text card that doesn't pretend to be the video. Also skippable.
 * - **Reveal:** the menu fades up from black. Title, menu panel and Cousin follow in a short stagger.
 *   - Any input finishes the reveal at once, and reduced motion skips it.
 */
import { IntroController, type IntroEnd, type VideoPort } from '../app/intro';
import { realScheduler } from '../app/session';
import { wordmarkHtml } from './brand';
import { esc } from './svg';

/** One thing initialization loads. `run` resolves true when loaded (it does its own retries). */
export interface StartupItem {
  readonly label: string;
  run(): Promise<boolean>;
}

export interface IntroDeps {
  root: HTMLElement;
  videoUrl: string | null;
  reduceMotion: () => boolean;
  /** Called synchronously inside the start gesture (audio unlock lives here). */
  onGesture(): void;
  /** Current mute/level for the video's own soundtrack. */
  videoVolume(): { muted: boolean; volume: number };
  setMuted(muted: boolean): void;
  /** Enter the menu (called once, while the screen is black). */
  onMenu(reason: IntroEnd): void;
  /** What initialization loads before the start prompt (each item retries itself). */
  startup(): StartupItem[];
  /** Background warm-up that may start once the essentials are in. */
  afterStartup?(): void;
}

/** Longest the start prompt waits for a slow network before letting the player start anyway. */
export const INIT_PATIENCE_MS = 8000;
/** How long the text credit holds when the studio video isn't supplied. */
export const CREDIT_CARD_MS = 1600;
/** Skip / Mute ignore input until the starting gesture is released and at least this long has passed. */
export const SKIP_ARM_MS = 400;
/** If the starting input's release is never seen (focus moved, a lost pointerup), arm anyway after this. */
export const SKIP_ARM_MAX_MS = 1500;
/** The credit's soundtrack fades out over this on Skip (shorter under reduced motion; the picture fade is 420 ms). */
export const AUDIO_FADE_MS = 380;

function port(el: HTMLVideoElement): VideoPort {
  return {
    play: () => el.play(),
    pause: () => el.pause(),
    release: () => {
      el.pause();
      el.removeAttribute('src');
      el.load(); // drops buffered media: its audio can never overlap menu music
    },
    on: (event, cb) => {
      el.addEventListener(event, cb);
      return () => el.removeEventListener(event, cb);
    },
    durationSec: () => (Number.isFinite(el.duration) ? el.duration : null),
    mute: () => void (el.muted = true),
    fadeOut: (ms) =>
      new Promise<void>((resolve) => {
        const from = el.volume;
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / ms);
          try {
            el.volume = Math.max(0, from * (1 - k)); // iOS ignores volume: the release still stops it
          } catch {
            /* volume not settable */
          }
          if (k >= 1 || document.hidden) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  };
}

export function showStart(d: IntroDeps): () => void {
  const { root } = d;
  root.className = 'is-start';
  root.innerHTML = `
    <div class="start-screen">
      ${wordmarkHtml({ level: 'h1', className: 'is-start' })}
      <div class="start-load" data-region="start-load">
        <progress class="start-progress" max="1" value="0" aria-label="Loading the game"></progress>
        <p class="start-status" role="status">Loading…</p>
        <button type="button" class="btn-ghost start-retry" data-act="start-retry" hidden>Try again</button>
      </div>
      <button type="button" class="start-button" data-act="start" disabled>Loading…</button>
    </div>
    <div class="fade-black" aria-hidden="true"></div>`;
  const startBtn = root.querySelector('.start-button') as HTMLButtonElement;
  const statusEl = root.querySelector('.start-status') as HTMLElement;
  const bar = root.querySelector('.start-progress') as HTMLProgressElement;
  const retryBtn = root.querySelector('.start-retry') as HTMLButtonElement;

  let ready = false;
  let started = false;
  let disposed = false;
  let controller: IntroController | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let cardTimer = 0;
  let cardLeft = 0;
  let cardAt = 0;
  // Skip guard: armed once the starting input is released AND SKIP_ARM_MS has passed.
  let skipArmed = false;
  let armMin = false;
  let armReleased = false;
  let armTimers: number[] = [];
  let armOffs: (() => void)[] = [];
  const fade = root.querySelector('.fade-black') as HTMLElement;
  const fadeMs = () => (d.reduceMotion() ? 0 : 420);
  if (d.reduceMotion()) fade.style.transition = 'none';

  // ---- initialization: truthful progress, retries, a usable fallback ----
  const items = d.startup();
  const result = new Map<StartupItem, boolean>();
  let settledAll: () => void = () => {};
  const allSettled = new Promise<void>((r) => (settledAll = r));
  const report = () => {
    if (disposed) return;
    const done = result.size;
    const failed = items.filter((i) => result.get(i) === false);
    bar.max = items.length || 1;
    bar.value = done;
    if (done < items.length) {
      statusEl.textContent = ready ? `Still loading (${done} of ${items.length}). You can start now.` : `Loading… ${done} of ${items.length}`;
      return;
    }
    retryBtn.hidden = failed.length === 0;
    statusEl.textContent = failed.length
      ? `Couldn’t load ${failed.map((i) => i.label).join(', ')}. Drawn stand-ins will be used, so you can still play.`
      : 'Ready.';
    bar.hidden = failed.length === 0;
    root.querySelector('.start-load')?.classList.toggle('is-ready', failed.length === 0);
    settledAll();
  };
  const runItems = (list: readonly StartupItem[]) =>
    Promise.all(
      list.map((it) =>
        it.run().then(
          (ok) => (result.set(it, ok), report()),
          () => (result.set(it, false), report()),
        ),
      ),
    );
  report();
  void runItems(items);
  const patience = window.setTimeout(() => becomeReady(), INIT_PATIENCE_MS);
  void allSettled.then(() => becomeReady());

  function becomeReady(): void {
    if (ready || disposed) return;
    ready = true;
    window.clearTimeout(patience);
    report();
    startBtn.disabled = false;
    startBtn.textContent = 'Tap, click or press Enter to start';
    startBtn.focus({ preventScroll: true });
    d.afterStartup?.();
    // Only now buffer the credit, so it never competes with the essentials.
    if (d.videoUrl) {
      videoEl = document.createElement('video');
      videoEl.preload = 'auto';
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.className = 'intro-video';
      videoEl.src = d.videoUrl;
    }
  }

  // ---- start (one gesture) and the credit ----
  /** The key behind a keyboard-activated click (a button's own Enter/Space activation carries no key). */
  let lastKey = '';
  const onKey = (e: KeyboardEvent) => {
    const activates = e.key === 'Enter' || e.key === ' ';
    if (!e.repeat) lastKey = e.key;
    // An auto-repeating key never activates anything here: a held Enter can't start the game (if its first press
    // came while loading) and can't skip the credit. Only fresh presses count.
    if (e.repeat && activates) {
      e.preventDefault();
      return;
    }
    if (started) {
      // While the guard is closed, a held or repeating key can't reach Skip / Mute (their own Enter/Space).
      if (!skipArmed && (activates || e.key === 'Escape')) {
        e.preventDefault();
        return;
      }
      // Keyboard skip during the credit (its buttons handle Enter/Space themselves).
      if (e.key === 'Escape' && !e.repeat && !finished) skip();
      return;
    }
    if (!ready || e.target === retryBtn || e.repeat) return;
    if (!['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(e.key)) begin({ key: e.key });
  };
  /** Open the Skip / Mute guard (both conditions met). */
  const maybeArm = () => {
    if (skipArmed || !armMin || !armReleased || finished || disposed) return;
    skipArmed = true;
    for (const b of root.querySelectorAll<HTMLElement>('.intro-controls [aria-disabled]')) b.removeAttribute('aria-disabled');
    root.querySelector('.intro-stage')?.setAttribute('data-skip', 'armed');
  };
  /** The start input: wait for its release (a pointerup, or that key's keyup) before Skip can act. */
  const guardSkip = (from: { key?: string; pointer?: boolean }) => {
    armTimers.push(window.setTimeout(() => ((armMin = true), maybeArm()), SKIP_ARM_MS));
    armTimers.push(window.setTimeout(() => ((armMin = armReleased = true), maybeArm()), SKIP_ARM_MAX_MS));
    if (!from.key && !from.pointer) armReleased = true; // a click: the press is already over
    const released = () => window.setTimeout(() => ((armReleased = true), maybeArm()), 0); // after the trailing click
    if (from.pointer) {
      const up = () => released();
      addEventListener('pointerup', up, { capture: true, once: true });
      addEventListener('pointercancel', up, { capture: true, once: true });
      armOffs.push(() => removeEventListener('pointerup', up, true), () => removeEventListener('pointercancel', up, true));
    }
    if (from.key) {
      const up = (e: KeyboardEvent) => e.key === from.key && released();
      addEventListener('keyup', up, true);
      armOffs.push(() => removeEventListener('keyup', up, true));
    }
  };
  const skip = () => {
    if (!skipArmed) return; // the start gesture's own trailing events never skip
    if (controller) controller.skip();
    else if (cardTimer) {
      window.clearTimeout(cardTimer);
      cardTimer = 0;
      finishTo('skip');
    }
  };
  const creditHtml = (body: string, label: string, mute: string) => `
      <div class="intro-stage" role="region" aria-label="${esc(label)}" data-skip="guarded">
        ${body}
        <div class="intro-controls">${mute}<button type="button" class="btn" data-act="intro-skip" aria-disabled="true">Skip intro</button></div>
      </div>`;
  const begin = (from: { key?: string; pointer?: boolean } = {}) => {
    if (started || disposed || !ready) return;
    started = true; // double clicks / key repeats can't start twice
    guardSkip(from);
    d.onGesture();
    startBtn.disabled = true;
    const screen = root.querySelector('.start-screen')!;
    if (!videoEl) {
      // No studio video supplied: a short typeset credit, honest about being text.
      screen.innerHTML = creditHtml('<div class="credit-card"><p class="credit-studio">INSPIRE</p><p class="credit-note">presents</p></div>', 'Studio credit', '');
      if (d.reduceMotion()) screen.querySelector('.credit-card')?.classList.add('no-motion');
      (root.querySelector('[data-act="intro-skip"]') as HTMLElement).focus();
      armCard(CREDIT_CARD_MS);
      return;
    }
    const v = videoEl;
    const vol = d.videoVolume();
    v.muted = vol.muted;
    v.volume = vol.volume;
    screen.innerHTML = creditHtml('<div class="intro-frame"></div>', 'INSPIRE studio intro', `<button type="button" class="btn-ghost" data-act="intro-mute" aria-pressed="${vol.muted}" aria-disabled="true">${vol.muted ? 'Unmute' : 'Mute'}</button>`);
    root.querySelector('.intro-frame')!.appendChild(v);
    (root.querySelector('[data-act="intro-skip"]') as HTMLElement).focus();
    controller = new IntroController({
      video: port(v),
      scheduler: realScheduler,
      fadeOutMs: d.reduceMotion() ? 120 : AUDIO_FADE_MS,
      onFinish: (r, released) => finishTo(r, released),
      // Sound was refused: the credit plays muted, and says so (the player's saved mute is left alone).
      onMutedFallback: () => {
        const m = root.querySelector<HTMLElement>('[data-act="intro-mute"]');
        if (m) {
          m.setAttribute('aria-pressed', 'true');
          m.textContent = 'Unmute';
        }
      },
    });
    controller.start();
    if (document.hidden) controller.suspend();
  };
  const armCard = (ms: number) => {
    cardLeft = ms;
    cardAt = performance.now();
    cardTimer = window.setTimeout(() => {
      cardTimer = 0;
      finishTo('missing');
    }, ms);
  };

  // Backgrounding: the credit pauses (video and timers) and picks up where it was on return.
  const onVisibility = () => {
    if (!started || finished) return;
    if (document.hidden) {
      controller?.suspend();
      if (cardTimer) {
        window.clearTimeout(cardTimer);
        cardTimer = 0;
        cardLeft = Math.max(0, cardLeft - (performance.now() - cardAt));
      }
    } else {
      controller?.resume();
      if (!controller && !cardTimer) armCard(Math.max(300, cardLeft));
    }
  };

  let finished = false;
  const finishTo = (reason: IntroEnd, released: Promise<void> = Promise.resolve()) => {
    if (finished || disposed) return;
    finished = true;
    // Decode before reveal: wait (briefly, never past the patience budget) for essentials still in flight.
    const essentials = Promise.race([allSettled, new Promise<void>((r) => window.setTimeout(r, ready ? 1500 : 0))]);
    // Controlled fade through black, then the menu, then fade back in.
    fade.classList.add('is-on');
    // The menu (and its music) only once the credit's media is released: no overlap, ever.
    void Promise.all([essentials, released, new Promise<void>((r) => window.setTimeout(r, fadeMs()))]).then(() => {
      if (disposed) return;
      cleanup();
      d.onMenu(reason);
      reveal();
    });
  };

  /** Menu art first (the black lifts), then title, panel and Cousin. Any input completes it at once. */
  const reveal = () => {
    const f = document.createElement('div');
    f.className = 'fade-black is-on';
    f.setAttribute('aria-hidden', 'true');
    const reduce = d.reduceMotion();
    if (reduce) f.style.transition = 'none';
    root.appendChild(f);
    const scene = reduce ? null : root.querySelector<HTMLElement>('.scene');
    let endTimer = 0;
    const done = () => {
      scene?.classList.remove('is-reveal');
      window.clearTimeout(endTimer);
      removeEventListener('pointerdown', done, true);
      removeEventListener('keydown', done, true);
    };
    if (scene) {
      scene.classList.add('is-reveal');
      endTimer = window.setTimeout(done, 1400);
      addEventListener('pointerdown', done, true);
      addEventListener('keydown', done, true);
    }
    requestAnimationFrame(() => {
      f.classList.remove('is-on');
      window.setTimeout(() => f.remove(), fadeMs() + 50);
    });
  };

  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    // A click with detail 0 came from the keyboard (Enter/Space on the button): arm Skip only after that key's release.
    if (t.dataset.act === 'start') begin(e.detail === 0 && lastKey ? { key: lastKey } : {});
    if (t.getAttribute('aria-disabled') === 'true') return; // Skip / Mute: guarded until the start input is released
    if (t.dataset.act === 'start-retry') {
      // Retry only what failed; progress counts it again honestly.
      const failed = items.filter((i) => result.get(i) === false);
      for (const i of failed) result.delete(i);
      retryBtn.hidden = true;
      report();
      void runItems(failed);
    }
    if (t.dataset.act === 'intro-skip') skip();
    if (t.dataset.act === 'intro-mute' && videoEl && skipArmed) {
      const muted = !videoEl.muted;
      videoEl.muted = muted;
      if (!muted && videoEl.paused && !finished) void videoEl.play().catch(() => undefined); // unmuting is a gesture
      d.setMuted(muted); // persists: menu music will respect it
      t.setAttribute('aria-pressed', String(muted));
      t.textContent = muted ? 'Unmute' : 'Mute';
    }
  };
  const onPointer = (e: PointerEvent) => {
    // Touch anywhere on the start screen starts (the button covers it, this catches the margins).
    const t = e.target as HTMLElement;
    if (!started && ready && t.closest('.start-screen') && !t.closest('.start-retry')) begin({ pointer: true });
  };
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointer);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  const cleanup = () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearTimeout(patience);
    window.clearTimeout(cardTimer);
    for (const t of armTimers) window.clearTimeout(t);
    for (const off of armOffs) off();
    armTimers = [];
    armOffs = [];
    if (controller && !controller.done) controller.finish('cancelled');
  };
  return () => {
    disposed = true;
    cleanup();
  };
}
