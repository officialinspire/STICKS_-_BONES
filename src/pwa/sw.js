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
 * Full offline storage (owner-authorized): EVERY shipped runtime file is listed by the build as
 * [path, bytes, sha256], in four groups:
 *   shell → `shell:<build>`  HTML, every JS chunk (lazy Story/achievements included), CSS, fonts, manifest,
 *                            icons, font licences. All-or-nothing at install.
 *   core  → `assets:v1`      Menu/table art (both orientations), UI/table sounds, result cues. Best effort at
 *                            install: Quick Play offline as soon as the worker is installed.
 *   story → `story:v1`       Chapter backdrops (both orientations), cast sheets, story sounds.
 *   media → `media:v1`       Music, ambience beds and the studio intro video.
 * The whole-game download (SB_CACHE_ALL) saves everything still missing, 2 files at a time, then re-reads
 * and re-hashes every stored file; only when all of them match does it write the `verified` marker for
 * this build — the page says "Full game ready offline" only from that marker plus a presence check.
 *
 * Storage rules:
 *   - A response is stored only if it is a complete 200 with exactly the expected bytes and SHA-256
 *     (never a 206, a truncated body or a corrupt copy). It is stored with the right MIME type.
 *   - Files are content-hashed, so a copy already held under the same path (an older build's cache, or
 *     the retired optional `audio:v1` cache) is adopted after re-hashing instead of downloaded again.
 *   - Old media and art stay usable until this build's pack is verified; only then are unreferenced
 *     entries and retired caches removed. Offline, a file the new build hasn't saved yet falls back to
 *     the previous build's copy of the same asset (images, sounds and video only — never code).
 *   - Byte ranges: a single range gets 206 with Content-Range, an unsatisfiable one 416 with
 *     `bytes *\/<length>`, anything else the full 200 (ranges may be ignored, RFC 9110 §14.2).
 *   - Quota errors stop the download and are reported; missing (404) files are counted; corrupt copies
 *     are deleted and fetched again once. Nothing here ever throws to the page.
 */
const APP = 'inspire:sticks-and-bones';
/* eslint-disable no-undef */
const BUILD = __SB_BUILD__;
const GROUPS = __SB_GROUPS__;
/* eslint-enable no-undef */
const GROUP_NAMES = ['shell', 'core', 'story', 'media'];
const CACHE = { shell: `${APP}:shell:${BUILD}`, core: `${APP}:assets:v1`, story: `${APP}:story:v1`, media: `${APP}:media:v1` };
const META = `${APP}:meta:v1`;
/** Retired caches whose files may be adopted, then deleted once this build is verified. */
const RETIRED = [`${APP}:audio:v1`];
const ours = (name) => name.startsWith(`${APP}:`);
const abs = (u) => new URL(u, self.location.href).href;
const keyOf = (u) => {
  const x = new URL(u);
  return x.origin + x.pathname;
};
/** key → { group, url, bytes, sha } in pack order (shell, core, story, media). */
const FILES = new Map();
for (const group of GROUP_NAMES) for (const [u, bytes, sha] of GROUPS[group]) FILES.set(keyOf(abs(u)), { group, rel: u, url: abs(u), bytes, sha });
const ALL = [...FILES.values()];
const TOTAL_BYTES = ALL.reduce((s, f) => s + f.bytes, 0);
const INDEX = abs('index.html');
const SCOPE = self.registration.scope;
const MARKER = abs('__sb-offline-verified');

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  woff2: 'font/woff2',
  webp: 'image/webp',
  png: 'image/png',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webmanifest: 'application/manifest+json',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json',
};
const extOf = (url) => (/\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1] ?? '').toLowerCase();
const typeOf = (url) => TYPES[extOf(url)] || 'application/octet-stream';
/** Media and art may fall back to an older build's copy offline; code never does. */
const SUBSTITUTABLE = new Set(['webp', 'wav', 'mp3', 'mp4']);

/** The download job (one at a time) and what the last one found (memory only). */
let job = null;
let progress = null;
const last = { error: null, missing: 0, corrupt: 0, failed: 0, storage: null };

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || e)));
const fail = (kind, message) => Object.assign(new Error(message), { kind });

async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let out = '';
  for (const b of d) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Our caches only, and never created just by looking. */
