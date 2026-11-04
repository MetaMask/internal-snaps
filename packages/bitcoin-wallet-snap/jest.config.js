const baseConfig = require('../../jest.config.packages');

module.exports = {
  ...baseConfig,
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '\\.svg$': 'jest-transform-stub',
  },
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 78.49,
      functions: 68.83,
      lines: 85.49,
      statements: 85.24,
    },
  },
};
