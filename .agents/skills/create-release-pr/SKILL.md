---
name: create-release-pr
description: >-
  Create the internal-snaps release pull request. Use when the user says
  "Release PR", "Create release PR", "Create release for Bitcoin, Solana,
  Stellar, utils package snaps", or asks to prepare/publish a new monorepo
  release.
---

# Create a release PR

Prepare the next `internal-snaps` release on a `release/<version>` branch with
`yarn create-release-branch`, fix up the changelogs and snap manifests, and open
the release PR with the `no-changelog` label.

## Inputs

- Optional packages: `bitcoin`, `solana`, `stellar`, `tron`, or `utils`
  (`@metamask/snap-networks-utils`). With none, release every package whose
  changelog has consumer-facing changes.
- `REPO`, default `$(git rev-parse --show-toplevel)`.

## Non-negotiable rules

- Start from the repo checkout on `main` with a clean working tree. Stop if
  another release PR is already open.
- Use `yarn create-release-branch`; do not hand-edit versions or move changelog
  sections it owns.
- Branch: `release/<version>`, where `<version>` is the next root major. The
  root version is always `<current root major + 1>.0.0` (for example, `20.0.0`
  after root `19.0.0`). It is not derived from the package bumps.
- PR title and squash commit: `Release/<version>` (capital `R`, slash, version).
  Keep the tool commits `Initialize Release <version>` and
  `Update Release <version>`; do not name a commit `Release/<version>` yourself,
  the squash merge takes the PR title.
- Follow-up commits use `chore: <lowercase imperative>`, e.g.
  `chore: remove uncategorized changelog entries`.
- Add the `no-changelog` label.
- No Jira key in the branch, title, commit, or body.
- Open the PR ready for review, not as a draft.
- Do not release a package with no consumer-facing changes; skip it and report
  it. Skipped packages can still have their dependency range updated by
  `yarn constraints`, without a version bump (as Bitcoin did in
  `Release/19.0.0`).

## Package semver

Decide each bump from the **consumer-facing entries left in `[Unreleased]`**
after cleanup:

| Bump    | Rule                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `major` | Any entry contains `**BREAKING` (including `**BREAKING:**`).                                                                |
| `minor` | Any `Added`, `Changed`, `Deprecated`, `Removed`, or `Security` entry, and no breaking entry.                                |
| `patch` | Every consumer-facing entry is under `Fixed`.                                                                               |
| skip    | Only `Uncategorized`, tests, internal refactors, release commits, or tooling/dependency chores remain, or there is nothing. |

Priority is `major` > `minor` > `patch`. A package can have changes since its
last tag and still be skipped if none of them affect consumers.

## Steps

### 1. Preflight

```bash
REPO="${INTERNAL_SNAPS_DIR:-$(git rev-parse --show-toplevel)}"
cd "$REPO"

git switch main
git pull --ff-only origin main
git fetch origin --tags
gh auth status

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree must be clean before creating a release." >&2
  exit 1
fi

EXISTING="$(gh pr list --repo MetaMask/internal-snaps --state open \
  --search 'head:release/' --json number,title --jq '.[] | "#\(.number) \(.title)"')"
if [ -n "$EXISTING" ]; then
  echo "A release PR is already open:" >&2
  echo "$EXISTING" >&2
  exit 1
fi
```

### 2. Create the branch and release spec

```bash
VERSION="$(node -p "require('./package.json').version.split('.')[0] * 1 + 1 + '.0.0'")"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/internal-snaps-release.XXXXXX")"

EDITOR= yarn create-release-branch --temp-directory "$RUN_DIR"
```

`EDITOR=` runs the tool without an interactive editor. It creates
`release/$VERSION`, commits `Initialize Release $VERSION`, writes
`$RUN_DIR/RELEASE_SPEC.yml` listing every package changed since its last release
tag, and exits.

Confirm the setup:

```bash
git branch --show-current   # release/20.0.0
git log --oneline -1        # Initialize Release 20.0.0
cat "$RUN_DIR/RELEASE_SPEC.yml"
```

If the tool reports there are no packages to release, stop and report that.

### 3. Clean the release changelogs

Review what the tool added:

```bash
git show HEAD -- packages/*/CHANGELOG.md
```

For every package listed in the release spec, edit its `## [Unreleased]`
section:

- Remove entries for release PRs, other packages, tests, internal refactors,
  tooling, and dependency chores that consumers do not notice.
- Move real consumer-facing changes out of `### Uncategorized` into `Added`,
  `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`.
- Reword entries in consumer terms and consolidate related changes.
- Leave no `### Uncategorized` section.

Follow `docs/processes/updating-changelogs.md`. Do not clean packages you are
skipping: the tool restores their changelogs.

### 4. Write the release spec and apply it

Edit `$RUN_DIR/RELEASE_SPEC.yml`. Keep the packages the user asked for, plus any
package the tool requires to satisfy dependency validation:

```yaml
packages:
  '@metamask/stellar-wallet-snap': major
  '@metamask/bitcoin-wallet-snap': null
```

- `major`, `minor`, or `patch` applies that bump.
- `null` skips the package (the generated default).
- `"intentionally-skip"` skips it even when the tool wants it for dependency
  validation. Use only when you are sure the dependent needs no change.
