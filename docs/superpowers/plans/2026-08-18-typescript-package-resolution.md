# TypeScript Package Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local TypeScript and Jest resolution explicit for the workspace package while leaving all other `@metamask/*` dependencies on their installed declarations.

**Architecture:** Replace the shared `@metamask/*` wildcard with exact and subpath mappings for `@metamask/snap-networks-utils`. Mirror those mappings in the package Jest configuration so tests and the TypeScript language service select the same local source files.

**Tech Stack:** TypeScript 5.8, Jest 30, Yarn 4, JSON configuration, CommonJS Jest configuration.

## Global Constraints

- Only `@metamask/snap-networks-utils` is resolved to local source.
- All other `@metamask/*` packages use normal package resolution.
- TypeScript and Jest mappings must remain synchronized.
- No runtime source, dependency, or public API changes are introduced.

---

### Task 1: Commit the approved design and implementation plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-18-typescript-package-resolution-design.md`
- Create: `docs/superpowers/plans/2026-08-18-typescript-package-resolution.md`

**Interfaces:**
- Produces the documented resolution rules used by Task 2.

- [ ] **Step 1: Review both documents for placeholders and contradictions**

Confirm that the design identifies the wildcard assumption, the explicit allowlist, Jest synchronization, and validation commands. Confirm that the plan’s paths match the package layout under `packages/`.

- [ ] **Step 2: Commit the documentation**

Run:

```bash
git add docs/superpowers/specs/2026-08-18-typescript-package-resolution-design.md docs/superpowers/plans/2026-08-18-typescript-package-resolution.md
git commit -m "docs: define TypeScript package resolution fix"
```

Expected: one commit containing only the design and implementation plan.

### Task 2: Add explicit local package mappings

**Files:**
- Modify: `tsconfig.packages.json:8-17`
- Modify: `jest.config.packages.js:79-93`

**Interfaces:**
- TypeScript maps `@metamask/snap-networks-utils` to `../snap-networks-utils/src` and `@metamask/snap-networks-utils/*` to `../snap-networks-utils/src/*` relative to each package’s `baseUrl`.
- Jest maps the same package root and subpaths to `<rootDir>/../snap-networks-utils/src` and `<rootDir>/../snap-networks-utils/src/$1`.
- Other `@metamask/*` imports are not intercepted by these local mappings.

- [ ] **Step 1: Write the expected configuration assertion**

Use the existing effective-config commands as the regression check:

```bash
yarn tsc --showConfig -p packages/tron-wallet-snap/tsconfig.json
```

The output must contain exactly the two `@metamask/snap-networks-utils` path patterns and must not contain `@metamask/*`.

- [ ] **Step 2: Run the check before implementation**

Run:

```bash
yarn tsc --showConfig -p packages/tron-wallet-snap/tsconfig.json
```

Expected: the current output contains `"@metamask/*": ["../*/src"]`, demonstrating the behavior being replaced.

- [ ] **Step 3: Update TypeScript configuration**

Replace the wildcard `paths` entry with:

```json
"paths": {
  "@metamask/snap-networks-utils": ["../snap-networks-utils/src"],
  "@metamask/snap-networks-utils/*": ["../snap-networks-utils/src/*"]
}
```

- [ ] **Step 4: Update Jest configuration**

Replace the generic `'^@metamask/(.+)$'` local mapping and fallback with:

```js
'^@metamask/snap-networks-utils$': '<rootDir>/../snap-networks-utils/src',
'^@metamask/snap-networks-utils/(.+)$':
  '<rootDir>/../snap-networks-utils/src/$1',
```

Keep the existing `json-rpc-engine/v2` and `utils/node` special cases unchanged.

- [ ] **Step 5: Commit the configuration change**

Run:

```bash
git add tsconfig.packages.json jest.config.packages.js
git commit -m "fix: resolve only workspace packages locally"
```

Expected: one commit containing only the TypeScript and Jest configuration changes.

### Task 3: Verify local and published resolution behavior

**Files:**
- No additional files.

**Interfaces:**
- Validation demonstrates local root and subpath resolution for the workspace package and normal installed resolution for another `@metamask/*` dependency.

- [ ] **Step 1: Push the pre-validation revision**

Run:

```bash
git push -u origin ulissesferreira/fix-typescript-package-resolution-5832
```

- [ ] **Step 2: Verify effective TypeScript mappings**

Run:

```bash
yarn tsc --showConfig -p packages/tron-wallet-snap/tsconfig.json
```

Expected: both explicit workspace mappings are present and the broad `@metamask/*` mapping is absent.

- [ ] **Step 3: Verify TypeScript resolution traces**

Run:

```bash
yarn tsc --noEmit -p packages/tron-wallet-snap/tsconfig.json --traceResolution
```

Expected: `@metamask/snap-networks-utils` and its `logger` subpath resolve under `packages/snap-networks-utils/src`; `@metamask/snaps-sdk` and `@metamask/utils` resolve under `node_modules/@metamask`.

- [ ] **Step 4: Run affected package type checks**

Run:

```bash
yarn workspace @metamask/snap-networks-utils run build
yarn workspace @metamask/bitcoin-wallet-snap exec tsc --noEmit
yarn workspace @metamask/solana-wallet-snap exec tsc --noEmit
yarn workspace @metamask/tron-wallet-snap exec tsc --noEmit
```

Expected: all commands exit successfully.

- [ ] **Step 5: Run affected tests and repository validation**

Run:

```bash
yarn workspace @metamask/snap-networks-utils run test
yarn workspace @metamask/tron-wallet-snap run test
yarn lint
yarn changelog:validate
```

Expected: all commands exit successfully. If lint removes build output, rebuild the affected package before any subsequent package test.

- [ ] **Step 6: Commit any necessary validation-only corrections**

If formatting or validation identifies a required correction, make the smallest fix, rerun the relevant check, and commit it separately:

```bash
git add <corrected-files>
git commit -m "chore: format TypeScript resolution configuration"
git push
```
