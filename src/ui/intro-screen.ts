/**
 * Start screen → studio intro (if supplied) → fade through black → menu.
 * The start gesture unlocks audio and plays NO sound of its own; the audio
 * manager is in its silent 'intro' scene while the credit runs, and the video
 * element is released before menu music can start.
 */
import { IntroController, type IntroEnd, type VideoPort } from '../app/intro';
import { realScheduler } from '../app/session';
import { wordmarkHtml } from './brand';

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
  /** Warm up what the menu needs during the start screen / credit. */
  preload(): void;
}

function port(el: HTMLVideoElement): VideoPort {
  return {
    play: () => el.play(),
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
  };
}

export function showStart(d: IntroDeps): () => void {
  const { root } = d;
  root.className = 'is-start';
  root.innerHTML = `
    <div class="start-screen">
      ${wordmarkHtml({ level: 'h1', className: 'is-start' })}
      <button type="button" class="start-button" data-act="start" autofocus>Tap, click or press any key to start</button>
    </div>
    <div class="fade-black" aria-hidden="true"></div>`;
  d.preload();
  // Buffer the credit while the player decides to start (only if it exists).
  let videoEl: HTMLVideoElement | null = null;
  if (d.videoUrl) {
    videoEl = document.createElement('video');
    videoEl.preload = 'auto';
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.className = 'intro-video';
    videoEl.src = d.videoUrl;
  }
  let started = false;
  let disposed = false;
  let controller: IntroController | null = null;
  const fade = root.querySelector('.fade-black') as HTMLElement;
  const fadeMs = () => (d.reduceMotion() ? 0 : 420);
  if (d.reduceMotion()) fade.style.transition = 'none';

  const onKey = (e: KeyboardEvent) => {
    if (controller && !controller.done && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
      // Keyboard skip during the credit (buttons also handle Enter/Space themselves).
      if (e.key === 'Escape') controller.skip();
      return;
    }
    if (!started && !['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) begin();
  };
  const begin = () => {
    if (started || disposed) return;
    started = true; // double clicks / key repeats can't start twice
    d.onGesture();
    (root.querySelector('.start-button') as HTMLButtonElement).disabled = true;
    if (!videoEl) return void finishTo('missing');
    const v = videoEl;
    const vol = d.videoVolume();
    v.muted = vol.muted;
    v.volume = vol.volume;
    root.querySelector('.start-screen')!.innerHTML = `
      <div class="intro-stage" role="region" aria-label="INSPIRE studio intro">
        <div class="intro-frame"></div>
        <div class="intro-controls">
          <button type="button" class="btn-ghost" data-act="intro-mute" aria-pressed="${vol.muted}">${vol.muted ? 'Unmute' : 'Mute'}</button>
          <button type="button" class="btn" data-act="intro-skip">Skip intro</button>
        </div>
      </div>`;
    root.querySelector('.intro-frame')!.appendChild(v);
    (root.querySelector('[data-act="intro-skip"]') as HTMLElement).focus();
    controller = new IntroController({ video: port(v), scheduler: realScheduler, onFinish: (r) => finishTo(r) });
    controller.start();
  };
  let finished = false;
  const finishTo = (reason: IntroEnd) => {
    if (finished || disposed) return;
    finished = true;
    // Controlled fade through black, then the menu, then fade back in.
    fade.classList.add('is-on');
    window.setTimeout(() => {
      if (disposed) return;
      cleanup();
      d.onMenu(reason);
      const f = document.createElement('div');
      f.className = 'fade-black is-on';
      f.setAttribute('aria-hidden', 'true');
      if (d.reduceMotion()) f.style.transition = 'none';
      root.appendChild(f);
      requestAnimationFrame(() => {
        f.classList.remove('is-on');
        window.setTimeout(() => f.remove(), fadeMs() + 50);
      });
    }, fadeMs());
  };
  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'start') begin();
    if (t.dataset.act === 'intro-skip') controller?.skip();
    if (t.dataset.act === 'intro-mute' && videoEl) {
      const muted = !videoEl.muted;
      videoEl.muted = muted;
      d.setMuted(muted); // persists: menu music will respect it
      t.setAttribute('aria-pressed', String(muted));
      t.textContent = muted ? 'Unmute' : 'Mute';
    }
  };
  const onPointer = (e: PointerEvent) => {
    // Touch anywhere on the start screen starts (the button covers it, this catches the margins).
    if (!started && (e.target as HTMLElement).closest('.start-screen')) begin();
  };
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointer);
  document.addEventListener('keydown', onKey);
  const cleanup = () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('keydown', onKey);
    if (controller && !controller.done) controller.finish('cancelled');
  };
  return () => {
    disposed = true;
    cleanup();
  };
}
