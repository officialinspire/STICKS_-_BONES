/**
 * Short rules/help screen, written from docs/RULES.md (Cousin's House Rules v1)
 * and cross-checked against it and the presets by src/ui/help.test.ts.
 * Mode-specific detail comes from preset data (rules-summary.ts).
 */
import { DEFAULT_RULES_PRESET, MODE_IDS } from '../engine';
import { rulesHtml } from './rules-summary';
import { esc } from './svg';

export interface HelpSection {
  readonly id: string;
  readonly title: string;
  readonly points: readonly string[];
}

/** The bonuses this table does NOT use (RULES.md: "No capicú, chuchazo, forced-pass bonus, or forced redeal"). */
export const EXCLUDED_BONUSES = ['capicú', 'chuchazo', 'forced-pass bonus', 'forced redeal'] as const;

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: 'set',
    title: 'The tiles',
    points: [
      'A double-six set: all 28 tiles from 0|0 to 6|6. A blank counts as zero.',
      'Everyone gets seven tiles. Draw keeps 14 in a boneyard; Block sets 14 aside; Partnership deals all 28.',
    ],
  },
  {
    id: 'turn',
    title: 'Your turn',
    points: [
      'Match a number on one of the two open ends. Doubles go crosswise and are never spinners — there are always exactly two ends.',
      'If you can play, you must.',
    ],
  },
  {
    id: 'stuck',
    title: 'When you can’t play',
    points: [
      'Draw: draw one tile at a time until you get one that plays — then you must play it that turn. Pass only when the boneyard is empty.',
      'Block and Partnership: knock on the table to pass.',
    ],
  },
  {
    id: 'direction',
    title: 'Turn direction',
    points: ['Play goes counterclockwise: you (bottom) → right → top → left. Partners sit across from each other.'],
  },
  {
    id: 'opening',
    title: 'Who opens',
    points: [
      'Draw and Block, first hand: the highest double opens; if nobody has a double, the heaviest tile (ties go to the higher end). That tile must be led.',
      'Partnership, first hand: whoever holds 6|6 leads it.',
      'Later hands: Draw — the last winner, any tile. Block — the opening seat alternates. Partnership — whoever went out, or after a block the winning team’s lower-pip player.',
    ],
  },
  {
    id: 'scoring',
    title: 'Ending a hand and scoring',
    points: [
      'Go out first and your side scores the pips left in the other hands (Draw and Partnership count every hand still holding tiles).',
      'Blocked game (tranque): nobody can play. The lower pip count — or the team with fewer combined pips — wins.',
      'Blocked scoring: Draw and Partnership score every pip left (the winner’s own included); Block scores the opponent’s pips minus your own.',
      'A tied block scores nothing. Draw and Block play to 100, Partnership to 200 (either can be chosen).',
    ],
  },
  {
    id: 'bonuses',
    title: 'Not used at this table',
    points: [`No bonuses in v1: no ${EXCLUDED_BONUSES.slice(0, -1).join(', no ')}, and no ${EXCLUDED_BONUSES.at(-1)}.`],
  },
  {
    id: 'device',
    title: 'Playing here',
    points: [
      'Tap a glowing tile (✓), then tap the end where it should go. If it fits both ends, you choose.',
      'Keyboard: arrows move through your tiles, Enter picks, arrows choose an end, Enter places, Esc cancels.',
      'Two players on one device: pass it over when asked — each hand stays covered until its owner taps Reveal.',
    ],
  },
];

export function helpHtml(): string {
  const preset = DEFAULT_RULES_PRESET;
  const diagram = `<div class="turn-diagram" role="img" aria-label="Turn order: bottom, right, top, left — counterclockwise. Partners sit opposite.">
      <span class="seat s-top">Top<br><small>partner</small></span><span class="seat s-left">Left</span><span class="arrow" aria-hidden="true">↺</span><span class="seat s-right">Right</span><span class="seat s-bottom">You</span>
    </div>`;
  const sections = HELP_SECTIONS.map(
    (s) => `<section class="help-section" data-help="${s.id}"><h3>${esc(s.title)}</h3><ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>${s.id === 'direction' ? diagram : ''}</section>`,
  ).join('');
  return `<p class="note">${esc(preset.name)} v${preset.version}. ${esc(preset.disclaimer)}</p>
    <div class="help-grid">${sections}</div>
    <details class="pause-more"><summary>Each mode in detail</summary><div class="rules-grid">${MODE_IDS.map((m) => rulesHtml(preset.modes[m])).join('')}</div></details>`;
}
