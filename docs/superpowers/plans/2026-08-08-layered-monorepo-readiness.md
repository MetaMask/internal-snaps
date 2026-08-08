# Layered Monorepo Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a normal `yarn`, library packages are built, TypeScript works, and Snap **unit** Jest suites run; Snap bundles / `installSnap` tests still require `yarn build`.

**Architecture:** Keep the dual package model (libraries via `ts-bridge`, snaps via `mm-snap`). Fix root TypeScript `paths`, post-install `build:libs` only, split Snap Jest into node unit vs `snaps-jest` integration, and stop lint from leaving library `dist/` wiped.

**Tech Stack:** Yarn 4 workspaces, TypeScript 5.8 project refs/`paths`, Jest 30, `ts-bridge`, `@metamask/snaps-cli` / `@metamask/snaps-jest`, LavaMoat `allow-scripts` yarn plugin.

**Spec:** `docs/superpowers/specs/2026-08-08-layered-monorepo-readiness-design.md`

## Global Constraints

- Do not build Snap bundles in the install hook (libraries only).
- Keep Yarn constraint: Snap `scripts.build` must start with `mm-snap build`; library `scripts.build` must remain the `ts-bridge … --no-references` command.
- Keep package `scripts.test` string required by `yarn.config.cjs` unless that constraint is updated in the same task that changes it.
- Prefer editing shared configs (`tsconfig.packages.json`, `tsconfig.snaps.json`, `jest.config.packages.js`, root `package.json`) over one-off per-snap drift.
- `installSnap` tests must not run under the default unit Jest environment.
- Every consumer-facing behavior change to a published package needs a changelog entry under Unreleased; pure tooling/docs-only root changes do not.

---

## File map

| File                                                                                                                          | Responsibility                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `scripts/build-libs.mjs`                                                                                                      | Discover non-snap workspaces and run their `build` scripts topologically          |
| `package.json`                                                                                                                | `build:libs`, wire into `allow-scripts`, lint rebuild, optional `build:snaps`     |
| `tsconfig.packages.json`                                                                                                      | Root-correct `@metamask/*` → `packages/*/src` paths                               |
| `tsconfig.snaps.json`                                                                                                         | Shared Snap TS compiler defaults                                                  |
| `packages/*/tsconfig.json` (snaps)                                                                                            | Extend `tsconfig.snaps.json`                                                      |
| `jest.config.packages.js`                                                                                                     | Keep mapper in sync with TS paths; document Snap usage                            |
| `jest.config.snaps.unit.js`                                                                                                   | Shared Node-environment unit defaults for snaps                                   |
| `packages/*/jest.config.*` (snaps)                                                                                            | Unit config (node); integration stays `snaps-jest`                                |
| `packages/solana-wallet-snap/**`                                                                                              | Move `installSnap` tests into `integration-test/`                                 |
| `packages/sample-snap/**`                                                                                                     | Move `installSnap` tests into `integration-test/` or dedicated integration config |
| `packages/*/snap.config.ts`                                                                                                   | Safe `ENVIRONMENT` default where validated                                        |
| `yarn.config.cjs`                                                                                                             | Allow Snap `test:integration` script pattern if constrained                       |
| `docs/getting-started/setting-up-your-environment.md`, `AGENTS.md`, `docs/processes/testing.md`, `docs/processes/building.md` | Document layered workflow                                                         |
| `package.json` `workspaces` / `examples/`                                                                                     | Fix empty `examples/*` glob                                                       |
| `.github/workflows/lint-build-test.yml`                                                                                       | Only if unit vs integration split requires CI job changes                         |

---

### Task 1: Fix TypeScript workspace path mapping

**Files:**

- Modify: `tsconfig.packages.json`
- Modify: `jest.config.packages.js` (comment + mapper sanity check only if needed)
- Test: `packages/tron-wallet-snap` typecheck against `@metamask/snap-networks-utils` **without** that package’s `dist/`

**Interfaces:**

- Consumes: existing `@metamask/*` imports in snaps/libs
- Produces: `compilerOptions.paths` of `@metamask/*` → `packages/*/src` resolved from repo root config

