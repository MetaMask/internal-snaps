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
  setupFilesAfterEnv: [
    ...baseConfig.setupFilesAfterEnv,
    '<rootDir>/jest.setup.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 72.49,
      functions: 79.91,
      lines: 85.79,
      statements: 85.79,
    },
  },
};
