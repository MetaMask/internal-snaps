/* eslint-disable import-x/no-nodejs-modules */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import packageVitestConfig, {
  loggerMockPlugin,
} from '../../vitest.config.packages';

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  packageVitestConfig,
  defineConfig({
    plugins: [
      loggerMockPlugin(
        resolve(packageRoot, 'src/utils/logger.ts'),
        resolve(packageRoot, 'src/utils/__mocks__/logger.ts'),
      ),
    ],
    test: {
      // `vitest doctor` measured 4 workers fastest for this suite. Extra
      // workers queue transforms on the single Vite server and get slower.
      maxWorkers: 4,
      server: {
        deps: {
          // With `isolate: false`, the first import of a package is reused.
          // Spying the published ESM fails unless Vitest inlines and transforms it.
          inline: [
            '@metamask/keyring-snap-sdk',
            '@metamask/keyring-snap-sdk/v2',
          ],
        },
      },
      // Runs after the shared setup files. `mergeConfig` appends this array.
      setupFiles: [resolve(packageRoot, 'vitest.setup.ts')],
      coverage: {
        exclude: ['src/utils/logger.ts'],
        thresholds: {
          branches: 77.31,
          functions: 86.5,
          lines: 87.63,
          statements: 87.55,
        },
      },
    },
  }),
);
/* eslint-enable import-x/no-nodejs-modules */