async function ownNames() {
  return (await caches.keys()).filter(ours);
}
async function openIf(name) {
  return (await caches.has(name)) ? caches.open(name) : null;
}

/** A complete, checksum-verified copy is stored with these headers. */
function stored(f, body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': typeOf(f.url), 'Content-Length': String(f.bytes), 'Accept-Ranges': 'bytes', 'X-SB-Sha256': f.sha } });
}
async function putVerified(cache, f, buf) {
  if (buf.byteLength !== f.bytes) throw fail('corrupt', `incomplete: ${buf.byteLength} of ${f.bytes} bytes`);
  if ((await sha256(buf)) !== f.sha) throw fail('corrupt', 'checksum mismatch');
  await cache.put(f.url, stored(f, buf));
}

/** The stored copy is this build's file (cheap check: the checksum header written when it was verified). */
async function isGood(cache, f) {
  const r = cache && (await cache.match(f.url, { ignoreSearch: true }));
  return !!r && r.headers.get('X-SB-Sha256') === f.sha && r.headers.get('Content-Length') === String(f.bytes);
}

/** Download one file (or adopt an identical copy we already hold) into its group's cache. */
async function ensure(f, cache) {
  // Adopt: the same path in any of our caches (content-hashed names), after re-hashing it.
  for (const name of await ownNames()) {
    if (name === META) continue;
    const c = await caches.open(name);
    const r = await c.match(f.url, { ignoreSearch: true });
    if (!r || (name === CACHE[f.group] && r.headers.get('X-SB-Sha256') === f.sha)) continue;
    try {
      const buf = await r.arrayBuffer();
      await putVerified(cache, f, buf);
      return 'adopted';
    } catch (e) {
      if (isQuota(e)) throw e;
      if (name === CACHE[f.group]) await c.delete(f.url, { ignoreSearch: true }); // a corrupt copy of our own: drop it
    }
  }
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(30_000, f.bytes / 20)); // ≥ 20 KB/s, or it is a stall
    try {
      const res = await fetch(new Request(f.url, { cache: 'reload', signal: ctl.signal }));
      if (res.status === 404 || res.status === 410) throw fail('missing', `HTTP ${res.status}`);
      if (res.status !== 200) throw fail('network', `HTTP ${res.status}`); // never store a 206 or an error page
      const buf = await res.arrayBuffer();
      await putVerified(cache, f, buf);
      return 'downloaded';
    } catch (e) {
      if (isQuota(e) || (e && e.kind === 'missing')) throw e;
      lastErr = e && e.kind ? e : fail('network', String((e && e.message) || e));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function readMarker() {
  try {
    const c = await openIf(META);
    const r = c && (await c.match(MARKER));
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Remove what this verified build no longer uses: other shells, retired caches, unreferenced entries. */
async function prune() {
  let removed = 0;
  for (const name of await ownNames()) {
    if (name === META || name === CACHE.shell) continue;
    const group = GROUP_NAMES.find((g) => CACHE[g] === name);
    if (!group) {
      await caches.delete(name); // an older shell, the retired audio cache, or anything stale of ours
      removed++;
      continue;
    }
    const c = await caches.open(name);
    for (const req of await c.keys()) {
      const f = FILES.get(keyOf(req.url));
      if (!f || f.group !== group) {
        await c.delete(req);
        removed++;
      }
    }
  }
  return removed;
}

/**
 * The whole-game download: everything missing, then a full re-hash, then the marker and the prune.
 * `deep` re-hashes even when this build is already verified (Repair). Never throws.
 */
function runFull(deep = false) {
  if (job) return job;
  job = (async () => {
    Object.assign(last, { error: null, missing: 0, corrupt: 0, failed: 0 });
    const opened = {};
    try {
      for (const g of GROUP_NAMES) opened[g] = await caches.open(CACHE[g]);
    } catch (e) {
      last.error = isQuota(e) ? 'quota' : 'storage';
      last.storage = String((e && e.message) || e);
      await broadcast({ type: 'SB_PROGRESS', phase: 'done', finished: true, result: { ...last, verified: false } });
      return;
    }
    const marker = await readMarker();
    const todo = [];
    let done = 0;
    let bytesDone = 0;
    for (const f of ALL) {
      if (await isGood(opened[f.group], f)) {
        done++;
        bytesDone += f.bytes;
      } else todo.push(f);
    }
    if (!todo.length && marker && marker.build === BUILD && !deep) {
      progress = null;
      await broadcast({ type: 'SB_PROGRESS', phase: 'done', finished: true, result: { ...last, verified: true } });
      return;
    }
    const total = ALL.length;
    const report = (phase) => {
      progress = { phase, done, total, bytesDone, bytesTotal: TOTAL_BYTES };
      return broadcast({ type: 'SB_PROGRESS', ...progress });
    };
    await report('download');
    const download = async (list) => {
      const queue = [...list];
      const worker = async () => {
        while (queue.length) {
          const f = queue.shift();
          try {
            await ensure(f, opened[f.group]);
            done++;
            bytesDone += f.bytes;
          } catch (e) {
            if (isQuota(e)) {
              last.error = 'quota';
              queue.length = 0; // more files won't fit either
            } else if (e && e.kind === 'missing') last.missing++;
            else if (e && e.kind === 'corrupt') last.corrupt++;
            else last.failed++;
          }
          await report('download');
        }
      };
      await Promise.all([worker(), worker()]);
    };
    await download(todo);
    if (!last.error && last.missing + last.corrupt + last.failed === 0) {
      // Verify: re-read and re-hash every stored file; a damaged copy is dropped and fetched once more.
      done = 0;
      bytesDone = 0;
      const bad = [];
      for (const f of ALL) {
        const r = await opened[f.group].match(f.url, { ignoreSearch: true });
        let ok = false;
        try {
          const buf = r ? await r.arrayBuffer() : null;
          ok = !!buf && buf.byteLength === f.bytes && (await sha256(buf)) === f.sha;
        } catch {
          ok = false;
        }
        if (ok) {
          done++;
          bytesDone += f.bytes;
        } else {
          if (r) await opened[f.group].delete(f.url, { ignoreSearch: true });
          bad.push(f);
        }
        if (done % 8 === 0 || done === total) await report('verify');
      }
      if (bad.length) await download(bad);
    }
    const complete = !last.error && last.missing + last.corrupt + last.failed === 0;
    if (!complete && !last.error) last.error = last.failed ? 'network' : last.corrupt ? 'corrupt' : 'missing';
    if (complete) {
      try {
        const meta = await caches.open(META);
        await meta.put(MARKER, new Response(JSON.stringify({ build: BUILD, files: total, bytes: TOTAL_BYTES }), { headers: { 'Content-Type': 'application/json' } }));
        await prune(); // only now: old media stayed usable until every replacement was verified
      } catch (e) {
        last.error = isQuota(e) ? 'quota' : 'storage';
      }
    } else if (marker && marker.build === BUILD) {
      // This build was verified before, but files are gone or damaged now: it is no longer complete.
      try {
        await (await caches.open(META)).delete(MARKER);
      } catch {
        /* reported through status */
      }
    }
    progress = null;
    await broadcast({ type: 'SB_PROGRESS', phase: 'done', finished: true, done, total, bytesDone, bytesTotal: TOTAL_BYTES, result: { ...last, verified: complete && !last.error } });
  })()
    .catch(async (e) => {
      last.error = isQuota(e) ? 'quota' : 'storage';
      progress = null;
      await broadcast({ type: 'SB_PROGRESS', phase: 'done', finished: true, result: { ...last, verified: false } });
    })
    .finally(() => (job = null));
  return job;
}

/** What is saved right now (cheap: presence and checksum headers, no re-hashing). */
async function status() {
  const out = { build: BUILD, busy: !!job, progress, last: { ...last }, totalBytes: TOTAL_BYTES, totalFiles: ALL.length };
  try {
    const opened = {};
    for (const g of GROUP_NAMES) opened[g] = await openIf(CACHE[g]);
    let good = 0;
    let goodBytes = 0;
    const have = [];
    for (const g of GROUP_NAMES) {
      let cached = 0;
      let bytes = 0;
      for (const [u, b, sha] of GROUPS[g]) {
        const r = opened[g] && (await opened[g].match(abs(u), { ignoreSearch: true }));
        if (!r) continue;
        cached++; // present (a retained older-format copy still plays)
        bytes += b;
        have.push(u);
        if (r.headers.get('X-SB-Sha256') === sha) {
          good++;
          goodBytes += b;
        }
      }
      out[g] = { cached, total: GROUPS[g].length, bytes, totalBytes: GROUPS[g].reduce((s, [, b]) => s + b, 0) };
    }
    out.have = have;
    out.good = good;
    out.goodBytes = goodBytes;
    const marker = await readMarker();
    out.verifiedBuild = marker ? marker.build : null;
    out.verified = !!marker && marker.build === BUILD && good === ALL.length;
    // Verified once, files gone since (the browser evicted or removed them).
    out.damaged = !!marker && marker.build === BUILD ? ALL.length - good : 0;
    // Entries of ours this build doesn't reference (an older build's media/art, kept until this one is verified).
    let retained = 0;
    for (const name of await ownNames()) {
      if (name === META || name === CACHE.shell) continue;
      const group = GROUP_NAMES.find((g) => CACHE[g] === name);
      const c = await caches.open(name);
      for (const req of await c.keys()) {
        const f = FILES.get(keyOf(req.url));
        if (!group || !f || f.group !== group) retained++;
      }
    }
    out.retained = retained;
    out.storage = null;
  } catch (e) {
    out.storage = String((e && e.message) || e); // storage unavailable (private mode, blocked site data)
  }
  return out;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // The shell is all-or-nothing: every file complete and checksum-verified (or adopted).
        const shell = await caches.open(CACHE.shell);
        const queue = ALL.filter((f) => f.group === 'shell');
        const worker = async () => {
          while (queue.length) {
            const f = queue.shift();
            if (!(await isGood(shell, f))) await ensure(f, shell);
          }
        };
        await Promise.all([worker(), worker()]);
      } catch (e) {
        // Tell open pages why (e.g. storage full); the install fails and is retried on a later visit.
        await broadcast({ type: 'SB_INSTALL_FAILED', error: isQuota(e) ? 'quota' : e && e.kind === 'missing' ? 'missing' : 'network' });
        throw e;
      }
      // Quick Play's art and sounds, best effort; the rest arrives with the whole-game download.
      try {
        const core = await caches.open(CACHE.core);
        const list = ALL.filter((f) => f.group === 'core');
        let done = 0;
        const queue = [...list];
        const worker = async () => {
          while (queue.length) {
            const f = queue.shift();
            try {
              if (!(await isGood(core, f))) await ensure(f, core);
              done++;
            } catch (e) {
              if (isQuota(e)) {
                last.error = 'quota';
                queue.length = 0;
              }
            }
            await broadcast({ type: 'SB_PROGRESS', phase: 'install', done, total: list.length, bytesDone: 0, bytesTotal: 0 });
          }
        };
        await Promise.all([worker(), worker()]);
      } catch (e) {
        last.error = isQuota(e) ? 'quota' : 'storage';
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Older shells are code for a build no page runs any more. Media and art are NOT pruned here:
      // they stay usable until this build's whole pack is verified (see prune()).
      for (const name of await ownNames()) if (name.startsWith(`${APP}:shell:`) && name !== CACHE.shell) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

/** Parse a Range header against a length: null = serve the whole file, 'unsatisfiable' = 416. */
function parseRange(h, len) {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null; // malformed or several ranges: ignore it, send 200
  if (m[1] === '') {
    const n = Number(m[2]);
    return n === 0 || len === 0 ? 'unsatisfiable' : { start: Math.max(0, len - n), end: len - 1 };
  }
  const start = Number(m[1]);
  if (m[2] !== '' && Number(m[2]) < start) return null; // invalid: ignore it
  if (start >= len) return 'unsatisfiable';
  return { start, end: m[2] === '' ? len - 1 : Math.min(len - 1, Number(m[2])) };
}

/** Answer from a stored copy with the right MIME type, honouring a byte range (200 / 206 / 416). */
async function respond(hit, req, f) {
  const head = req.method === 'HEAD';
  const type = typeOf(f.url);
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  const range = req.headers.get('range');
  if (!range) {
    const len = hit.headers.get('Content-Length');
    return new Response(head ? null : hit.body, { status: 200, headers: len ? { ...base, 'Content-Length': len } : base });
  }
  const blob = await hit.blob();
  const r = parseRange(range, blob.size);
  if (r === null) return new Response(head ? null : blob, { status: 200, headers: { ...base, 'Content-Length': String(blob.size) } });
  if (r === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${blob.size}` } });
  return new Response(head ? null : blob.slice(r.start, r.end + 1, type), {
    status: 206,
    headers: { ...base, 'Content-Range': `bytes ${r.start}-${r.end}/${blob.size}`, 'Content-Length': String(r.end - r.start + 1) },
  });
}

/** This build's copy, or the same path held elsewhere by us (e.g. the retired audio cache). */
async function lookup(f) {
  const own = await openIf(CACHE[f.group]);
  const hit = own && (await own.match(f.url, { ignoreSearch: true }));
  if (hit) return hit;
  for (const name of await ownNames()) {
    if (name === META || name === CACHE[f.group]) continue;
    const r = await (await caches.open(name)).match(f.url, { ignoreSearch: true });
    if (r) return r;
  }
  return null;
}

/** "<dir>/<stem>-<8-char hash>.<ext>" → "<dir>/<stem>.<ext>": the same asset from another build. */
const stemOf = (url) => {
  const p = new URL(url).pathname;
  const m = /^(.*\/[^/]*?)-[\w-]{8}\.(\w+)$/.exec(p);
  return m ? `${m[1]}.${m[2]}` : null;
};
/** Offline only: an older build's copy of the same image/sound/video, kept until this build is verified. */
async function olderVersion(f) {
  if (!SUBSTITUTABLE.has(extOf(f.url))) return null;
  const want = stemOf(f.url);
  if (!want) return null;
  for (const name of await ownNames()) {
    if (name === META || name.startsWith(`${APP}:shell:`)) continue;
    const c = await caches.open(name);
    for (const req of await c.keys()) if (req.url !== f.url && stemOf(req.url) === want) return c.match(req);
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.url.startsWith(SCOPE)) return; // not ours: untouched
  const key = keyOf(req.url);
  if (req.mode === 'navigate') {
    if (key !== keyOf(SCOPE) && key !== keyOf(INDEX)) return;
    // Cache-first: the running build's HTML always matches its cached JS/CSS; updates wait for the player.
    event.respondWith(
      (async () => {
        const shell = await openIf(CACHE.shell);
        return (shell && (await shell.match(INDEX))) ?? fetch(req);
      })(),
    );
    return;
  }
  const f = FILES.get(key);
  if (!f) return; // unlisted: network only
  event.respondWith(
    (async () => {
      const hit = await lookup(f);
      if (hit) return respond(hit, req, f);
      let res;
      try {
        res = await fetch(req);
      } catch (e) {
        const old = await olderVersion(f);
        if (old) return respond(old, req, f);
        throw e;
      }
      if (res.status === 200 && req.method === 'GET' && !req.headers.get('range')) {
        // Cache-on-fetch: what the game asked for is kept, if (and only if) it is complete and verified.
        const copy = res.clone();
        event.waitUntil(
          (async () => {
            const cache = await caches.open(CACHE[f.group]);
            await putVerified(cache, f, await copy.arrayBuffer());
          })().catch((e) => {
            if (isQuota(e)) last.error = 'quota';
          }),
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
    self.skipWaiting(); // only ever sent by the page after the player chose "Update now"
  } else if (msg.type === 'SB_STATUS') {
    event.waitUntil(status().then(reply));
  } else if (msg.type === 'SB_CACHE_ALL') {
    event.waitUntil(runFull(false).then(status).then(reply));
  } else if (msg.type === 'SB_REPAIR') {
    // App-only repair: stale caches of ours and the marker go; every stored file is re-hashed and a bad
    // copy replaced; what is missing downloads again. Saves and settings (localStorage) are never touched.
    event.waitUntil(
      (async () => {
        try {
          const keep = new Set([...Object.values(CACHE), ...RETIRED]);
          for (const name of await ownNames()) if (!keep.has(name)) await caches.delete(name);
        } catch {
          /* storage unavailable: status says so */
        }
        await runFull(true);
        reply(await status());
      })(),
    );
  }
});
