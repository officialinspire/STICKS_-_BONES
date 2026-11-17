/**
 * Cinematic staging for NO REST FOR COUSIN — presentation only.
 *
 * Every cue is anchored to the EXACT opening text of a stage direction in the
 * approved script (`at`), so staging can never drift onto the wrong line;
 * `staging.test.ts` proves each anchor matches exactly one block of its scene.
 * Cues change light, the threshold glow, water, Cousin's expression and
 * audio hooks. They never change dialogue, rules or tiles, and nothing is
 * required to resolve a hand.
 *
 * Portraits: only Roberto has approved, labelled expression art. The other
 * characters are staged with name tags, light and text — never a guessed
 * expression from the unlabelled cast sheets, and never two unrelated
 * portraits pushed together.
 */
import type { RuntimeAssetId } from '../assets';
import type { StoryCue } from '../audio/manager';
import type { SceneId } from './progress';

export type Light = 'dream' | 'dawn' | 'morning' | 'midday' | 'resort' | 'resort-cold' | 'night' | 'jungle' | 'cave' | 'rest-area' | 'sunset' | 'sunset-cold' | 'dinner';
export type Mood = 'neutral' | 'smirk' | 'thinking' | 'explaining' | 'laughing' | 'surprised' | 'delighted' | 'pumped';

export type Cue =
  | { readonly kind: 'light'; readonly to: Light }
  | { readonly kind: 'backdrop'; readonly env: RuntimeAssetId | null; readonly light: Light; readonly focus?: string }
  | { readonly kind: 'threshold'; readonly to: 'on' | 'bright' | 'dim' | 'off' }
  | { readonly kind: 'water'; readonly to: 'crescent' | 'rise' | 'line' | 'recede' | 'still' | 'none' }
  | { readonly kind: 'boundary'; readonly show: boolean }
  | { readonly kind: 'cousin'; readonly to: 'in' | 'out' }
  | { readonly kind: 'expr'; readonly mood: Mood }
  | { readonly kind: 'pulse' } // a knock: brief, captioned glow on the threshold (no flash)
  | { readonly kind: 'warmth'; readonly on: boolean } // close, warm vignette for intimate beats
  | { readonly kind: 'audio'; readonly cue: StoryCue };

export interface SceneStaging {
  readonly env: RuntimeAssetId | null;
  readonly light: Light;
  /** CSS object-position style focal point for portrait/landscape crops. */
  readonly focus: string;
  /** Optional establishing move during the entrance (never perpetual). */
  readonly establishing: 'push' | 'pan-left' | 'pan-right' | 'none';
  /** Cousin on stage from the first beat (otherwise he enters on a cue). */
  readonly cousin: boolean;
  /** Backdrop while this scene's hand is played (Chapter 6: the modern rest area — never the ancient platform). */
  readonly handEnv?: RuntimeAssetId | null;
  readonly handNote?: string;
  readonly cues: readonly { readonly at: string; readonly cues: readonly Cue[] }[];
}

