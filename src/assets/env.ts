/**
 * Which file to show for an environment backdrop on THIS viewport, and where its focal point is.
 * Portrait viewports (no wider than 3:4) get the 3:4 crop centred on the focal point: the same visible
 * area as the full frame under `background-size: cover`, at roughly a third of the bytes.
 */
import { ENV_FOCUS, isEnv, portraitCrop, PORTRAIT_ASPECT } from './focal';
import { IMAGE_ASSETS } from './manifest';
import type { RuntimeAssetId, WarmKey } from './urls';

const QUERY = `(max-aspect-ratio: ${Math.round(PORTRAIT_ASPECT * 4)}/4)`;

export function portraitViewport(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

/** The warm/URL key for an environment on this viewport (non-environment ids pass through). */
export function envKey(id: RuntimeAssetId, portrait = portraitViewport()): WarmKey {
  return isEnv(id) && portrait ? `${id}@portrait` : id;
}

/** CSS background-position that keeps the environment's focal point where the staging wants it. */
export function envPosition(key: WarmKey): string {
  const env = key.replace(/@portrait$/, '');
  if (!isEnv(env)) return '50% 50%';
  const f = ENV_FOCUS[env];
  if (!key.endsWith('@portrait')) return `${pct(f.x)} ${pct(f.y)}`;
  const src = IMAGE_ASSETS.find((a) => a.id === env)!;
  const c = portraitCrop(src.width, src.height, f.x);
  return `${pct((f.x * src.width - c.x) / c.w)} ${pct(f.y)}`;
}
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;

/** Re-pick backdrops when the viewport crosses 3:4 (rotation, split screen). Returns the unsubscribe. */
export function onViewportShape(cb: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
