# Snap migration process guide

This document outlines the process for migrating a MetaMask first-party Snap into the `internal-snaps` monorepo. The migration target is assumed to be based off template-snap-monorepo.

> Prerequisites: `internal-snaps` has been created and prepared to host snaps, its CI is green, and the host repo grants merge access for the migration PRs. The migration target must be in a clean state with all in-flight work merged or rebased. Install `git-filter-repo`.

---

## Phase A: Preparation in the original repository

### [PR#1] Add the migration notice to the README

Add this banner to the top of `README.md`:

```markdown
<table><tr><td><p align="center"><b>⚠️ PLEASE READ ⚠️</b></p><p align="center">This package is currently being migrated to our <a href="<https://github.com/MetaMask/internal-snaps>"><code>internal-snaps</code></a> monorepo. Please do not make any commits to this repository while this migration is taking place, as they will not be transferred over. Also, please re-open PRs that are under active development in the <code>internal-snaps</code> repo.</p></td></tr></table>
```

### [PR#2] Align dependency versions and TypeScript / ESLint / Prettier / Oxfmt configurations with `internal-snaps`

- If the snap's dependency versions are ahead of `internal-snaps`, update the monorepo root first; otherwise, bump the snap to match.
- Copy the relevant tooling configs (`tsconfig.base.json` compiler flags, `.prettierrc.js`, `.oxfmtrc.json`, the shared ESLint config) so the snap satisfies them on the monorepo's tooling.
- Preserve any TypeScript compiler flags enabled in the snap but not in the monorepo.
- **Yarn version**: if the source repo (or the `packages/snap/package.json`) pins `yarn@3.x`, upgrade to Yarn 4 (`yarn set version berry && yarn set version stable`) and re-resolve `yarn.lock` before merging. The monorepo runs Yarn 4; a yarn-3 lockfile will be re-generated on first install in the monorepo regardless, but bumping in the source repo first avoids surprise dependency-resolution diffs at integration time.
- Resolve any errors that result from the alignment.

### [PR#3] Reconcile with `template-snap-monorepo`

Compare `<original-repo>/packages/snap` against the current sample-snap from `internal-snaps` and add anything missing: eslint, jest config, `LICENSE`, etc.

### [PR#4] Cut a final release from the source repo

Cut and publish a final release of the package from the original repository. All subsequent releases happen from `internal-snaps`. Keep the release tag for the changelog link in PR#7.

---

## Phase B: Staging from `internal-snaps`'s `merged-packages/`

### [PR#5] Migrate the source repo's git history into `merged-packages/`

> [!WARNING]
>
> - **Do not rebase** the migration branch: it will disrupt the imported history.
> - **Merge the PR without squashing.** Contact a maintainer to temporarily enable merge commits into `main`.
> - Coordinate with the team to minimise the time the PR stays open; superfluous merge commits to `main` will pollute the migrated git history. If history pollution occurs, replay the migration on a fresh branch before merging.

1.  Navigate to a temporary directory: `cd /tmp`.
2.  Clone a fresh copy of the source repo: `git clone <https://github.com/MetaMask/snap-tron-wallet`>. **Do not** reuse an existing clone: the next step rewrites history irreversibly.
3.  `cd snap-tron-wallet`.
4.  Rewrite history so the snap package lives at the staging path:
    This both isolates the snap package (drops the `packages/site/` test-dapp and any other top-level files) and moves it into the staging directory in a single rewrite. If the source repo is **not** itself a monorepo (i.e. the snap lives at the repo root), use `-path-rename :merged-packages/<name>-snap/` instead.
    `bash
git filter-repo \\
  --path packages/snap/ \\
  --path-rename packages/snap/:merged-packages/tron-wallet-snap/
`
5.  `cd` into your local checkout of `internal-snaps`.
6.  Add the rewritten repo as a remote: `git remote add tron-wallet-snap /tmp/snap-tron-wallet`.
7.  Fetch history without tags: `git fetch tron-wallet-snap --no-tags`.
8.  Create the migration branch: `git checkout -b migrate-tron-wallet-snap`.
9.  Merge the snap into the monorepo: `git merge --allow-unrelated-histories tron-wallet-snap/main`.
10. Open a pull request in `internal-snaps` that reflects the above changes.

### [PR#6] Reset the CHANGELOG, linking back to the old repository

In `merged-packages/tron-wallet-snap/CHANGELOG.md`:

- Replace the file with a fresh CHANGELOG that contains only an empty `## [Unreleased]` section (no historical releases).
- Add a `### Changed` entry under `## [Unreleased]` explaining that the package was migrated, and include a link to the old changelog:
  > This package was migrated from `MetaMask/snap-tron-wallet`. See the source repository for the original changelog.