- [ ] **Step 1: Confirm the failure without library dist**

```bash
rm -rf packages/snap-networks-utils/dist
yarn workspace @metamask/tron-wallet-snap exec tsc --noEmit 2>&1 | head -20
```

Expected: `TS2307: Cannot find module '@metamask/snap-networks-utils'`

- [ ] **Step 2: Fix paths in `tsconfig.packages.json`**

Replace the paths block with root-correct mappings (paths are resolved relative to this file’s directory — the repo root):

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@metamask/*": ["packages/*/src"]
    }
  }
}
```

Keep the existing comment, but update it to say paths are rooted at the monorepo root (this file), and must stay synchronized with `jest.config.packages.js`.

- [ ] **Step 3: Re-run typecheck without library dist**

```bash
rm -rf packages/snap-networks-utils/dist
yarn workspace @metamask/tron-wallet-snap exec tsc --noEmit
```

Expected: exit 0 (or only pre-existing unrelated errors — none for `snap-networks-utils`).

If it still fails: run `tsc --traceResolution` on one file and verify the candidate is `/workspace/packages/snap-networks-utils/src`, not `/snap-networks-utils/src`. Do **not** “fix” by restoring `dist` in this task.

- [ ] **Step 4: Verify library package still typechecks**

```bash
yarn workspace @metamask/snap-networks-utils exec tsc --noEmit
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add tsconfig.packages.json
git commit -m "fix: resolve TypeScript workspace paths from monorepo root"
```

---

### Task 2: Add shared Snap TypeScript config

**Files:**

- Create: `tsconfig.snaps.json`
- Modify: `packages/bitcoin-wallet-snap/tsconfig.json`
- Modify: `packages/solana-wallet-snap/tsconfig.json`
- Modify: `packages/tron-wallet-snap/tsconfig.json`
- Modify: `packages/sample-snap/tsconfig.json`

**Interfaces:**

- Consumes: `tsconfig.packages.json` (including fixed paths)
- Produces: shared Snap compiler options — JSX from snaps-sdk, `moduleResolution: bundler`, `module: preserve`, `skipLibCheck`, `resolveJsonModule`, `types: ["jest"]`

- [ ] **Step 1: Create `tsconfig.snaps.json`**

```json
{
  "extends": "./tsconfig.packages.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@metamask/snaps-sdk",
    "module": "preserve",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["jest"]
  }
}
```

- [ ] **Step 2: Slim each snap `tsconfig.json` to extend the shared config**

Example for Tron (keep package-specific strictness flags that already differ only if required; prefer moving common flags into `tsconfig.snaps.json`):

```json
{
  "extends": "../../tsconfig.snaps.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM"],
    "target": "es2023",
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "noErrorTruncation": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["**/*.ts", "**/*.tsx", "locales/*.json"]
}
```

Repeat for bitcoin / solana / sample, preserving each package’s intentional `lib`/`target`/`exactOptionalPropertyTypes` differences. Remove redundant duplicates of jsx / moduleResolution / skipLibCheck / types.

- [ ] **Step 3: Typecheck all snaps**

```bash
yarn typecheck
```

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add tsconfig.snaps.json packages/*/tsconfig.json
git commit -m "chore: add shared tsconfig for snap packages"
```

---

### Task 3: Add `build:libs` and run it after install

**Files:**

- Create: `scripts/build-libs.mjs`
- Modify: `package.json` (scripts)
- Optional test helper: none (verify with shell)

**Interfaces:**

- Consumes: Yarn workspaces list; `snap.manifest.json` presence; each lib’s `scripts.build`
- Produces:
  - `yarn build:libs` — builds every non-private workspace without `snap.manifest.json`
  - `yarn build:snaps` — builds every workspace **with** `snap.manifest.json` (topological-dev via foreach)
  - `scripts.allow-scripts` — runs LavaMoat allow-scripts then `yarn build:libs`

- [ ] **Step 1: Add `scripts/build-libs.mjs`**

