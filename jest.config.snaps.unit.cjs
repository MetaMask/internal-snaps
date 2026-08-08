const path = require('path');

/**
 * Shared Jest config for Snap unit tests.
 *
 * Uses the Node environment (not @metamask/snaps-jest) so suites run without
 * a pre-built dist/bundle.js. SES / installSnap coverage belongs in each
 * package's integration config instead.
 *
 * Workspace @metamask/* mapping must stay synchronized with
 * tsconfig.packages.json paths (./packages/<name>/src).
 */
module.exports = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['.*/index\\.ts'],
  coverageProvider: 'babel',
  coverageReporters: ['text', 'html', 'json-summary', 'lcov'],
  resetMocks: true,
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/integration-test/',
    '\\.integration\\.test\\.[tj]sx?$',
  ],
  moduleNameMapper: {
    '^@metamask/utils/node$': require.resolve('@metamask/utils/node'),
    // Only rewrite bare workspace package names. Subpath imports such as
    // `@metamask/snaps-controllers/node` must fall through to node_modules.
    '^@metamask/([^/]+)$': [
      path.join(__dirname, 'packages/$1/src'),
      path.join(__dirname, 'node_modules/@metamask/$1'),
    ],
  },
};
