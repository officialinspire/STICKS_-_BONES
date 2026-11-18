/**
 * Analytics adapter — DISABLED until the owner supplies the INSPIRE analytics
 * contract for this game (see docs/ANALYTICS.md and analytics-config.ts).
 *
 * What it guarantees today, and will keep guaranteeing once a transport is plugged in:
 *   - Only the events and fields below exist. Every payload is rebuilt from a
 *     per-event allowlist of enum/integer fields, so a tile hand, seed, move
 *     history, player-entered name, save, image or free text can't get through.
 *     Error messages are the one free-text field, and they are sanitised.
 *   - Nothing is sent unless `config.enabled`, a transport exists AND consent is granted.
 *   - De-duplication: one launch per page load; `match_start` only on the first
 *     accepted command of a NEW match (never on render, restore, or a replaced
 *     double-tapped deal); `match_resume` is separate and explicit; round/match
 *     ends once per match + hand.
 *   - Story events are SEPARATE from Quick Play (a story hand never emits match_*): an encounter starts on
 *     the chapter hand's first accepted command; chapter and case completion once per case; resume and
 *     assistance explicit. Their only fields are fixed enums (the nine scene ids, outcomes) — never hands,
 *     seeds, raw saves, entered names or dialogue. The story event NAMES are this build's proposal, not a
 *     deployed contract: they must be mapped to the owner's contract before anything is sent.
 */
import type { Difficulty } from '../ai/types';
import type { ModeId } from '../engine/types';

export type StartKind = 'fresh' | 'rematch' | 'restart';
export type Opponent = 'ai' | 'local';
/** Who won, without names: vs the computer from the player's side; two humans as team 1 / team 2. */
export type Winner = 'player' | 'computer' | 'team_1' | 'team_2' | 'tie';

export type AnalyticsEvent =
  | { name: 'game_launch'; display: 'browser' | 'standalone'; build: string }
  | { name: 'match_start'; start_kind: StartKind; mode: ModeId; opponent: Opponent; difficulty: Difficulty | null; humans_partnered: boolean | null }
  | { name: 'match_resume'; mode: ModeId; opponent: Opponent; difficulty: Difficulty | null; hand_number: number }
  | { name: 'round_end'; mode: ModeId; opponent: Opponent; difficulty: Difficulty | null; hand_number: number; ending: 'domino' | 'blocked' | 'blocked_tie'; winner: Winner; points: number }
  | { name: 'match_end'; mode: ModeId; opponent: Opponent; difficulty: Difficulty | null; hands_played: number; winner: Winner }
  | { name: 'app_error'; kind: 'error' | 'unhandledrejection'; area: 'boot' | 'menu' | 'table' | 'unknown'; message: string }
  | { name: 'story_encounter_start'; scene: StoryScene; mode: ModeId; replay: boolean }
  | { name: 'story_chapter_complete'; scene: StoryScene; outcome: StoryOutcome; replay: boolean }
  | { name: 'story_case_complete' }
  | { name: 'story_resume'; scene: StoryScene; part: 'dialogue' | 'hand'; via: 'continue' | 'update' }
  | { name: 'story_assist'; scene: StoryScene; kind: 'skip_scene' };

export const STORY_SCENES = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'] as const;
export type StoryScene = (typeof STORY_SCENES)[number];
export type StoryOutcome = 'win' | 'loss' | 'tie' | 'none';

export type EventName = AnalyticsEvent['name'];

/** A transport delivers sanitised events to the real analytics service (none is configured). */
export interface AnalyticsTransport {
  send(event: AnalyticsEvent & { app: 'sticks-and-bones' }): void;
}

export interface AnalyticsConfig {
  readonly enabled: boolean;
  readonly transport: AnalyticsTransport | null;
  /** Consent gate. Absent consent means nothing is sent. */
  readonly consent: () => boolean;
}

