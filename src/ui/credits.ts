/**
 * The epilogue's title reprise and end credits ("Cut to title, then credits. Case complete." — the script's last
 * direction), then back to the Case file.
 *
 * Presentation only: it reads nothing from and writes nothing to the case (the epilogue's end card has already saved
 * it), never touches a session, and can be left at any moment (← Case file, Back to the case file, Escape). The reveal
 * is CSS only: any tap or key finishes it at once, and under reduced motion it is already finished. Pagination is the
 * shared menu-pages element, so every page fits from 320×568 to desktop and large text. The existing wordmark is the
 * title; the credits are code-rendered from src/story/credits.ts.
 */
import { CREDITS } from '../story/credits';
import { wordmarkHtml } from './brand';
import { menuPages } from './menu-pages';
import { esc } from './svg';

export interface CreditsDeps {
  readonly root: HTMLElement;
  readonly reduceMotion: boolean;
  /** Leave for the Case file (called once). */
  onDone(): void;
  /** The title is up: the case-complete cue (AudioManager; nothing plays if it wasn't supplied). */
  onReprise?(): void;
}

export function creditsHtml(reduceMotion: boolean): string {
  const pages = CREDITS.map((p) => ({
    title: p.title,
    layout: 'credits-list panel-dark',
    list: 'ul' as const,
    html: `<li class="credits-h">${esc(p.title)}</li>${p.lines.map((l) => `<li class="credit"><span class="credit-role">${esc(l.role)}</span> <span class="credit-name">${esc(l.name)}</span>${l.note ? ` <span class="credit-note">${esc(l.note)}</span>` : ''}</li>`).join('')}`,
  }));
  return `<div class="story-shell case-menu credits-screen" data-reveal="${reduceMotion ? 'done' : 'play'}">
      <header class="story-head">
        <button type="button" class="btn-ghost back" data-act="credits-done">← Case file</button>
        ${wordmarkHtml({ story: true, level: 'h1', className: 'is-story credits-title' })}
      </header>
      ${menuPages('Credits', [
        { title: 'Case complete', layout: 'case-actions panel-dark credits-end', html: `<p class="case-complete">Case complete.</p><p class="note-dark">Credits follow on the next pages.</p><button type="button" class="btn primary" data-act="credits-done">Back to the case file</button>` },
        ...pages,
      ])}
    </div>`;
}

/** Show the reprise and credits in `root`. Returns a dispose function (also called on leaving). */
export function showCredits(d: CreditsDeps): () => void {
  let done = false;
  const root = d.root;
  root.className = 'is-story';
  root.innerHTML = creditsHtml(d.reduceMotion);
  const shell = root.querySelector<HTMLElement>('.credits-screen')!;
  // Left some other way (the root was re-rendered): the document listeners go with it on their next event.
  const finishReveal = () => (shell.isConnected ? shell.setAttribute('data-reveal', 'done') : dispose());
  const dispose = () => {
    done = true;
    document.removeEventListener('pointerdown', finishReveal, true);
    document.removeEventListener('keydown', onKey, true);
    shell.removeEventListener('animationend', onAnim);
    shell.removeEventListener('click', onClick);
  };
  const leave = () => {
    if (done) return;
    dispose();
    d.onDone();
  };
  // Document-level (capture): a tap anywhere or a key with focus anywhere (body included) finishes the reveal.
  const onKey = (e: KeyboardEvent) => {
    if (!shell.isConnected) return dispose();
    finishReveal();
    if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      leave();
    }
  };
  const onAnim = (e: AnimationEvent) => {
    if (e.target === shell.querySelector('menu-pages')) finishReveal();
  };
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-act="credits-done"]')) leave();
  };
  document.addEventListener('pointerdown', finishReveal, true);
  document.addEventListener('keydown', onKey, true);
  shell.addEventListener('animationend', onAnim);
  shell.addEventListener('click', onClick);
  shell.querySelector<HTMLElement>('.credits-end [data-act="credits-done"]')?.focus({ preventScroll: true });
  d.onReprise?.();
  return dispose;
}
