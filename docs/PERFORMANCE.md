# Performance: runtime assets, loading and the byte budget

Every number here was **measured** with `npm run perf`, which profiles the
production build served by `vite preview`, in Chromium. Conditions:

- an emulated 390×844 phone at 3×;
- a "fast 4G" link: 9 Mbps down, 150 ms RTT;
- a 4× CPU slowdown.

The script reports medians of several runs (`PERF_RUNS`, default 3). Single runs
vary by ±20 ms on timings, so never compare single samples.

To measure an older commit with the same script, build it in a worktree and
point `PERF_ROOT` at that checkout. This is how the "before" column below was taken.

## Runtime images are WebP derivatives; the originals are untouched

`npm run assets:derive` (`scripts/build-derivatives.ts`) writes new files to
`assets/generated/web/`. They have the **same pixel dimensions** as their sources,
so every frame rectangle in the manifest still applies. It records the following
in `src/assets/derivatives.json`:

- bytes and sha256;
- the source's sha256;
- encoder settings;
- measured quality: mean premultiplied error, and the p99 error over
  semi-transparent edge pixels, which is the measure of halos.

`npm run assets:verify` re-hashes each derivative and fails if any of these is
true:

- it was built from a different source;
- its dimensions differ from the source's;
- its alpha is not exact;
- `urls.ts` serves the original instead of the derivative.

| Asset | Original PNG | WebP | Encoding | Mean err | Edge p99 |
| --- | ---: | ---: | --- | ---: | ---: |
| Patio backdrop | 2,690 KB | 229 KB | q82 | 4.61 | — (opaque) |
| Weathered tabletop | 2,870 KB | 294 KB | q82 | 4.50 | 14.9 |
| Cousin portrait atlas | 1,496 KB | 291 KB | q88, lossless alpha | 1.46 | 10.9 |
| Slam strip | 1,742 KB | 264 KB | q86, lossless alpha | 2.02 | 12.4 |
| Effects sheet | 634 KB | 224 KB | q88, lossless alpha | 0.12 | 5.6 |
| Tile atlas | 637 KB | 115 KB | **lossless** (pip geometry exact) | 0.00 | 0.0 |
| **Total** | **10,069 KB** | **1,417 KB** | | | |

How to read the error columns:

- Errors are max-channel premultiplied RGB on a 0–255 scale.
- Gates: mean ≤ 3 (≤ 6 for the two opaque backdrops, which are always shown
  under a darkening gradient), edge p99 ≤ 20, alpha bit-exact.
- The e2e pip check still counts every pip at every rotation from screenshots
  of the WebP atlas.

## Loading: essentials first, the rest warmed with bounded concurrency

`src/assets/warm.ts` fetches **and decodes** images (`img.decode()`) through a
queue of **at most 2 concurrent downloads**.

**Deadlines** (hardening pass):
- Every attempt has a 15 s deadline (`WARM_DEADLINE_MS`) and completes exactly once. A stalled fetch or decode
  is abandoned: its download is cancelled, its slot released and the id marked failed (the drawn fallback
  shows meanwhile).
- Each attempt carries its own number, so a late completion from an abandoned or forgotten attempt can't
  change a newer attempt's state.
- A failed id is fetched again only on an explicit retry (`retryWarm`, `warmWithRetry`).
- The scene itself never waits longer than the director's 4 s prepare timeout.
- Tests: `src/assets/warm.test.ts`, and `npm run faults` § E (a backdrop that never answers: the scene
  presents over the fallback and the cast still loads on the other slot).

When images load:

- **At the start screen:** only `ESSENTIAL_ASSETS`, which are the menu backdrop
  and Cousin's portrait.
- **Once the menu is up:** `deferredAssets()` queues the tile atlas and the
  tabletop, then optional art, but only what this device will show:
  - the effects sheet only when motion is allowed;
  - the slam strip only on wide screens with motion and host animation on.
- **On demand:** a table mount moves the atlas and tabletop to the front of the
  queue. Anything skipped loads on first use.
- **Failures:** a failed image resolves `false` and is never retried. Every image
  has a drawn fallback; e2e plays with all rasters blocked.

## Measured: before (Stage 8 build) vs after (Stage 9)

These are 5-run medians from the same script on the same machine. "Before" is
commit 8dc36d2 built in a worktree.

