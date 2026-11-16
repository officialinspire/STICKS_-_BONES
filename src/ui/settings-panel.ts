/** Settings form shared by the menu and the in-game pause sheet. */
import type { Settings } from '../app/settings';

export interface SettingsApi {
  get(): Settings;
  set(p: Partial<Settings>): void;
}

export function settingsPanelHtml(s: Settings): string {
  const radio = (name: string, value: string, label: string, checked: boolean) =>
    `<label class="check"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}> ${label}</label>`;
  return `<div class="settings-panel">
    <fieldset><legend>Cousin’s language</legend><div class="row">
      ${radio('set-language', 'explicit', 'Explicit (“Fuck that…”)', s.explicitLanguage)}
      ${radio('set-language', 'clean', 'Clean (“Forget that…”)', !s.explicitLanguage)}
    </div></fieldset>
    <fieldset><legend>Table talk</legend><div class="row">
      <label class="check"><input type="checkbox" name="set-banter" ${s.banter ? 'checked' : ''}> Cousin’s banter</label>
      <label class="check"><input type="checkbox" name="set-host-anim" ${s.hostAnimation ? 'checked' : ''}> Cousin’s slam animation</label>
    </div></fieldset>
    <fieldset><legend>Motion</legend><div class="row">
      ${radio('set-motion', 'system', 'Follow my device', s.motion === 'system')}
      ${radio('set-motion', 'reduce', 'Reduce', s.motion === 'reduce')}
      ${radio('set-motion', 'full', 'Full', s.motion === 'full')}
    </div></fieldset>
    <fieldset><legend>Computer speed</legend><div class="row">
      ${radio('set-ai-speed', 'relaxed', 'Relaxed', s.aiSpeed === 'relaxed')}
      ${radio('set-ai-speed', 'normal', 'Normal', s.aiSpeed === 'normal')}
      ${radio('set-ai-speed', 'quick', 'Quick', s.aiSpeed === 'quick')}
    </div><p class="note">Only how long the computer pauses before moving — never how it plays.</p></fieldset>
  </div>`;
}

export function bindSettingsPanel(root: HTMLElement, api: SettingsApi): void {
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    switch (t.name) {
      case 'set-language':
        api.set({ explicitLanguage: t.value === 'explicit' });
        break;
      case 'set-banter':
        api.set({ banter: t.checked });
        break;
      case 'set-host-anim':
        api.set({ hostAnimation: t.checked });
        break;
      case 'set-motion':
        api.set({ motion: t.value as Settings['motion'] });
        break;
      case 'set-ai-speed':
        api.set({ aiSpeed: t.value as Settings['aiSpeed'] });
        break;
    }
  });
}
