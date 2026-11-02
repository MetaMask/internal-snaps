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
      branches: 77.33,
      functions: 66.76,
      lines: 84.81,
      statements: 84.58,
    },
  },
};
