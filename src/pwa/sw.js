/*
 * STICKS & BONES service worker (generated into dist/sw.js by the `sticks-pwa`
 * Vite plugin, which replaces the three __SB_*__ placeholders).
 *
 * Isolation rules — this app shares an origin with other INSPIRE apps on
 * GitHub Pages (https://<owner>.github.io/<app>/):
 *   - It is registered with scope = this app's directory only.
 *   - It only ever opens, reads or deletes caches named `inspire:sticks-and-bones:*`.
 *   - It only answers requests under its own scope; everything else goes to
 *     the network untouched.
 *   - It never unregisters anything and never calls skipWaiting() on its own:
 *     an update waits until the player chooses "Update now".
 *
 * Caches:
 *   shell:<build>  — the minimal app shell (HTML, JS, CSS, manifest, small icons).
 *                    All-or-nothing (cache.addAll): install fails and retries on
 *                    the next visit if any shell file is missing.
 *   assets:v1      — the optimized approved images (WebP derivatives) and the short SFX (WAV). Best effort,
 *                    2 at a time, quota errors reported to the page, never fatal.
 * Music and video are NOT cached (streamed; the game is silent offline).
 */
const APP = 'inspire:sticks-and-bones';
// Build-time placeholders, replaced by the sticks-pwa Vite plugin (the build fails if any remain).
/* eslint-disable no-undef */
const BUILD = __SB_BUILD__;
const SHELL = __SB_SHELL__;
const ASSETS = __SB_ASSETS__;
/* eslint-enable no-undef */
const SHELL_CACHE = `${APP}:shell:${BUILD}`;
const ASSET_CACHE = `${APP}:assets:v1`;
const ours = (name) => name.startsWith(`${APP}:`);
const abs = (u) => new URL(u, self.location.href).href;
const keyOf = (u) => {
  const x = new URL(u);
  return x.origin + x.pathname;
};
const SHELL_KEYS = new Set(SHELL.map((u) => keyOf(abs(u))));
const ASSET_KEYS = new Set(ASSETS.map((u) => keyOf(abs(u))));
const INDEX = abs('index.html');
const SCOPE = self.registration.scope;

/** Last asset-caching problem (kept in memory; the page also re-derives status from the caches). */
let lastError = null;
let assetJob = null;

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || e)));

async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  // `cache: 'reload'` bypasses the HTTP cache so a new build never stores stale files.
  await cache.addAll(SHELL.map((u) => new Request(abs(u), { cache: 'reload' })));
}

/** Download the approved images not yet cached, at most 2 at a time. Never throws. */
function cacheAssets() {
  if (assetJob) return assetJob;
  assetJob = (async () => {
    lastError = null;
    const cache = await caches.open(ASSET_CACHE);
    const todo = [];
    for (const u of ASSETS) if (!(await cache.match(abs(u)))) todo.push(u);
    let done = ASSETS.length - todo.length;
    const worker = async () => {
      while (todo.length) {
        const u = todo.shift();
        try {
          const res = await fetch(new Request(abs(u), { cache: 'reload' }));
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
          await cache.put(abs(u), res);
          done++;
          await broadcast({ type: 'SB_PROGRESS', done, total: ASSETS.length });
        } catch (e) {
          lastError = isQuota(e) ? 'quota' : 'network';
          if (lastError === 'quota') todo.length = 0; // stop: more files won't fit either
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await broadcast({ type: 'SB_PROGRESS', done, total: ASSETS.length, error: lastError });
  })().finally(() => (assetJob = null));
  return assetJob;
}

async function status() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  let shellCached = 0;
  let assetsCached = 0;
  let bytes = 0;
  for (const u of SHELL) {
    const r = await shell.match(abs(u));
    if (r) {
      shellCached++;
      bytes += (await r.blob()).size;
    }
  }
  for (const u of ASSETS) {
    const r = await assets.match(abs(u));
    if (r) {
      assetsCached++;
      bytes += (await r.blob()).size;
    }
  }
  return { build: BUILD, shell: { cached: shellCached, total: SHELL.length }, assets: { cached: assetsCached, total: ASSETS.length }, bytes, error: lastError, busy: !!assetJob };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await cacheShell();
      } catch (e) {
        // Tell open pages why (e.g. storage full); the install fails and is retried on a later visit.
        await broadcast({ type: 'SB_INSTALL_FAILED', error: isQuota(e) ? 'quota' : 'network' });
        throw e;
      }
      // Images are shared between builds (hashed names): warm the new ones now, best effort.
      await cacheAssets();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only this app's caches are ever deleted: old shells, and images no build references.
      for (const name of await caches.keys()) {
        if (ours(name) && name.startsWith(`${APP}:shell:`) && name !== SHELL_CACHE) await caches.delete(name);
      }
      const assets = await caches.open(ASSET_CACHE);
      for (const req of await assets.keys()) if (!ASSET_KEYS.has(keyOf(req.url))) await assets.delete(req);
      await self.clients.claim();
    })(),
  );
});

async function fromCaches(request) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = await shell.match(request, { ignoreSearch: true });
  if (hit) return hit;
  return (await caches.open(ASSET_CACHE)).match(request, { ignoreSearch: true });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return; // not ours: untouched
  const key = keyOf(req.url);
  if (req.mode === 'navigate') {
    if (key !== keyOf(SCOPE) && key !== keyOf(INDEX)) return;
    // Cache-first: the running build's HTML always matches its cached JS/CSS; updates wait for the player.
    event.respondWith(
      (async () => (await (await caches.open(SHELL_CACHE)).match(INDEX)) ?? fetch(req))(),
    );
    return;
  }
  if (!SHELL_KEYS.has(key) && !ASSET_KEYS.has(key)) return; // music, video, anything else: network only
  event.respondWith(
    (async () => {
      const hit = await fromCaches(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && ASSET_KEYS.has(key)) {
        const copy = res.clone();
        event.waitUntil(
          caches
            .open(ASSET_CACHE)
            .then((c) => c.put(req.url.split('?')[0], copy))
            .catch((e) => (lastError = isQuota(e) ? 'quota' : 'network')),
        );
      }
      return res;
    })(),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  const reply = (v) => event.ports[0]?.postMessage(v);
  if (msg.type === 'SB_SKIP_WAITING') {
    self.skipWaiting();
  } else if (msg.type === 'SB_STATUS') {
    event.waitUntil(status().then(reply));
  } else if (msg.type === 'SB_CACHE_ASSETS') {
    event.waitUntil(cacheAssets().then(status).then(reply));
  } else if (msg.type === 'SB_REPAIR') {
    // Targeted repair: delete ONLY this app's caches, then download them again.
    event.waitUntil(
      (async () => {
        for (const name of await caches.keys()) if (ours(name)) await caches.delete(name);
        try {
          await cacheShell();
        } catch (e) {
          lastError = isQuota(e) ? 'quota' : 'network';
        }
        await cacheAssets();
        reply(await status());
      })(),
    );
  }
});
