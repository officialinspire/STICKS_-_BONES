import type { Rect } from '../assets/types';
import { esc } from './svg';

/**
 * Crop one frame out of a sheet with an SVG viewBox. Scales to whatever CSS
 * size the element is given and never assumes the sheet is evenly packed —
 * the rect comes from the verified manifest.
 */
export function spriteSvg(opts: {
  url: string | null;
  sheetWidth: number;
  sheetHeight: number;
  rect: Rect;
  label?: string;
  className?: string;
}): string {
  const { rect } = opts;
  const a11y = opts.label ? `role="img" aria-label="${esc(opts.label)}"` : 'aria-hidden="true" focusable="false"';
  const image = opts.url
    ? `<image href="${esc(opts.url)}" width="${opts.sheetWidth}" height="${opts.sheetHeight}"/>`
    : '';
  return `<svg class="sprite ${esc(opts.className ?? '')}" viewBox="${rect.x} ${rect.y} ${rect.w} ${rect.h}" preserveAspectRatio="xMidYMax meet" ${a11y}>${image}</svg>`;
}
