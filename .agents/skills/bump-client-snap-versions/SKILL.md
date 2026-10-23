---
name: bump-client-snap-versions
description: >-
  Update snap packages on clients. Use when the user says "Update snap packages on clients",
  or asks to bump @metamask/*-wallet-snap versions in metamask-extension or metamask-mobile
  and open the resulting pull requests.
---

# Update snap packages on clients

Bump each Snap published from `MetaMask/internal-snaps` to its latest version on npm in both MetaMask clients. Open one PR per snap per client, following each client's current PR template.

## Inputs

- Optional snap: `tron`, `solana`, `bitcoin`, `stellar`, or a full `@metamask/<name>-wallet-snap`. With no snap, bump every internal `@metamask/*-wallet-snap` dependency that is behind.
- `INTERNAL_SNAPS_DIR`, default `$HOME/Desktop/internal-snaps`.
- `MM_EXTENSION_DIR`, default `$HOME/Desktop/metamask-extension`.
- `MM_MOBILE_DIR`, default `$HOME/Desktop/metamask-mobile`.

## Non-negotiable rules

- "Latest" means the npm `latest` dist-tag, read live from `registry.npmjs.org`. Do not use the local `main` or release branch version: it can be ahead of what is published. Do not trust plain `npm view`: this machine has `offline = true` in `~/.npmrc`, so it can return stale cached versions.
- One PR per snap per client. A single snap produces exactly two PRs: one extension, one mobile.
- Never bump a package the client does not already depend on.
- Plan and bump in temporary worktrees from `origin/main`. Never touch the user's existing checkout: it is often on another branch and dirty.
- Branch: `chore/release-<snap>-snap-version-<version>`.
- Title and commit: ``chore: bump `@metamask/<snap>-wallet-snap` to `^<version>` ``.
- No Jira key in the branch, title, or commit.
- The commit contains only `package.json` and `yarn.lock`.
- Skip a client/package that is already at the latest version, and report it.
- If an open or merged PR, or a local/remote branch, already exists for the branch, skip it and report. Never force-push.
- Follow the client's current `.github/pull-request-template.md`. Do not invent headings.
- Open the PR non-draft, as in the user's previous bump PRs. Do not add labels; CI adds team/size labels.
- Set `CHANGELOG entry: null`. Do not add a `no-changelog` label; previous bump PRs did not.
- The Description must keep the user's structure: "Bumping `<pkg>` to `^<version>` to bring the following changes to the client:" followed by the changelog sections for versions in `(current, target]`, newest first.
- Keep any `mms-check` comments from the mobile template. Remove the other instructional HTML comments.

## Steps

### 1. Preflight

```bash
SNAPS="${INTERNAL_SNAPS_DIR:-$HOME/Desktop/internal-snaps}"
EXT="${MM_EXTENSION_DIR:-$HOME/Desktop/metamask-extension}"
MOBILE="${MM_MOBILE_DIR:-$HOME/Desktop/metamask-mobile}"

test -d "$SNAPS/.git"
test -d "$EXT/.git"
test -d "$MOBILE/.git"
gh auth status
git -C "$SNAPS" fetch origin main --tags
git -C "$EXT" fetch origin main
git -C "$MOBILE" fetch origin main
git -C "$EXT" remote get-url origin
git -C "$MOBILE" remote get-url origin
```

The remotes must be `MetaMask/metamask-extension` and `MetaMask/metamask-mobile`. If a repo is missing, ask the user for its path; do not clone or guess.

### 2. Plan against `origin/main`

Create one temporary worktree per client, detached at `origin/main`:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mm-snap-bump.XXXXXX")"
git -C "$EXT" worktree add --detach "$RUN_DIR/extension" origin/main
git -C "$MOBILE" worktree add --detach "$RUN_DIR/mobile" origin/main
```

List the internal Snap packages:

```bash
jq -r '.name' "$SNAPS"/packages/*/package.json | grep -- '-wallet-snap$'
```

For each client and package:

1. Read the declared range. If it is empty, the client does not depend on the package; skip it.

```bash
pkg="@metamask/tron-wallet-snap"
wt="$RUN_DIR/extension"
range="$(jq -r --arg pkg "$pkg" '.dependencies[$pkg] // .devDependencies[$pkg] // empty' "$wt/package.json")"
```

2. Read the client's resolved version from `yarn.lock`:

```bash
current="$(awk -v key="\"$pkg@npm:$range\":" '$0 == key { getline; print $2; exit }' "$wt/yarn.lock")"
```

3. Read the latest published version live from the registry:

```bash
target="$(curl -fsSL "https://registry.npmjs.org/@metamask%2F${pkg#@metamask/}" | jq -r '."dist-tags".latest')"
```

4. Skip if the client is already current:

```bash
if [ "$(printf '%s\n%s\n' "$current" "$target" | sort -V | tail -1)" = "$current" ]; then
  echo "skip $pkg: already at $current"
