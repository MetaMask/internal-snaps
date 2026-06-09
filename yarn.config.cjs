/* @ts-check */
// The ESLint JSDoc plugin usually disables this rule for TypeScript files,
// but for JavaScript files we are typechecking, we need to disable it manually.
// See: <https://github.com/gajus/eslint-plugin-jsdoc/issues/888#issuecomment-1544914446>
/* eslint-disable jsdoc/no-undefined-types */

// This file is used to define, among other configuration, rules that Yarn will
// execute when you run `yarn constraints`. These rules primarily check the
// manifests of each package in the monorepo to ensure they follow a standard
// format, but also check the presence of certain files as well.

/** @type {import('@yarnpkg/types')} */
const { hasProperty } = require('@metamask/utils');
const { defineConfig } = require('@yarnpkg/types');
const { readFile } = require('fs/promises');
const { get } = require('lodash');
const { basename, resolve } = require('path');
const semver = require('semver');
const { inspect } = require('util');

/**
 * These packages and ranges are allowed to mismatch expected consistency checks
 * Only intended as temporary measures to faciliate upgrades and releases.
 * This should trend towards empty.
 */
const ALLOWED_INCONSISTENT_DEPENDENCIES = {};

/**
 * These packages are allowed as peer dependencies without requiring installation as
 * devDependencies.
 */
const ALLOWED_PEER_DEPENDENCIES = ['react', 'react-dom', 'react-native'];

/**
 * These packages are tools and do not ship with APIs.
 */
const TOOLS = [];

/**
 * These packages deploy documentation sites and use a different build script.
 */
const DOCSITE_PACKAGES = [];

/**
 * Teams that co-own the monorepo. Every package must list at least one of these
 * teams in `.github/CODEOWNERS`.
 */
const MONOREPO_OWNER_TEAMS = ['@MetaMask/core-platform', '@MetaMask/network'];

/**
 * Returns true if the workspace is a snap package, i.e. it has a
 * `snap.manifest.json` file at its root. Snap packages have different build,
 * file, and packaging expectations than regular TypeScript packages.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @returns {Promise<boolean>} True if the workspace is a snap package.
 */
async function isSnapWorkspace(workspace) {
  return workspaceFileExists(workspace, 'snap.manifest.json');
}

/**
 * Aliases for the Yarn type definitions, to make the code more readable.
 *
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Yarn} Yarn
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Workspace} Workspace
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Dependency} Dependency
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.DependencyType} DependencyType
 */

