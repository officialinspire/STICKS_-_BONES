/*
 * STICKS & BONES service worker (generated into dist/sw.js by the `sticks-pwa`
 * Vite plugin, which replaces the __SB_BUILD__ and __SB_GROUPS__ placeholders).
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
 * Groups (each file listed with its exact byte size from the build):
 *   shell  → `shell:<build>`  HTML, JS (including the lazy Story chunks), CSS, fonts, manifest, small
 *                             icons. All-or-nothing at install.
 *   core   → `assets:v1`      Menu/table art and the UI/table sounds: Quick Play works fully offline.
 *                             Best effort at install.
 *   story  → `story:v1`       Chapter backdrops (both variants), cast sheets, story accents. Cached as each
 *                             chapter is fetched (so the current and next chapter become offline-ready),
 *                             and in full only when the player chooses "Download the whole story".
 *   audio  → `audio:v1`       Music and ambience beds. OPTIONAL: cached only when the player turns on
 *                             offline audio (its size is shown first). Never cached otherwise; served with
 *                             byte ranges for <audio>. The studio intro video is never cached.
 * Every download is checked against its expected size (a truncated response is never stored), at most
 * 2 at a time; quota errors stop a job and are reported; nothing here ever throws to the page.
 */
const APP = 'inspire:sticks-and-bones';
/* eslint-disable no-undef */
const BUILD = __SB_BUILD__;
const GROUPS = __SB_GROUPS__;
/* eslint-enable no-undef */
const CACHE = { shell: `${APP}:shell:${BUILD}`, core: `${APP}:assets:v1`, story: `${APP}:story:v1`, audio: `${APP}:audio:v1` };
const ours = (name) => name.startsWith(`${APP}:`);
const abs = (u) => new URL(u, self.location.href).href;
const keyOf = (u) => {
  const x = new URL(u);
  return x.origin + x.pathname;
};
/** key → { group, url, bytes } */
const FILES = new Map();
for (const [group, list] of Object.entries(GROUPS)) for (const [u, bytes] of list) FILES.set(keyOf(abs(u)), { group, url: abs(u), bytes });
const INDEX = abs('index.html');
const SCOPE = self.registration.scope;

/** Last problem per group (memory only; the page re-derives status from the caches). */
const lastError = { shell: null, core: null, story: null, audio: null };
const jobs = { core: null, story: null, audio: null };

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || e)));

async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

async function cacheShell() {
  const cache = await caches.open(CACHE.shell);
  // `cache: 'reload'` bypasses the HTTP cache so a new build never stores stale files.
  await cache.addAll(GROUPS.shell.map(([u]) => new Request(abs(u), { cache: 'reload' })));
}

/** Fetch one file and store it only if it is complete (exact expected size). */
async function fetchInto(cache, url, bytes) {
  const res = await fetch(new Request(url, { cache: 'reload' }));
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { missing: res.status === 404 });
  const blob = await res.blob();
  if (bytes && blob.size !== bytes) throw new Error(`truncated: ${blob.size} of ${bytes} bytes`);
  await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(blob.size) } }));
}

/** Download a group's missing files, 2 at a time, with progress. Never throws. */
function cacheGroup(group) {
  if (jobs[group]) return jobs[group];
  jobs[group] = (async () => {
    lastError[group] = null;
    const cache = await caches.open(CACHE[group]);
    const list = GROUPS[group];
    const todo = [];
    let done = 0;
    let bytesDone = 0;
    for (const [u, b] of list) {
      if (await cache.match(abs(u))) {
        done++;
        bytesDone += b;
      } else todo.push([u, b]);
    }
    const total = list.length;
    const bytesTotal = list.reduce((s, [, b]) => s + b, 0);
    let missing = 0;
    const worker = async () => {
      while (todo.length) {
        const [u, b] = todo.shift();
        try {
          await fetchInto(cache, abs(u), b);
          done++;
          bytesDone += b;
        } catch (e) {
          if (isQuota(e)) {
            lastError[group] = 'quota';
            todo.length = 0; // stop: more files won't fit either
          } else if (e && e.missing) missing++;
          else lastError[group] = 'network';
        }
        await broadcast({ type: 'SB_PROGRESS', group, done, total, bytesDone, bytesTotal });
      }
    };
    await Promise.all([worker(), worker()]);
    await broadcast({ type: 'SB_PROGRESS', group, done, total, bytesDone, bytesTotal, missing, error: lastError[group], finished: true });
  })().finally(() => (jobs[group] = null));
  return jobs[group];
}