fi
```

5. Build the changelog diff. Fetch the changelog at the target tag:

```bash
git -C "$SNAPS" show "$pkg@$target:packages/${pkg#@metamask/}/CHANGELOG.md"
```

Copy the `## [x.y.z]` sections from the top, newest first. Skip `Unreleased`. Stop when you reach `## [<current>]`; do not include it. Demote the headings so `## [x.y.z]` becomes `### [x.y.z]` and `### Category` becomes `#### Category`.

6. Build the Description:

```text
Bumping `<pkg>` to `^<target>` to bring the following changes to the client:

<selected changelog sections>
```

If the target version has no changelog section, stop that bump and report it. Do not bump to a version whose changes cannot be described.

Print the plan before opening anything:

```text
extension  @metamask/tron-wallet-snap   4.2.0 -> 4.3.0
mobile     @metamask/tron-wallet-snap   4.2.0 -> 4.3.0
```

If every plan is a skip, remove the worktrees and report that both clients are already on the latest published versions. Stop.

If the user did not name a snap and more than one snap is behind, ask which snap(s) to bump before opening PRs, showing the plan above. If only one snap is behind, continue automatically.

### 3. Open the PRs

For each non-skipped plan:

#### 3.1 Skip existing work

```bash
git -C "$client" branch --list "$branch"
git -C "$client" ls-remote --heads origin "$branch"
gh pr list --repo "$repo" --head "$branch" --state all --json url,state,number
```

Anything non-empty means the branch or PR already exists. Add it to the skipped report and continue.

#### 3.2 Create the branch from `origin/main`

Use the client's planning worktree, reset it, and branch from `origin/main`:

```bash
git -C "$wt" switch --detach origin/main
git -C "$wt" reset --hard origin/main
git -C "$wt" switch -c "$branch"
```

#### 3.3 Apply the bump

Edit the client's `package.json` and change only the dependency version:

```diff
-    "@metamask/tron-wallet-snap": "^4.2.0",
+    "@metamask/tron-wallet-snap": "^4.3.0",
```

Do not reformat the file or change anything else.

#### 3.4 Update only the lockfile

```bash
(cd "$wt" && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install --mode=update-lockfile)
```

#### 3.5 Verify the diff

```bash
(cd "$wt" && git status --porcelain)
grep -F -A2 "\"$pkg@npm:^$target\":" "$wt/yarn.lock"
```

The status must be exactly `M package.json` and `M yarn.lock`. If anything else changed, abort this bump, reset the worktree, and report the extra files. The lockfile must resolve the target version.

#### 3.6 Commit

```bash
(cd "$wt" && git add package.json yarn.lock && git commit -m "$title")
```

#### 3.7 Build the PR body from the client's template

Read `"$wt/.github/pull-request-template.md"` and write the body to `"$RUN_DIR/body.md"`. Keep the template's headings, order, and `mms-check` comments. Remove the other instructional HTML comments.

Fill the sections with:

- **Description**: the Description built in step 2.
- **Changelog**: `CHANGELOG entry: null`.
- **Related issues**: `Fixes: N/A — dependency version bump only.`
- **Manual testing steps**: `N/A — dependency version bump only. No behavioral changes to the <client> client.` Use `extension` or `mobile`.
- **Screenshots/Recordings**: `### **Before**` with `N/A`, then `### **After**` with `N/A`.
- **Pre-merge author checklist**: check the standard five boxes. Leave the performance checks and reviewer checklist unchecked.

This is the shape the body must have:

```markdown
## **Description**

Bumping `@metamask/tron-wallet-snap` to `^4.3.0` to bring the following changes to the client:

### [4.3.0]

#### Changed

- ...

## **Changelog**

CHANGELOG entry: null

## **Related issues**

Fixes: N/A — dependency version bump only.

## **Manual testing steps**

N/A — dependency version bump only. No behavioral changes to the extension client.

## **Screenshots/Recordings**

### **Before**

N/A

### **After**

N/A

## **Pre-merge author checklist**

- [x] ...
```

For multiple versions, repeat the `### [x.y.z]` blocks newest first.

#### 3.8 Push and open the PR

```bash
git -C "$wt" push -u origin "$branch"
gh pr create --repo "$repo" --base main --head "$branch" \
  --title "$title" --body-file "$RUN_DIR/body.md"
```

Report the URL and continue with the remaining plans.

### 4. Clean up

```bash
git -C "$EXT" worktree remove --force "$RUN_DIR/extension"
git -C "$MOBILE" worktree remove --force "$RUN_DIR/mobile"
```

Remove worktrees only after all PRs are created. If a push or PR creation fails, leave that worktree in place and report its path.

### 5. Report

Return a short table:

```text
PRs opened:
- extension: <url>
- mobile: <url>

Skipped:
- <client> <package>: already at <version>
- <client> <package>: branch or PR already exists
```

If nothing was opened, say so and list the versions checked.

## Failure handling

- Missing npm version or missing git tag: stop that bump and report it. Do not bump to a version that is not on npm.
- `yarn install --mode=update-lockfile` fails: leave the worktree, report the error and its path.
- Diff includes anything other than `package.json` and `yarn.lock`: reset and skip that bump.
- Do not force-push, amend someone else's branch, or delete existing branches.
