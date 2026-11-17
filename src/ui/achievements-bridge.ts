/**
 * The core-bundle side of achievements: a few lines that load the achievements chunk on demand and
 * never make the game wait for it.
 *
 * - Table events are subscribed SYNCHRONOUSLY through the TableController (the approved boundary)
 *   and buffered until the chunk is ready, so nothing is missed.
 * - The fresh deal's public hand sizes are captured at subscription time.
 */
import type { TableController } from '../app/controller';
import type { TableContext } from '../app/achievements/tracker';
import type { SceneId } from '../story/progress';
import type { Service, ServiceDeps } from './achievements';

let deps: ServiceDeps | null = null;
let service: Promise<Service> | null = null;

export function configureAchievements(d: ServiceDeps): void {
  deps = d;
}

/** Load (once) and start the service; resolves when the tracker is ready. */
export function achievementsReady(): Promise<Service> {
  return (service ??= import('./achievements').then((m) => m.createService(deps!)));
}

const later = (fn: (s: Service) => void) => void achievementsReady().then(fn, () => undefined);

export const achievements = {
  note: (counter: string) => later((s) => s.tracker.note(counter)),
  storyChapter: (scene: SceneId, outcome: 'win' | 'loss' | 'tie' | 'none', replay: boolean, caseKey: string) => later((s) => s.tracker.storyChapter(scene, outcome, replay, caseKey)),
  storyAssist: (caseKey: string) => later((s) => s.tracker.storyAssist(caseKey)),
  renderPage: (el: HTMLElement) => later((s) => s.renderPage(el)),
  /** Follow a table from now on (events are buffered until the chunk has loaded). */
  watch(controller: TableController, ctx: TableContext): () => void {
    if (ctx.kind === 'none') return () => {};
    const v = controller.view();
    const fresh = !ctx.restored && controller.session.phase === 'playing' && v.line.tiles.length === 0 ? { sizes: [...v.handSizes] } : null;
    let queue: (readonly unknown[])[] | null = [];
    let listener: ((e: never) => void) | null = null;
    const off = controller.subscribe((events) => {
      if (queue) queue.push(events);
      else listener?.(events as never);
    });
    later((s) => {
      listener = s.tracker.listener(controller, ctx, fresh) as (e: never) => void;
      for (const b of queue ?? []) listener(b as never);
      queue = null;
    });
    return off;
  },
};
