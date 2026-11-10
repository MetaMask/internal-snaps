import base, { createConfig } from '@metamask/oxlint-config';
import commonjs from '@metamask/oxlint-config-commonjs';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';
import vitest from '@metamask/oxlint-config-vitest';

export default createConfig({
  extends: [base],

  jsPlugins: [
    {
      name: 'internal-snaps',
      specifier: './scripts/oxlint-rules.mjs',
    },
  ],

  ignorePatterns: [
    '**/coverage/**',
    '**/dist/**',
    '**/docs/**',
    '.yarn/**',
    'scripts/create-package/snap-template/**',
    'scripts/create-package/library-template/**',
  ],

  rules: {
    'internal-snaps/no-in-operator': 'error',
    'internal-snaps/no-sequence-expression': 'error',
    'internal-snaps/no-with-statement': 'error',
  },

  options: {
    // TODO: Enable this once all unused disable directives are removed.
    // For the initial migration of ESLint to Oxlint, there are many unused
    // ones, and removing them all in a single pull request would result in a
    // large, hard to review pull request.
    // reportUnusedDisableDirectives: 'error',
    typeAware: true,
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      extends: [typescript],
      rules: {
        // TODO: Auto-fix breaks stuff.
        'typescript/promise-function-async': 'off',

        // Relative imports are extensionless in this repo.
        'import/extensions': 'off',

        // TypeScript reports undefined identifiers.
        'eslint/no-undef': 'off',

        // TypeScript handles redeclaration through declaration merging.
        'eslint/no-redeclare': 'off',

        'internal-snaps/no-enum': 'error',
        'internal-snaps/no-private-accessibility': 'error',
        'internal-snaps/no-state-change-events': 'error',
      },
    },

    {
      files: ['**/*.cjs', '**/*.cts', '.prettierrc.js'],
      extends: [nodejs, commonjs],
      rules: {
        'import/extensions': 'off',
        'import/unambiguous': 'off',
      },
    },

    {
      files: ['packages/*/src/**/*.ts'],
      excludeFiles: ['**/*.test.ts', '**/tests/**'],
      rules: {
        'internal-snaps/no-messenger-actions-in-constructor': 'error',
        'internal-snaps/no-relative-packages': 'error',
      },
    },

    {
      files: ['packages/*/src/index.ts'],
      rules: {
        'internal-snaps/no-external-action-type-exports': 'error',
      },
    },

    {
      files: [
        '.github/**',
        'yarn.config.cjs',
        '**/scripts/**',
        '**/snap.config.ts',
        'packages/*/jest.integration.config.mjs',
        'tests/vitest/**',
        'vitest.config.*.ts',
      ],
      extends: [nodejs],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
        'n/hashbang': 'off',
        'n/no-unsupported-features/node-builtins': 'off',
        'import/unambiguous': 'off',
      },
    },

    {
      files: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/integration-test/**',
        '**/__mocks__/**',
        '**/*.fixtures.ts',
        '**/tests/**',
      ],
      extends: [nodejs, vitest],
      plugins: ['typescript'],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
        'n/no-unsupported-features/node-builtins': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'vitest/no-mocks-import': 'off',
      },
    },

    {
      files: ['**/tests/**'],
      excludeFiles: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'vitest/require-top-level-describe': 'off',
        'import/unambiguous': 'off',
      },
    },
  ],
});