```js
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const list = spawnSync('yarn', ['workspaces', 'list', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
});

if (list.status !== 0) {
  console.error(list.stderr || list.stdout);
  process.exit(list.status ?? 1);
}

const workspaces = list.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((workspace) => workspace.location !== '.');

const libraries = workspaces.filter(
  (workspace) =>
    !existsSync(join(root, workspace.location, 'snap.manifest.json')),
);

if (libraries.length === 0) {
  console.log('No library workspaces to build.');
  process.exit(0);
}

const names = libraries.map((workspace) => workspace.name);
console.log(`Building libraries: ${names.join(', ')}`);

const result = spawnSync(
  'yarn',
  [
    'workspaces',
    'foreach',
    '--all',
    '--no-private',
    '--topological-dev',
    '--parallel',
    '--interlaced',
    '--verbose',
    ...names.flatMap((name) => ['--include', name]),
    'run',
    'build',
  ],
  { cwd: root, stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 1);
```

If Yarn’s foreach `--include` UX differs in 4.17.1, adjust to an equivalent filter (verify with `yarn workspaces foreach --help`). Fallback: loop `yarn workspace <name> run build` in dependency order from `yarn workspaces list --json` plus each package’s `package.json` deps.

- [ ] **Step 2: Wire root scripts in `package.json`**

Add/adjust:

```json
{
  "scripts": {
    "allow-scripts": "yarn exec allow-scripts && yarn build:libs",
    "build:libs": "node ./scripts/build-libs.mjs",
    "build:snaps": "yarn workspaces foreach --all --no-private --topological-dev --parallel --interlaced --verbose --exclude @metamask/snap-networks-utils run build",
    "setup": "yarn install"
  }
}
```

Notes:

- Prefer excluding by “is snap” in a `build-snaps.mjs` mirror if `--exclude` of only today’s library is too brittle; when a second library appears, update to a snap-detecting script.
- `setup` can remain `yarn install` because `allow-scripts` already chains `build:libs` after install via the Yarn plugin.

- [ ] **Step 3: Verify install hook builds libraries**

```bash
rm -rf packages/snap-networks-utils/dist
yarn allow-scripts
test -f packages/snap-networks-utils/dist/index.d.mts && echo 'libs built'
```

Expected: `libs built`. Snaps’ `dist/bundle.js` should still be absent unless previously built.

- [ ] **Step 4: Verify `mm-snap` can resolve the library**

```bash
ENVIRONMENT=local yarn workspace @metamask/tron-wallet-snap run build
```

Expected: Snap bundle succeeds (no “Package path . is exported … no valid target”).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-libs.mjs package.json
git commit -m "feat: build library packages after yarn install"
```

---

### Task 4: Rebuild libraries after eslint cleans dist

**Files:**

- Modify: `package.json` (`lint:eslint`)
- Modify: `AGENTS.md` (Cursor Cloud caveats)

**Interfaces:**

- Consumes: `build:only-clean`, `build:libs`
- Produces: `lint:eslint` ends with library `dist/` restored

- [ ] **Step 1: Update `lint:eslint`**

Change:

```json
"lint:eslint": "yarn build:only-clean && NODE_OPTIONS='--max-old-space-size=6144' yarn eslint"
```

to:

```json
"lint:eslint": "yarn build:only-clean && NODE_OPTIONS='--max-old-space-size=6144' yarn eslint && yarn build:libs"
```

- [ ] **Step 2: Smoke-test**

```bash
yarn lint:eslint
test -f packages/snap-networks-utils/dist/index.d.mts && echo 'libs restored'
```

Expected: eslint completes; `libs restored`.

- [ ] **Step 3: Update `AGENTS.md` caveat**

Replace the “`yarn lint` deletes `dist/`” bullet with: eslint still cleans `packages/*/dist` before linting, then `build:libs` restores library artifacts; Snap bundles still need `yarn build` / `yarn build:snaps` afterward.

- [ ] **Step 4: Commit**

```bash
git add package.json AGENTS.md
git commit -m "fix: restore library builds after eslint dist clean"
```

---

### Task 5: Shared Snap unit Jest config (Node environment)

**Files:**

- Create: `jest.config.snaps.unit.js`
- Modify: `packages/bitcoin-wallet-snap/jest.config.mjs`
- Modify: `packages/tron-wallet-snap/jest.config.mjs`
- Modify: `packages/solana-wallet-snap/jest.config.js`
- Modify: `packages/sample-snap/jest.config.js` (temporary: may still need integration-only until Task 6)
- Modify: `jest.config.packages.js` (keep mapper; ensure Snap unit configs reuse the same `@metamask/(.*)` workspace→source pattern)

**Interfaces:**

- Consumes: `ts-jest`, workspace source mapper pattern from `jest.config.packages.js`
- Produces: default Snap `test` runs in `testEnvironment: 'node'` and does **not** load `@metamask/snaps-jest` preset

- [ ] **Step 1: Create `jest.config.snaps.unit.js`**

```js
const path = require('path');

module.exports = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: ['./src/**/*.ts', './src/**/*.tsx'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['.*/index\\.ts'],
  coverageProvider: 'babel',
  coverageReporters: ['text', 'html', 'json-summary', 'lcov'],
  resetMocks: true,
  restoreMocks: true,
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/integration-test/'],
  moduleNameMapper: {
    '\\.svg$': 'jest-transform-stub',
    '^@metamask/utils/node$': require.resolve('@metamask/utils/node'),
    '^@metamask/(.+)$': [
      path.join(__dirname, 'packages/$1/src'),
      path.join(__dirname, 'node_modules/@metamask/$1'),
    ],
  },
};
```

- [ ] **Step 2: Point bitcoin/tron/solana unit configs at the shared config**

Example ESM wrapper for bitcoin/tron (`jest.config.mjs`):

```js
// @ts-check
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const shared = require('../../jest.config.snaps.unit.js');

