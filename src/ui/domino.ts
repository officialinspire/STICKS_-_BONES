/**
 * Domino tile rendering as inline SVG.
 *
 * Pips always come from canonical values and are drawn as vector circles, so a
 * tile renders correctly even when face art is missing or fails to load: the
 * flat ivory base, divider and pips sit underneath/over the optional sprite.
 */
import type { Rect } from '../assets/types';
import type { Pip } from '../engine/types';
import { esc } from './svg';

/** Pip centres inside one 100×100 half, by value. */
export const PIP_LAYOUT: Readonly<Record<Pip, readonly (readonly [number, number])[]>> = {
  0: [],
  1: [[50, 50]],
  2: [
    [27, 27],
    [73, 73],
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73],
  ],
  4: [
    [27, 27],
    [73, 27],
    [27, 73],
    [73, 73],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [27, 24],
    [27, 50],
    [27, 76],
    [73, 24],
    [73, 50],
    [73, 76],
  ],
};

export interface FaceSprite {
  readonly url: string;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly rect: Rect;
}

export interface DominoOptions {
  /** 'vertical' puts `a` on top; 'horizontal' puts `a` on the left. */
  readonly orientation?: 'vertical' | 'horizontal';
  readonly face?: FaceSprite | null;
  /** Accessible label. Omit for decorative tiles (aria-hidden). Never label hidden tiles with values. */
  readonly label?: string;
  readonly className?: string;
}

function pips(value: Pip, offsetY: number): string {
  return PIP_LAYOUT[value]
    .map(([x, y]) => `<circle cx="${x}" cy="${y + offsetY}" r="8.5" class="pip"/>`)
    .join('');
}

export function dominoSvg(a: Pip, b: Pip, opts: DominoOptions = {}): string {
  const horizontal = opts.orientation === 'horizontal';
  const viewBox = horizontal ? '0 0 200 100' : '0 0 100 200';
  const transform = horizontal ? ' transform="translate(0 100) rotate(-90)"' : '';
  const face = opts.face
    ? `<svg x="0" y="0" width="100" height="200" viewBox="${opts.face.rect.x} ${opts.face.rect.y} ${opts.face.rect.w} ${opts.face.rect.h}" preserveAspectRatio="none"><image href="${esc(opts.face.url)}" width="${opts.face.sheetWidth}" height="${opts.face.sheetHeight}"/></svg>`
    : '';
  const a11y = opts.label ? `role="img" aria-label="${esc(opts.label)}"` : 'aria-hidden="true" focusable="false"';
  return (
    `<svg class="domino ${esc(opts.className ?? '')}" viewBox="${viewBox}" ${a11y}>` +
    `<g${transform}>` +
    `<rect x="1.5" y="1.5" width="97" height="197" rx="12" class="domino-base"/>` +
    face +
    `<line x1="12" y1="100" x2="88" y2="100" class="domino-divider"/>` +
    pips(a, 0) +
    pips(b, 100) +
    `</g></svg>`
  );
}
