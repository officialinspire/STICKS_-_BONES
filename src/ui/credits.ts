/**
 * The epilogue's end credits ("Cut to title, then credits. Case complete." — the script's last direction): a film-style
 * reel. The existing wordmark rises in, then "Case complete." and every credit roll slowly up the screen; at the end a
 * "Back to the case file" button appears.
 *
 * Presentation only: it reads nothing from and writes nothing to the case (the epilogue's end card already saved it),
 * never touches a session, and can be left at any moment ("Skip credits", Escape). A tap on the reel (or Space)
 * pauses and resumes it. Under reduced motion nothing rolls: the same credits are a still list that scrolls.
 * The credits are code-rendered from src/story/credits.ts and are always in the DOM, so screen readers get all of them
 * whatever the reel is doing.
 */
import { CREDITS } from '../story/credits';
import { wordmarkHtml } from './brand';
import { esc } from './svg';

export interface CreditsDeps {
  readonly root: HTMLElement;
  readonly reduceMotion: boolean;
  /** Leave for the Case file (called once). */
  onDone(): void;
  /** The title is up: the case-complete cue (AudioManager; nothing plays if it wasn't supplied). */
  onReprise?(): void;
}

/** Reel speed: about 38 px a second, the pace of film credits on a phone. */
export const ROLL_PX_PER_SEC = 38;

export function creditsHtml(reduceMotion: boolean): string {
  const sections = CREDITS.map(
    (p) =>
      `<section class="roll-section" aria-label="${esc(p.title)}"><h3 class="roll-h">${esc(p.title)}</h3><ul class="roll-lines" role="list">${p.lines
        .map((l) => `<li class="roll-line"><span class="roll-role">${esc(l.role)}</span><span class="roll-name">${esc(l.name)}</span>${l.note ? `<span class="roll-note">${esc(l.note)}</span>` : ''}</li>`)
        .join('')}</ul></section>`,
  ).join('');
  return `<div class="credits-screen" data-motion="${reduceMotion ? 'still' : 'roll'}" data-state="rolling">
      <button type="button" class="btn-ghost credits-skip" data-act="credits-done">Skip credits</button>
      <div class="roll-viewport" data-region="roll" tabindex="-1" aria-label="Credits">
        <div class="roll-reel">
          ${wordmarkHtml({ story: true, level: 'h1', className: 'is-story credits-title' })}
          <p class="case-complete roll-complete">Case complete.</p>
          ${sections}
        </div>
      </div>
      <div class="roll-end" hidden><button type="button" class="btn primary" data-act="credits-done">Back to the case file</button></div>
    </div>`;
}

/** Show the reel in `root`. Returns a dispose function (also called on leaving). */
export function showCredits(d: CreditsDeps): () => void {
  let done = false;
  const root = d.root;
  root.className = 'is-story';
  root.innerHTML = creditsHtml(d.reduceMotion);
  const shell = root.querySelector<HTMLElement>('.credits-screen')!;
  const viewport = shell.querySelector<HTMLElement>('.roll-viewport')!;
  const reel = shell.querySelector<HTMLElement>('.roll-reel')!;
  const end = shell.querySelector<HTMLElement>('.roll-end')!;
  let anim: Animation | null = null;

  const finish = () => {
    if (done) return;
    shell.dataset.state = 'ended';
    end.hidden = false;
    end.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };
  const dispose = () => {
    done = true;
    anim?.cancel();
    document.removeEventListener('keydown', onKey, true);
    shell.removeEventListener('click', onClick);
  };
  const leave = () => {
    if (done) return;
    dispose();
    d.onDone();
  };
  const togglePause = () => {
    if (!anim || shell.dataset.state === 'ended') return;
    if (anim.playState === 'running') {
      anim.pause();
      shell.dataset.state = 'paused';
    } else {
      anim.play();
      shell.dataset.state = 'rolling';
    }
  };
  // Document-level (capture): a key with focus anywhere (body included) works; the root may have been re-rendered.
  const onKey = (e: KeyboardEvent) => {
    if (!shell.isConnected) return dispose();
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      leave();
    } else if (e.key === ' ' && !(e.target as HTMLElement).closest('button')) {
      e.preventDefault();
      togglePause();
    }
  };
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="credits-done"]')) leave();
    else if (t.closest('.roll-viewport')) togglePause();
  };
  document.addEventListener('keydown', onKey, true);
  shell.addEventListener('click', onClick);

  if (d.reduceMotion || typeof reel.animate !== 'function') {
    // Still: the whole list, scrollable, with its way out at the bottom from the start.
    shell.dataset.state = 'still';
    end.hidden = false;
  } else {
    // From just below the screen to just above it, at a steady film-credit pace (dev runs can ask for a quick roll).
    const from = viewport.clientHeight;
    const to = -reel.scrollHeight;
    const fast = import.meta.env.DEV && Boolean((window as unknown as { __sbStoryFast?: boolean }).__sbStoryFast);
    const ms = fast ? 2500 : Math.round(((from - to) / ROLL_PX_PER_SEC) * 1000);
    anim = reel.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration: ms, easing: 'linear', fill: 'forwards' });
    anim.onfinish = finish;
  }
  shell.querySelector<HTMLElement>('.credits-skip')?.focus({ preventScroll: true });
  d.onReprise?.();
  return dispose;
}
