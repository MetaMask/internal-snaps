const baseConfig = require('../../jest.config.packages');

module.exports = {
  ...baseConfig,
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    // Published `@metamask/*` packages are increasingly ESM-only: they have
    // no `main` field, just an `exports` map, sometimes nested inside other
    // packages' `node_modules`. Jest runs tests as CommonJS and leaves
    // `node_modules` untransformed by default, so requiring those packages
    // fails with a syntax error. Transform every `@metamask/*` package at
    // any nesting depth so ESM-only releases are transpiled to CommonJS like
    // the rest of the code. `lodash-es` is ESM-only by design and comes with
    // them.
    'node_modules/(?!(@metamask/|lodash-es/))',
  ],
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '\\.svg$': 'jest-transform-stub',
  },
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
  setupFilesAfterEnv: [
    ...baseConfig.setupFilesAfterEnv,
    '<rootDir>/jest.setup.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 72.63,
      functions: 79.95,
      lines: 85.85,
      statements: 85.86,
    },
  },
};
