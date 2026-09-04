/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // This package is an ES module (`"type": "module"`), but tests are run in
  // CommonJS mode, so force `ts-jest` to compile to CommonJS regardless of
  // the package type.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node10',
        },
      },
    ],
  },

  coveragePathIgnorePatterns: [
    ...(baseConfig.coveragePathIgnorePatterns ?? []),
    '.*/__mocks__/',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});
