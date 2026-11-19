# STICKS & BONES

Traditional Puerto Rican dominoes in the browser, hosted by Roberto, aka **Cousin**: two-player **Draw**,
two-player **Block** and four-player **Partnership**, solo against a fair computer or two people sharing one
device, plus the story **NO REST FOR COUSIN** (prologue, seven chapters with one hand each, epilogue). It runs
entirely in the browser, installs as an app and plays offline. There is no backend, account or online play.

> **Status: 1.0.0-rc.3 (release candidate), live at https://officialinspire.github.io/STICKS_-_BONES/.**
> Quick Play, two players and the whole Story are playable end to end. The release workflow (`npm run release`)
> runs every suite in Chromium, Firefox and WebKit under emulation. Still open before a stable 1.0.0 (they need
> people, not more automation): real-device testing, a listening pass, three first-time playthroughs for pacing
> (the build's own estimate is well under the 90–110-minute target), the analytics contract, and the missing media
> listed in [docs/RELEASE_HANDOFF.md](docs/RELEASE_HANDOFF.md) and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
> Progress log: [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) · Story: [docs/STORY_BUILD_STATUS.md](docs/STORY_BUILD_STATUS.md)
> · Changes: [CHANGELOG.md](CHANGELOG.md).

## Setup

Requires Node.js ≥ 20.19 (developed on 22.x).

```bash
npm install
```

```bash
npm run dev
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/`, then a base-path/URL-safety check of the output |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint, including engine-purity rules (no DOM, timers, `Math.random`, or UI/asset imports in `src/engine`) |
| `npm test` | Vitest unit tests |
| `npm run assets:verify` | Re-measure all source art against the typed manifest (bytes, SHA-256, dimensions, frame rects) |
| `npm run assets:measure` | Print freshly measured asset data as JSON |
| `npm run atlas:build` | Regenerate the double-six tile atlas + JSON from the verified material sheet |
| `npm run release` | The release workflow: `check` and `audio:report`, then every browser suite in Chromium, Firefox and WebKit (`--engines`, `--suites`, `--resume`); report in `test-results/release/` |
| `npm run release:sweep` | Every mode × 5 viewports × 100/130 % text, with rotation and background/resume, on the production build (`SB_BROWSER` picks the engine) |
| `npm run ai:tournament` | Mirrored seeded AI duels per mode plus decision timing |
| `npm run e2e` | Browser acceptance checks (needs the machine's Playwright + Chromium; not part of `check`) |
| `npm run qa` | Rendered-screen QA: 8 viewports × 13 screens (including story cast lines and the longest line at 130 % text), layout/target/pip/endpoint metrics, atlas bleed ([docs/QA.md](docs/QA.md)) |
| `npm run a11y` | axe, keyboard, focus traps, screen-reader privacy, reduced motion, safe areas, orientation |
| `npm run perf` | Profile the production build (run `npm run build` first) — see [docs/PERFORMANCE.md](docs/PERFORMANCE.md) |
| `npm run assets:derive` | Rebuild the WebP runtime derivatives (and the environments' 3:4 portrait crops) from the preserved originals |
| `npm run assets:cast` | Rebuild the cleaned, baseline-aligned story cast sheets (`src/assets/cast.json`) |
| `python3 scripts/build-audio.py <sources dir>` | Rebuild the CC0 sound bank and `docs/SOUND_SOURCES.md` from the downloaded originals |
| `npm run story:build` | Rebuild `src/story/script.json` from the approved `docs/STORY_SCRIPT.md` (verbatim) |
| `npm run story:e2e` | Story cinematics in a browser: input, skip, reload mid-scene/mid-hand, missing art, reduced motion, compositions, Story analytics |
| `npm run story:route` | Play the whole case through the UI (bot), every win/loss/tie route, pacing hooks and a clearly labelled pacing model |
| `npm run audio` | Scene soundtrack in a real browser: exact knock motif, no ghost sounds, mute, backgrounding, missing files, bed loops |
| `npm run perf:story` | Startup bytes, chapter entry, decode cost, tap latency and an 8-visit leak check on the production build |
| `python3 scripts/build-fonts.py <dir>` / `python3 scripts/build-wordmark.py <dir>` | Rebuild the font subsets / wordmark vectors (needs `pip install fonttools brotli`; see docs/DESIGN.md) |
| `npm run icons:build` | Rebuild the PWA icons (maskable safe area measured) |
| `npm run matches` | Play complete matches in all 8 supported arrangements (clean console, analytics recorder) |
| `npm run smoke` | CI browser smoke on the production build (`npm run build` first) |
| `npm run pwa` | Installable-PWA acceptance: subpath, offline, interrupted downloads, quota, update, repair ([docs/PWA.md](docs/PWA.md)) |
| `npm run check` | All of the above in sequence |

## Developer tools

In `npm run dev`, the menu has a **Developer tools** panel: a fixed seed, a
"control both seats" mode, force-SVG rendering, layout fixtures (max board,
21-tile hand, both-ends choice) and a link to the tile contact sheet at
`/dev/contact-sheet.html`. None of this is in production builds.

## GitHub Pages / subpath hosting

The build uses a **relative base (`./`)** by default, so `dist/` works unchanged
from any subpath (e.g. `https://<owner>.github.io/STICKS_-_BONES/`). To emit
absolute URLs instead, build with `BASE_PATH=/STICKS_-_BONES/ npm run build`.
`.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages once the owner enables Pages
(source: GitHub Actions); the steps are in [docs/RELEASE_HANDOFF.md](docs/RELEASE_HANDOFF.md). Nothing has been
deployed from this branch.

## Layout

```
assets/art/        Owner's source art (unaltered, see assets/art/README.md)
docs/              RULES.md, ENGINE.md, AI.md, SHARED_DEVICE.md, PRESENTATION.md, AUDIO.md, SAVES.md, ASSETS.md, QA.md, PERFORMANCE.md, PWA.md, ANALYTICS.md, PLAYTEST.md, RELEASE_HANDOFF.md, DESIGN.md, STORY_SCRIPT.md, STORY_BUILD_STATUS.md, BUILD_STATUS.md
scripts/           Asset verification + measurement, dist check
src/engine/        Pure, deterministic, serializable game engine (no DOM)
  rules/presets.ts Versioned rules presets ("Cousin's House Rules" v1)
  match.ts         Command → state + events state machine (see docs/ENGINE.md)
src/assets/        Typed asset manifest, runtime URL registry
src/board/         Pure board layout (wrapping view of the logical chain)
src/render/        Shared pip geometry, atlas/SVG tile renderer
src/app/           GameSession (commands, AI scheduling), TableController + privacy state machine, saves
src/ai/            Fair AI: sanitized observation, Easy/Normal/Hard policies, worker runner
src/ui/            Menu, table screen, dialogs
src/dev/           Dev-only fixtures, tile contact sheet and audio audition (not in production)
src/story/         Story pipeline: verbatim script, chapters/routes, progress, director, staging, captions, timing
src/audio/         The one audio manager, sound bank, scene profiles
src/pwa/           Service worker (app-scoped caches: shell, core, story, optional audio)
assets/audio/      Approved music; CC0 SFX and ambience beds (docs/SOUND_SOURCES.md)
assets/generated/  Generated derivatives (tile atlas, WebP images, portrait crops, cast sheets)
```

## Rules

Rules come from versioned presets. The default is **Cousin's House Rules**, the
house defaults at this table, not the only correct Puerto Rican rules. See
[docs/RULES.md](docs/RULES.md).

Art inventory and runtime plan: [docs/ASSETS.md](docs/ASSETS.md) ·
[assets/art/README.md](assets/art/README.md).