/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: 65.5,
      functions: 62.64,
      lines: 75.29,
      statements: 74.57,
    },
  },
};

export default config;
```

Preserve each package’s existing `coverageThreshold`, `setupFilesAfterEnv`, `maxWorkers`, and SVG transformer overrides.

**Critical:** remove `preset: '@metamask/snaps-jest'` from unit configs.

- [ ] **Step 3: Prove a former failure now passes without Snap bundle**

```bash
rm -rf packages/tron-wallet-snap/dist
yarn workspace @metamask/tron-wallet-snap run jest --no-coverage src/services/assets/AssetsService.test.ts
```

Expected: tests run (PASS or real assertion failures) — **not** `dist/bundle.js does not exist`.

- [ ] **Step 4: Commit**

```bash
git add jest.config.snaps.unit.js packages/*/jest.config.*
git commit -m "test: run snap unit tests in node without snaps-jest"
```

---

### Task 6: Move `installSnap` tests to integration configs

**Files:**

- Create/Modify: `packages/solana-wallet-snap/jest.integration.config.js` (or `.mjs`)
- Create: `packages/solana-wallet-snap/integration-test/` (move installSnap specs here)
- Modify: `packages/solana-wallet-snap/package.json` (add `test:integration`)
- Modify: `packages/sample-snap/jest.config.js`, `package.json`, move `src/index.test.tsx` → `integration-test/`
- Create: `packages/sample-snap/jest.integration.config.js`
- Modify: `packages/bitcoin-wallet-snap` / `tron-wallet-snap` only if needed for script naming consistency
- Modify: `yarn.config.cjs` if a new required script pattern is enforced for snaps

**Interfaces:**

- Consumes: `@metamask/snaps-jest` `installSnap`
- Produces:
  - `yarn workspace <snap> run test` → unit only (no bundle)
  - `yarn workspace <snap> run test:integration` → `snaps-jest` after `yarn build`

- [ ] **Step 1: Inventory current `installSnap` files**

Known today:

- `packages/sample-snap/src/index.test.tsx`
- `packages/solana-wallet-snap/src/index.test.ts` (partially; also has non-installSnap cases — split the file)
- `packages/solana-wallet-snap/src/features/confirmation/views/**/render.test.tsx`
- `packages/bitcoin-wallet-snap/integration-test/*.test.ts` (already correct)

- [ ] **Step 2: Move Solana `installSnap` tests**

1. Create `packages/solana-wallet-snap/integration-test/`.
2. Move render tests that call `installSnap` into that folder (keep imports working; adjust relative paths).
3. Split `src/index.test.ts`: keep pure unit cases (e.g. mocked cronjob handler tests) under `src/`; move `installSnap` cases to `integration-test/on-rpc-request.test.ts` (name freely, but under `integration-test/`).
4. Add:

```js
// packages/solana-wallet-snap/jest.integration.config.js
module.exports = {
  preset: '@metamask/snaps-jest',
  testMatch: ['**/integration-test/**/*.[jt]s?(x)'],
};
```

5. Add script:

```json
"test:integration": "NODE_OPTIONS=--experimental-vm-modules jest --config jest.integration.config.js --reporters=jest-silent-reporter"
```

- [ ] **Step 3: Handle sample-snap**

All current tests use `installSnap`. Move them to `integration-test/` and either:

- Make unit `jest.config.js` use `passWithNoTests: true` and `testMatch` under `src/`, or
- Keep a trivial unit smoke test that does not use `installSnap`

Add `test:integration` like Solana. Root `test:verbose` already excludes sample-snap; keep that unless you intentionally include unit smoke tests later.

- [ ] **Step 4: Verify unit vs integration gate**

```bash
rm -rf packages/solana-wallet-snap/dist
yarn workspace @metamask/solana-wallet-snap run test
```

Expected: unit suites pass without bundle.

```bash
ENVIRONMENT=local yarn workspace @metamask/solana-wallet-snap run build
yarn workspace @metamask/solana-wallet-snap run test:integration
```

Expected: integration suites discover and run under `snaps-jest` (pass/fail based on assertions, but must find the bundle).

- [ ] **Step 5: Update yarn constraints if they reject new scripts**

Only if `yarn constraints` complains. Do not invent constraints for `test:integration` unless useful; if you add one, require snaps to define `test:integration` with a `jest --config` integration config.

- [ ] **Step 6: Commit**

```bash
git add packages/solana-wallet-snap packages/sample-snap yarn.config.cjs
git commit -m "test: move installSnap coverage into snap integration suites"
```

---

### Task 7: Safe Snap build environment defaults

**Files:**

- Modify: `packages/solana-wallet-snap/snap.config.ts`
- Modify: other snap configs only if they validate `ENVIRONMENT` the same way
- Modify: `.env.example` files if present

**Interfaces:**

- Consumes: `process.env.ENVIRONMENT`
- Produces: default `'local'` (or `'test'`) when unset so SES eval accepts the value

- [ ] **Step 1: Reproduce**

```bash
env -u ENVIRONMENT yarn workspace @metamask/solana-wallet-snap run build 2>&1 | tail -30
```

Expected (today): SES error about `ENVIRONMENT` received `""`.

- [ ] **Step 2: Default the env in `snap.config.ts`**

```ts
const environment = {
  ENVIRONMENT: process.env.ENVIRONMENT || 'local',
  // ...unchanged keys
};
```

Use `||` (not `??`) so empty string also falls back.

- [ ] **Step 3: Re-run build without ENVIRONMENT**

```bash
env -u ENVIRONMENT yarn build
```

Expected: all library + snap builds succeed (CI secrets still override when present).

- [ ] **Step 4: Commit**

```bash
git add packages/solana-wallet-snap/snap.config.ts
git commit -m "fix: default solana snap ENVIRONMENT to local for builds"
```

---

### Task 8: Workspace and docs hygiene

**Files:**

- Modify: `package.json` (`workspaces`) **or** create `examples/.gitkeep` + placeholder — prefer removing `examples/*` until an example exists
- Modify: `docs/README.md` (remove or fix dead migration-guide link)
- Modify: `docs/getting-started/setting-up-your-environment.md`
- Modify: `docs/processes/building.md`
- Modify: `docs/processes/testing.md`
- Modify: `AGENTS.md`

**Interfaces:**

- Produces: accurate contributor workflow for layered readiness

- [ ] **Step 1: Fix workspaces glob**

In root `package.json`, change:

```json
"workspaces": [
  "packages/*"
]
```

(unless you intentionally add an `examples` package in this same change).

- [ ] **Step 2: Update getting-started**

After `yarn install`, document that library packages are built automatically via `allow-scripts` → `build:libs`. Then:

```bash
yarn typecheck
yarn test
yarn build          # when you need snap bundles / integration tests / serve
```

- [ ] **Step 3: Update building + testing process docs**

State clearly:

- `yarn build:libs` — shared packages (`ts-bridge`)
- `yarn build` / `yarn build:snaps` — snap bundles
- `yarn test` — unit tests (node for snaps)
- `yarn workspace <snap> run test:integration` — requires built snap

- [ ] **Step 4: Fix docs index**

Remove the link to missing `./processes/snap-migration-process-guide.md` or add a stub page that says the guide is not in-tree yet (prefer remove until content exists).

- [ ] **Step 5: Commit**

```bash
git add package.json docs AGENTS.md
git commit -m "docs: describe layered install, typecheck, and test workflow"
```

---

### Task 9: CI alignment

**Files:**

- Modify: `.github/workflows/lint-build-test.yml` only as needed

**Interfaces:**

- Consumes: build artifacts upload/download
- Produces: CI unit tests match local unit semantics; integration remains optional/separate

- [ ] **Step 1: Decide CI matrix behavior**

Keep current flow (build all → download dist → `yarn workspace … run test`) — this remains valid and still exercises packages after a full build.

Optional improvement in this task (recommended if low-risk):

- Unit job can run **without** snap artifacts once Task 5/6 landed
- Add a separate `test-integration` job for snaps that define `test:integration`, needing build artifacts (+ secrets/services as today)

Minimum for this plan: ensure CI still passes with the new unit configs. Do not delete the build job.

- [ ] **Step 2: Run the same commands CI runs**

```bash
yarn build
yarn test:scripts
yarn workspaces foreach --all --exclude @metamask/sample-snap --parallel --verbose run test
```

Expected: pass (sample excluded as today, or included if it now has unit smoke tests).

- [ ] **Step 3: Commit only if workflow files changed**

```bash
git add .github/workflows/lint-build-test.yml
git commit -m "ci: align snap unit and integration test jobs"
```

---

### Task 10: End-to-end verification on a clean tree

**Files:**

- None (verification only); fix regressions found in earlier tasks

- [ ] **Step 1: Clean artifacts and reinstall**

```bash
rm -rf packages/*/dist node_modules
yarn install
```

Expected: install ends with `build:libs` success; `packages/snap-networks-utils/dist` exists; snap `dist/bundle.js` files absent.

- [ ] **Step 2: TypeScript + unit tests**

```bash
yarn typecheck
yarn test
```

Expected: both pass.

- [ ] **Step 3: Full build + one integration suite**

```bash
yarn build
yarn workspace @metamask/bitcoin-wallet-snap run test:integration
```

Expected: build pass; bitcoin integration either runs (if Docker available) or fails only on missing Docker — not on missing bundle. If Docker is unavailable in the agent environment, substitute:

```bash
yarn workspace @metamask/sample-snap run test:integration
```

(after sample migration), which should not need Docker.

- [ ] **Step 4: Lint**

```bash
yarn lint
test -f packages/snap-networks-utils/dist/index.d.mts && echo 'libs ok after lint'
```

Expected: lint pass; libraries restored.

- [ ] **Step 5: Final commit if verification required fixes**

```bash
git add -A
git commit -m "fix: address layered readiness verification gaps"
```

Only commit if there are real fixes; otherwise stop.

---

## Self-review

| Spec requirement                   | Task          |
| ---------------------------------- | ------------- |
| Post-install library builds only   | Task 3        |
| TypeScript works after install     | Tasks 1–3     |
| Unit Jest after install            | Tasks 5–6     |
| Snap integration still needs build | Task 6        |
| Local/CI builds work               | Tasks 7, 9–10 |
| Lint does not leave libs broken    | Task 4        |
| Shared snap TS config / less drift | Task 2        |
| Docs + workspaces hygiene          | Task 8        |
| Env default for snap builds        | Task 7        |

No TBD placeholders. Script names (`build:libs`, `build:snaps`, `test:integration`, `allow-scripts`) are consistent across tasks.