module.exports = defineConfig({
  async constraints({ Yarn }) {
    const rootWorkspace = Yarn.workspace({ cwd: '.' });
    if (rootWorkspace === null) {
      throw new Error('Could not find root workspace');
    }

    const repositoryUri = rootWorkspace.manifest.repository.url.replace(
      /\.git$/u,
      '',
    );

    for (const workspace of Yarn.workspaces()) {
      const workspaceBasename = getWorkspaceBasename(workspace);
      const isChildWorkspace = workspace.cwd !== '.';
      const isPrivate =
        hasProperty(workspace.manifest, 'private') &&
        workspace.manifest.private === true;
      const dependenciesByIdentAndType = getDependenciesByIdentAndType(
        Yarn.dependencies({ workspace }),
      );
      const isSnap = isChildWorkspace && (await isSnapWorkspace(workspace));

      // All packages must have a name.
      expectWorkspaceField(workspace, 'name');

      if (isChildWorkspace) {
        // All non-root packages must have a name that matches its directory
        // (e.g., a package in a workspace directory called `foo` must be called
        // `@metamask/foo`).
        expectWorkspaceField(
          workspace,
          'name',
          `@metamask/${workspaceBasename}`,
        );

        // All non-root packages must have a version.
        expectWorkspaceField(workspace, 'version');

        // All non-root packages must have a description that ends in a period.
        expectWorkspaceDescription(workspace);

        // All non-root packages must have the same set of NPM keywords.
        expectWorkspaceField(workspace, 'keywords', ['Ethereum', 'MetaMask']);

        // All non-root packages must have a homepage URL that includes its name.
        expectWorkspaceField(
          workspace,
          'homepage',
          `${repositoryUri}/tree/main/packages/${workspaceBasename}#readme`,
        );

        // All non-root packages must have a URL for reporting bugs that points
        // to the Issues page for the repository.
        expectWorkspaceField(workspace, 'bugs.url', `${repositoryUri}/issues`);

        // All non-root packages must specify a Git repository within the
        // MetaMask GitHub organization.
        expectWorkspaceField(workspace, 'repository.type', 'git');
        expectWorkspaceField(
          workspace,
          'repository.url',
          `${repositoryUri}.git`,
        );

        // All non-root packages must have a license.
        await expectWorkspaceLicense(workspace);

        if (isSnap) {
          // Snap packages must use `mm-snap build` as the build entry point
          // (other commands may be chained after it for locale generation,
          // pre-installed snap bundling, etc.) and must regenerate the manifest
          // shasum before publish via `mm-snap manifest`.
          expectWorkspaceScriptStartsWith(workspace, 'build', 'mm-snap build');
          expectWorkspaceField(
            workspace,
            'scripts.prepublishOnly',
            'mm-snap manifest',
          );

          // Snap packages do not ship as ES modules, so the `sideEffects`,
          // `exports`, `main`, and `types` constraints do not apply.
        } else {
          // All non-root packages must not have side effects.
          expectWorkspaceField(workspace, 'sideEffects', false);

          // All non-root packages must set up ESM- and CommonJS-compatible
          // exports correctly (aside from tools).
          if (!TOOLS.includes(workspace.ident)) {
            expectCorrectWorkspaceExports(workspace);
          }

          // All non-root packages must have a "build" script. All packages that
          // do not exclusively deploy documentation sites must use `ts-bridge`.
          if (DOCSITE_PACKAGES.includes(workspace.ident)) {
            expectWorkspaceField(workspace, 'scripts.build');
          } else {
            expectWorkspaceField(
              workspace,
              'scripts.build',
              'ts-bridge --project tsconfig.build.json --verbose --clean --no-references',
            );

            // All non-root packages must have the same "build:all" script.
            expectWorkspaceField(
              workspace,
              'scripts.build:all',
              'ts-bridge --project tsconfig.build.json --verbose --clean',
            );
          }

          // All non-root packages must have the same "build:docs" script (aside
          // from tools).
          if (!TOOLS.includes(workspace.ident)) {
            expectWorkspaceField(workspace, 'scripts.build:docs', 'typedoc');
          }
        }

        // No non-root packages may have a "prepack" script.
        workspace.unset('scripts.prepack');

        // All non-root package must have valid "changelog:update" and
        // "changelog:validate" scripts.
        expectCorrectWorkspaceChangelogScripts(workspace);

        // All non-root packages must have a valid "since-latest-release" script.
        expectWorkspaceField(
          workspace,
          'scripts.since-latest-release',
          '../../scripts/since-latest-release.sh',
        );

        if (isSnap) {
          // Snap packages need `jest` available but typically use
          // `@metamask/snaps-jest`; the script wording is left to each snap.
          expectWorkspaceField(workspace, 'scripts.test');
        } else {
          // All non-root packages must have the same "test" script.
          expectWorkspaceField(
            workspace,
            'scripts.test',
            'NODE_OPTIONS=--experimental-vm-modules jest --reporters=jest-silent-reporter',
          );

          // All non-root packages must have the same "test:clean" script.
          expectWorkspaceField(
            workspace,
            'scripts.test:clean',
            'NODE_OPTIONS=--experimental-vm-modules jest --clearCache',
          );

          // All non-root packages must have the same "test:verbose" script.
          expectWorkspaceField(
            workspace,
            'scripts.test:verbose',
            'NODE_OPTIONS=--experimental-vm-modules jest --verbose',
          );

          // All non-root packages must have the same "test:watch" script.
          expectWorkspaceField(
            workspace,
            'scripts.test:watch',
            'NODE_OPTIONS=--experimental-vm-modules jest --watch',
          );
        }
      }

      if (isChildWorkspace) {
        if (isSnap) {
          // Snap packages publish their bundled JS plus the manifest, images,
          // and locale files. They do not have a `dist/` exports tree like
          // TypeScript packages do.
          expectWorkspaceArrayField(workspace, 'files', 'dist/');
          expectWorkspaceArrayField(workspace, 'files', 'snap.manifest.json');
          expectWorkspaceArrayField(workspace, 'files', 'images/');
          expectWorkspaceArrayField(workspace, 'files', 'locales/');
        } else {
          // The list of files included in all non-root packages must only
          // include files generated during the build process.
          expectWorkspaceArrayField(workspace, 'files', 'dist/');
        }
      } else {
        // The root package must specify an empty set of published files. (This
        // is required in order to be able to import anything in
        // development-only scripts, as otherwise the
        // `node/no-unpublished-require` ESLint rule will disallow it.)
        expectWorkspaceField(workspace, 'files', []);
      }

      // If one workspace package lists another workspace package within
      // `dependencies` or `devDependencies`, the version used within the
      // dependency range must match the current version of the dependency.
      expectUpToDateWorkspaceDependenciesAndDevDependencies(
        Yarn,
        dependenciesByIdentAndType,
      );

      // If one workspace package lists another workspace package within
      // `peerDependencies`, the dependency range must satisfy the current
      // version of that package.
      expectUpToDateWorkspacePeerDependencies(Yarn, workspace);

      // No dependency may be listed under both `dependencies` and
      // `devDependencies`, or under both `dependencies` and `peerDependencies`.
      expectDependenciesNotInBothProdAndDevOrPeer(
        workspace,
        dependenciesByIdentAndType,
      );

      // If one package A lists another package B in its `peerDependencies`,
      // then B must also be listed in A's `devDependencies`, and if B is a
      // workspace package, the dev dependency must match B's version.
      expectPeerDependenciesAlsoListedAsDevDependencies(
        Yarn,
        workspace,
        dependenciesByIdentAndType,
      );

      // The root workspace (and only the root workspace) must specify the Yarn
      // version required for development.
      if (isChildWorkspace) {
        workspace.unset('packageManager');
      } else {
        expectWorkspaceField(workspace, 'packageManager', 'yarn@4.14.1');
      }

      // All packages must specify a minimum Node.js version of 20.
      expectWorkspaceField(workspace, 'engines.node', '>=20');

      // All non-root public packages should be published to the NPM registry;
      // all non-root private packages should not.
      if (isPrivate) {
        workspace.unset('publishConfig');
      } else {
        expectWorkspaceField(workspace, 'publishConfig.access', 'public');
        expectWorkspaceField(
          workspace,
          'publishConfig.registry',
          'https://registry.npmjs.org/',
        );
      }

      if (isChildWorkspace) {
        // All non-root packages must have a valid README.md file.
        await expectReadme(workspace, workspaceBasename, isPrivate || isSnap);

        await expectCodeowner(workspace, workspaceBasename);
      }
    }

    // All version ranges in `dependencies` and `devDependencies` for the same
    // non-workspace dependency across the monorepo must be the same.
    expectConsistentDependenciesAndDevDependencies(Yarn);
  },
});

