/**
 * Restrained, non-blocking table effects. Every effect element is
 * pointer-events:none, sits below the open-end targets and the HUD, removes
 * itself, and is skipped entirely under reduced motion. Effects only ever
 * decorate PUBLIC things (tiles on the board, seat chips) — never a hand.
 */
import { assetUrl, getAsset, getFrame } from '../assets';
import { effectBox } from '../render/stage';
import { esc } from './svg';

type FxFrame = 'impact-burst' | 'dust-puff' | 'ripple' | 'star-gold' | 'confetti';

let fxLoaded: boolean | null = null;
export function preloadEffects(): void {
  if (fxLoaded !== null || typeof Image === 'undefined') return;
  const url = assetUrl('fx.sheet');
  if (!url) {
    fxLoaded = false;
    return;
  }
  fxLoaded = false;
  const img = new Image();
  img.onload = () => (fxLoaded = true);
  img.src = url;
}

function fxSvg(frame: FxFrame): string {
  const url = assetUrl('fx.sheet');
  if (!fxLoaded || !url) return '<span class="fx-ring" aria-hidden="true"></span>'; // code-drawn fallback
  const sheet = getAsset('fx.sheet');
  const b = effectBox(getFrame('fx.sheet', frame));
  return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><image href="${esc(url)}" width="${sheet.width}" height="${sheet.height}"/></svg>`;
}

export class Effects {
  constructor(private readonly reduceMotion: () => boolean) {}

  #spawn(host: HTMLElement, frame: FxFrame, cls: string, box: { x: number; y: number; size: number }, ms: number): void {
    if (this.reduceMotion()) return;
    const el = document.createElement('span');
    el.className = `fx ${cls}`;
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${box.x - box.size / 2}px`;
    el.style.top = `${box.y - box.size / 2}px`;
    el.style.width = el.style.height = `${box.size}px`;
    el.innerHTML = fxSvg(frame);
    host.appendChild(el);
    window.setTimeout(() => el.remove(), ms);
  }

  /** A short impact puff centred on a freshly placed board tile. */
  impact(board: HTMLElement, tile: HTMLElement, unit: number, big = false): void {
    const x = tile.offsetLeft + tile.offsetWidth / 2;
    const y = tile.offsetTop + tile.offsetHeight / 2;
    this.#spawn(board, big ? 'star-gold' : 'impact-burst', big ? 'fx-big' : 'fx-impact', { x, y, size: unit * (big ? 3 : 2.2) }, big ? 900 : 480);
  }

  /** The pass "knock": a ripple on the passing seat's chip (or the hand area for the viewer). */
  knock(target: HTMLElement): void {
    if (this.reduceMotion()) return;
    target.classList.remove('is-knock');
    void target.offsetWidth; // restart the CSS animation
    target.classList.add('is-knock');
    window.setTimeout(() => target.classList.remove('is-knock'), 520);
    const rect = { x: target.clientWidth / 2, y: target.clientHeight / 2, size: Math.min(120, Math.max(48, target.clientWidth * 0.6)) };
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    this.#spawn(target, 'ripple', 'fx-knock', rect, 520);
  }

  clear(root: HTMLElement): void {
    root.querySelectorAll('.fx').forEach((e) => e.remove());
    root.querySelectorAll('.is-knock').forEach((e) => e.classList.remove('is-knock'));
  }
}
