export class MenuPages extends HTMLElement {
  #view!: HTMLElement;
  #sections!: HTMLElement[];
  #select: HTMLSelectElement | null = null;
  #section = 0;
  #page = 0;
  #pages: HTMLElement[][] = [];
  #frame = 0;
  #resize = new ResizeObserver(() => this.refresh());
  #changes = new MutationObserver(() => this.refresh());

  connectedCallback(): void {
    this.#view = this.querySelector('.menu-page-view')!;
    this.#sections = [...this.#view.children] as HTMLElement[];
    this.#select = this.querySelector('.menu-pages-nav select');
    this.#select?.addEventListener('change', () => this.#open(Number(this.#select!.value)));
    this.querySelectorAll<HTMLButtonElement>('[data-page-step]').forEach((button) => button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const step = Number(button.dataset.pageStep);
      const next = this.#page + step;
      if (this.#pages[next]) {
        this.#page = next;
        this.#show();
      } else {
        this.#open(this.#section + step, step < 0);
      }
    }));
    this.#resize.observe(this.#view);
    this.#changes.observe(this.#view, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    this.refresh();
    void document.fonts.ready.then(() => { if (this.isConnected) this.refresh(); });
  }

  disconnectedCallback(): void {
    this.#resize.disconnect();
    this.#changes.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  refresh(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#layout());
  }

  /** Reveal a returning menu's launch button before restoring focus to it. */
  reveal(target: HTMLElement): void {
    const section = this.#sections.findIndex((el) => el.contains(target));
    if (section < 0) return;
    this.#section = section;
    this.#layout(target);
  }

  #open(section: number, last = false): void {
    this.#section = section;
    this.#page = 0;
    this.#layout(undefined, last);
  }

  #layout(target?: HTMLElement, last = false): void {
    if (!this.#view.clientHeight) return;
    const anchor = target ?? this.#pages[this.#page]?.[0];
    const nav = this.querySelector<HTMLElement>('.menu-pages-nav')!;
    const section = this.#sections[this.#section]!;
    const items = [...section.children].filter((item): item is HTMLElement => item instanceof HTMLElement && !item.hidden);
    const focused = document.activeElement as HTMLElement | null;

    nav.hidden = this.#sections.length === 1;
    this.#sections.forEach((el) => el.toggleAttribute('data-off-page', el !== section));
    items.forEach((item) => item.removeAttribute('data-off-page'));
    const fits = () => this.#view.scrollHeight <= this.#view.clientHeight + 1;
    if (items.length <= 1 || fits()) {
      this.#pages = [items];
    } else {
      nav.hidden = false;
      items.forEach((item) => item.setAttribute('data-off-page', ''));
      this.#pages = [];
      let current: HTMLElement[] = [];
      for (const item of items) {
        item.removeAttribute('data-off-page');
        if (current.length && !fits()) {
          this.#pages.push(current);
          current.forEach((el) => el.setAttribute('data-off-page', ''));
          current = [];
        }
        current.push(item);
      }
      this.#pages.push(current);
    }
    const match = (el?: HTMLElement | null) => this.#pages.findIndex((page) => el && page.some((item) => item.contains(el)));
    const focusedPage = match(focused);
    this.#page = last ? this.#pages.length - 1 : focusedPage >= 0 && !target ? focusedPage : Math.max(0, match(anchor));
    this.#show();
    if (focused && focused !== document.body && document.activeElement !== focused && this.contains(focused)) {
      focused.focus({ preventScroll: true });
    }
  }

  #show(): void {
    const items = this.#pages[this.#page]!;
    for (const child of this.#sections[this.#section]!.children) {
      (child as HTMLElement).toggleAttribute('data-off-page', !items.includes(child as HTMLElement));
    }
    if (this.#select) this.#select.value = String(this.#section);
    const count = this.querySelector<HTMLElement>('.menu-page-count')!;
    const label = `${this.#page + 1} / ${this.#pages.length}`;
    const sectionTitle = this.#select?.selectedOptions[0]?.textContent;
    if (count.textContent !== label || count.dataset.section !== (sectionTitle ?? '')) {
      count.textContent = label;
      count.dataset.section = sectionTitle ?? '';
      count.setAttribute('aria-label', `${sectionTitle ? sectionTitle + ', ' : ''}page ${this.#page + 1} of ${this.#pages.length}`);
    }
    this.querySelector('[data-page-step="-1"]')!.setAttribute('aria-disabled', String(this.#section === 0 && this.#page === 0));
    this.querySelector('[data-page-step="1"]')!.setAttribute('aria-disabled', String(this.#section === this.#sections.length - 1 && this.#page === this.#pages.length - 1));
    // At extreme zoom an individual card can be taller than the entire viewport.
    const needsScroll = this.#view.scrollHeight > this.#view.clientHeight + 1;
    if (needsScroll) this.#view.tabIndex = 0;
    else this.#view.removeAttribute('tabindex');
    this.#view.scrollTop = 0;
  }
}

customElements.define('menu-pages', MenuPages);
