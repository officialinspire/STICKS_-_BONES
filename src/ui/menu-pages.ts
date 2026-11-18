import { esc } from './svg';

export interface MenuSection {
  title: string;
  html: string;
  layout?: string;
  list?: 'ul' | 'ol';
}

/** Keep every control mounted so form values survive changes of page and orientation. */
export function menuPages(label: string, sections: readonly MenuSection[]): string {
  return `<menu-pages>
    <div class="menu-pages-nav" role="group" aria-label="${esc(label)}" hidden>
      <button class="btn-ghost dark" type="button" data-page-step="-1" aria-label="Previous page">‹</button>
      ${sections.length > 1 ? `<select aria-label="${esc(label)} section">${sections.map(({ title }, i) => `<option value="${i}">${esc(title)}</option>`).join('')}</select>` : ''}
      <span class="menu-page-count" role="status"></span>
      <button class="btn-ghost dark" type="button" data-page-step="1" aria-label="Next page">›</button>
    </div>
    <div class="menu-page-view">${sections.map(({ html, layout = '', list = 'div' }, i) => `<${list} class="menu-page-items ${layout}"${i ? ' data-off-page' : ''}${list === 'div' ? '' : ' role="list"'}>${html}</${list}>`).join('')}</div>
  </menu-pages>`;
}
