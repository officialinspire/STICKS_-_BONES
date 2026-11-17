import { describe, expect, it } from 'vitest';
import { Analytics, sanitizeEvent, sanitizeMessage, winnerLabel, type AnalyticsEvent, type AnalyticsTransport, type MatchInfo } from './analytics';
import { ANALYTICS_CONFIG } from './analytics-config';

const M: MatchInfo = { matchId: 'm1', mode: 'draw2', opponent: 'ai', difficulty: 'normal', humansPartnered: null };
function make(consent = true, enabled = true) {
  const sent: unknown[] = [];
  const recorded: AnalyticsEvent[] = [];
  const transport: AnalyticsTransport = { send: (e) => void sent.push(e) };
  const a = new Analytics({ enabled, transport, consent: () => consent });
  a.record((e) => recorded.push(e));
  return { a, sent, recorded };
}

describe('analytics adapter', () => {
  it('ships disabled: no transport, no consent, nothing sent', () => {
    expect(ANALYTICS_CONFIG.enabled).toBe(false);
    expect(ANALYTICS_CONFIG.transport).toBeNull();
    expect(ANALYTICS_CONFIG.consent()).toBe(false);
    const a = new Analytics(ANALYTICS_CONFIG);
    expect(a.active).toBe(false);
    expect(() => a.launch('browser', 'local')).not.toThrow();
  });

  it('sends only with consent', () => {
    const no = make(false);
    no.a.launch('browser', 'b1');
    expect(no.sent).toHaveLength(0);
    expect(no.recorded).toHaveLength(1); // the dev recorder still sees the sanitised event
    const yes = make(true);
    yes.a.launch('standalone', 'b1');
    expect(yes.sent).toEqual([{ name: 'game_launch', display: 'standalone', build: 'b1', app: 'sticks-and-bones' }]);
  });

  it('labels fresh vs resume and never double-counts starts', () => {
    const { a, recorded } = make();
    a.launch('browser', 'x');
    a.launch('browser', 'x'); // re-render / second call
    a.matchActivity(M, 'fresh', false);
    a.matchActivity(M, 'fresh', false); // every later move
    a.resume({ ...M, matchId: 'm2' }, 3);
    a.resume({ ...M, matchId: 'm2' }, 3); // double tap
    a.matchActivity({ ...M, matchId: 'm2' }, 'fresh', true); // restored game playing on: not a start
    a.matchActivity({ ...M, matchId: 'm3' }, 'rematch', false);
    const names = recorded.map((e) => (e.name === 'match_start' ? `start:${e.start_kind}` : e.name));
    expect(names).toEqual(['game_launch', 'start:fresh', 'match_resume', 'start:rematch']);
  });

  it('round and match ends are counted once per hand / match', () => {
    const { a, recorded } = make();
    for (let i = 0; i < 2; i++) {
      a.roundEnd(M, { handNumber: 1, ending: 'domino', winner: 'player', points: 17 });
      a.matchEnd(M, 5, 'computer');
    }
    expect(recorded.map((e) => e.name)).toEqual(['round_end', 'match_end']);
  });

  it('payloads are rebuilt from the allowlist: secrets and unknown fields cannot pass', () => {
    const leaky = { name: 'match_start', start_kind: 'fresh', mode: 'draw2', opponent: 'ai', difficulty: 'hard', humans_partnered: null, seed: 'abc', hand: ['t64'], names: ['Ana'], save: '{...}' };
    expect(sanitizeEvent(leaky)).toEqual({ name: 'match_start', start_kind: 'fresh', mode: 'draw2', opponent: 'ai', difficulty: 'hard', humans_partnered: null });
    expect(sanitizeEvent({ name: 'match_start', start_kind: 'fresh', mode: 'Ana’s game', opponent: 'ai', difficulty: null, humans_partnered: null })).toBeNull();
    expect(sanitizeEvent({ name: 'move', tile: 't64' })).toBeNull();
    expect(sanitizeEvent({ name: 'round_end', mode: 'draw2', opponent: 'ai', difficulty: null, hand_number: 1, ending: 'domino', winner: 'player', points: -3 })).toBeNull();
  });

  it('error messages lose tiles, numbers, names, urls and paths', () => {
    const m = sanitizeMessage('Bad move t64 (6|4) by "Ana" seed 123456 at https://x.io/a?seed=9 /home/user/app/src/main.ts ana@example.com');
    expect(m).not.toMatch(/t64|6\|4|Ana|123456|seed=9|home\/user|example\.com/);
    expect(sanitizeMessage('x'.repeat(500)).length).toBeLessThanOrEqual(120);
    const { a, recorded } = make();
    for (let i = 0; i < 5; i++) a.error('error', 'table', new Error('Boom 42'));
    expect(recorded).toHaveLength(3); // capped per distinct message
    expect(recorded[0]).toEqual({ name: 'app_error', kind: 'error', area: 'table', message: 'Boom <n>' });
  });

  it('winner labels carry no names', () => {
    expect(winnerLabel(0, 'ai', 0)).toBe('player');
    expect(winnerLabel(1, 'ai', 0)).toBe('computer');
    expect(winnerLabel(1, 'local', 0)).toBe('team_2');
    expect(winnerLabel(null, 'local', 0)).toBe('tie');
  });

  it('a throwing transport or consent hook never breaks the game', () => {
    const a = new Analytics({ enabled: true, transport: { send: () => { throw new Error('net'); } }, consent: () => { throw new Error('cmp'); } });
    expect(() => a.launch('browser', 'x')).not.toThrow();
    const b = new Analytics({ enabled: true, transport: { send: () => { throw new Error('net'); } }, consent: () => true });
    expect(() => b.matchEnd(M, 1, 'tie')).not.toThrow();
  });
});

