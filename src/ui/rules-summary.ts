/**
 * Plain-language rules summary generated from preset DATA (never hand-written
 * per mode), so what players read always matches what the engine enforces.
 */
import type { ModeRules, OpeningRule, PointsRule } from '../engine/rules/presets';
import { esc } from './svg';

const OPENING: Record<OpeningRule['kind'], string> = {
  'highest-double-else-heaviest': 'the highest double opens (no doubles: the heaviest tile), and it must be led',
  'double-six-holder': 'whoever holds 6|6 must lead it',
  'previous-winner': 'the previous hand’s winner opens with any tile',
  'rotate-from-previous-opener': 'the opening seat alternates, any tile',
  'seat-that-went-out': 'the player who went out opens with any tile',
  'lowest-member-of-winning-team': 'the lower-pip player on the winning team opens with any tile',
};

const POINTS: Record<PointsRule, string> = {
  'all-remaining-hand-pips': 'every pip left in every hand',
  'opponent-hand-pips': 'the opponent’s remaining pips',
  'opponent-minus-own-pips': 'the opponent’s pips minus their own',
};

export function rulesItems(r: ModeRules): string[] {
  const players = r.seatCount === 4 ? 'Four players in two teams — partners sit across from each other.' : 'Two players.';
  const stock =
    r.stock.kind === 'boneyard'
      ? `Seven tiles each; the other ${r.stock.size} form the boneyard.`
      : r.stock.kind === 'unused'
        ? `Seven tiles each; the other ${r.stock.size} are set aside and never used.`
        : 'Seven tiles each — all 28 are dealt.';
  const noMove =
    r.noMove.kind === 'draw-until-playable'
      ? 'Can’t play? Draw until you can (a playable drawn tile must be played). Pass only when the boneyard is empty.'
      : 'Can’t play? Knock to pass. If you can play, you must.';
  const blockWinner = r.scoring.blockWinner === 'lowest-team-pips' ? 'the team with fewer pips wins' : 'the lower pip count wins';
  return [
    players,
    stock,
    'Match a number on one of the two open ends. Doubles go crosswise; there are no spinners.',
    noMove,
    `First hand: ${OPENING[r.opening.firstHand.kind]}. Later: ${OPENING[r.opening.afterOut.kind]}.`,
    `Go out first to win the hand and score ${POINTS[r.scoring.out]}.`,
    `Blocked (tranque): ${blockWinner} and scores ${POINTS[r.scoring.blockWin]}. A tie scores nothing.`,
    `First to ${r.target.default} wins by default (${r.target.allowed.join(' or ')} available). No bonuses.`,
  ];
}

export function rulesHtml(r: ModeRules, headingLevel: 2 | 3 = 3): string {
  return `<section class="rules-card" aria-label="${esc(r.name)} rules"><h${headingLevel}>${esc(r.name)}</h${headingLevel}><ul>${rulesItems(r)
    .map((t) => `<li>${esc(t)}</li>`)
    .join('')}</ul></section>`;
}
