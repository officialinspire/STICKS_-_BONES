/**
 * Whose side the table's host figure is on, and the mood that follows from it.
 *
 * - `opponent` — Quick Play against the computer: the host is Cousin, an AI seat across the table. He smirks
 *   at his own plays, laughs when his side goes out and is surprised when the player does.
 * - `commentator` — two humans share the device: Cousin watches; he explains, and is delighted for the winner.
 * - `player` — Story: the figure is Roberto, the player's OWN character. His mood follows his side: delighted
 *   when his team wins or goes out, thoughtful when it loses (never laughing at Vale's domino), surprised by a
 *   blocked table.
 */
import type { Mood } from './host';

export type HostSide = 'opponent' | 'commentator' | 'player';
/** A hand's result from the host's side. */
export type HostOutcome = 'host-won' | 'host-lost' | 'tie';

/** The results sheet's figure. `over` = the match ended with this hand. */
export function resultMood(side: HostSide, outcome: HostOutcome, over: boolean): Mood {
  if (outcome === 'tie') return 'thinking';
  if (side === 'commentator') return over ? 'delighted' : 'explaining';
  if (side === 'player') return outcome === 'host-won' ? 'delighted' : 'thinking';
  return outcome === 'host-won' ? (over ? 'pumped' : 'laughing') : over ? 'delighted' : 'surprised';
}

/** A hand ends: someone went out (`hostSideOut` true/false), or the table blocked (null). */
export function endMood(side: HostSide, hostSideOut: boolean | null): Mood {
  if (hostSideOut === null) return 'surprised';
  if (side === 'player') return hostSideOut ? 'delighted' : 'surprised';
  if (side === 'commentator') return 'surprised';
  return hostSideOut ? 'laughing' : 'surprised';
}

/** A tile was played by the host himself, a partner of his, the human player, or someone else. */
export function playMood(side: HostSide, by: 'host' | 'partner' | 'human' | 'other'): Mood {
  if (side === 'player') return by === 'partner' ? 'smirk' : 'neutral';
  return by === 'human' ? 'neutral' : 'smirk';
}
