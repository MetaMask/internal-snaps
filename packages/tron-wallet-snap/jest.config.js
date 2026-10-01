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

  // Measure index.ts barrels (e.g. src/constants/index.ts) so SonarCloud new-code coverage sees them; the shared base config's blanket index.ts exclusion zeroes them in lcov.
  coveragePathIgnorePatterns: ['jest\\.setup\\.ts$'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 73.09,
      functions: 80.43,
      lines: 86.39,
      statements: 86.38,
    },
  },
};
