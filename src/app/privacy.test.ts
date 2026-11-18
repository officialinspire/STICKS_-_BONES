import { describe, expect, it } from 'vitest';
import { revealedSeat, transition, type ControllerState, type Facts } from './privacy';

const f = (turn: number, turnIsHuman: boolean, phase: Facts['phase'] = 'playing', privacy = true): Facts => ({ phase, turn: turn as 0, turnIsHuman, privacy });

describe('shared-device state machine', () => {
  it('a new two-human match starts covered for the first human; Ready then Reveal opens the hand', () => {
    let s = transition({ kind: 'round-results' }, { type: 'start', facts: f(1, true), restored: false });
    expect(s).toEqual({ kind: 'covered', seat: 1, reason: 'start' });
    expect(revealedSeat(s, true, null)).toBeNull();
    s = transition(s, { type: 'reveal', facts: f(1, true) }); // reveal without Ready is ignored
    expect(s.kind).toBe('covered');
    s = transition(s, { type: 'ready' });
    expect(s).toEqual({ kind: 'revealing', seat: 1 });
    expect(revealedSeat(s, true, null)).toBeNull();
    s = transition(s, { type: 'reveal', facts: f(1, true) });
    expect(s).toEqual({ kind: 'human-turn', seat: 1 });
    expect(revealedSeat(s, true, null)).toBe(1);
  });

  it('the same human keeps the device while still on turn (e.g. after drawing)', () => {
    const s: ControllerState = { kind: 'human-turn', seat: 0 };
    expect(transition(s, { type: 'game-changed', facts: f(0, true) })).toBe(s);
  });

  it('handing to another human covers; an AI turn shows the public table; results are public', () => {
    const h0: ControllerState = { kind: 'human-turn', seat: 0 };
    expect(transition(h0, { type: 'game-changed', facts: f(1, true) })).toEqual({ kind: 'covered', seat: 1, reason: 'handoff' });
    const ai = transition(h0, { type: 'game-changed', facts: f(1, false) });
    expect(ai).toEqual({ kind: 'ai-turn', seat: 1 });
    expect(revealedSeat(ai, true, null)).toBeNull();
    // After AI seats, even the same human must take the device back explicitly.
    expect(transition(ai, { type: 'game-changed', facts: f(0, true) })).toEqual({ kind: 'covered', seat: 0, reason: 'handoff' });
    const res = transition(h0, { type: 'game-changed', facts: f(0, true, 'hand-ended') });
    expect(res).toEqual({ kind: 'round-results' });
    expect(transition(res, { type: 'game-changed', facts: f(1, true) })).toEqual({ kind: 'covered', seat: 1, reason: 'new-hand' });
  });

  it('pause, tab hide, orientation and restore all land on the cover; nothing private survives a pause', () => {
    const h0: ControllerState = { kind: 'human-turn', seat: 0 };
    const paused = transition(h0, { type: 'pause', reason: 'hidden' });
    expect(paused).toEqual({ kind: 'paused', reason: 'hidden' });
    expect(revealedSeat(paused, true, null)).toBeNull();
    expect(transition(paused, { type: 'game-changed', facts: f(1, false) })).toBe(paused);
    expect(transition(paused, { type: 'resume', facts: f(0, true) })).toEqual({ kind: 'covered', seat: 0, reason: 'resume' });
    expect(transition(h0, { type: 'conceal', reason: 'orientation' })).toEqual({ kind: 'covered', seat: 0, reason: 'orientation' });
    expect(transition({ kind: 'revealing', seat: 0 }, { type: 'conceal', reason: 'hidden' })).toEqual({ kind: 'covered', seat: 0, reason: 'hidden' });
    expect(transition({ kind: 'round-results' }, { type: 'start', facts: f(0, true), restored: true })).toEqual({ kind: 'covered', seat: 0, reason: 'restored' });
  });

  it('reveal is refused if the turn moved on meanwhile', () => {
    const s = transition({ kind: 'revealing', seat: 0 }, { type: 'reveal', facts: f(1, false) });
    expect(s).toEqual({ kind: 'ai-turn', seat: 1 });
  });

  it('solo play (privacy off) never covers; the one human always sees their hand', () => {
    const s = transition({ kind: 'round-results' }, { type: 'start', facts: f(0, true, 'playing', false), restored: true });
    expect(s).toEqual({ kind: 'human-turn', seat: 0 });
    const ai = transition(s, { type: 'game-changed', facts: f(1, false, 'playing', false) });
    expect(revealedSeat(ai, false, 0)).toBe(0);
    expect(transition(transition(s, { type: 'pause', reason: 'dialog' }), { type: 'resume', facts: f(0, true, 'playing', false) })).toEqual({ kind: 'human-turn', seat: 0 });
  });
});
