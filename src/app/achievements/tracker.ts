/**
 * Achievement tracker: follows tables through the approved boundary (TableController.subscribe, i.e.
 * applied, redacted events), Story completions through the existing Story `track` hook, and a few
 * screen/control uses. It turns them into facts and keeps the versioned record.
 *
 * What counts:
 * - **quick-solo:** Quick Play against the computer. Hand, tactical and match facts.
 * - **story:** a first-time chapter hand. Hand and tactical facts; Story facts come from chapter
 *   completions.
 * - **local:** two people on one device. Only "finished a two-player match" facts.
 * - **none:** Story replays, developer fixtures and both-seats mode. Nothing at all.
 *
 * Nothing waits on this module: the game never awaits a fact or a save. A refused save is reported
 * through `onSaveFailed` (the app's persistent "Not saved" banner) and the counters stay in memory, so
 * a later successful write keeps everything.
 */
import type { TableController } from '../controller';
import type { KeyValueStore } from '../storage';
import type { Stats } from '../stats';
import type { SceneId } from '../../story/progress';
import type { SeatIndex } from '../../engine/types';
import type { GameEvent } from '../../engine/events';
import { HandObserver, localMatchFacts, MatchObserver, type Facts } from './facts';
import { applyFacts, applyRetro, loadProgress, retroCounts, saveProgress, storyAssisted, storyChapter, type AchProgress } from './progress';

export type TableKind = 'quick-solo' | 'story' | 'local' | 'none';

export interface TableContext {
  readonly kind: TableKind;
  /** Stable per game: the match id, or `story:<case>:<scene>`. Dedupe keys derive from it. */
  readonly gameKey: string;
  /** Resumed from a save (its earlier events were not observed). */
  readonly restored: boolean;
}

export interface TrackerDeps {
  readonly store: KeyValueStore | null;
  now(): number;
  onUnlock(ids: readonly string[], retro: boolean): void;
  onSaveFailed(): void;
  onSaved?(): void;
  /** Per-record write health: the outcome, and a retry that writes the tracker's LATEST progress. */
  onSaveResult?(ok: boolean, retry: () => boolean): void;
}

export class AchievementTracker {
  #p: AchProgress;
  readonly #d: TrackerDeps;
  readonly loadStatus: string;

  constructor(d: TrackerDeps) {
    this.#d = d;
    const r = loadProgress(d.store);
    this.#p = r.progress;
    this.loadStatus = r.status;
  }

  get progress(): AchProgress {
    return this.#p;
  }

  /** Award once what existing records prove (statistics, completed Story scenes). */
  retro(stats: Stats | null, completedScenes: readonly SceneId[]): void {
    const r = applyRetro(this.#p, retroCounts(stats, completedScenes), this.#d.now());
    this.#commit(r.progress, r.fresh, true);
  }

  /** Opened a screen or used a control ("explore.*"): once is enough. */
  note(counter: string): void {
    const r = applyFacts(this.#p, { [counter]: 1 }, this.#d.now(), `note:${counter}`);
    this.#commit(r.progress, r.fresh, false);
  }

  storyChapter(scene: SceneId, outcome: 'win' | 'loss' | 'tie' | 'none', replay: boolean, caseKey: string): void {
    if (replay) return; // replays never change achievements
    const r = storyChapter(this.#p, scene, outcome, caseKey, this.#d.now());
    this.#commit(r.progress, r.fresh, false);
  }

  storyAssist(caseKey: string): void {
    this.#commit(storyAssisted(this.#p, caseKey), [], false);
  }

  /**
   * The listener for one table's applied events (the caller subscribes it to the TableController).
   * `fresh` carries the public hand sizes captured when the game was dealt (before any play), so the
   * first hand counts as observed; null for a restored game.
   */
  listener(controller: TableController, ctx: TableContext, fresh: { readonly sizes: readonly number[] } | null): (events: readonly GameEvent[]) => void {
    if (ctx.kind === 'none') return () => {};
    const s = controller.session;
    const me = (s.humanSeats[0] ?? 0) as SeatIndex;
    const teams = s.rules.teams as readonly (readonly SeatIndex[])[];
    const myTeam = teams.findIndex((t) => t.includes(me));
    const hand = () => new HandObserver({ mode: s.config.mode, me, teams, seatCount: s.rules.seatCount });
    // A restored hand starts unobserved (its earlier events are unknown); the next deal is observed.
    let obs = hand();
    if (fresh && !ctx.restored) obs.prime(fresh.sizes);
    const match = new MatchObserver(!ctx.restored);
    return (events) => {
      if (!events.length) return;
      if (ctx.kind === 'local') {
        const won = events.find((e) => e.type === 'match-won');
        if (won && won.type === 'match-won') {
          const humans = s.humanSeats;
          const partners = humans.length === 2 && teams.some((t) => humans.every((h) => t.includes(h)));
          this.#apply(localMatchFacts({ mode: s.config.mode, humansArePartners: partners, humansWon: teams[won.team]!.includes(me) }), `${ctx.gameKey}:match`);
        }
        return;
      }
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!;
        if (e.type === 'hand-started') obs = hand();
        if (e.type === 'hand-resolved') {
          this.#apply(obs.resolve(e.result), `${ctx.gameKey}:h${e.result.handNumber}`);
          match.hand(e.scores, myTeam);
          continue;
        }
        if (e.type === 'match-won') {
          if (ctx.kind === 'quick-solo') this.#apply(match.won({ mode: s.config.mode, difficulty: s.difficulty, target: s.config.targetScore, myTeam, winnerTeam: e.team, scores: e.scores }), `${ctx.gameKey}:match`);
          continue;
        }
        this.#apply(obs.feed([e]));
      }
    };
  }

  #apply(f: Facts, key?: string): void {
    const r = applyFacts(this.#p, f, this.#d.now(), key);
    this.#commit(r.progress, r.fresh, false);
  }

  #commit(next: AchProgress, fresh: readonly string[], retro: boolean): void {
    if (next === this.#p) return;
    this.#p = next;
    const ok = saveProgress(this.#d.store, next);
    if (this.#d.onSaveResult) this.#d.onSaveResult(ok, () => saveProgress(this.#d.store, this.#p));
    else if (ok) this.#d.onSaved?.();
    else this.#d.onSaveFailed();
    if (fresh.length) this.#d.onUnlock(fresh, retro);
  }
}