| Metric | Before | After |
| --- | ---: | ---: |
| Bytes before the start screen settles | 4,882 KB | **579 KB** |
| Bytes by the time the menu shows | 4,883 KB | **580 KB** |
| Menu backdrop fully arrived (from navigation) | 7,335 ms | **1,182 ms** |
| Cousin's portrait arrived | 7,321 ms | **1,295 ms** |
| Tabletop art arrived, relative to "Deal the tiles" | +6,026 ms (after) | **−5,678 ms (already warm)** |
| Image bytes in the whole session | 8,331 KB | **1,155 KB** |
| Code bytes (JS + CSS, gzip on the wire) | 57 KB | 59 KB |
| Navigation → start screen | 460 ms | 452 ms |
| Start gesture → menu (includes the fade) | 889 ms | 867 ms |
| "Deal the tiles" → table with atlas faces | 138 ms | 139 ms |
| Worst input → next paint during play (Event Timing) | 80 ms (72–96) | 64 ms (56–72) |
| Longest main-thread task during play | 60 ms (0–75) | 59 ms (54–62) |
| Image decodes ("Decode Image" events) | 12, 75 ms | 5, 132 ms |
| …of which on the renderer main thread | 0 ms | 0 ms |

Reading this honestly:

- **Clear wins:** bytes and the time until art is on screen, by about an order of
  magnitude. Most of the old start-up time went to fetching PNGs.
- **No change:** navigation, start-to-menu and deal-to-table times. These are
  dominated by code and the scripted fade, not by images.
- **Decode CPU went up:** WebP decodes cost more per image than these PNGs did,
  so there are fewer decodes but more total decode milliseconds. **All of it runs
  on raster worker threads** in both builds, with 0 ms on the main thread.
- **Main-thread responsiveness: no regression.** This is not claimed as a win.
  - The longest task during play is 59 ms vs 60 ms. Worst input-to-paint is 64 vs
    80 ms, but the run ranges overlap.
  - An intermediate build of this stage measured 75 ms (64–89). It used a
    document-wide `html:has(#app.is-table)` rule, which was then replaced by a
    class. With the class, the median went back to 59 ms.
  - The trace never showed one dominant child event, so `:has()` is the likely
    cause but not a proven one.
- **Media bytes are not compared.** Music streams on demand after the start
  gesture, and how much of it arrives in the window depends on what else
  competes for the link.

## Byte budget (enforced by `npm run build`)

`scripts/check-dist.mjs` fails the build when any line goes over. The limits
were set from the measured Stage 9 dist with modest headroom. Raise one only on
purpose, with a new measurement, in the same change.

| Budget | Limit | Measured |
| --- | ---: | ---: |
| Code (all JS + CSS + HTML, raw) | 260 KB | 182 KB (≈ 52 KB gzip) |
| All runtime images | 1,700 KB | 1,417 KB |
| Largest single image | 400 KB | 294 KB (tabletop) |
| Start-up set (code + backdrop + portrait, raw) | 760 KB | 702 KB (579 KB on the wire) |
| Media (music, streamed on demand only) | 8,000 KB | 7,332 KB |
| PWA icons (PNG by spec) | 140 KB | 113 KB |
| Service worker + build manifest | 16 KB | 8 KB |
| Whole dist | 9,800 KB | 9,063 KB (Stage 10) |

The build also fails if a PNG original is ever bundled; only the generated PWA icons in `icons/` are PNG. The offline cache holds 1,668,179 B (see `docs/PWA.md`).

## Not measured here (needs real devices)

- Real-network and real-device timings: low-end Android, iOS Safari, Firefox.
- Thermal and battery behaviour.
- Decode cost on hardware without fast WebP decoding.

See the device list in `docs/QA.md`.

## Story: measured with `npm run perf:story` (integration stage, 2026-11-17)

Same conditions (production build, fast-4G emulation, 4× CPU). Single runs; numbers vary run to run.

| Measurement | Portrait 390×844 @3x | Landscape 1366×768 @1x |
| --- | --- | --- |
| Start screen | 471 ms, 546 KB in 7 requests | 454 ms, 685 KB in 7 requests |
| Start tap → menu | 915 ms | 855 ms |
| **Essential bytes to the menu** (code, fonts, the viewport's patio variant, Cousin's portrait) | **546 KB** | **685 KB** |
| Background warm-up by then (table art, offline core files) | 688 KB | 953 KB |

