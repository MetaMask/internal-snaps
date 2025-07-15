// @ts-check
/**
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
const config = {
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  resetMocks: true,
  testMatch: ['**/src/**/?(*.)+(spec|test).[tj]s?(x)'],
};

module.exports = config;
