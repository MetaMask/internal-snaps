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
          // With `isolate: false`, the first import of this package is reused.
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
        exclude: [
          'src/**/constants.ts',
          'src/**/constants/**',
          'src/utils/logger.ts',
          'src/**/permissions.ts',
          'src/**/context.ts',
          'src/utils/snap.ts',
          'src/shims/eventsource.ts',
        ],
        thresholds: {
          branches: 77.83,
          functions: 87.36,
          lines: 88.41,
          statements: 88.37,
        },
      },
    },
  }),
);
/* eslint-enable import-x/no-nodejs-modules */