describe('Story analytics (separate from Quick Play)', () => {
  const make = () => {
    const sent: Record<string, unknown>[] = [];
    const a = new Analytics({ enabled: true, transport: { send: (e) => void sent.push(e) }, consent: () => true });
    return { a, sent };
  };
  it('only fixed enums leave: unknown scenes, extra fields, names and hands are rejected or dropped', () => {
    expect(sanitizeEvent({ name: 'story_encounter_start', scene: 'chapter-3', mode: 'partnership4', replay: false, hand: ['t66'], names: ['Ana'] })).toEqual({ name: 'story_encounter_start', scene: 'chapter-3', mode: 'partnership4', replay: false });
    expect(sanitizeEvent({ name: 'story_encounter_start', scene: 'chapter-99', mode: 'draw2', replay: false })).toBeNull();
    expect(sanitizeEvent({ name: 'story_resume', scene: 'chapter-1', part: 'dialogue', via: 'continue', progress: '{"raw":"save"}' })).toEqual({ name: 'story_resume', scene: 'chapter-1', part: 'dialogue', via: 'continue' });
    expect(sanitizeEvent({ name: 'story_case_complete', seed: 'abc' })).toEqual({ name: 'story_case_complete' });
  });
  it('de-duplicates: one encounter per dealt hand, one completion per case + chapter, one case completion, one resume per position', () => {
    const { a, sent } = make();
    a.storyEncounter('chapter-1', 'draw2', false, 'tok1');
    a.storyEncounter('chapter-1', 'draw2', false, 'tok1');
    a.storyEncounter('chapter-1', 'draw2', false, 'tok2'); // a new deal of the same chapter (Continue after leaving)
    a.storyChapterComplete('chapter-1', 'win', false, 'case:1');
    a.storyChapterComplete('chapter-1', 'win', false, 'case:1');
    a.storyChapterComplete('chapter-1', 'loss', true, 'replay:x'); // a replay is reported as one
    a.storyCaseComplete('case:1');
    a.storyCaseComplete('case:1');
    a.storyResume('chapter-2', 'hand', 'update', 'k');
    a.storyResume('chapter-2', 'hand', 'update', 'k');
    a.storyAssist('chapter-2', 'skip_scene', 's');
    expect(sent.map((e) => e.name)).toEqual(['story_encounter_start', 'story_encounter_start', 'story_chapter_complete', 'story_chapter_complete', 'story_case_complete', 'story_resume', 'story_assist']);
    expect(sent.every((e) => e.app === 'sticks-and-bones')).toBe(true);
    expect(sent.some((e) => String(e.name).startsWith('match_'))).toBe(false);
  });
  it('nothing is sent without consent or while disabled (the default)', () => {
    const sent: unknown[] = [];
    new Analytics({ enabled: true, transport: { send: (e) => void sent.push(e) }, consent: () => false }).storyCaseComplete('c');
    new Analytics({ enabled: false, transport: { send: (e) => void sent.push(e) }, consent: () => true }).storyCaseComplete('c');
    expect(sent).toEqual([]);
  });
});
