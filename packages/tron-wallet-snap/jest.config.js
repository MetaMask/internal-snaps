const baseConfig = require('../../jest.config.packages');

module.exports = {
  ...baseConfig,
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
    '^.+\\.svg$': '<rootDir>/../../jest.svg-transformer.js',
  },
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
  setupFilesAfterEnv: [
    ...baseConfig.setupFilesAfterEnv,
    '<rootDir>/jest.setup.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 73.58,
      functions: 83.36,
      lines: 87.6,
      statements: 87.59,
    },
  },
};
