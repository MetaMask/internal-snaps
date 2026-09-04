// @ts-check
/**
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
const config = {
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: ['./src/**/*.ts', './src/**/*.tsx'],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: ['.*/index\\.ts'],

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'babel',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ['text', 'html', 'json-summary', 'lcov'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 72.43,
      functions: 57.43,
      lines: 81.02,
      statements: 80.75,
    },
  },

  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  moduleNameMapper: {
    // `@metamask/snap-networks-utils` is ESM-only, which Jest's CommonJS
    // runtime cannot require, so map it to the uncompiled source instead.
    // The source uses Node16-style `.js` specifiers and `lodash-es`, which
    // must be mapped as well.
    '^@metamask/snap-networks-utils$':
      '<rootDir>/../snap-networks-utils/src/index.ts',
    '^lodash-es$': 'lodash',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  resetMocks: true,
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
};

export default config;