/**
 * Organizes the given dependencies by name and type (`dependencies`,
 * `devDependencies`, or `peerDependencies`).
 *
 * @param {Dependency[]} dependencies - The list of dependencies to transform.
 * @returns {Map<string, Map<DependencyType, Dependency>>} The resulting map.
 */
function getDependenciesByIdentAndType(dependencies) {
  const dependenciesByIdentAndType = new Map();

  for (const dependency of dependencies) {
    const dependenciesForIdent = dependenciesByIdentAndType.get(
      dependency.ident,
    );

    if (dependenciesForIdent === undefined) {
      dependenciesByIdentAndType.set(
        dependency.ident,
        new Map([[dependency.type, dependency]]),
      );
    } else {
      dependenciesForIdent.set(dependency.type, dependency);
    }
  }

  return dependenciesByIdentAndType;
}

/**
 * Construct a nested map of non-peer dependencies (`dependencies` and
 * `devDependencies`). The inner layer categorizes instances of the same
 * dependency by the version range specified; the outer layer categorizes the
 * inner layer by the name of the dependency itself.
 *
 * @param {Dependency[]} dependencies - The list of dependencies to transform.
 * @returns {Map<string, Map<string, Dependency[]>>} The resulting map.
 */
function getNonPeerDependenciesByIdent(dependencies) {
  const nonPeerDependenciesByIdent = new Map();

  for (const dependency of dependencies) {
    if (dependency.type === 'peerDependencies') {
      continue;
    }

    const dependencyRangesForIdent = nonPeerDependenciesByIdent.get(
      dependency.ident,
    );

    if (dependencyRangesForIdent === undefined) {
      nonPeerDependenciesByIdent.set(
        dependency.ident,
        new Map([[dependency.range, [dependency]]]),
      );
    } else {
      const dependenciesForDependencyRange = dependencyRangesForIdent.get(
        dependency.range,
      );

      if (dependenciesForDependencyRange === undefined) {
        dependencyRangesForIdent.set(dependency.range, [dependency]);
      } else {
        dependenciesForDependencyRange.push(dependency);
      }
    }
  }

  return nonPeerDependenciesByIdent;
}

