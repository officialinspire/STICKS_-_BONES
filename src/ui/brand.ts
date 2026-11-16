/**
 * The STICKS & BONES wordmark (vector masters in src/assets/brand/, built by
 * `npm run wordmark:build`). Inlined so it stays sharp at any size and works
 * offline. The heading's accessible name is real text; the SVG art is hidden
 * from assistive technology. The full stacked mark shows when there's room;
 * the one-line compact mark is used in short landscape and tight headers.
 */
import compactSvg from '../assets/brand/wordmark-compact.svg?raw';
import masterSvg from '../assets/brand/wordmark.svg?raw';

/** Remove the standalone-file accessibility attributes: the wrapper provides the name. */
const art = (svg: string) => svg.replace(/\s*role="img"/, '').replace(/\s*aria-label="[^"]*"/, '').replace(/<title>.*?<\/title>/, '').replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
const MASTER = art(masterSvg);
const COMPACT = art(compactSvg);

export const STORY_SUBTITLE = 'NO REST FOR COUSIN';
export const MENU_PROMISE = 'A dominoes mystery in Puerto Rico.';

export function wordmarkHtml(o: { level?: 'h1' | 'p'; story?: boolean; className?: string } = {}): string {
  const tag = o.level ?? 'h1';
  const sub = o.story ? `<span class="wm-sub">${STORY_SUBTITLE}</span>` : '';
  const name = o.story ? `STICKS &amp; BONES: ${STORY_SUBTITLE}` : 'STICKS &amp; BONES';
  return `<${tag} class="wordmark ${o.className ?? ''}"><span class="sr-only">${name}</span><span class="wm-art wm-full">${MASTER}</span><span class="wm-art wm-compact">${COMPACT}</span>${sub ? `<span aria-hidden="true">${sub}</span>` : ''}</${tag}>`;
}
