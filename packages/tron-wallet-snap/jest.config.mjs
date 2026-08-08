// @ts-check
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const shared = require('../../jest.config.snaps.unit.js');

/**
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
const config = {
  ...shared,
  collectCoverageFrom: ['./src/**/*.ts', './src/**/*.tsx'],
  coverageThreshold: {
    global: {
      branches: 69.96,
      functions: 75.86,
      lines: 82.61,
      statements: 82.62,
    },
  },
  moduleNameMapper: {
    ...shared.moduleNameMapper,
    '\\.svg$': 'jest-transform-stub',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};

export default config;
