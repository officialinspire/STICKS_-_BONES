import type { Page } from 'playwright';

/** Reach a control using the same section selector and page buttons a player uses. */
export async function showMenuItem(page: Page, selector: string): Promise<void> {
  const item = page.locator(selector).first();
  await item.waitFor({ state: 'attached' });
  if (await item.isVisible()) return;
  const pager = item.locator('xpath=ancestor::menu-pages[1]');
  const direction = () => item.evaluate((el: Element) => {
    const group = el.closest('.menu-page-items')!;
    const shown = [...group.children].find((child) => !child.hasAttribute('hidden') && !child.hasAttribute('data-off-page'));
    return shown && (el.compareDocumentPosition(shown) & Node.DOCUMENT_POSITION_FOLLOWING) ? '-1' : '1';
  });
  const select = pager.locator('.menu-pages-nav select');
  if (await select.count()) {
    const section = await item.evaluate((el: Element) => {
      const group = el.closest('.menu-page-items')!;
      return [...group.parentElement!.children].indexOf(group);
    });
    await select.selectOption(String(section));
  }
  for (let i = 0; i < 100 && !(await item.isVisible()); i++) {
    const next = pager.locator(`[data-page-step="${await direction()}"]`);
    if (await next.getAttribute('aria-disabled') === 'true') break;
    await next.click();
  }
  if (!(await item.isVisible())) throw new Error(`Menu control not reachable: ${selector}`);
}
