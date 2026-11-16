/**
 * Cousin's table talk. Plain conversational English with real domino terms
 * (dominó, tranque, pass) — no phonetic accents or stereotyped spelling.
 * Lines are chosen only from PUBLIC events, so banter can never reveal a hand.
 *
 * - `explicitLanguage` picks the explicit wording where a line has one
 *   (the opening line: "Fuck that…" vs "Forget that…").
 * - `enabled: false` silences banter entirely; factual lines still appear.
 * - Recently used lines are suppressed; routine moves only sometimes get a line.
 */
export type BanterContext =
  | 'opening'
  | 'hand-start'
  | 'cousin-play'
  | 'player-play'
  | 'other-play'
  | 'double'
  | 'player-pass'
  | 'cousin-pass'
  | 'draw'
  | 'cousin-out'
  | 'player-out'
  | 'team-out'
  | 'tranque'
  | 'tie'
  | 'match-won'
  | 'match-lost';

export interface Line {
  readonly id: string;
  readonly clean: string;
  readonly explicit?: string;
}

export const OPENING_LINE: Line = { id: 'opening', clean: 'Forget that, we playing DOMINOES!', explicit: 'Fuck that, we playing DOMINOES!' };

export const LINES: Readonly<Record<BanterContext, readonly Line[]>> = {
  opening: [OPENING_LINE],
  'hand-start': [
    { id: 'hs1', clean: 'New hand. Same table, new luck.' },
    { id: 'hs2', clean: 'Fresh tiles. Let’s see what you’ve got.' },
    { id: 'hs3', clean: 'Shuffle done. Eyes on the table.' },
    { id: 'hs4', clean: 'Here we go again.' },
  ],
  'cousin-play': [
    { id: 'cp1', clean: 'Follow that.' },
    { id: 'cp2', clean: 'Your move.' },
    { id: 'cp3', clean: 'That’s how it’s done.' },
    { id: 'cp4', clean: 'Nice and clean.' },
    { id: 'cp5', clean: 'Think about that one.' },
  ],
  'player-play': [
    { id: 'pp1', clean: 'Okay, I see you.' },
    { id: 'pp2', clean: 'Not bad at all.' },
    { id: 'pp3', clean: 'Interesting choice.' },
    { id: 'pp4', clean: 'Alright, alright.' },
  ],
  'other-play': [
    { id: 'op1', clean: 'The table’s moving.' },
    { id: 'op2', clean: 'Keep it going.' },
  ],
  double: [
    { id: 'd1', clean: 'A double. Getting it out of the way.' },
    { id: 'd2', clean: 'Big double on the table.' },
  ],
  'player-pass': [
    { id: 'ps1', clean: 'Knock knock — nothing, huh?' },
    { id: 'ps2', clean: 'Passing already?' },
    { id: 'ps3', clean: 'Rough spot. Skip.' },
  ],
  'cousin-pass': [
    { id: 'cps1', clean: 'Nothing for me. Go on.' },
    { id: 'cps2', clean: 'I’ll knock on that.' },
    { id: 'cps3', clean: 'Pass. Don’t get comfortable.', explicit: 'Pass. Don’t get too damn comfortable.' },
  ],
  draw: [
    { id: 'dr1', clean: 'Back to the boneyard.' },
    { id: 'dr2', clean: 'Digging for something useful.' },
  ],
  'cousin-out': [
    { id: 'co1', clean: '¡Dominó! Count ’em up.' },
    { id: 'co2', clean: 'And that’s the hand.' },
  ],
  'player-out': [
    { id: 'po1', clean: 'You got me that time.' },
    { id: 'po2', clean: 'Well played. Count ’em.' },
  ],
  'team-out': [
    { id: 'to1', clean: 'That team closed it out.' },
    { id: 'to2', clean: 'Out! Partners know each other.' },
  ],
  tranque: [
    { id: 'tq1', clean: 'Tranque. Nobody moves — count the pips.' },
    { id: 'tq2', clean: 'Locked up. Let’s count.', explicit: 'Locked up tight. Count the damn pips.' },
  ],
  tie: [{ id: 'ti1', clean: 'Dead even. Nobody scores.' }],
  'match-won': [
    { id: 'mw1', clean: 'Good game. Rematch?' },
    { id: 'mw2', clean: 'You earned that one.' },
  ],
  'match-lost': [
    { id: 'ml1', clean: 'The table remembers. Rematch?' },
    { id: 'ml2', clean: 'Better luck next time — run it back?' },
  ],
};

/** Contexts that always get a line; routine ones only sometimes. */
const ALWAYS: ReadonlySet<BanterContext> = new Set(['opening', 'cousin-out', 'player-out', 'team-out', 'tranque', 'tie', 'match-won', 'match-lost']);
const ROUTINE_CHANCE = 0.45;
const MEMORY = 8;

export interface BanterOptions {
  explicitLanguage: boolean;
  enabled: boolean;
  /** Returns [0,1). Injected so tests are deterministic; presentation only. */
  random?: () => number;
}

export class Banter {
  #recent: string[] = [];
  #opts: BanterOptions;
  #random: () => number;

  constructor(opts: BanterOptions) {
    this.#opts = { ...opts };
    this.#random = opts.random ?? Math.random;
  }

  configure(p: Partial<Pick<BanterOptions, 'explicitLanguage' | 'enabled'>>): void {
    this.#opts = { ...this.#opts, ...p };
  }

  text(line: Line): string {
    return this.#opts.explicitLanguage && line.explicit ? line.explicit : line.clean;
  }

  /** A line for this context, or null (banter off, routine skip, or nothing fresh). */
  say(ctx: BanterContext): string | null {
    if (!this.#opts.enabled) return null;
    if (!ALWAYS.has(ctx) && this.#random() >= ROUTINE_CHANCE) return null;
    const pool = LINES[ctx];
    const fresh = pool.filter((l) => !this.#recent.includes(l.id));
    if (!fresh.length) {
      if (!ALWAYS.has(ctx)) return null; // never repeat a routine line just to fill silence
    }
    const candidates = fresh.length ? fresh : [...pool].sort((a, b) => this.#recent.indexOf(a.id) - this.#recent.indexOf(b.id));
    const line = fresh.length ? candidates[Math.floor(this.#random() * candidates.length)]! : candidates[0]!;
    this.#recent = [...this.#recent.filter((id) => id !== line.id), line.id].slice(-MEMORY);
    return this.text(line);
  }
}
