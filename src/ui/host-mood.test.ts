import { describe, expect, it } from 'vitest';
import { endMood, playMood, resultMood } from './host-mood';

describe('host mood follows the host’s side', () => {
  it('Quick Play (Cousin across the table): unchanged — he laughs when his side wins or goes out', () => {
    expect(resultMood('opponent', 'host-won', false)).toBe('laughing');
    expect(resultMood('opponent', 'host-won', true)).toBe('pumped');
    expect(resultMood('opponent', 'host-lost', false)).toBe('surprised');
    expect(resultMood('opponent', 'host-lost', true)).toBe('delighted');
    expect(endMood('opponent', true)).toBe('laughing');
    expect(endMood('opponent', false)).toBe('surprised');
    expect(playMood('opponent', 'host')).toBe('smirk');
    expect(playMood('opponent', 'human')).toBe('neutral');
  });
  it('Story (Roberto is the player): never laughs at the other side’s domino; delighted for his own', () => {
    expect(resultMood('player', 'host-lost', false)).toBe('thinking');
    expect(resultMood('player', 'host-won', false)).toBe('delighted');
    expect(endMood('player', false)).toBe('surprised');
    expect(endMood('player', true)).toBe('delighted');
    expect(playMood('player', 'other')).toBe('neutral'); // Vale or Rafa played: no smirk at them
    expect(playMood('player', 'partner')).toBe('smirk'); // Marisol's play
    for (const o of ['host-won', 'host-lost', 'tie'] as const) expect(['laughing', 'pumped']).not.toContain(resultMood('player', o, true));
  });
  it('two humans: the commentator explains; a blocked table surprises everyone', () => {
    expect(resultMood('commentator', 'host-won', false)).toBe('explaining');
    expect(resultMood('commentator', 'tie', false)).toBe('thinking');
    expect(endMood('commentator', null)).toBe('surprised');
  });
});