export const STAGING: Readonly<Record<SceneId, SceneStaging>> = {
  prologue: {
    env: 'env.cave-waterfall',
    light: 'dream',
    focus: '50% 40%',
    establishing: 'push',
    cousin: false,
    cues: [
      { at: '[Water. A narrow line of warm light', cues: [{ kind: 'threshold', to: 'on' }, { kind: 'pulse' }, { kind: 'audio', cue: 'knock-three' }] },
      { at: '[No voice answers. A fourth knock', cues: [{ kind: 'pulse' }, { kind: 'audio', cue: 'knock-beyond' }, { kind: 'threshold', to: 'bright' }] },
      { at: '[Cut to the neighborhood patio at dawn.', cues: [{ kind: 'threshold', to: 'off' }, { kind: 'backdrop', env: 'env.neighborhood-patio', light: 'dawn', focus: '50% 55%' }, { kind: 'cousin', to: 'in' }, { kind: 'expr', mood: 'thinking' }] },
      { at: '[A neighbor calls “Cousin!” outside.', cues: [{ kind: 'expr', mood: 'smirk' }] },
    ],
  },
  'chapter-1': {
    env: 'env.neighborhood-patio',
    light: 'morning',
    focus: '50% 55%',
    establishing: 'pan-right',
    cousin: true,
    cues: [
      { at: '[She almost smiles. He sees that it takes effort and stops performing.]', cues: [{ kind: 'expr', mood: 'neutral' }, { kind: 'warmth', on: true }] },
      { at: '[She sits. Roberto places water in front of her and waits.]', cues: [{ kind: 'expr', mood: 'neutral' }] },
      { at: '[His grin softens.]', cues: [{ kind: 'expr', mood: 'neutral' }, { kind: 'warmth', on: true }] },
      { at: "[After she leaves, Rafa looks at the napkin and the notebook's waterfall sketch.]", cues: [{ kind: 'warmth', on: false }, { kind: 'expr', mood: 'thinking' }] },
    ],
  },
  'chapter-2': {
    env: 'env.back-alley',
    light: 'midday',
    focus: '45% 50%',
    establishing: 'pan-left',
    cousin: true,
    cues: [
      { at: '[Her phone rings. VALE on screen.', cues: [{ kind: 'light', to: 'resort-cold' }, { kind: 'expr', mood: 'neutral' }] },
      { at: '[Roberto stills. Marisol signals that she will handle it.]', cues: [{ kind: 'expr', mood: 'thinking' }] },
      { at: '[He ends the call. The alley sounds return.', cues: [{ kind: 'light', to: 'midday' }] },
    ],
  },
  'chapter-3': {
    env: 'env.resort-patio',
    light: 'resort',
    focus: '50% 50%',
    establishing: 'push',
    cousin: true,
    cues: [
      { at: '[He dismisses them without looking at the tray. His smile arrives the instant he turns toward Marisol.]', cues: [{ kind: 'light', to: 'resort' }] },
      { at: "[His handshake is deliberate. Roberto gives him no physical contest.]", cues: [{ kind: 'expr', mood: 'neutral' }] },
      // Vale's menace is carried by the light alone (no portrait beside a line about him).
      { at: '[His smile is gone.]', cues: [{ kind: 'light', to: 'resort-cold' }] },
      { at: "[Outside the patio, she notices Roberto's silence.]", cues: [{ kind: 'light', to: 'resort' }, { kind: 'warmth', on: true }] },
    ],
  },
  'chapter-4': {
    env: 'env.moonlit-promenade',
    light: 'night',
    focus: '50% 60%',
    establishing: 'pan-left',
    cousin: true,
    cues: [
      { at: "[Roberto's hand stops halfway to his cup. Marisol notices.]", cues: [{ kind: 'expr', mood: 'thinking' }] },
      { at: '[Let the surf hold the silence.', cues: [{ kind: 'audio', cue: 'surf' }, { kind: 'warmth', on: true }] },
      { at: '[He looks out over the water.]', cues: [{ kind: 'expr', mood: 'neutral' }] },
      { at: '[They share a quiet smile. Under the bench, a thin crescent of water', cues: [{ kind: 'water', to: 'crescent' }, { kind: 'audio', cue: 'water' }] },
      { at: '[Three light taps beneath the bench.', cues: [{ kind: 'pulse' }, { kind: 'audio', cue: 'knock-motif-soft' }, { kind: 'expr', mood: 'surprised' }] },
    ],
  },
  'chapter-5': {
    env: 'env.jungle-camp',
    light: 'jungle',
    focus: '50% 45%',
    establishing: 'push',
    cousin: true,
    cues: [
      { at: '[Luz compares the dream sketch', cues: [{ kind: 'expr', mood: 'thinking' }] },
      { at: '[She studies the sketch again, disturbed rather than delighted.]', cues: [{ kind: 'light', to: 'jungle' }] },
      { at: '[Common continuation. A voice from the empty trail says Roberto, quietly.', cues: [{ kind: 'audio', cue: 'whisper' }, { kind: 'expr', mood: 'surprised' }, { kind: 'water', to: 'none' }] },
      { at: '[A small line of water gathers on a root and travels upward', cues: [{ kind: 'water', to: 'rise' }, { kind: 'threshold', to: 'on' }, { kind: 'audio', cue: 'water' }] },
    ],
  },
  'chapter-6': {
    env: 'env.cave-waterfall',
    light: 'cave',
    focus: '50% 40%',
    establishing: 'push',
    cousin: true,
    // The hand is played at the modern rest area near the entrance — never on the ancient platform.
    handEnv: null,
    handNote: 'Modern inspection rest area near the entrance. The ancient platform stays untouched.',
    cues: [
      // The contractor speaker's voice and repeating cough: CAPTION ONLY (no recording supplied; never impersonated).
      { at: '[A cough. The identical cough repeats', cues: [{ kind: 'audio', cue: 'speaker' }] },
      { at: '[The group documents the equipment.', cues: [{ kind: 'audio', cue: 'water' }] },
      { at: '[Roberto turns toward the waterfall. The warm line of reflected light', cues: [{ kind: 'threshold', to: 'on' }, { kind: 'expr', mood: 'neutral' }] },
      { at: '[He nods. Three knocks. A fourth answers from beyond the platform.', cues: [{ kind: 'pulse' }, { kind: 'audio', cue: 'knock-motif' }] },
      { at: '[Water lifts in a thin curve along the stone', cues: [{ kind: 'water', to: 'rise' }, { kind: 'audio', cue: 'water' }] },
      { at: '[The reflection brightens as if a door has opened farther.', cues: [{ kind: 'threshold', to: 'bright' }, { kind: 'boundary', show: true }] },
      { at: '[Roberto kneels on the modern walkway, staying behind the agreed boundary.]', cues: [{ kind: 'boundary', show: true }, { kind: 'expr', mood: 'thinking' }] },
      { at: '[The lifted water lowers.', cues: [{ kind: 'water', to: 'recede' }, { kind: 'threshold', to: 'dim' }, { kind: 'pulse' }, { kind: 'boundary', show: false }, { kind: 'audio', cue: 'knock-one' }] },
      { at: '[Cut to the entrance rest area.', cues: [{ kind: 'threshold', to: 'off' }, { kind: 'water', to: 'none' }, { kind: 'backdrop', env: null, light: 'rest-area' }, { kind: 'warmth', on: true }] },
      { at: '[She takes his hand. He lets her.]', cues: [{ kind: 'expr', mood: 'neutral' }] },
    ],
  },
  'chapter-7': {
    env: 'env.executive-terrace',
    light: 'sunset',
    focus: '50% 50%',
    establishing: 'pan-right',
    cousin: true,
    cues: [
      { at: '[Vale checks his phone. The stop notice has arrived. His jaw tightens.]', cues: [{ kind: 'light', to: 'sunset-cold' }] },
      { at: '[Vale takes a breath, recovering the public smile as a guest approaches.]', cues: [{ kind: 'light', to: 'sunset' }] },
      { at: '[Marisol sits again. The effort of staying composed catches up with her.', cues: [{ kind: 'warmth', on: true }, { kind: 'expr', mood: 'neutral' }] },
      { at: "[Luz's message arrives: work stopped", cues: [{ kind: 'expr', mood: 'delighted' }] },
    ],
  },
  epilogue: {
    env: 'env.neighborhood-patio',
    light: 'dinner',
    focus: '50% 55%',
    establishing: 'none',
    cousin: true,
    cues: [
      { at: '[A simple dinner has been interrupted by neither a laptop nor a case folder.', cues: [{ kind: 'audio', cue: 'dinner' }, { kind: 'expr', mood: 'smirk' }] },
      // A mutual moment: warmth and the caption only — never one portrait standing in for two people.
      { at: '[She touches his jaw, giving him a moment to meet her halfway. They kiss.', cues: [{ kind: 'warmth', on: true }] },
      { at: '[A knock at the gate.', cues: [{ kind: 'pulse' }, { kind: 'audio', cue: 'knock-one' }, { kind: 'expr', mood: 'laughing' }] },
      { at: '[No one stands outside. A shallow line of water lies beneath the gate.', cues: [{ kind: 'water', to: 'line' }, { kind: 'pulse' }, { kind: 'audio', cue: 'knock-motif-soft' }, { kind: 'expr', mood: 'thinking' }] },
      { at: '[He looks toward the doorway. The light stays on.]', cues: [{ kind: 'threshold', to: 'on' }] },
      { at: '[A beat. His familiar grin returns, with less armor behind it.]', cues: [{ kind: 'expr', mood: 'smirk' }] },
      { at: '[The water goes still.', cues: [{ kind: 'water', to: 'still' }, { kind: 'audio', cue: 'ambience-off' }] },
    ],
  },
};

/** Cues for one block: those whose anchor the block's exact text starts with. */
export function cuesFor(sceneId: SceneId, raw: string): readonly Cue[] {
  return STAGING[sceneId].cues.filter((c) => raw.startsWith(c.at)).flatMap((c) => c.cues);
}