do **not** try to rewrite the old tag-diff links to point at `internal-snaps`. The old tags do not exist in the new repo, so the links would 404.

### [PR#7] Remove files and directories replaced by the monorepo root

Inside `merged-packages/tron-wallet-snap/`:

- **Remove**: `.github/`, `.git*`, `.depcheckrc.{json,yml}`, `.yarn/`, `.yarnrc.yml`, `yarn.lock`, `.editorconfig`, `.eslint*`, `.prettier*`, `.oxfmtrc*`, `.nvm*`, `lavamoat/`, `simple-git-hooks` config, `node_modules/`, `dist/`, `coverage/`, real `.env` files (keep `.env.example` / `.env.sample`), and top-level `LICENSE` if present alongside `LICENSE.MIT0` / `LICENSE.APACHE2`.
- **Keep**: `src/`, `tests/`, `integration-test/` (if present), `docs/` (snap-internal docs), `scripts/` (snap-internal helpers like `build-preinstalled-snap.js`, `populate-en-locale.js` / `populate-locale.js`, `update-manifest-local.js`), `CHANGELOG.md`, `package.json`, `README.md`, `jest.config.js`, `jest.integration.config.js`, `jest.setup.ts` (if present), custom jest transformers (e.g. `svg-transformer.js`), `babel.config.js` (if jest uses babel), `tsconfig*.json`, `snap.manifest.json`, `snap.config.ts`, `messages.json`, `openrpc.json`, `keyring.openrpc.json`, `images/`, `locales/`, `crowdin.yml`, `.env.example` / `.env.sample`, `LICENSE.MIT0`, `LICENSE.APACHE2`.

Carry over any snap-specific Yarn patches into the monorepo root `.yarn/patches/`. For Tron, this means `tronweb-npm-6.1.0-771b242b6a.patch`. (e.g., Solana and Bitcoin have no patches; this step is no-op for them.)

### [PR#8] Replace config files

- `tsconfig.json`: See sample-snap config.
- `jest.config.js`: keep the snap's existing config (it already does what `@metamask/snaps-jest` expects). Verify its `preset` / `transform` / custom `setupFilesAfterEnv` / custom transformer references (e.g. `<rootDir>/svg-transformer.js`) still resolve under the monorepo's hoisted dependencies. Preserve any `coverageThreshold`, `collectCoverageFrom`, `coveragePathIgnorePatterns`, and `testMatch` overrides.
- If `jest.integration.config.js` (or any other config file) uses ESM `export default` while the rest of the snap is CommonJS, convert it to `module.exports` (or rename to `.mjs`); ESLint in the monorepo rejects the mismatch.
- Keep `babel.config.js` if jest uses babel for transformation.
- Add tsconfig reference paths for upstream dependencies: snaps in `internal-snaps` are leaf packages and do not consume monorepo workspaces, but this may change in the future.

### [PR#9] Align dependencies and build scripts with the monorepo

- Remove redundant build scripts already provided by the monorepo root.
- Remove redundant dev dependencies already listed at the monorepo root. **Exception**: do not remove `typescript`.
- Align dependency versions with the monorepo:
  - If the snap version is ahead, decrement to match the monorepo (or bump the monorepo in a preceding PR).
  - If behind, bump only when there are no resulting breaking changes to resolve.
- **Migrate root-level `resolutions`**: copy any entries from the source repo's root `package.json#resolutions` into the monorepo root `package.json#resolutions`, merging with the existing set. Common offenders: `@metamask/snaps-sdk` (Solana, Bitcoin), `@types/react` / `@types/react-dom` (Solana). If snaps in the monorepo disagree on a pinned version, raise it to a coordination decision before merging.
- **Migrate LavaMoat allow-list entries**: Run `yarn allow-scripts auto` to
- **Move `crowdin.yml`** from the source repo root (or `packages/snap/`) into the package directory so the monorepo's per-package Crowdin tooling treats it independently.
- **Snap-specific**: keep `scripts.build` starting with `mm-snap build` (the monorepo constraint only requires the prefix; chaining `&& yarn locale:build && yarn build-preinstalled-snap`: or `build:locale`, depending on the snap: is supported). Add `scripts.prepublishOnly: mm-snap manifest` so the manifest shasum stays in sync at publish time.
- Edit `package.json` metadata:
  - `repository.url` → `https://github.com/MetaMask/internal-snaps.git`.
  - `homepage` → `https://github.com/MetaMask/internal-snaps/tree/main/packages/tron-wallet-snap#readme`.
  - `bugs.url` → `https://github.com/MetaMask/internal-snaps/issues`.
  - `license` → `(MIT-0 OR Apache-2.0)`.
  - `files`: includes `dist/`, `snap.manifest.json`, `images/`, `locales/`.
  - Add `scripts.changelog:update`: `../../scripts/update-changelog.sh @metamask/tron-wallet-snap`.
  - Add `scripts.changelog:validate`: `../../scripts/validate-changelog.sh @metamask/tron-wallet-snap`.
  - Add `scripts.since-latest-release`: `../../scripts/since-latest-release.sh`.

