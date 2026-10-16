const baseConfig = require('../../jest.config.packages');

module.exports = {
  ...baseConfig,
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
    '^.+\\.mjs$': 'ts-jest',
  },
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '\\.svg$': 'jest-transform-stub',
  },
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 76.65,
      functions: 64.7,
      lines: 83.67,
      statements: 83.44,
    },
  },
};
