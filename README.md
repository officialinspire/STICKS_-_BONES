# STICKS & BONES

Traditional dominoes in Puerto Rico, hosted by Roberto, aka **Cousin**. Planned
modes are two-player **Draw**, two-player **Block** and four-player **Partnership**,
played solo against AI or by two humans sharing one device. It runs entirely in
the browser, with no backend, accounts or online play.

> **Status:** Stage 2. The pure rules engine is complete and tested. The app
> still shows the Stage 1 placeholder screen, and table UI comes next. See
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
| `npm run check` | All of the above in sequence |

## GitHub Pages / subpath hosting

The build uses a **relative base (`./`)** by default, so `dist/` works unchanged
from any subpath (e.g. `https://<owner>.github.io/STICKS_-_BONES/`). To emit
absolute URLs instead, build with `BASE_PATH=/STICKS_-_BONES/ npm run build`.
No deployment workflow is set up yet.

## Layout

```
assets/art/        Owner's source art (unaltered, see assets/art/README.md)
docs/              RULES.md, ENGINE.md, ASSETS.md, BUILD_STATUS.md
scripts/           Asset verification + measurement, dist check
src/engine/        Pure, deterministic, serializable game engine (no DOM)
  rules/presets.ts Versioned rules presets ("Cousin's House Rules" v1)
  match.ts         Command → state + events state machine (see docs/ENGINE.md)
src/assets/        Typed asset manifest, runtime URL registry
src/ui/            Presentation (SVG tiles, sprites, placeholder screen)
```

## Rules

Rules come from versioned presets. The default is **Cousin's House Rules**, the
house defaults at this table, not the only correct Puerto Rican rules. See
[docs/RULES.md](docs/RULES.md).

Art inventory and runtime plan: [docs/ASSETS.md](docs/ASSETS.md) ·
[assets/art/README.md](assets/art/README.md).