### [PR#10] Update the README to reflect non-root-package status

- Preserve the opening sentence/paragraph that introduces the snap.
- Add or modify an "Installation" section (see other snap READMEs once they exist, or model after a core non-root package).
- Preserve the "Usage" section.
- Remove "Test", "Build" and other instructions for common development tasks (these now live in the monorepo's `docs/processes/`).
- Add a "Contributing" section that links to the monorepo's `docs/processes/`.

---

## [PR#11] Phase C: Integration into `packages/`

All Phase C steps go in a **single** PR. Coordinate with the team to minimise the time it stays open.

### 1. Move the package from `merged-packages/` to `packages/`

```bash
git mv merged-packages/tron-wallet-snap packages/tron-wallet-snap
yarn install
```

Check the snap's tests pass: `yarn workspace @metamask/tron-wallet-snap run test`.

### 2. Linter and constraints fixes

- `yarn constraints --fix` then `yarn constraints` until clean.
- Verify `scripts.changelog:validate` is present in `package.json` (added in PR#10).
- `yarn allow-scripts auto` if the snap brought new lifecycle scripts. Commit the LavaMoat policy update.
- `yarn lint:eslint --fix --suppress-all` to absorb existing snap-side findings into `eslint-suppressions.json`, then `yarn lint` to confirm clean.
- Update `teams.json`: add `"metamask/tron-wallet-snap": "@MetaMask/networks"` (or the owning team).
- Update `.github/CODEOWNERS`: append `/packages/tron-wallet-snap/ @MetaMask/networks`.

### 4. Resolve or TODO downstream errors

If the migration breaks anything inside the monorepo (rare, since snaps are leaf packages):

- Resolve simple errors in this PR.
- Mark complex/blocked errors with `@ts-expect-error TODO:` and file a follow-up issue.

### 5. Record changes in CHANGELOG `[Unreleased]`

In `packages/tron-wallet-snap/CHANGELOG.md` under `## [Unreleased]`, e.g.:

- `### Changed`
  - Migrated package from `MetaMask/snap-tron-wallet` to `MetaMask/internal-snaps` (no consumer-visible behaviour change).
  - Re-licensed split into `LICENSE.MIT0` + `LICENSE.APACHE2` files (SPDX expression unchanged).

### 6. Finalize merge

- Confirm all tests pass for the snap and for the rest of the monorepo (CI must be green).
- Double-check that any changes that landed on `main` while the PR was open are correctly merged in.

---

## Phase D: Clean-up and release

### Source repo (`snap-tron-wallet`)

1. **Transfer open issues** from the source repo into `internal-snaps` using GitHub's _Transfer issue_ feature. Prepend the title with `[tron-wallet-snap]`.
2. **Lock open PRs** (do not provide a reason). Leave this comment:

   ```markdown
   This library has now been migrated into the internal-snaps monorepo. This PR has been locked and this repo will be archived shortly. Going forward, releases of this library will only include changes made in the internal-snaps repo.

   - Please push this branch to internal-snaps and open a new PR there.
   - Optionally, add a link pointing to the discussion in this PR to provide context.
   ```

   For important PRs, manually migrate them into `internal-snaps` or create follow-up tickets.

3. **[PR#12] Replace the migration notice in `snap-tron-wallet/README.md`** with the archive notice (this replaces the banner added in PR#1):

   ```html
   <table>
     <tr>
       <td>
         <p align="center"><b>⚠️ PLEASE READ ⚠️</b></p>
         <p align="center">
           This package has been migrated to our
           <a href="<https://github.com/MetaMask/internal-snaps>"
             ><code>internal-snaps</code></a
           >
           monorepo, and this repository has been archived. Please note that all
           future development and feature releases will take place in the
           <a href="<https://github.com/MetaMask/internal-snaps>"
             ><code>internal-snaps</code></a
           >
           repository.
         </p>
       </td>
     </tr>
   </table>
   ```

4. **Archive the source repository**. Contact a maintainer to perform this step. Keep tags and the final release intact for npm-package history continuity.

### `internal-snaps`

1. **Fix any `@ts-expect-error TODO:` annotations** added during PR#12. Do this before the first post-migration release if possible.
2. **[PR#13] Cut the first post-migration release** with `yarn create-release-branch -i`.
3. **Verify the preview-build workflow** by opening a no-op PR against the new package and confirming the preview-publish job posts.
