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
queue of **at most 2 concurrent downloads**:

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
