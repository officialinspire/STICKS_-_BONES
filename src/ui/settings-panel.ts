/** Settings form shared by the menu and the in-game pause sheet. */
import type { AudioSettings, Settings } from '../app/settings';
import { hapticsSupported } from '../audio/haptics';

export interface SettingsApi {
  get(): Settings;
  set(p: Partial<Settings>): void;
}

export function settingsPanelHtml(s: Settings): string {
  const radio = (name: string, value: string, label: string, checked: boolean) =>
    `<label class="check"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}> ${label}</label>`;
  const a = s.audio;
  const slider = (key: keyof AudioSettings, label: string, note = '') =>
    `<label class="field slider"><span>${label}${note ? ` <small>${note}</small>` : ''}</span><input type="range" min="0" max="100" step="5" name="set-vol-${key}" value="${Math.round((a[key] as number) * 100)}" aria-valuetext="${Math.round((a[key] as number) * 100)} percent"></label>`;
  return `<div class="settings-panel">
    <fieldset><legend>Sound</legend>
      <label class="check"><input type="checkbox" name="set-mute" ${a.muted ? 'checked' : ''}> Mute all sound</label>
      ${slider('master', 'Master')}
      ${slider('music', 'Music')}
      ${slider('sfx', 'Sound effects', '(placeholder sounds)')}
      ${slider('voice', 'Voice', '(no recorded voice yet — subtitles only)')}
      ${slider('ambience', 'Ambience')}
      <label class="check"><input type="checkbox" name="set-ambience" ${a.ambienceOn ? 'checked' : ''}> Scene ambience <small>(patio, surf, jungle, cave)</small></label>
      ${hapticsSupported() ? `<label class="check"><input type="checkbox" name="set-haptics" ${s.haptics ? 'checked' : ''}> Vibration (haptics)</label>` : '<p class="note">Vibration isn’t available on this device.</p>'}
    </fieldset>
    <fieldset><legend>Cousin’s language</legend><div class="row">
      ${radio('set-language', 'explicit', 'Explicit (“Fuck that…”)', s.explicitLanguage)}
      ${radio('set-language', 'clean', 'Clean (“Forget that…”)', !s.explicitLanguage)}
    </div></fieldset>
    <fieldset><legend>Table talk</legend><div class="row">
      <label class="check"><input type="checkbox" name="set-banter" ${s.banter ? 'checked' : ''}> Cousin’s banter</label>
      <label class="check"><input type="checkbox" name="set-host-anim" ${s.hostAnimation ? 'checked' : ''}> Cousin’s slam animation</label>
    </div></fieldset>
    <fieldset><legend>Story text</legend><div class="row">
      ${radio('set-story-text', '1', 'Standard', s.storyTextScale === 1)}
      ${radio('set-story-text', '1.15', 'Large', s.storyTextScale === 1.15)}
      ${radio('set-story-text', '1.3', 'Larger', s.storyTextScale === 1.3)}
    </div>
      <label class="check"><input type="checkbox" name="set-instant-text" ${s.instantText ? 'checked' : ''}> Show each line at once <small>(no gradual reveal)</small></label>
    </fieldset>
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
  // Sliders update live while dragging.
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.name.startsWith('set-vol-')) return;
    const key = t.name.slice('set-vol-'.length) as keyof AudioSettings;
    const v = Math.max(0, Math.min(1, Number(t.value) / 100));
    t.setAttribute('aria-valuetext', `${Math.round(v * 100)} percent`);
    api.set({ audio: { ...api.get().audio, [key]: v } });
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    switch (t.name) {
      case 'set-mute':
        api.set({ audio: { ...api.get().audio, muted: t.checked } });
        break;
      case 'set-ambience':
        api.set({ audio: { ...api.get().audio, ambienceOn: t.checked } });
        break;
      case 'set-haptics':
        api.set({ haptics: t.checked });
        break;
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
      case 'set-story-text':
        api.set({ storyTextScale: Number(t.value) as Settings['storyTextScale'] });
        break;
      case 'set-instant-text':
        api.set({ instantText: t.checked });
        break;
    }
  });
}