At startup the gates prove **no** PNG source, story backdrop, cast sheet, ambience bed, table/story SFX or the
gameplay track is fetched, and that the patio comes as the viewport's variant (the 90 KB crop on a phone vs
the 229 KB full frame). The menu track streams once the menu plays it.

| Story | Result |
| --- | --- |
| Chapter 1 entry (Continue → revealed, decoded before the curtain opens) | **643 ms** |
| Story layer + chapter + next-chapter prefetch | 1522 KB in 14 requests; images: cast-rafa.webp, cast-marisol.webp, back-alley-portrait.webp, cast-vale.webp |
| Image decode work (trace) | 96.1 ms total, largest 31.6 ms, 4 decodes |
| Next taps (INP proxy, 4× CPU) | 12 taps, worst event **24 ms** |
| **8 chapter visits** (open → 5 lines → case file), visit 2 → 8, after a forced GC | DOM nodes 301 → 301, JS listeners 57 → 57, heap 2.95 → 3.13 MB, live timers 1 → 1, intervals 1 → 1, workers 1 → 1, audio buffer sources 0 → 0, media elements 0 → 0, `<img>` 0 → 0 |

**Memory pressure:** decoded story images are no longer pinned forever. Menu/table art stays pinned; story
images (backdrops, crops, cast) are kept for the 4 most recent keys only (`src/assets/warm.ts`), so a long
case can't hold every decoded chapter (a full-frame backdrop is ~6.3 MB decoded, a portrait crop ~2.7 MB).
Short SFX are decoded per need (UI at the menu, table sounds at a table, story accents in Story) instead of
all 30 at the first tap.

**A measurement trap, recorded so nobody repeats it:** the first leak run showed DOM nodes +249 and listeners
+3 per visit. A heap snapshot showed the retained detached nodes were held by *DevTools global handles*:
Playwright's `waitForSelector` returns an element handle that pins its detached subtree. With waits that hold
no handles, the app shows no growth. A minimal page proved the metric itself is stable.

### Budgets revisited (scripts/check-dist.mjs)

The Story content is on-demand, so instead of raising the image budget, images are now split:

| Budget | Limit | Measured | Why |
| --- | --- | --- | --- |
| core images | 3,300 KB (unchanged) | 3,050 KB | menu/table art + full-frame backdrops |
| story images (on demand) | **1,600 KB (new)** | 1,474 KB | 7 portrait crops + 4 cleaned cast sheets |
| largest chapter | **1,000 KB (new)** | 923 KB (Ch. 3) | what ONE chapter downloads: its backdrop + cast |
| startup | 900 KB (unchanged) | 894 KB build-time (one patio variant + portrait + code + fonts); 546 / 685 KB measured essential | |
| code | 300 KB (unchanged) | 295 KB | the manifest's documentation prose is now stripped from the bundle (−4 KB) |
| story chunks | 130 KB (unchanged) | 113 KB | + the cast frame table |
| service worker | **22 KB (was 16)** | 19 KB | per-file sizes for truncation checks and four groups |
| total | **15,400 KB (was 13,900)** | 15,045 KB | + 1.46 MB of on-demand Story images, none at startup |

**Full offline storage stage (2026-11-18):** a new **offline pack budget, 21,000 KB**: everything the
whole-game download saves (= every shipped file except `sw.js`/`build.json`), measured **20,403 KB**.
- **Service worker 48 KB (was 22)**, measured 43 KB: `sw.js` and `build.json` both carry every file's
  SHA-256 (81 × 64 hex characters each) plus the verification, range and retention code.
- **Counting correction:** `sw.js` used to be counted in **code** (and so in **startup**) although the page
  never loads it — the browser fetches it after `load`. It now has only its own gate. Code measures
  **315 KB / 330** (the page-side download, status and install code is ~3 KB of it); startup **941 KB / 960**.
- **Total 21,100 KB (was 21,000)**, measured 20,446 KB (+24 KB of worker and manifest).
- **When it loads:** nothing new at startup. The whole-game download starts 1.5 s after the menu appears,
  online only, 2 files at a time; `npm run pwa` checks that no Story or media file is requested before the
  menu. Under Data Saver it waits for the player.

