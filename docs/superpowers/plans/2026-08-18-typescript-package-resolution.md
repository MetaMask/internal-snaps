# TypeScript Package Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript and Jest resolve workspace `@metamask/*` packages from monorepo `packages/*/src` while published scoped packages keep using `node_modules`.

**Architecture:** Root-relative wildcard mappings for package roots and subpaths, a Snap-specific config with `composite: false`, and a Jest mapper that tries local source then the installed package.

**Tech Stack:** TypeScript 5.8, Jest 30, Yarn 4, JSON configuration, CommonJS Jest configuration.

## Global Constraints

- Only `@metamask/*` packages with matching source under `packages/*/src` are resolved locally.
- Other `@metamask/*` packages use normal package resolution.
- Package-root and subpath imports must both resolve.
- TypeScript and Jest mappings must remain synchronized.
- Snap package configs use `composite: false` and avoid a conflicting `baseUrl`.
- No runtime source, dependency, or public API changes are introduced.

---

### Task 1: Apply the root-relative resolution configuration

**Files:**

- Modify: `tsconfig.packages.json`
- Create: `tsconfig.snaps.json`
- Modify: `jest.config.packages.js`
- Modify: `packages/*/tsconfig.json`
- Modify: `scripts/create-package/package-template/tsconfig.json`

**Interfaces:**

- TypeScript maps `@metamask/*` to `./packages/*/src` and `@metamask/snap-networks-utils/*` to that package's `src/*`.
- Snap configs inherit `composite: false` from `tsconfig.snaps.json`.
- Jest maps `packages/<name>/src` first and falls back to `node_modules/@metamask/<name>`.

- [x] **Step 1: Update TypeScript, Snap, and Jest configuration**
- [ ] **Step 2: Commit the configuration change**

```bash
git add tsconfig.packages.json tsconfig.snaps.json jest.config.packages.js packages/*/tsconfig.json scripts/create-package/package-template/tsconfig.json docs/superpowers
git commit -m "fix: resolve workspace packages from the monorepo root"
```

### Task 2: Verify local and published resolution behavior

- [ ] **Step 1: Verify effective TypeScript mappings**

```bash
yarn tsc --showConfig -p packages/tron-wallet-snap/tsconfig.json
yarn tsc --showConfig -p packages/solana-wallet-snap/tsconfig.json
```

Expected: Snap configs have `composite: false`. Tron has no `baseUrl` and inherits the root-relative mappings. Solana re-declares the same mappings relative to its `baseUrl`.

- [ ] **Step 2: Run affected package type checks**

```bash
yarn tsc --noEmit -p packages/bitcoin-wallet-snap/tsconfig.json
yarn tsc --noEmit -p packages/solana-wallet-snap/tsconfig.json
yarn tsc --noEmit -p packages/tron-wallet-snap/tsconfig.json
yarn tsc --noEmit -p packages/stellar-wallet-snap/tsconfig.json
yarn tsc --noEmit -p packages/snap-networks-utils/tsconfig.json
```

- [ ] **Step 3: Run library tests, lint, and changelog validation**

```bash
yarn workspace @metamask/snap-networks-utils run test
yarn lint
yarn changelog:validate
```