// ---- allowlist ------------------------------------------------------------------------
const MODES = ['draw2', 'block2', 'partnership4'] as const;
const DIFFS = ['easy', 'normal', 'hard'] as const;
type Check = (v: unknown) => boolean;
const oneOf = (xs: readonly unknown[]): Check => (v) => xs.includes(v);
const int = (max: number): Check => (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const boolOrNull: Check = (v) => v === null || typeof v === 'boolean';
const diff: Check = (v) => v === null || DIFFS.includes(v as Difficulty);
const SCHEMA: Record<EventName, Record<string, Check>> = {
  game_launch: { display: oneOf(['browser', 'standalone']), build: (v) => typeof v === 'string' && /^[\w.-]{1,32}$/.test(v) },
  match_start: { start_kind: oneOf(['fresh', 'rematch', 'restart']), mode: oneOf(MODES), opponent: oneOf(['ai', 'local']), difficulty: diff, humans_partnered: boolOrNull },
  match_resume: { mode: oneOf(MODES), opponent: oneOf(['ai', 'local']), difficulty: diff, hand_number: int(999) },
  round_end: {
    mode: oneOf(MODES),
    opponent: oneOf(['ai', 'local']),
    difficulty: diff,
    hand_number: int(999),
    ending: oneOf(['domino', 'blocked', 'blocked_tie']),
    winner: oneOf(['player', 'computer', 'team_1', 'team_2', 'tie']),
    points: int(1000),
  },
  match_end: { mode: oneOf(MODES), opponent: oneOf(['ai', 'local']), difficulty: diff, hands_played: int(999), winner: oneOf(['player', 'computer', 'team_1', 'team_2', 'tie']) },
  app_error: { kind: oneOf(['error', 'unhandledrejection']), area: oneOf(['boot', 'menu', 'table', 'unknown']), message: (v) => typeof v === 'string' && v.length <= 120 },
  story_encounter_start: { scene: oneOf(STORY_SCENES), mode: oneOf(MODES), replay: oneOf([true, false]) },
  story_chapter_complete: { scene: oneOf(STORY_SCENES), outcome: oneOf(['win', 'loss', 'tie', 'none']), replay: oneOf([true, false]) },
  story_case_complete: {},
  story_resume: { scene: oneOf(STORY_SCENES), part: oneOf(['dialogue', 'hand']), via: oneOf(['continue', 'update']) },
  story_assist: { scene: oneOf(STORY_SCENES), kind: oneOf(['skip_scene']) },
};

/**
 * Rebuild an event from its allowlist; null if anything is missing or invalid.
 * Unknown fields are dropped, never passed through.
 */
export function sanitizeEvent(e: { name: string } & Record<string, unknown>): AnalyticsEvent | null {
  const schema = SCHEMA[e.name as EventName];
  if (!schema) return null;
  const out: Record<string, unknown> = { name: e.name };
  for (const [k, ok] of Object.entries(schema)) {
    const v = k === 'message' ? sanitizeMessage(e[k]) : e[k];
    if (!ok(v)) return null;
    out[k] = v;
  }
  return out as AnalyticsEvent;
}

/**
 * Error text without anything that could identify a game or a person: URLs and
 * query strings, file paths, tile ids/values (t64, 6|4), numbers of 2+ digits
 * (seeds, ids), quoted strings (names), emails. Capped at 120 characters.
 */
export function sanitizeMessage(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw ?? '');
  s = s
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '<email>')
    .replace(/\b(?:https?|blob|data|file):\S+/gi, '<url>')
    .replace(/(?:\/[\w.@-]+){2,}/g, '<path>')
    .replace(/(["'“‘`])[^"'”’`]*\1|“[^”]*”|‘[^’]*’/g, '<text>')
    .replace(/\bt[0-6]{2}\b/gi, '<tile>')
    .replace(/\b[0-6]\s*[|–-]\s*[0-6]\b/g, '<tile>')
    .replace(/\d{2,}/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

// ---- the tracker ------------------------------------------------------------------------
export interface MatchInfo {
  readonly matchId: string;
  readonly mode: ModeId;
  readonly opponent: Opponent;
  readonly difficulty: Difficulty | null;
  /** Two humans on the same team (Partnership with both humans partnered); null when not applicable. */
  readonly humansPartnered: boolean | null;
}

export class Analytics {
  #config: AnalyticsConfig;
  #launched = false;
  #started = new Set<string>();
  #rounds = new Set<string>();
  #ended = new Set<string>();
  #lastResume: string | null = null;
  #errors = new Map<string, number>();
  /** Every accepted (sanitised) event, kept only when a debug recorder is attached (dev/tests). */
  #recorder: ((e: AnalyticsEvent) => void) | null = null;

  constructor(config: AnalyticsConfig) {
    this.#config = config;
  }

  /** Dev/test hook: observe accepted events even while the transport is disabled. */
  record(fn: ((e: AnalyticsEvent) => void) | null): void {
    this.#recorder = fn;
  }

  get active(): boolean {
    return this.#config.enabled && !!this.#config.transport;
  }

  #emit(e: { name: string } & Record<string, unknown>): void {
    const clean = sanitizeEvent(e);
    if (!clean) return;
    this.#recorder?.(clean);
    if (!this.active) return;
    let consent = false;
    try {
      consent = this.#config.consent();
    } catch {
      consent = false;
    }
    if (!consent) return;
    try {
      this.#config.transport!.send({ ...clean, app: 'sticks-and-bones' });
    } catch {
      /* analytics must never break the game */
    }
  }

  launch(display: 'browser' | 'standalone', build: string): void {
    if (this.#launched) return;
    this.#launched = true;
    this.#emit({ name: 'game_launch', display, build });
  }

  /**
   * The match really started: its first command was accepted. Call on every
   * applied batch; only the first batch of a NEW (non-restored) match counts.
   */
  matchActivity(m: MatchInfo, kind: StartKind, restored: boolean): void {
    this.#lastResume = null;
    if (restored || this.#started.has(m.matchId)) return;
    this.#started.add(m.matchId);
    this.#emit({ name: 'match_start', start_kind: kind, mode: m.mode, opponent: m.opponent, difficulty: m.difficulty, humans_partnered: m.humansPartnered });
  }

  /** The player chose Resume (also after an update reload). A restored match never counts as a start. */
  resume(m: MatchInfo, handNumber: number): void {
    this.#started.add(m.matchId);
    if (this.#lastResume === m.matchId) return; // repeated tap with no play in between
    this.#lastResume = m.matchId;
    this.#emit({ name: 'match_resume', mode: m.mode, opponent: m.opponent, difficulty: m.difficulty, hand_number: handNumber });
  }

  roundEnd(m: MatchInfo, r: { handNumber: number; ending: 'domino' | 'blocked' | 'blocked_tie'; winner: Winner; points: number }): void {
    const key = `${m.matchId}#${r.handNumber}`;
    if (this.#rounds.has(key)) return;
    this.#rounds.add(key);
    this.#emit({ name: 'round_end', mode: m.mode, opponent: m.opponent, difficulty: m.difficulty, hand_number: r.handNumber, ending: r.ending, winner: r.winner, points: r.points });
  }

  matchEnd(m: MatchInfo, handsPlayed: number, winner: Winner): void {
    if (this.#ended.has(m.matchId)) return;
    this.#ended.add(m.matchId);
    this.#emit({ name: 'match_end', mode: m.mode, opponent: m.opponent, difficulty: m.difficulty, hands_played: handsPlayed, winner });
  }

  // ---- Story (separate from Quick Play) --------------------------------------------------------
  #story = new Set<string>();
  #storyOnce(key: string): boolean {
    if (this.#story.has(key)) return false;
    this.#story.add(key);
    return true;
  }
  /**
   * A chapter hand really started: its first command was accepted. `token` identifies this dealt hand
   * locally (never sent); a restored hand must not call this.
   */
  storyEncounter(scene: StoryScene, mode: ModeId, replay: boolean, token: string): void {
    if (this.#storyOnce(`enc:${token}`)) this.#emit({ name: 'story_encounter_start', scene, mode, replay });
  }
  /** Chapter finished; `caseId` is a local key for this case (never sent). Once per case + scene (+ replay run). */
  storyChapterComplete(scene: StoryScene, outcome: StoryOutcome, replay: boolean, caseId: string): void {
    if (this.#storyOnce(`ch:${caseId}:${scene}:${replay}`)) this.#emit({ name: 'story_chapter_complete', scene, outcome, replay });
  }
  storyCaseComplete(caseId: string): void {
    if (this.#storyOnce(`case:${caseId}`)) this.#emit({ name: 'story_case_complete' });
  }
  /** Continue Case into an in-progress position (or the automatic return after an update). Once per position per page. */
  storyResume(scene: StoryScene, part: 'dialogue' | 'hand', via: 'continue' | 'update', positionKey: string): void {
    if (this.#storyOnce(`res:${positionKey}:${via}`)) this.#emit({ name: 'story_resume', scene, part, via });
  }
  storyAssist(scene: StoryScene, kind: 'skip_scene', key: string): void {
    if (this.#storyOnce(`assist:${key}`)) this.#emit({ name: 'story_assist', scene, kind });
  }

  /** Sanitised error report; each distinct message at most 3 times per page. */
  error(kind: 'error' | 'unhandledrejection', area: 'boot' | 'menu' | 'table' | 'unknown', raw: unknown): void {
    const message = sanitizeMessage(raw) || 'unknown error';
    const n = this.#errors.get(message) ?? 0;
    if (n >= 3) return;
    this.#errors.set(message, n + 1);
    this.#emit({ name: 'app_error', kind, area, message });
  }
}

/** Map a team index to a nameless winner label. */
export function winnerLabel(team: number | null, opponent: Opponent, humanTeam: number): Winner {
  if (team === null) return 'tie';
  if (opponent === 'ai') return team === humanTeam ? 'player' : 'computer';
  return team === 0 ? 'team_1' : 'team_2';
}
