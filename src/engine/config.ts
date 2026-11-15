/**
 * Match configuration: which preset, mode, target and who controls each seat.
 *
 * Supported control setups (product scope):
 *   - solo: exactly one human, AI everywhere else;
 *   - local two-player: exactly two humans sharing one device (pass-and-play),
 *     AI fills any remaining partnership seats.
 * Zero humans, three or more humans, and online seats are rejected.
 *
 * The config deliberately has no seed or RNG state: those are secrets that
 * belong to match state, never to shareable settings.
 */
import { DEFAULT_RULES_PRESET, getRulesPreset, type ModeRules, type RulesPreset } from './rules/presets';
import { MODE_IDS, type ModeId, type SeatIndex, type TargetScore } from './types';

export const MATCH_CONFIG_SCHEMA_VERSION = 1;
export const MAX_DISPLAY_NAME_LENGTH = 20;
export const AI_PROFILES = ['standard'] as const;
export type AiProfile = (typeof AI_PROFILES)[number];

/** Local human player slot: 0 = first human, 1 = second human on the same device. */
export type HumanSlot = 0 | 1;

export type SeatController =
  | { readonly kind: 'human'; readonly slot: HumanSlot }
  | { readonly kind: 'ai'; readonly profile: AiProfile };

export interface SeatConfig {
  readonly seat: SeatIndex;
  readonly controller: SeatController;
  /** Optional label shown in UI. Never contains hidden information. */
  readonly displayName?: string;
}

export interface MatchConfig {
  readonly schemaVersion: typeof MATCH_CONFIG_SCHEMA_VERSION;
  readonly rules: { readonly presetId: string; readonly presetVersion: number };
  readonly mode: ModeId;
  readonly targetScore: TargetScore;
  readonly seats: readonly SeatConfig[];
}

export type ConfigErrorCode =
  | 'not-an-object'
  | 'schema-version'
  | 'unknown-preset'
  | 'unknown-mode'
  | 'invalid-target'
  | 'seat-count'
  | 'seat-index'
  | 'controller'
  | 'human-count'
  | 'human-slot'
  | 'ai-profile'
  | 'display-name';

export interface ConfigError {
  readonly code: ConfigErrorCode;
  readonly message: string;
  readonly path: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly config: MatchConfig; readonly preset: RulesPreset; readonly rules: ModeRules }
  | { readonly ok: false; readonly errors: readonly ConfigError[] };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Validate untrusted input (e.g. from a menu or localStorage). Never throws.
 * On success returns a normalized, frozen copy.
 */