async function groupStatus(group) {
  const total = GROUPS[group].length;
  const totalBytes = GROUPS[group].reduce((s, [, b]) => s + b, 0);
  // Never create a cache just by asking about it (story/audio exist only once something is saved).
  if (!(await caches.has(CACHE[group]))) return { cached: 0, total, bytes: 0, totalBytes, error: lastError[group], busy: !!jobs[group], have: group === 'story' || group === 'core' ? [] : undefined };
  const cache = await caches.open(CACHE[group]);
  let cached = 0;
  let bytes = 0;
  const have = [];
  for (const [u, b] of GROUPS[group]) {
    if (await cache.match(abs(u))) {
      cached++;
      bytes += b;
      have.push(u);
    }
  }
  return { cached, total: GROUPS[group].length, bytes, totalBytes: GROUPS[group].reduce((s, [, b]) => s + b, 0), error: lastError[group], busy: !!jobs[group], have: group === 'story' || group === 'core' ? have : undefined };
}

async function status() {
  const out = { build: BUILD };
  for (const g of ['shell', 'core', 'story', 'audio']) out[g] = await groupStatus(g);
  return out;
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
      // Only what Quick Play needs; Story files arrive per chapter or by the player's explicit download.
      await cacheGroup('core');
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only this app's caches are ever deleted: old shells, and files no build references.
      for (const name of await caches.keys()) {
        if (ours(name) && name.startsWith(`${APP}:shell:`) && name !== CACHE.shell) await caches.delete(name);
      }
      for (const group of ['core', 'story', 'audio']) {
        if (!(await caches.has(CACHE[group]))) continue; // never create a cache just to prune it
        const c = await caches.open(CACHE[group]);
        for (const req of await c.keys()) {
          const f = FILES.get(keyOf(req.url));
          if (!f || f.group !== group) await c.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

/** A cached full response, cut to the requested byte range (for <audio> elements). */
async function ranged(res, range) {
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  if (!m) return res;
  const buf = await res.arrayBuffer();
  const len = buf.byteLength;
  const start = m[1] === '' ? Math.max(0, len - Number(m[2])) : Number(m[1]);
  const end = m[1] !== '' && m[2] !== '' ? Math.min(len - 1, Number(m[2])) : len - 1;
  if (start >= len || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${len}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${len}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return; // not ours: untouched
  const key = keyOf(req.url);
  if (req.mode === 'navigate') {
    if (key !== keyOf(SCOPE) && key !== keyOf(INDEX)) return;
    // Cache-first: the running build's HTML always matches its cached JS/CSS; updates wait for the player.
    event.respondWith((async () => (await (await caches.open(CACHE.shell)).match(INDEX)) ?? fetch(req))());
    return;
  }
  const f = FILES.get(key);
  if (!f) return; // video and anything unlisted: network only
  if (f.group === 'audio') {
    // Optional offline audio: served from its cache only if the player downloaded it; never cached here.
    event.respondWith(
      (async () => {
        const hit = await (await caches.open(CACHE.audio)).match(f.url);
        return hit ? ranged(hit, req.headers.get('range')) : fetch(req);
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const hit = await (await caches.open(CACHE[f.group])).match(f.url, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && f.group !== 'shell') {
        // Cache-on-fetch (images/SFX the game asked for): the current and prefetched next chapter stay available offline.
        const copy = res.clone();
        event.waitUntil(
          (async () => {
            const blob = await copy.blob();
            if (blob.size !== f.bytes) return; // never store a truncated file
            await (await caches.open(CACHE[f.group])).put(f.url, new Response(blob, { headers: { 'Content-Type': copy.headers.get('Content-Type') || '' } }));
          })().catch((e) => (lastError[f.group] = isQuota(e) ? 'quota' : 'network')),
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
  } else if (msg.type === 'SB_CACHE_GROUP' && ['core', 'story', 'audio'].includes(msg.group)) {
    event.waitUntil(cacheGroup(msg.group).then(status).then(reply));
  } else if (msg.type === 'SB_DROP_GROUP' && ['story', 'audio'].includes(msg.group)) {
    event.waitUntil(caches.delete(CACHE[msg.group]).then(status).then(reply));
  } else if (msg.type === 'SB_REPAIR') {
    // Targeted repair: delete ONLY this app's caches, then download again what the player had chosen.
    const keep = (msg.groups || []).filter((g) => ['story', 'audio'].includes(g));
    event.waitUntil(
      (async () => {
        for (const name of await caches.keys()) if (ours(name)) await caches.delete(name);
        try {
          await cacheShell();
          lastError.shell = null;
        } catch (e) {
          lastError.shell = isQuota(e) ? 'quota' : 'network';
        }
        await cacheGroup('core');
        for (const g of keep) await cacheGroup(g);
        reply(await status());
      })(),
    );
  }
});
