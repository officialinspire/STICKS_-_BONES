/**
 * Which local records failed to save, tracked per record, so one successful write can never hide another
 * record's failure.
 *
 * - Every writer reports its outcome with a retry that writes that record's LATEST in-memory value, so a
 *   retry never resurrects an older state.
 * - The "Not saved" warning lists the failing records and clears only when every one of them has been
 *   written successfully. A record removed on purpose (a finished match's save) is `resolve`d: its pending
 *   retry is dropped, so an old save can't reappear.
 * - `retryAll()` retries every failing record once (bounded by the caller: before an update, on a later
 *   successful write, when the page is hidden, or on the player's "Try again").
 */
export type RecordName = 'save' | 'settings' | 'stats' | 'story' | 'achievements';

export const RECORD_LABEL: Readonly<Record<RecordName, string>> = {
  save: 'your match',
  settings: 'your settings',
  stats: 'your statistics',
  story: 'your Story progress',
  achievements: 'your achievements',
};

export class WriteHealth {
  readonly #dirty = new Map<RecordName, () => boolean>();
  readonly #onChange: (failing: readonly RecordName[]) => void;
  #retrying = false;

  constructor(onChange: (failing: readonly RecordName[]) => void) {
    this.#onChange = onChange;
  }

  /** The outcome of a write. A failure keeps `retry` (the latest value) until a later write of the same record succeeds. */
  report(name: RecordName, ok: boolean, retry: () => boolean): void {
    const before = this.#dirty.size;
    const had = this.#dirty.has(name);
    if (ok) this.#dirty.delete(name);
    else this.#dirty.set(name, retry);
    if (this.#dirty.size !== before || had !== this.#dirty.has(name)) this.#emit();
    // Storage just accepted a write: a good moment to retry what failed before (once, not recursively).
    if (ok && this.#dirty.size) this.retryAll();
  }

  /** The record was removed on purpose: nothing of it is pending any more. */
  resolve(name: RecordName): void {
    if (this.#dirty.delete(name)) this.#emit();
  }

  /** Retry every failing record once. True when nothing is left unsaved. */
  retryAll(): boolean {
    if (this.#retrying || !this.#dirty.size) return this.#dirty.size === 0;
    this.#retrying = true;
    let changed = false;
    try {
      for (const [name, retry] of [...this.#dirty]) {
        let ok = false;
        try {
          ok = retry();
        } catch {
          ok = false;
        }
        if (ok && this.#dirty.get(name) === retry) {
          this.#dirty.delete(name);
          changed = true;
        }
      }
    } finally {
      this.#retrying = false;
    }
    if (changed) this.#emit();
    return this.#dirty.size === 0;
  }

  get failing(): readonly RecordName[] {
    return [...this.#dirty.keys()];
  }
  has(name: RecordName): boolean {
    return this.#dirty.has(name);
  }

  #emit(): void {
    this.#onChange(this.failing);
  }
}
