/**
 * Whole-state invariant checks. Used after every command in simulations and on
 * restore. Returns human-readable problems (empty = consistent).
 */
import { validateMatchConfig } from './config';
import { checkLine } from './line';
import { isRngState } from './rng';
import type { ModeRules } from './rules/presets';
import { ENGINE_ID, MATCH_STATE_SCHEMA_VERSION, type MatchState } from './state';
import { CANONICAL_TILE_IDS, parseTileId } from './tiles';

export function checkInvariants(state: MatchState): string[] {
  const p: string[] = [];
  if (state.schemaVersion !== MATCH_STATE_SCHEMA_VERSION) p.push('schemaVersion');
  if (state.engine !== ENGINE_ID) p.push('engine id');
  const v = validateMatchConfig(state.config);
  if (!v.ok) return [...p, ...v.errors.map((e) => `config ${e.path}: ${e.message}`)];
  const rules: ModeRules = v.rules;
  if (!isRngState(state.rng)) p.push('rng state');
  if (!Number.isInteger(state.seq) || state.seq < 0) p.push('seq');

  const h = state.hand;
  // Conservation: every canonical tile in exactly one zone.
  const zones = [...h.hands.flat(), ...h.stock, ...h.line.tiles.map((t) => t.tile)];
  if (zones.some((id) => !parseTileId(id))) p.push('non-canonical tile id in a zone');
  if (zones.length !== CANONICAL_TILE_IDS.length || new Set(zones).size !== zones.length)
    p.push(`tile conservation: ${zones.length} placements, ${new Set(zones).size} unique`);
  if (h.hands.length !== rules.seatCount) p.push('hand count');
  if (h.stockKind !== rules.stock.kind) p.push('stock kind');
  if (h.stockKind === 'unused' && h.stock.length !== rules.stock.size) p.push('unused stock changed size');
  if (h.stockKind === 'none' && h.stock.length !== 0) p.push('stock should be empty');
  if (h.stockKind !== 'boneyard') {
    // Without drawing, hands only shrink: nobody can hold more than they were dealt.
    if (h.hands.some((x) => x.length > rules.tilesPerSeat)) p.push('a hand exceeds the dealt size in a no-draw mode');
    const inPlay = h.hands.reduce((n, x) => n + x.length, 0) + h.line.tiles.length;
    if (inPlay !== rules.seatCount * rules.tilesPerSeat) p.push('hands + line differ from the dealt tile count');
  }
  p.push(...checkLine(h.line));

  for (const s of [h.turn, h.opener]) if (!Number.isInteger(s) || s < 0 || s >= rules.seatCount) p.push('seat out of range');
  if (h.line.tiles.length === 0) {
    if (h.requirement.kind === 'tile' && state.phase === 'playing' && !h.hands[h.opener]!.includes(h.requirement.tile))
      p.push('opener does not hold the required opening tile');
    if (state.phase === 'playing' && h.turn !== h.opener) p.push('empty line but turn is not the opener');
  } else {
    const first = [...h.line.tiles].sort((a, b) => a.playIndex - b.playIndex)[0]!;
    if (first.seat !== h.opener) p.push('first tile not played by the opener');
    if (h.requirement.kind === 'tile' && first.tile !== h.requirement.tile) p.push('opening tile differs from requirement');
  }

  switch (state.phase) {
    case 'playing':
      if (h.end || h.result) p.push('playing with an end/result');
      if (h.consecutivePasses < 0 || h.consecutivePasses >= rules.seatCount) p.push('pass counter out of range');
      if (h.hands.some((x) => x.length === 0)) p.push('a seat is out but the hand is still playing');
      if (h.stockKind === 'boneyard' && h.stock.length > 0 && h.consecutivePasses > 0) p.push('passed while boneyard not empty');
      break;
    case 'hand-ended':
      if (!h.end || h.result) p.push('hand-ended needs an end and no result');
      break;
    case 'hand-resolved':
    case 'match-over':
      if (!h.end || !h.result) p.push(`${state.phase} needs an end and a result`);
      break;
    default:
      p.push(`unknown phase ${String(state.phase)}`);
  }
  if (h.end?.kind === 'out' && h.hands[h.end.seat]!.length !== 0) p.push('out seat still holds tiles');
  if (h.end?.kind === 'blocked' && h.consecutivePasses !== rules.seatCount) p.push('blocked without a full round of passes');

  // Public log agrees with the line and the pass counter, and never names a drawn tile.
  if (!Array.isArray(h.log)) p.push('public log missing');
  else {
    const plays = h.log.filter((a) => a.kind === 'play');
    const byIndex = [...h.line.tiles].sort((a, b) => a.playIndex - b.playIndex);
    if (plays.length !== byIndex.length || plays.some((a, i) => a.kind === 'play' && (a.tile !== byIndex[i]!.tile || a.seat !== byIndex[i]!.seat)))
      p.push('public log plays differ from the line');
    let trailing = 0;
    for (let i = h.log.length - 1; i >= 0 && h.log[i]!.kind !== 'play'; i--) if (h.log[i]!.kind === 'pass') trailing++;
    if (trailing !== h.consecutivePasses) p.push('public log passes differ from the pass counter');
    if (h.log.some((a) => a.kind === 'draw' && 'tile' in a)) p.push('public log names a drawn tile');
    if (h.stockKind !== 'boneyard' && h.log.some((a) => a.kind === 'draw')) p.push('draw logged in a no-draw mode');
  }

  // Scores.
  if (state.scores.length !== rules.teams.length || state.scores.some((s) => !Number.isInteger(s) || s < 0)) p.push('scores');
  const last = state.history[state.history.length - 1];
  if (last && last.scoresAfter.some((s, i) => s !== state.scores[i])) p.push('scores differ from last hand result');
  state.history.forEach((r, i) => {
    const before = i === 0 ? null : state.history[i - 1]!.scoresAfter;
    if (before && r.scoresAfter.some((s, t) => s !== before[t]! + (t === r.winnerTeam ? r.points : 0)))
      p.push(`history[${i}] scoresAfter inconsistent`);
    if (r.handNumber !== state.history[0]!.handNumber + i) p.push(`history[${i}] hand number`);
    if (r.winnerTeam === null && r.points !== 0) p.push(`history[${i}] tie scored points`);
  });
  if (state.phase === 'hand-resolved' && h.result !== last) {
    if (!last || last.handNumber !== h.number) p.push('current result missing from history');
  }
  const leader = state.scores.findIndex((s) => s >= state.config.targetScore);
  if (state.phase === 'match-over') {
    if (state.winnerTeam === null || state.scores[state.winnerTeam]! < state.config.targetScore) p.push('match-over without a winner at target');
  } else {
    if (state.winnerTeam !== null) p.push('winner set before match-over');
    if (leader >= 0 && state.history.length > 0) p.push('a side reached the target but the match continues');
  }
  return p;
}
