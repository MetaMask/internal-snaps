import jest from '@metamask/eslint-config-jest';
import typescript from '@metamask/eslint-config-typescript';

const NODE_LTS_VERSION = 22;

export default [
  {
    files: ['packages/bitcoin-wallet-snap/**/*.{ts,tsx}'],
    extends: [typescript],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'jsdoc/check-tag-names': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  {
    files: ['packages/bitcoin-wallet-snap/**/*.test.tsx'],
    extends: [jest],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
    settings: {
      node: {
        version: `^${NODE_LTS_VERSION}`,
      },
    },
  },
  {
    files: [
      'packages/bitcoin-wallet-snap/jest.config.js',
      'packages/bitcoin-wallet-snap/jest.integration.config.js',
    ],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['packages/bitcoin-wallet-snap/integration-test/**/*.test.ts'],
    rules: {
      'jest/no-disabled-tests': 'off',
      'n/no-sync': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['packages/bitcoin-wallet-snap/scripts/**/*.js'],
    rules: {
      'n/no-sync': 'off',
    },
  },
  {
    files: ['packages/bitcoin-wallet-snap/src/handlers/UserInputHandler.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