**Startup polish stage (2026-11-18):** a separate **video budget, 400 KB**; the studio credit measures 272 KB.
It no longer counts as music.
- **When it loads:** it is fetched only once the essentials are in, at the start prompt (`preload="auto"`
  then), so it never competes with initialization. (Since the full offline storage stage it is also saved
  offline, after the menu.)
- **Totals:** total 20,418 / 21,000 KB; code 327 / 330 KB (the skip guard, the muted retry and the
  soundtrack fade).
- **Startup:** startup stays within 960 KB; the video is not part of it.

**Owner audio stage (2026-11-18):** music **13,500 KB (was 8,000)**, measured 12,757 KB; total **21,000 KB (was
15,400)**, measured 20,147 KB.
- **What grew:** the owner's two scene beds (5,335 KB, stream-copied with cover art removed, which saved
  1.9 MB) and two result cues (90 KB).
- **Rejected:** re-encoding the owner's masters to a lower bitrate (a second lossy generation; the briefs ask
  for ≥ 192 kbps).
- **When it loads:** none of it loads at startup. Music streams per scene, cues decode with the table sounds,
  and offline it is in the optional audio download only (now 15.1 MB, disclosed).
- **SFX:** 576 KB / 720. The owner's three trimmed clips (58 KB) replace three retired stand-ins (36 KB).
- **Code:** 325 KB / 330, of which about 1 KB is the service worker's longer file list. The music manifest's
  `notes` prose is now stripped from the bundle like the image manifest's.
- **Startup:** 951 KB / 960 (948 after the hardening pass).

**Hardening pass (2026-11-18):** code **330 KB (was 320)**, measured 322 KB.
- The +8 KB is resilience code: worker answer validation and the observation-only fallback, media failure
  classification and recovery, per-record save health with Try again, the Retry / Back panels for failed
  chunks, and image deadlines.
- It must be in the core bundle: it handles the failure of the lazy chunks themselves.
- Every other budget is unchanged; startup measured 948 KB / 960 (the code growth carries into it).

**Resort backdrop correction (2026-11-18):** Chapter 3 now downloads the executive terrace (its 3:4 crop is
96 KB) instead of the retired leisure patio, and `resort-patio` is no longer bundled.
- Measured: story images 1,410 KB / 1,600, largest chapter 848 KB / 1,000 (still Ch. 3), total 14,682 KB / 15,400.
- Startup is unchanged: 940 KB / 960.

**Menu polish stage (2026-11-17):** code **310 KB (was 300)**, measured 305 KB raw. The +6 KB is the shared
confirmation sheet, the Achievements page, the per-mode statistics cards, menu Back/Escape history and their
styles; 1 KB of styles for the removed statistics table was deleted. Startup stays under its 900 KB budget.

**Startup stage (2026-11-17):**
- **Code: 320 KB (was 310).** Measured 310.3 KB raw. The +5 KB is initialization progress, retries,
  the text credit, the menu reveal and backgrounding during the credit.
  - The two inline wordmark SVGs are about 29 KB of the core code. Serving them as image files would be
    the next saving, if the budget needs to come down.
- **Startup: 960 KB (was 900).** The start prompt now waits until the tile atlas (115 KB) is decoded, so
  the atlas is counted.
  - Measured: code + fonts + the larger patio variant + Cousin's portrait + tile atlas.

**Stage 3 (2026-11-19): owner art for Chapter 6 and the evidence cards.** +647 KB, all on demand:
the rest area full frame 429 KB (q83, the lowest WebP quality that passes the derivative gate: q80 measured 6.39,
q82 6.06 mean error against a limit of 6) and its 3:4 crop 171 KB; the evidence card 47 KB.
- **Largest chapter 1,150 KB (was 1,000)**, measured 1,122 KB: Chapter 6 is the only chapter the script sets in two
  places (the cave, then the modern entrance rest area where its hand is played). Every other chapter is unchanged
  (max 848 KB, Chapter 3).
- **Total 21,250 KB (was 21,100)**, measured 21,173 KB. Offline pack 20,959 KB / 21,000 (unchanged limit), story
  images 1,581 KB / 1,600 (unchanged), core images 3,153 KB / 3,300 (unchanged), largest image 429 KB / 450.
- Both raises are for the owner-supplied art this stage requires, measured after choosing the smallest passing
  encode; nothing else grew to fit. Nothing new loads at startup.

