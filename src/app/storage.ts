/**
 * Versioned local records (match save, settings, statistics). Every record is
 * an envelope { format, version, data }. Reading never throws:
 *   - missing                → defaults
 *   - older known version    → migrated (and rewritten in the current version)
 *   - unreadable / wrong format / failed validation → "corrupt"
 *   - newer than this build  → "incompatible"
 * Corrupt or incompatible data is moved to `<key>.quarantine` (one slot) rather
 * than silently destroyed, and the caller tells the player what happened.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ReadStatus = 'ok' | 'missing' | 'migrated' | 'corrupt' | 'incompatible' | 'unavailable';

export interface RecordSpec<T> {
  readonly key: string;
  readonly format: string;
  readonly version: number;
  /** Validate current-version data; return null if invalid. */
  validate(data: unknown): T | null;
  /** Upgrade data from an older version (or a legacy un-enveloped value: version 0). Return null if impossible. */
  migrate?(fromVersion: number, data: unknown): unknown;
}

export interface ReadResult<T> {
  readonly status: ReadStatus;
  readonly value: T | null;
}

/** Thrown by a validator when data is well-formed but needs something this build doesn't have (e.g. an unknown rules preset). */
export class IncompatibleRecord extends Error {}

export function quarantineKey(key: string): string {
  return `${key}.quarantine`;
}

function safeGet(store: KeyValueStore, key: string): string | null | undefined {
  try {
    return store.getItem(key);
  } catch {
    return undefined;
  }
}

function quarantine(store: KeyValueStore, key: string, raw: string): void {
  try {
    store.setItem(quarantineKey(key), raw);
  } catch {
    /* storage full: dropping the bad copy is acceptable */
  }
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readRecord<T>(store: KeyValueStore | null, spec: RecordSpec<T>): ReadResult<T> {
  if (!store) return { status: 'unavailable', value: null };
  const raw = safeGet(store, spec.key);
  if (raw === undefined) return { status: 'unavailable', value: null };
  if (raw === null) return { status: 'missing', value: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(store, spec.key, raw);
    return { status: 'corrupt', value: null };
  }
  const env = parsed as { format?: unknown; version?: unknown; data?: unknown };
  const enveloped = typeof parsed === 'object' && parsed !== null && env.format === spec.format && typeof env.version === 'number';
  let version = enveloped ? (env.version as number) : 0;
  let data: unknown = enveloped ? env.data : parsed;
  if (version > spec.version) {
    quarantine(store, spec.key, raw);
    return { status: 'incompatible', value: null };
  }
  let migrated = false;
  if (version < spec.version) {
    if (!spec.migrate) {
      quarantine(store, spec.key, raw);
      return { status: version === 0 ? 'corrupt' : 'incompatible', value: null };
    }
    try {
      data = spec.migrate(version, data);
    } catch {
      data = null;
    }
    if (data === null || data === undefined) {
      quarantine(store, spec.key, raw);
      return { status: version === 0 ? 'corrupt' : 'incompatible', value: null };
    }
    version = spec.version;
    migrated = true;
  }
  let value: T | null = null;
  try {
    value = spec.validate(data);
  } catch (e) {
    if (e instanceof IncompatibleRecord) {
      quarantine(store, spec.key, raw);
      return { status: 'incompatible', value: null };
    }
    value = null;
  }
  if (value === null) {
    quarantine(store, spec.key, raw);
    return { status: 'corrupt', value: null };
  }
  if (migrated) writeRecord(store, spec, value);
  return { status: migrated ? 'migrated' : 'ok', value };
}

export function writeRecord<T>(store: KeyValueStore | null, spec: Pick<RecordSpec<T>, 'key' | 'format' | 'version'>, value: T): boolean {
  if (!store) return false;
  try {
    store.setItem(spec.key, JSON.stringify({ format: spec.format, version: spec.version, data: value }));
    return true;
  } catch {
    return false;
  }
}

export function removeRecord(store: KeyValueStore | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}
