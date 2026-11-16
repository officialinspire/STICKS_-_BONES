import { describe, expect, it } from 'vitest';
import { Banter, LINES, OPENING_LINE, type BanterContext } from './banter';

function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}
const PROFANITY = /\b(fuck|shit|damn|hell|ass|bitch)\b/i;

describe('Cousin banter', () => {
  it('opening line follows the explicit-language setting exactly', () => {
    expect(new Banter({ explicitLanguage: true, enabled: true }).say('opening')).toBe('Fuck that, we playing DOMINOES!');
    expect(new Banter({ explicitLanguage: false, enabled: true }).say('opening')).toBe('Forget that, we playing DOMINOES!');
    expect(OPENING_LINE.clean).not.toMatch(PROFANITY);
  });

  it('clean mode never produces profanity, from any context', () => {
    const b = new Banter({ explicitLanguage: false, enabled: true, random: seq([0, 0.3, 0.6, 0.9, 0.1]) });
    for (let i = 0; i < 400; i++) for (const ctx of Object.keys(LINES) as BanterContext[]) expect(b.say(ctx) ?? '').not.toMatch(PROFANITY);
    for (const lines of Object.values(LINES)) for (const l of lines) expect(l.clean).not.toMatch(PROFANITY);
  });

  it('disabled banter says nothing at all', () => {
    const b = new Banter({ explicitLanguage: true, enabled: false });
    for (const ctx of Object.keys(LINES) as BanterContext[]) expect(b.say(ctx)).toBeNull();
  });

  it('suppresses repeats: no line twice within the memory window', () => {
    const b = new Banter({ explicitLanguage: false, enabled: true, random: seq([0.1, 0.2, 0.05, 0.3, 0.15]) });
    const said: string[] = [];
    for (let i = 0; i < 40; i++) {
      const t = b.say('cousin-play');
      if (t) said.push(t);
    }
    for (let i = 1; i < said.length; i++) expect(said.slice(Math.max(0, i - 4), i)).not.toContain(said[i]);
  });

  it('routine moves only sometimes get a line; big moments always do', () => {
    const quiet = new Banter({ explicitLanguage: false, enabled: true, random: () => 0.99 });
    expect(quiet.say('player-play')).toBeNull();
    expect(quiet.say('tranque')).not.toBeNull();
  });

  it('reconfiguring takes effect immediately', () => {
    const b = new Banter({ explicitLanguage: true, enabled: true });
    b.configure({ explicitLanguage: false });
    expect(b.say('opening')).toBe('Forget that, we playing DOMINOES!');
    b.configure({ enabled: false });
    expect(b.say('opening')).toBeNull();
  });
});
