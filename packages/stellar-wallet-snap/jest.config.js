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

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    '.*/constants\\.ts$', // any file named constants.ts
    '.*/constants/', // any file in a folder named constants
    '.*/utils/logger\\.ts$', // skip logger.ts
    '.*/permissions\\.ts$', // skip permissions.ts
    '.*/context\\.ts$', // skip context.ts
    '.*/utils/snap\\.ts$', // skip snap.ts
    '.*/shims/eventsource\\.ts$', // skip eventsource.ts
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 80,
      statements: 80,
    },
  },

  // Transpile stellar-sdk's ESM-only deps so CJS Jest can load them. Do not use
  // NODE_OPTIONS=--experimental-vm-modules: native ESM Jest (`useESM` +
  // extensionsToTreatAsEsm) needs that flag, but then `jest` is not injected as
  // a global and CJS packages like lodash break named imports.
  transformIgnorePatterns: [
    '/node_modules/(?!.*(?:@exodus|uint8array-extras|@noble|eventsource|smol-toml)/)',
  ],
};
