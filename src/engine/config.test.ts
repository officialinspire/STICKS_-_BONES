import { describe, expect, it } from 'vitest';
import { createMatchConfig, validateMatchConfig, type MatchConfig } from './config';

const valid = (): MatchConfig => {
  const r = createMatchConfig({ mode: 'draw2' });
  if (!r.ok) throw new Error('fixture');
  return r.config;
};
const codes = (input: unknown) => {
  const r = validateMatchConfig(input);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('createMatchConfig', () => {
  it('solo vs AI in every mode with default targets', () => {
    for (const [mode, target, seats] of [
      ['draw2', 100, 2],
      ['block2', 100, 2],
      ['partnership4', 200, 4],
    ] as const) {
      const r = createMatchConfig({ mode });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.config.targetScore).toBe(target);
      expect(r.config.seats).toHaveLength(seats);
      expect(r.config.seats.filter((s) => s.controller.kind === 'human')).toHaveLength(1);
    }
  });

  it('two local humans; AI fills remaining partnership seats', () => {
    const r = createMatchConfig({ mode: 'partnership4', humanSeats: [0, 2], targetScore: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.seats.map((s) => s.controller.kind)).toEqual(['human', 'ai', 'human', 'ai']);
    expect(r.config.seats[2]!.controller).toEqual({ kind: 'human', slot: 1 });
    expect(createMatchConfig({ mode: 'partnership4', humanSeats: [0, 1] }).ok).toBe(true);
    expect(createMatchConfig({ mode: 'block2', humanSeats: [0, 1] }).ok).toBe(true);
  });

  it('rejects zero, three, repeated or out-of-range human seats', () => {
    expect(createMatchConfig({ mode: 'draw2', humanSeats: [] }).ok).toBe(false);
    expect(createMatchConfig({ mode: 'partnership4', humanSeats: [0, 1, 2] }).ok).toBe(false);
    expect(createMatchConfig({ mode: 'draw2', humanSeats: [0, 0] }).ok).toBe(false);
    expect(createMatchConfig({ mode: 'draw2', humanSeats: [2] }).ok).toBe(false);
  });
});

describe('validateMatchConfig rejects invalid configs', () => {
  it('accepts a valid config and returns frozen normalized data', () => {
    const r = validateMatchConfig(JSON.parse(JSON.stringify(valid())));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.isFrozen(r.config.seats)).toBe(true);
  });

  it.each([
    ['non-object', null, 'not-an-object'],
    ['array', [], 'not-an-object'],
    ['schema version', { ...valid(), schemaVersion: 2 }, 'schema-version'],
    ['unknown preset', { ...valid(), rules: { presetId: 'nope', presetVersion: 1 } }, 'unknown-preset'],
    ['unknown preset version', { ...valid(), rules: { presetId: 'cousins-house-rules', presetVersion: 9 } }, 'unknown-preset'],
    ['unknown mode', { ...valid(), mode: 'spinner5' }, 'unknown-mode'],
    ['target 150', { ...valid(), targetScore: 150 }, 'invalid-target'],
    ['target string', { ...valid(), targetScore: '100' }, 'invalid-target'],
    ['too many seats', { ...valid(), seats: [...valid().seats, { seat: 2, controller: { kind: 'ai', profile: 'standard' } }] }, 'seat-count'],
    ['seats not array', { ...valid(), seats: 'x' }, 'seat-count'],
    ['seat out of order', { ...valid(), seats: [valid().seats[1], valid().seats[0]].map((s, i) => ({ ...s, seat: 1 - i })) }, 'seat-index'],
    ['bad controller', { ...valid(), seats: [valid().seats[0], { seat: 1, controller: { kind: 'online' } }] }, 'controller'],
    ['no humans', { ...valid(), seats: [0, 1].map((seat) => ({ seat, controller: { kind: 'ai', profile: 'standard' } })) }, 'human-count'],
    ['bad slot', { ...valid(), seats: [{ seat: 0, controller: { kind: 'human', slot: 2 } }, valid().seats[1]] }, 'human-slot'],
    ['single human on slot 1', { ...valid(), seats: [{ seat: 0, controller: { kind: 'human', slot: 1 } }, valid().seats[1]] }, 'human-slot'],
    ['two humans same slot', { ...valid(), seats: [0, 1].map((seat) => ({ seat, controller: { kind: 'human', slot: 0 } })) }, 'human-slot'],
    ['unknown AI profile', { ...valid(), seats: [valid().seats[0], { seat: 1, controller: { kind: 'ai', profile: 'cheater' } }] }, 'ai-profile'],
    ['long name', { ...valid(), seats: [{ ...valid().seats[0], displayName: 'x'.repeat(21) }, valid().seats[1]] }, 'display-name'],
    ['control chars in name', { ...valid(), seats: [{ ...valid().seats[0], displayName: 'a\u0007b' }, valid().seats[1]] }, 'display-name'],
  ])('%s', (_label, input, code) => {
    expect(codes(input)).toContain(code);
  });

  it('rejects three humans in partnership', () => {
    const r = createMatchConfig({ mode: 'partnership4' });
    if (!r.ok) throw new Error('fixture');
    const seats = r.config.seats.map((s, i) => (i < 3 ? { ...s, controller: { kind: 'human', slot: Math.min(i, 1) } } : s));
    expect(codes({ ...r.config, seats })).toContain('human-count');
  });
});
