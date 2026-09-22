const baseConfig = require('../../jest.config.packages');

module.exports = {
  ...baseConfig,
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
    '^.+\\.svg$': '<rootDir>/svg-transformer.js',
  },
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '\\.svg$': 'jest-transform-stub',
  },
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
  setupFilesAfterEnv: [...baseConfig.setupFilesAfterEnv, './jest.setup.ts'],
  verbose: true,

  // Solana tests start a mock RPC on a fixed port (8899); parallel workers collide.
  maxWorkers: 1,

  // NOTE: Unlike the other packages, Solana's suite relies on mock
  // implementations established in `jest.setup.ts` surviving between tests, so
  // it must opt out of the base config's mock resetting. Flipping this to
  // `true` requires reworking those mocks first.
  resetMocks: false,
  restoreMocks: false,
};
