// @ts-check
import { createRequire } from 'node:module';

const requireWithCreateRequire = createRequire(import.meta.url);
const shared = requireWithCreateRequire('../../jest.config.snaps.unit.cjs');

/**
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
const config = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: 65.5,
      functions: 62.64,
      lines: 75.29,
      statements: 74.57,
    },
  },
};

export default config;
