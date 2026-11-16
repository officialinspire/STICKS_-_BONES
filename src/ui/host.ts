/**
 * Cousin on screen. One persistent SVG whose viewBox moves between frames of
 * a shared stage (src/render/stage.ts), so expression swaps keep scale and
 * footing, the hat is never cropped and atlas neighbours never show. The
 * optional slam plays the 6-frame strip; it is purely visual (never awaited by
 * game logic), skipped under reduced motion or when disabled, and silently
 * skipped if the strip art is missing.
 */
import { assetUrl, getAsset } from '../assets';
import type { Rect } from '../assets/types';
import { bustBox, stageFor } from '../render/stage';
import { esc } from './svg';

export type Mood = 'neutral' | 'smirk' | 'thinking' | 'explaining' | 'laughing' | 'surprised' | 'delighted' | 'pumped';
export type HostVariant = 'bust' | 'full';

const PORTRAIT = 'cousin.atlas.portrait' as const;
const SLAM = 'cousin.anim.slam' as const;
const SLAM_FRAMES = ['ready', 'lift', 'aim', 'slam', 'press', 'recover'];
const FRAME_MS = 95;

let slamReady: Promise<boolean> | null = null;
function loadSlam(): Promise<boolean> {
  if (!slamReady) {
    slamReady = new Promise((resolve) => {
      const url = assetUrl(SLAM);
      if (!url || typeof Image === 'undefined') return resolve(false);
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }
  return slamReady;
}

function frameView(variant: HostVariant, sheetId: typeof PORTRAIT | typeof SLAM, frame: string): Rect {
  const stage = stageFor(getAsset(sheetId));
  return variant === 'bust' && sheetId === PORTRAIT ? bustBox(stage, frame) : stage.boxes[frame]!;
}

/** Static markup for a host figure (menus, results). */
export function hostFigureHtml(mood: Mood, variant: HostVariant, className = ''): string {
  const sheet = getAsset(PORTRAIT);
  const v = frameView(variant, PORTRAIT, mood);
  const url = assetUrl(PORTRAIT);
  return `<span class="host-figure-art ${esc(className)} host-${variant}"><span class="host-fallback" aria-hidden="true">R</span><svg class="host-svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Cousin">${
    url ? `<image href="${esc(url)}" width="${sheet.width}" height="${sheet.height}"/>` : ''
  }</svg></span>`;
}

export class HostView {
  #el: HTMLElement;
  #svg: SVGSVGElement | null = null;
  #variant: HostVariant;
  #mood: Mood = 'neutral';
  #timers: number[] = [];
  #animating = false;

  constructor(
    el: HTMLElement,
    variant: HostVariant,
    private readonly opts: { reduceMotion: () => boolean; animations: () => boolean },
  ) {
    this.#el = el;
    this.#variant = variant;
    this.#mount();
  }

  #mount(): void {
    this.#el.innerHTML = hostFigureHtml(this.#mood, this.#variant, 'host-live');
    this.#svg = this.#el.querySelector('svg');
    this.#svg?.querySelector('image')?.addEventListener('error', (e) => {
      (e.target as Element).closest('.host-figure-art')?.classList.add('art-missing');
      (e.target as Element).remove();
    });
  }

  setVariant(v: HostVariant): void {
    if (v === this.#variant) return;
    this.cancel();
    this.#variant = v;
    this.#mount();
    this.setMood(this.#mood, true);
  }

  #show(sheetId: typeof PORTRAIT | typeof SLAM, frame: string): void {
    const svg = this.#svg;
    if (!svg) return;
    const sheet = getAsset(sheetId);
    const url = assetUrl(sheetId);
    const r = frameView(this.#variant, sheetId, frame);
    svg.setAttribute('viewBox', `${r.x} ${r.y} ${r.w} ${r.h}`);
    const img = svg.querySelector('image');
    if (img && url) {
      if (img.getAttribute('href') !== url) img.setAttribute('href', url);
      img.setAttribute('width', String(sheet.width));
      img.setAttribute('height', String(sheet.height));
    }
    svg.dataset.frame = `${sheetId}/${frame}`;
  }

  setMood(mood: Mood, force = false): void {
    if (mood === this.#mood && !force) return;
    this.#mood = mood;
    if (!this.#animating) this.#show(PORTRAIT, mood);
  }

  /** Play the slam strip once (presentation only). Returns immediately; never blocks the game. */
  slam(): void {
    if (this.#variant !== 'full' || this.opts.reduceMotion() || !this.opts.animations() || this.#animating) return;
    void loadSlam().then((ok) => {
      if (!ok || this.#animating || this.opts.reduceMotion()) return;
      this.#animating = true;
      SLAM_FRAMES.forEach((f, i) => this.#timers.push(window.setTimeout(() => this.#show(SLAM, f), i * FRAME_MS)));
      this.#timers.push(
        window.setTimeout(() => {
          this.#animating = false;
          this.#show(PORTRAIT, this.#mood);
        }, SLAM_FRAMES.length * FRAME_MS + 120),
      );
    });
  }

  cancel(): void {
    this.#timers.forEach((t) => clearTimeout(t));
    this.#timers = [];
    if (this.#animating) {
      this.#animating = false;
      this.#show(PORTRAIT, this.#mood);
    }
  }
}
