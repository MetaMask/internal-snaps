import { defineConfig, mergeConfig } from 'vitest/config';

import packageVitestConfig from '../../vitest.config.packages';

export default mergeConfig(
  packageVitestConfig,
  defineConfig({
    test: {
      coverage: {
        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