/**
 * Get the basename of the workspace's directory. The workspace directory is
 * expected to be in the form `<directory>/<package-name>`, and this function
 * will extract `<package-name>`.
 *
 * @param {Workspace} workspace - The workspace.
 * @returns {string} The name of the workspace.
 */
function getWorkspaceBasename(workspace) {
  return basename(workspace.cwd);
}

/**
 * Get the absolute path to a file within the workspace.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {string} The absolute path to the file.
 */
function getWorkspacePath(workspace, path) {
  return resolve(__dirname, workspace.cwd, path);
}

/**
 * Get the contents of a file within the workspace. The file is expected to be
 * encoded as UTF-8.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {Promise<string>} The contents of the file.
 */
async function getWorkspaceFile(workspace, path) {
  return await readFile(getWorkspacePath(workspace, path), 'utf8');
}

/**
 * Attempts to access the given file to know whether the file exists.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {Promise<boolean>} True if the file exists, false otherwise.
 */
async function workspaceFileExists(workspace, path) {
  try {
    await getWorkspaceFile(workspace, path);
  } catch (error) {
    if (hasProperty(error, 'code') && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  return true;
}

/**
 * Expect that a workspace script exists and begins with a required prefix.
 * Additional commands may be chained (e.g. `mm-snap build && yarn build:locale`).
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} scriptName - The name of the script (e.g. `build`).
 * @param {string} expectedPrefix - The required leading command.
 */
function expectWorkspaceScriptStartsWith(
  workspace,
  scriptName,
  expectedPrefix,
) {
  const fieldPath = `scripts["${scriptName}"]`;
  const value = get(workspace.manifest, fieldPath);

  if (typeof value !== 'string' || value.length === 0) {
    workspace.set(fieldPath, expectedPrefix);
    return;
  }

  if (
    value !== expectedPrefix &&
    !value.startsWith(`${expectedPrefix} `) &&
    !value.startsWith(`${expectedPrefix} &&`)
  ) {
    workspace.error(
      `Expected script "${scriptName}" to start with "${expectedPrefix}", but found "${value}".`,
    );
  }
}

/**
 * This function does one of three things depending on the arguments given:
 *
 * - With no value provided, this will expect that the workspace has the given
 * field and that it is a non-null value; if the field is not present or is
 * null, this will log an error and cause the constraint to fail.
 * - With a value is provided, and the value is non-null, this will verify that
 * the field is equal to the given value.
 * - With a value is provided, and the value is null, this will verify that the
 * field is not present.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} fieldName - The field to check.
 * @param {unknown} [expectedValue] - The value to check.
 */
function expectWorkspaceField(workspace, fieldName, expectedValue = undefined) {
  const fieldValue = get(workspace.manifest, fieldName);

  if (expectedValue !== undefined && expectedValue !== null) {
    workspace.set(fieldName, expectedValue);
  } else if (expectedValue === null) {
    workspace.unset(fieldName);
  } else if (
    expectedValue === undefined &&
    (fieldValue === undefined || fieldValue === null)
  ) {
    workspace.error(`Missing required field "${fieldName}".`);
  }
}

/**
 * Expect that the workspace has the given field, and that it is an array-like
 * property containing the specified value. If the field is not present, is not
 * an array, or does not contain the value, this will log an error, and cause
 * the constraint to fail.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} fieldName - The field to check.
 * @param {unknown} expectedValue - The value that should be contained in the array.
 */
function expectWorkspaceArrayField(
  workspace,
  fieldName,
  expectedValue = undefined,
) {
  let fieldValue = get(workspace.manifest, fieldName);

  if (expectedValue) {
    if (!Array.isArray(fieldValue)) {
      fieldValue = [];
    }

    if (!fieldValue.includes(expectedValue)) {
      fieldValue.push(expectedValue);
      workspace.set(fieldName, fieldValue);
    }
  } else if (fieldValue === undefined || fieldValue === null) {
    workspace.error(`Missing required field "${fieldName}".`);
  }
}

/**
 * Expect that the workspace has a description, and that it is a non-empty
 * string. If the description is not present, or is null, this will log an
 * error, and cause the constraint to fail.
 *
 * This will also verify that the description does not end with a period.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectWorkspaceDescription(workspace) {
  expectWorkspaceField(workspace, 'description');

  const { description } = workspace.manifest;

  if (typeof description !== 'string') {
    workspace.error(
      `Expected description to be a string, but got ${typeof description}.`,
    );
    return;
  }

  if (description === '') {
    workspace.error(`Expected description not to be an empty string.`);
    return;
  }

  if (description.endsWith('.')) {
    workspace.set('description', description.slice(0, -1));
  }
}

/**
 * Expect that the workspace has a license file, and that the `license` field is
 * set. By default this is `(MIT-0 OR Apache-2.0)`, matching the license used by
 * the snap repositories that this monorepo absorbs.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
async function expectWorkspaceLicense(workspace) {
  const hasLicenseFile =
    (await workspaceFileExists(workspace, 'LICENSE')) ||
    (await workspaceFileExists(workspace, 'LICENCE'));
  const hasSplitLicenseFiles =
    (await workspaceFileExists(workspace, 'LICENSE.MIT0')) &&
    (await workspaceFileExists(workspace, 'LICENSE.APACHE2'));

  if (!hasLicenseFile && !hasSplitLicenseFiles) {
    workspace.error('Could not find LICENSE file');
  }

  if (
    workspace.manifest.license === null ||
    workspace.manifest.license === undefined
  ) {
    expectWorkspaceField(workspace, 'license', '(MIT-0 OR Apache-2.0)');
  }
}

/**
 * Expect that the workspace has exports set up correctly.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectCorrectWorkspaceExports(workspace) {
  // All non-root packages must provide the location of the ESM-compatible
  // JavaScript entrypoint and its matching type declaration file.
  expectWorkspaceField(
    workspace,
    'exports["."].import.types',
    './dist/index.d.mts',
  );
  expectWorkspaceField(
    workspace,
    'exports["."].import.default',
    './dist/index.mjs',
  );

  // All non-root package must provide the location of the CommonJS-compatible
  // entrypoint and its matching type declaration file.
  expectWorkspaceField(
    workspace,
    'exports["."].require.types',
    './dist/index.d.cts',
  );
  expectWorkspaceField(
    workspace,
    'exports["."].require.default',
    './dist/index.cjs',
  );
  expectWorkspaceField(workspace, 'main', './dist/index.cjs');
  expectWorkspaceField(workspace, 'types', './dist/index.d.cts');

  // Types should not be set in the export object directly, but rather in the
  // `import` and `require` subfields.
  expectWorkspaceField(workspace, 'exports["."].types', null);

  // All non-root packages must export a `package.json` file.
  expectWorkspaceField(
    workspace,
    'exports["./package.json"]',
    './package.json',
  );
}

/**
 * Expect that the workspace has "changelog:update" and "changelog:validate"
 * scripts, and that these package scripts call a common script by passing the
 * name of the package as the first argument.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectCorrectWorkspaceChangelogScripts(workspace) {
  /**
   * @type {Record<string, { expectedStartString: string, script: string, match: RegExpMatchArray | null }>}
   */
  const scripts = ['update', 'validate'].reduce((obj, variant) => {
    const expectedStartString = `../../scripts/${variant}-changelog.sh ${workspace.manifest.name}`;
    /** @type {string} */
    const script = workspace.manifest.scripts[`changelog:${variant}`] ?? '';
    const match = script.match(new RegExp(`^${expectedStartString}(.*)$`, 'u'));
    return { ...obj, [variant]: { expectedStartString, script, match } };
  }, {});

  if (
    scripts.update.match &&
    scripts.validate.match &&
    scripts.update.match[1] !== scripts.validate.match[1]
  ) {
    workspace.error(
      'Expected package\'s "changelog:validate" and "changelog:update" scripts to pass the same arguments to their underlying scripts',
    );
  }

  for (const [
    variant,
    { expectedStartString, script, match },
  ] of Object.entries(scripts)) {
    expectWorkspaceField(workspace, `scripts.changelog:${variant}`);

    if (script !== '' && !match) {
      workspace.error(
        `Expected package's "changelog:${variant}" script to be or start with "${expectedStartString}", but it was "${script}".`,
      );
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package within
 * `devDependencies`, or lists another workspace package within `dependencies`
 * (and does not already list it in `peerDependencies`), the version used within
 * the dependency range is exactly equal to the current version of the
 * dependency (and the range uses the `^` modifier).
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Map<string, Map<DependencyType, Dependency>>} dependenciesByIdentAndType -
 * Map of dependency ident to dependency type and dependency.
 */
function expectUpToDateWorkspaceDependenciesAndDevDependencies(
  Yarn,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    const dependencyWorkspace = Yarn.workspace({ ident: dependencyIdent });

    if (!dependencyWorkspace) {
      continue;
    }

    const devDependency = dependencyInstancesByType.get('devDependencies');
    const prodDependency = dependencyInstancesByType.get('dependencies');
    const peerDependency = dependencyInstancesByType.get('peerDependencies');

    if ((devDependency || prodDependency) && !peerDependency) {
      const dependency = devDependency ?? prodDependency;

      const ignoredRanges = ALLOWED_INCONSISTENT_DEPENDENCIES[dependencyIdent];
      if (ignoredRanges?.includes(dependency.range)) {
        continue;
      }

      dependency.update(`^${dependencyWorkspace.manifest.version}`);
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package within
 * `peerDependencies`, the dependency range satisfies the current version of
 * that package.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 */
function expectUpToDateWorkspacePeerDependencies(Yarn, workspace) {
  for (const dependency of Yarn.dependencies({ workspace })) {
    const dependencyWorkspace = Yarn.workspace({ ident: dependency.ident });

    if (
      dependencyWorkspace !== null &&
      dependency.type === 'peerDependencies'
    ) {
      const dependencyWorkspaceVersion = new semver.SemVer(
        dependencyWorkspace.manifest.version,
      );
      if (
        !semver.satisfies(
          dependencyWorkspace.manifest.version,
          dependency.range,
        )
      ) {
        // Ensure peer dependency includes latest breaking changes.
        //
        // Technically pre-1.0 versions can make breaking changes in patch releases, but
        // conventionally we always bump the most significant digit for breaking changes.
        if (dependencyWorkspaceVersion.major > 0) {
          dependency.update(`^${dependencyWorkspaceVersion.major}.0.0`);
        } else if (dependencyWorkspaceVersion.minor > 0) {
          dependency.update(`^0.${dependencyWorkspaceVersion.minor}.0`);
        } else {
          dependency.update(`^0.0.${dependencyWorkspaceVersion.patch}`);
        }
      }
    }
  }
}

/**
 * Expect that a workspace package does not list a dependency in both
 * `dependencies` and `devDependencies`, or in both `dependencies` and
 * `peerDependencies`.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {Map<string, Map<DependencyType, Dependency>>} dependenciesByIdentAndType -
 * Map of dependency ident to dependency type and dependency.
 */
function expectDependenciesNotInBothProdAndDevOrPeer(
  workspace,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    const dependency = dependencyInstancesByType.get('dependencies');
    if (dependency === undefined) {
      continue;
    }
    if (dependencyInstancesByType.has('devDependencies')) {
      workspace.error(
        `\`${dependencyIdent}\` cannot be listed in both \`dependencies\` and \`devDependencies\``,
      );
    } else if (dependencyInstancesByType.has('peerDependencies')) {
      expectWorkspaceField(
        workspace,
        `devDependencies["${dependencyIdent}"]`,
        dependency.range,
      );
      expectWorkspaceField(
        workspace,
        `dependencies["${dependencyIdent}"]`,
        null,
      );
    }
  }
}

/**
 * Expect that if a non-workspace package lists another package in its
 * `peerDependencies`, the package is also listed in `devDependencies`.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 * @param {Map<string, Map<DependencyType, Dependency>>} dependenciesByIdentAndType - Map of
 * dependency ident to dependency type and dependency.
 */
function expectPeerDependenciesAlsoListedAsDevDependencies(
  Yarn,
  workspace,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    const peerDependency = dependencyInstancesByType.get('peerDependencies');

    if (!peerDependency) {
      continue;
    }

    if (ALLOWED_PEER_DEPENDENCIES.includes(dependencyIdent)) {
      continue;
    }

    const dependencyWorkspace = Yarn.workspace({ ident: dependencyIdent });

    if (!dependencyWorkspace) {
      expectWorkspaceField(workspace, `devDependencies["${dependencyIdent}"]`);
    }
  }
}

/**
 * Filter out dependency ranges which are not to be considered in `expectConsistentDependenciesAndDevDependencies`.
 *
 * @param {string} dependencyIdent - The dependency being filtered for.
 * @param {Map<string, Dependency>} dependenciesByRange - Dependencies by range.
 * @returns {Map<string, Dependency>} The resulting map.
 */
function getInconsistentDependenciesAndDevDependencies(
  dependencyIdent,
  dependenciesByRange,
) {
  const ignoredRanges = ALLOWED_INCONSISTENT_DEPENDENCIES[dependencyIdent];
  if (!ignoredRanges) {
    return dependenciesByRange;
  }
  return new Map(
    Object.entries(dependenciesByRange).filter(
      ([range]) => !ignoredRanges.includes(range),
    ),
  );
}

/**
 * Expect that across the entire monorepo all version ranges in `dependencies`
 * and `devDependencies` for the same dependency are the same (as long as it is
 * not a dependency on a workspace package). As it is impossible to compare NPM
 * version ranges, let the user decide if there are conflicts.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 */
function expectConsistentDependenciesAndDevDependencies(Yarn) {
  const nonPeerDependenciesByIdent = getNonPeerDependenciesByIdent(
    Yarn.dependencies(),
  );

  for (const [
    dependencyIdent,
    dependenciesByRange,
  ] of nonPeerDependenciesByIdent.entries()) {
    const dependencyWorkspace = Yarn.workspace({ ident: dependencyIdent });

    if (dependenciesByRange.size <= 1 || dependencyWorkspace) {
      continue;
    }

    const dependenciesToConsider =
      getInconsistentDependenciesAndDevDependencies(
        dependencyIdent,
        dependenciesByRange,
      );
    const dependencyRanges = [...dependenciesToConsider.keys()].sort();

    for (const dependencies of dependenciesToConsider.values()) {
      for (const dependency of dependencies) {
        dependency.error(
          `Expected version range for ${dependencyIdent} (in ${
            dependency.type
          }) to be consistent across monorepo. Pick one: ${inspect(
            dependencyRanges,
          )}`,
        );
      }
    }
  }
}

/**
 * Expects the README.md:
 *
 * - To not contain template instructions (unless the workspace is the module
 * template itself).
 * - To contain installation instructions (if it is not private)
 * - To match the version of Node.js specified in the `.nvmrc` file.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} workspaceBasename - The name of the workspace.
 * @param {boolean} isPrivate - Whether the package is private.
 * @returns {Promise<void>}
 */
async function expectReadme(workspace, workspaceBasename, isPrivate) {
  const readme = await getWorkspaceFile(workspace, 'README.md');

  if (
    workspaceBasename !== 'metamask-module-template' &&
    readme.includes('## Template Instructions')
  ) {
    workspace.error(
      'The README.md contains template instructions. These instructions should be removed.',
    );
  }

  if (
    !isPrivate &&
    !readme.includes(`yarn add @metamask/${workspaceBasename}`)
  ) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using Yarn (\`yarn add @metamask/${workspaceBasename}\`). Please add an example.`,
    );
  }

  if (
    !isPrivate &&
    !readme.includes(`npm install @metamask/${workspaceBasename}`)
  ) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using npm (\`npm install @metamask/${workspaceBasename}\`). Please add an example.`,
    );
  }
}

// A promise resolving to the codeowners file contents
let cachedCodeownersFile;

/**
 * Expect that the workspace has a codeowner set, and that the package is
 * co-owned by at least one of the monorepo owner teams.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} workspaceBasename - The name of the workspace.
 * @returns {Promise<void>}
 */
async function expectCodeowner(workspace, workspaceBasename) {
  if (!cachedCodeownersFile) {
    cachedCodeownersFile = readFile(
      resolve(__dirname, '.github', 'CODEOWNERS'),
      'utf8',
    );
  }
  const codeownersFile = await cachedCodeownersFile;
  const codeownerRules = codeownersFile.split('\n');

  const packageCodeownerRule = codeownerRules.find((rule) =>
    // Matcher includes intentional trailing space to ensure there is a package-wide rule, not
    // just a rule for specific files/directories in the package.
    rule.startsWith(`/packages/${workspaceBasename} `),
  );

  if (!packageCodeownerRule) {
    // The monorepo always provides a default `*` rule covering both owner
    // teams, so any package without an explicit rule is implicitly co-owned.
    return;
  }

  const hasMonorepoOwner = MONOREPO_OWNER_TEAMS.some((team) =>
    packageCodeownerRule.includes(team),
  );

  if (!hasMonorepoOwner) {
    workspace.error(
      `Package CODEOWNERS rule must include at least one monorepo owner team (${MONOREPO_OWNER_TEAMS.join(
        ' or ',
      )}).`,
    );
  }
}
