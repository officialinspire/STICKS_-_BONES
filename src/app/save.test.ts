import { describe, expect, it } from 'vitest';
import { TableController } from './controller';
import { clearSave, readSave, SAVE_KEY, writeSave, type KeyValueStore } from './save';
import { GameSession } from './session';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const idle = { set: () => 0, clear: () => {} };

describe('local save / resume', () => {
  it('round-trips a two-human game, and the restored controller opens covered', () => {
    const store = memoryStore();
    const s = new GameSession({ mode: 'partnership4', opponent: 'local', humanSeats: [0, 2], names: ['Ana', 'Ben'], difficulty: 'hard', seed: 'save', aiSeed: 'ai' }, { scheduler: idle });
    expect(writeSave(store, s)).toBe(true);
    const g = readSave(store)!;
    expect(g.opponent).toBe('local');
    expect(g.difficulty).toBe('hard');
    expect(g.state).toEqual(s.debugState());
    expect(g.aiRng).toEqual(s.exportAiRng());
    const s2 = new GameSession({ state: g.state, opponent: g.opponent, difficulty: g.difficulty, aiRng: g.aiRng }, { scheduler: idle });
    expect(s2.seatName(2)).toBe('Ben');
    const c = new TableController(s2, { restored: true });
    if (s2.isHuman(s2.turn)) expect(c.state).toMatchObject({ kind: 'covered', reason: 'restored' });
    expect(c.revealed()).toBeNull();
    expect(c.view().myHand).toEqual([]);
    c.dispose();
  });

  it('discards malformed, tampered or finished saves, and never saves developer matches', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, '{nope');
    expect(readSave(store)).toBeNull();
    const s = new GameSession({ mode: 'draw2', opponent: 'local', seed: 'x', aiSeed: 'y' }, { scheduler: idle });
    writeSave(store, s);
    const raw = JSON.parse(store.getItem(SAVE_KEY)!);
    raw.state.hand.hands[0][0] = raw.state.hand.hands[1][0]; // duplicate a tile
    store.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(readSave(store)).toBeNull();
    raw.format = 'other';
    store.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(readSave(store)).toBeNull();
    const dev = new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'x', aiSeed: 'y' }, { scheduler: idle });
    clearSave(store);
    expect(writeSave(store, dev)).toBe(false);
    expect(store.data.size).toBe(0);
    expect(writeSave(null, s)).toBe(false);
  });

  it('survives storage that throws (private browsing)', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const s = new GameSession({ mode: 'block2', opponent: 'ai', seed: 'x', aiSeed: 'y' }, { scheduler: idle });
    expect(writeSave(broken, s)).toBe(false);
    expect(readSave(broken)).toBeNull();
    expect(() => clearSave(broken)).not.toThrow();
  });
});