export function validateMatchConfig(input: unknown): ValidationResult {
  const errors: ConfigError[] = [];
  const err = (code: ConfigErrorCode, path: string, message: string) => errors.push({ code, path, message });

  if (!isRecord(input)) return { ok: false, errors: [{ code: 'not-an-object', path: '', message: 'Config must be an object' }] };

  if (input.schemaVersion !== MATCH_CONFIG_SCHEMA_VERSION)
    err('schema-version', 'schemaVersion', `Expected schemaVersion ${MATCH_CONFIG_SCHEMA_VERSION}`);

  let preset: RulesPreset | null = null;
  const r = input.rules;
  if (!isRecord(r) || typeof r.presetId !== 'string' || typeof r.presetVersion !== 'number') {
    err('unknown-preset', 'rules', 'rules must be { presetId: string, presetVersion: number }');
  } else {
    preset = getRulesPreset(r.presetId, r.presetVersion);
    if (!preset) err('unknown-preset', 'rules', `Unknown rules preset ${r.presetId}@${r.presetVersion}`);
  }

  const mode = input.mode;
  const modeOk = typeof mode === 'string' && (MODE_IDS as readonly string[]).includes(mode);
  if (!modeOk) err('unknown-mode', 'mode', `Unknown mode ${String(mode)}`);

  const rules = preset && modeOk ? preset.modes[mode as ModeId] : null;

  if (rules) {
    const t = input.targetScore;
    if (typeof t !== 'number' || !(rules.target.allowed as readonly number[]).includes(t))
      err('invalid-target', 'targetScore', `Target must be one of ${rules.target.allowed.join(', ')}`);
  }

  const seatsIn = input.seats;
  const normalizedSeats: SeatConfig[] = [];
  if (!Array.isArray(seatsIn)) {
    err('seat-count', 'seats', 'seats must be an array');
  } else {
    if (rules && seatsIn.length !== rules.seatCount)
      err('seat-count', 'seats', `${rules.name} needs exactly ${rules.seatCount} seats, got ${seatsIn.length}`);
    const humanSlots: number[] = [];
    seatsIn.forEach((s: unknown, i) => {
      const path = `seats[${i}]`;
      if (!isRecord(s)) {
        err('seat-index', path, 'Seat must be an object');
        return;
      }
      if (s.seat !== i) err('seat-index', `${path}.seat`, `Seats must be listed in order; expected seat ${i}`);
      const c = s.controller;
      let controller: SeatController | null = null;
      if (!isRecord(c) || (c.kind !== 'human' && c.kind !== 'ai')) {
        err('controller', `${path}.controller`, 'controller.kind must be "human" or "ai"');
      } else if (c.kind === 'human') {
        if (c.slot !== 0 && c.slot !== 1) err('human-slot', `${path}.controller.slot`, 'Human slot must be 0 or 1');
        else {
          humanSlots.push(c.slot);
          controller = { kind: 'human', slot: c.slot };
        }
      } else {
        if (!(AI_PROFILES as readonly unknown[]).includes(c.profile))
          err('ai-profile', `${path}.controller.profile`, `AI profile must be one of ${AI_PROFILES.join(', ')}`);
        else controller = { kind: 'ai', profile: c.profile as AiProfile };
      }
      let displayName: string | undefined;
      if (s.displayName !== undefined) {
        if (typeof s.displayName !== 'string') err('display-name', `${path}.displayName`, 'displayName must be a string');
        else {
          displayName = s.displayName.trim();
          if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME_LENGTH || CONTROL_CHARS.test(displayName))
            err('display-name', `${path}.displayName`, `displayName must be 1–${MAX_DISPLAY_NAME_LENGTH} printable characters`);
        }
      }
      if (controller && typeof s.seat === 'number' && s.seat === i)
        normalizedSeats.push({ seat: i as SeatIndex, controller, ...(displayName ? { displayName } : {}) });
    });
    const humans = humanSlots.length;
    if (humans < 1 || humans > 2)
      err('human-count', 'seats', `Exactly one or two local humans are supported, got ${humans}`);
    else {
      const sorted = [...humanSlots].sort();
      if (sorted.some((slot, k) => slot !== k))
        err('human-slot', 'seats', humans === 1 ? 'A single human must use slot 0' : 'Two humans must use slots 0 and 1');
    }
  }

  if (errors.length || !preset || !rules) return { ok: false, errors };

  const config: MatchConfig = Object.freeze({
    schemaVersion: MATCH_CONFIG_SCHEMA_VERSION,
    rules: Object.freeze({ presetId: preset.id, presetVersion: preset.version }),
    mode: rules.mode,
    targetScore: input.targetScore as TargetScore,
    seats: Object.freeze(normalizedSeats.map((s) => Object.freeze(s))),
  });
  return { ok: true, config, preset, rules };
}

export interface CreateMatchOptions {
  readonly mode: ModeId;
  readonly targetScore?: TargetScore;
  /**
   * Seats controlled by local humans, in human-slot order. Defaults to [0].
   * For two humans in Partnership, [0, 2] makes them partners and [0, 1]
   * makes them opponents; both are allowed.
   */
  readonly humanSeats?: readonly SeatIndex[];
  readonly preset?: RulesPreset;
}

/** Build and validate a config; AI fills every seat not listed in humanSeats. */
export function createMatchConfig(opts: CreateMatchOptions): ValidationResult {
  const preset = opts.preset ?? DEFAULT_RULES_PRESET;
  const rules = preset.modes[opts.mode];
  if (!rules)
    return { ok: false, errors: [{ code: 'unknown-mode', path: 'mode', message: `Unknown mode ${String(opts.mode)}` }] };
  const humanSeats = opts.humanSeats ?? [0];
  const seats = Array.from({ length: rules.seatCount }, (_, seat) => {
    const slot = humanSeats.indexOf(seat as SeatIndex);
    return {
      seat,
      controller: slot >= 0 ? { kind: 'human', slot } : { kind: 'ai', profile: 'standard' },
    };
  });
  const extra = humanSeats.filter((s) => s >= rules.seatCount || humanSeats.indexOf(s) !== humanSeats.lastIndexOf(s));
  const result = validateMatchConfig({
    schemaVersion: MATCH_CONFIG_SCHEMA_VERSION,
    rules: { presetId: preset.id, presetVersion: preset.version },
    mode: opts.mode,
    targetScore: opts.targetScore ?? rules.target.default,
    seats,
  });
  if (extra.length) {
    const e: ConfigError = { code: 'seat-index', path: 'humanSeats', message: `Invalid or repeated human seats: ${extra.join(', ')}` };
    return { ok: false, errors: result.ok ? [e] : [e, ...result.errors] };
  }
  return result;
}
