# STICKS & BONES

Traditional dominoes in Puerto Rico, hosted by Roberto, aka **Cousin**. Planned
modes are two-player **Draw**, two-player **Block** and four-player **Partnership**,
played solo against AI or by two humans sharing one device. It runs entirely in
the browser, with no backend, accounts or online play.

> **Status:** Stage 5. Draw, Block and Partnership can be played solo against the
> computer (Easy, Normal or Hard; see [docs/AI.md](docs/AI.md)) or by two people
> sharing one device, with a privacy cover between turns (see
> [docs/SHARED_DEVICE.md](docs/SHARED_DEVICE.md)). Games autosave locally and can
> be resumed (versioned saves; see [docs/SAVES.md](docs/SAVES.md)). Cousin hosts with expressions, a slam animation and optional table
> talk; see [docs/PRESENTATION.md](docs/PRESENTATION.md). See
> [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md).

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
| `npm run ai:tournament` | Mirrored seeded AI duels per mode plus decision timing |
| `npm run e2e` | Browser acceptance checks (needs the machine's Playwright + Chromium; not part of `check`) |
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
No deployment workflow is set up yet.

## Layout

```
assets/art/        Owner's source art (unaltered, see assets/art/README.md)
docs/              RULES.md, ENGINE.md, AI.md, SHARED_DEVICE.md, PRESENTATION.md, AUDIO.md, SAVES.md, ASSETS.md, BUILD_STATUS.md
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
src/dev/           Dev-only fixtures and tile contact sheet (not in production)
assets/generated/  Generated derivatives (tile atlas + JSON)
```

## Rules

Rules come from versioned presets. The default is **Cousin's House Rules**, the
house defaults at this table, not the only correct Puerto Rican rules. See
[docs/RULES.md](docs/RULES.md).

Art inventory and runtime plan: [docs/ASSETS.md](docs/ASSETS.md) ·
[assets/art/README.md](assets/art/README.md).
