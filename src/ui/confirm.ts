/**
 * One confirmation sheet for every destructive menu action (discard a saved game, reset statistics,
 * erase local data, start the Story over). It's the same ivory sheet as the table's confirm.
 * - Focus starts on the safe choice.
 * - Escape or the safe button cancels.
 * - Focus returns to the control that opened the sheet.
 * Nothing is deleted unless the player picks the destructive button.
 */
import { wrapTab } from './focus-trap';
import { esc } from './svg';

export interface ConfirmText {
  title: string;
  body: string;
  /** Destructive button label (shown with the ⚠ mark). */
  yes: string;
  /** Safe button label. */
  no?: string;
}

export function confirmSheet(host: HTMLElement, t: ConfirmText): Promise<boolean> {
  const opener = document.activeElement as HTMLElement | null;
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet confirm';
  dlg.setAttribute('aria-labelledby', 'menu-confirm-title');
  dlg.setAttribute('aria-describedby', 'menu-confirm-body');
  dlg.innerHTML = `<h2 id="menu-confirm-title">${esc(t.title)}</h2><p id="menu-confirm-body">${esc(t.body)}</p><div class="sheet-actions"><button type="button" class="btn-ghost" data-act="confirm-no">${esc(t.no ?? 'Cancel')}</button><button type="button" class="btn danger" data-act="confirm-yes">${esc(t.yes)}</button></div>`;
  host.append(dlg);
  return new Promise((resolve) => {
    let done = false;
    const finish = (yes: boolean) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      if (!yes && opener?.isConnected) opener.focus();
      resolve(yes);
    };
    dlg.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'confirm-yes') finish(true);
      else if (act === 'confirm-no') finish(false);
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    dlg.addEventListener('keydown', (e) => wrapTab(e, dlg));
    dlg.showModal();
    dlg.querySelector<HTMLElement>('[data-act="confirm-no"]')!.focus();
  });
}
