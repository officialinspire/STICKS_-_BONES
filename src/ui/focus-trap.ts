/**
 * Keep Tab inside a modal surface (dialog sheet or privacy cover). Native
 * modal <dialog> already makes the page inert, but its Tab order can leave
 * the document for the browser's own UI; this wraps first ↔ last instead, so
 * keyboard and switch users always land on a control of the open surface.
 */
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function focusables(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) =>
    typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : el.offsetParent !== null,
  );
}

/** Call from a keydown handler; returns true if it moved focus. */
export function wrapTab(ev: KeyboardEvent, container: Element | null): boolean {
  if (ev.key !== 'Tab' || !container) return false;
  const items = focusables(container);
  if (!items.length) return false;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  const outside = !active || !container.contains(active);
  if (ev.shiftKey && (outside || active === first)) {
    ev.preventDefault();
    last.focus();
    return true;
  }
  if (!ev.shiftKey && (outside || active === last)) {
    ev.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