- If the user named a package that is not in the spec, it has no changes since
  its last tag. Report it; do not invent a bump.

Apply the spec:

```bash
yarn create-release-branch --temp-directory "$RUN_DIR"
```

Because the spec exists, the tool does not reopen an editor. It moves each
`[Unreleased]` section into the new version, bumps the package versions, updates
constraints and `yarn.lock`, and commits `Update Release $VERSION`.

Verify:

```bash
git log --oneline -3
git show --stat HEAD
git diff main...HEAD
grep -R "### Uncategorized" packages/*/CHANGELOG.md || true
```

If uncategorized entries remain, fix them and commit:

```bash
git add packages/*/CHANGELOG.md
git commit -m "chore: remove uncategorized changelog entries"
```

### 5. Sync snap manifests

`create-release-branch` does not update `snap.manifest.json`. Build the snaps so
`mm-snap` copies each `package.json` version into its manifest and rewrites the
bundle shasum. Build with `ENVIRONMENT=production`, as the Publish Release
workflow does; each package's local `.env` supplies the RPC/API URLs:

```bash
ENVIRONMENT=production yarn build
git status --short
```

Only `packages/*/snap.manifest.json` should be modified. Revert anything else
that the build touched. Then commit the manifests:

```bash
git add packages/*/snap.manifest.json
git commit -m "chore: sync snap manifest versions and shasums"
```

If a non-released snap's shasum changed because a released dependency range
changed, include it, but do not bump that snap's version.

Check every snap manifest matches its `package.json`:

```bash
for manifest in packages/*/snap.manifest.json; do
  pkg="$(dirname "$manifest")/package.json"
  [ "$(jq -r .version "$pkg")" = "$(jq -r .version "$manifest")" ] ||
    echo "version mismatch: $manifest"
done
```

### 6. Validate

```bash
yarn changelog:validate
yarn lint
```

Fix anything that fails and commit with `chore: ...`. Source changes are already
covered by the Build/Test jobs; no extra test run is needed for a
version-and-changelog-only release.

### 7. Write the PR body

Write `$RUN_DIR/body.md` using the release PR template. Keep this structure
exactly (no `## References` section):

```markdown
## Explanation

This release branch prepares version `20.0.0`. It contains:

- `@metamask/stellar-wallet-snap` `1.3.0` → `2.0.0` (major: <one-line summary>)
- `@metamask/snap-networks-utils` `3.1.0` → `3.2.0` (minor: <one-line summary>)
- `@metamask/bitcoin-wallet-snap` unchanged at `3.2.0`, with its `@metamask/snap-networks-utils` dependency bumped to `^3.2.0`
- Root monorepo version bumped to `20.0.0`

Merging this pull request triggers the Publish Release workflow on `main`.

## Checklist

- [x] I've updated the test suite for new or updated code as appropriate
- [ ] I've updated documentation (JSDoc, Markdown, etc.) for new or updated code as appropriate
- [x] I've communicated my changes to consumers by [updating changelogs for packages I've changed](https://github.com/MetaMask/internal-snaps/tree/main/docs/processes/updating-changelogs.md)
- [ ] I've introduced [breaking changes](https://github.com/MetaMask/internal-snaps/tree/main/docs/processes/breaking-changes.md) in this PR and have prepared draft pull requests for clients and consumer packages to resolve them
```

- One bullet per released package: `` `name` `old` → `new` (`bump`: summary) ``.
  `Release/19.0.0` and `Release/17.0.0` are the reference PRs.
- Add a bullet for a skipped package only when its dependency range changed,
  for example: "`@metamask/bitcoin-wallet-snap` unchanged at `3.2.0`, with its
  `@metamask/snap-networks-utils` dependency bumped to `^3.2.0`".
- Check the breaking-changes box (`[x]`) only when at least one package gets a
  `major` bump. Leave it unchecked otherwise.
- Do not paste the changelog into the body; one short summary per package is
  enough.

### 8. Push and open the PR

```bash
git push -u origin "release/$VERSION"

gh pr create --repo MetaMask/internal-snaps \
  --base main \
  --head "release/$VERSION" \
  --title "Release/$VERSION" \
  --body-file "$RUN_DIR/body.md" \
  --label no-changelog
```

Report the PR URL and the package plan, for example:

```text
Release/20.0.0
- @metamask/stellar-wallet-snap 1.3.0 -> 2.0.0 (major)
- @metamask/snap-networks-utils 3.1.0 -> 3.2.0 (minor)
- @metamask/bitcoin-wallet-snap 3.2.0 (skipped; dependency range only)
```

## Failure handling

- Dependency validation errors: include the dependent package with its own bump,
  or mark it `"intentionally-skip"` when it truly needs no change.
- `yarn build` changes files other than `snap.manifest.json`: stop, revert the
  unrelated changes, and report them.
- `yarn build` fails evaluating a snap because environment values are missing:
  stop and report it. Do not commit a shasum from a failed or partial build.
- Changelog validation fails: fix categories, headings, and links before
  pushing.
- Never force-push, amend another author's branch, or delete an existing release
  branch/PR.
