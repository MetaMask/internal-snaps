# Layered Monorepo Readiness Design

**Date:** 2026-08-08  
**Status:** Approved direction (Approach C)  
**Repo:** `@metamask/internal-snaps`

## Problem

This monorepo combines Core-style library packages (`ts-bridge`, declaration `exports`, Jest source mappers) with Snap packages (`mm-snap`, `snaps-jest`, SES bundle evaluation). Today those layers only work together **after** a full build:

- TypeScript workspace imports resolve through `package.json` `exports` → `dist/`, not through the intended source `paths`
- `@metamask/snaps-jest` requires `dist/bundle.js` even for ordinary unit tests
- `mm-snap` cannot bundle a snap that imports a workspace library unless that library’s `dist/` exists
- CI builds before test; local `yarn` does not

## Goals

After a normal `yarn` (install + lifecycle hooks):

1. Dependencies install correctly
2. TypeScript typechecking works for libraries and snaps
3. **Unit** Jest suites run without a prior Snap bundle build
4. Local and CI full builds continue to work

Explicitly **out of scope for post-install**: Snap SES integration tests (`installSnap`), `mm-snap serve` / watch, and publish artifacts. Those still require `yarn build` (or `yarn build:snaps`).

## Package model (unchanged)

| Kind | Detection | Build tool | Published shape |
|---|---|---|---|
| Library | no `snap.manifest.json` | `ts-bridge` | `dist/*` ESM/CJS + types |
| Snap | has `snap.manifest.json` | `mm-snap` (+ locale / preinstalled helpers) | `dist/bundle.js` + manifest |

Yarn constraints already encode this split; keep them.

## Layered readiness

```text
yarn install
  └─ allow-scripts hook
       └─ build:libs   (ts-bridge packages only)
            ├─ TypeScript via exports/types  ✅
            ├─ mm-snap can resolve workspace libs ✅
            └─ Snap unit Jest (node) ✅

yarn build / CI
  └─ build:libs then build snaps (topological-dev)
       └─ snaps-jest integration / serve / publish ✅
```

## Design decisions

### 1. Post-install builds libraries only

Add `build:libs` that runs `build` for every non-private workspace **without** `snap.manifest.json`, topological by dependency graph.

Wire it into the existing LavaMoat `allow-scripts` after-install hook so a normal `yarn` produces library `dist/` without rebuilding every Snap bundle.

### 2. Fix TypeScript workspace `paths`

`tsconfig.packages.json` currently maps `@metamask/*` → `../*/src`. Because `paths` are resolved relative to the config file that **defines** them (repo root), that pattern points outside the repo and never hits source.

Change the mapping to root-correct paths, e.g. `@metamask/*` → `packages/*/src`, and keep Jest `moduleNameMapper` synchronized. Keep post-install library builds so Node/`mm-snap` consumers of `exports` still work.

Introduce a shared `tsconfig.snaps.json` for Snap packages (JSX from `@metamask/snaps-sdk`, bundler resolution, `skipLibCheck`) to reduce per-snap drift.

### 3. Split Snap Jest surfaces

Default package `test` script stays constraint-compatible, but Snap **unit** Jest configs use the Node environment (no `snaps-jest` server).

`installSnap` / SES tests move under `integration-test/` (or an equivalent dedicated config) and run via `test:integration` after a Snap build — matching bitcoin’s existing pattern.

Root `yarn test` continues to run unit suites. CI keeps build-then-test so packages that still invoke `snaps-jest` in CI remain green; prefer aligning CI unit jobs to the node environment and running integration separately where Docker/env allow.

### 4. Lint must not leave the tree unusable

`lint:eslint` currently deletes all `packages/*/dist`. After eslint, rebuild libraries (`build:libs`) so typecheck / subsequent snap builds keep working.

### 5. Snap build env defaults

Snap configs that validate `ENVIRONMENT` must default to a valid enum value for local builds (e.g. `local`) when unset, so `yarn build` works without a full secrets `.env`.

### 6. Hygiene

- Resolve `examples/*` workspace glob (add stub or remove)
- Fix docs that link to a missing migration guide
- Update getting-started / AGENTS.md for the layered workflow

## Non-goals

- Building all Snap bundles on every `yarn install`
- Replacing `mm-snap` or `ts-bridge`
- Making `installSnap` tests run without a Snap bundle
- Changing release / preview-publish flows beyond needing library `dist/` as they already do

## Success criteria

| Command (fresh clone, after `yarn`) | Expected |
|---|---|
| `yarn typecheck` | Pass |
| `yarn workspace @metamask/snap-networks-utils run test` | Pass |
| `yarn workspace @metamask/tron-wallet-snap run test` (unit) | Pass without snap `dist/bundle.js` |
| `yarn build` | Pass with minimal/default env |
| CI lint-build-test | Pass |
| `yarn workspace … run test:integration` (where defined) | Pass only after snap build (+ env/services as today) |
