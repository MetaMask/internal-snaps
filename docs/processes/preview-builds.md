# Publishing and using preview builds

Preview builds are pre-production versions of packages. Unlike [local builds](./local-builds.md), they are published to NPM (albeit under a separate NPM namespace) and can therefore be treated the same way as production releases in CI. Because of this, we recommend using preview builds for testing.

Generally, when working with preview builds, you will follow this process:

1. Create a branch in your clone of this repo
2. Work on changes to your package(s)
3. [Publish preview builds](#publishing-preview-builds)
4. Switch to the project and [configure it to use the new preview builds](#using-preview-builds)
5. Repeat steps 2-4 as necessary

## Publishing preview builds

To publish preview builds:

1. Create a pull request with the changes to your package(s).
2. Post a comment on the pull request with the text `@metamaskbot publish-preview`. The `publish-preview` GitHub action will kick off to generate and publish preview builds for all packages in the monorepo.
3. After a few minutes, you will see a new comment that lists the newly published packages along with their versions.

This workflow is available to members of the MetaMask engineering team on GitHub. Independent contributors should use [local builds](./local-builds.md) instead.

## Using preview builds

To simulate production as best as possible, there are two different paths to take depending on whether you anticipate making breaking or non-breaking changes to the package you want to test.

### Testing non-breaking changes to a package

If you're in a MetaMask client repo (e.g. `metamask-extension` or `metamask-mobile`):

1. Open `package.json` and locate the `previewBuilds` section. If it doesn't exist, then add it (it should be an object).
2. Within `previewBuilds`, add an entry that looks like this:

   ```
   "<name-of-package>": {
     "type": "non-breaking",
     "previewVersion": "<preview-version>"
   }
   ```

   For example:

   ```
   "@metamask/permission-controller": {
     "type": "non-breaking",
     "previewVersion": "13.0.2-preview-940c934"
   }
   ```

3. Run `yarn install`. You're now using the preview build.

<details>
<summary><strong>Manual steps</strong></summary>

1. In the project, open `package.json` and locate the entry in `dependencies` for the package. Take note of the major part of the version.
   - Note that the dependency may be patched. Patched dependencies look like this:

     ```json
     "@metamask/<PACKAGE_NAME>": "patch:@metamask/<PACKAGE_NAME>@npm:<ESCAPED_VERSION_RANGE>#~/.yarn/patches/<PATCH_NAME>.patch"
     ```

     where:
     - `PACKAGE_NAME` is the name of the package.
     - `ESCAPED_VERSION_RANGE` is the version range, but where characters like `^` are escaped (for instance, `^` will appear as `%3A`).
     - `PATCH_NAME` is the filename for a patch. It is usually dash-separated, starts with the package name, and ends with the commit ID from which the patch was created.

     In this case the major version you are targeting will come from `ESCAPED_VERSION_RANGE`.

2. Run `yarn why @metamask/<PACKAGE_NAME>`, replacing `PACKAGE_NAME` as appropriate. You will see output like this:

   ```
   ├─ @metamask/parent-controller-1@npm:93.1.0
   │  └─ @metamask/my-controller@npm:12.1.1 (via npm:^12.1.1)
   │
   ├─ @metamask/parent-controller-2@npm:94.1.0
   │  └─ @metamask/my-controller@npm:12.1.1 (via npm:^12.1.1)
   │
   ├─ @metamask/parent-controller-3@npm:94.1.0 [abc9d]
   │  └─ @metamask/my-controller@npm:12.1.1 [57677] (via npm:^12.1.1 [15228])
   ...
   │
   └─ metamask@workspace:.
      └─ @metamask/my-controller@npm:12.1.1 [57677] (via npm:^12.1.0 [abc9d])
   ```

   Take note of all the version ranges that match the major version you saw earlier (here, we are looking for all version ranges that start with `^12`).

3. Back in `package.json`, locate the `resolutions` section. If it doesn't exist, then add it (it should be an object).

4. For each version range, add a new entry that looks like this:

   ```json
   "@metamask/<PACKAGE_NAME>@<VERSION_RANGE>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

   where:
   - `PACKAGE_NAME` is the name of your package
   - `VERSION_RANGE` is one of the version ranges you noted in step 2
   - `NPM_ORG` is the NPM scope that the preview build is published under (note: this is _not_ `@metamask`)
   - `PREVIEW_VERSION` is the version string of the preview build (note: this should _not_ start with `^`)

   Note that if the dependency was patched as in step 1, you may have a resolution already. You'll want to replace the existing resolution while keeping the existing patch. Your entry will look more like:

   ```json
   "@metamask/<PACKAGE_NAME>@<VERSION_RANGE>": "patch:@<NPM_ORG>/<PACKAGE_NAME>@npm:<ESCAPED_PREVIEW_VERSION>#~/.yarn/patches/<PATCH_NAME>.patch"
   ```

5. Run `yarn install` to apply the changes.

6. Run `yarn why @metamask/<PACKAGE_NAME>` again to confirm that all of the instances of the package you saw when you ran this command earlier are now using your preview build.

</details>

### Testing breaking changes to a package

If you're in a MetaMask client repo (e.g. `metamask-extension` or `metamask-mobile`), run:

1. Open `package.json` and locate the `previewBuilds` section. If it doesn't exist, then add it (it should be an object).
2. Within `previewBuilds`, add an entry that looks like this:

   ```
   "<name-of-package>": {
     "type": "breaking",
     "previewVersion": "<preview-version>"
   }
   ```

   For example:

   ```
   "@metamask/permission-controller": {
     "type": "breaking",
     "previewVersion": "13.0.2-preview-940c934"
   }
   ```

3. Run `yarn install`. You're now using the preview build.

<details>
<summary><strong>Manual steps</strong></summary>

1. In the project, open `package.json`, and:
   - Note the name of the package.
   - Locate the `resolutions` section. If it doesn't exist, then add it (it should be an object).
   - Check to see if the dependency you're testing is patched. Patched dependencies look like this:

     ```json
     "@metamask/<PACKAGE_NAME>": "patch:@metamask/<PACKAGE_NAME>@npm:<ESCAPED_VERSION_RANGE>#~/.yarn/patches/<PATCH_NAME>.patch"
     ```

     where:
     - `PACKAGE_NAME` is the name of the package.
     - `ESCAPED_VERSION_RANGE` is the version range, but where characters like `^` are escaped (for instance, `^` will appear as `%3A`).
     - `PATCH_NAME` is the filename for a patch. It is usually dash-separated, starts with the package name, and ends with the commit ID from which the patch was created.

2. Add a new entry to `resolutions` that looks like this:

   ```json
   "<ROOT_PACKAGE_NAME>@workspace:./@metamask/<PACKAGE_NAME>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

   where:
   - `ROOT_PACKAGE_NAME` is the value of the `name` field at the top of `package.json`
   - `NPM_ORG` is the NPM scope that the preview build is published under (note: this is _not_ `@metamask`)
   - `PACKAGE_NAME` is the name of your package
   - `PREVIEW_VERSION` is the version string of the preview build (note: this should _not_ start with `^`)

   Note that if the dependency was patched as in step 1, you may have a resolution already. You'll want to replace the existing resolution while keeping the existing patch. Your entry will look more like:

   ```json
   "@metamask/<PACKAGE_NAME>@<VERSION_RANGE>": "patch:@<NPM_ORG>/<PACKAGE_NAME>@npm:<ESCAPED_PREVIEW_VERSION>#~/.yarn/patches/<PATCH_NAME>.patch"
   ```

3. Run `yarn install` to apply the changes.

</details>
