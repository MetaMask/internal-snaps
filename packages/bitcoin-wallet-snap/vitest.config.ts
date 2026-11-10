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
      server: {
        deps: {
          // With `isolate: false`, the first import of a package is reused.
          // Spying the published ESM fails unless Vitest inlines and transforms it.
          inline: [
            '@metamask/bitcoindevkit',
            '@metamask/keyring-snap-sdk',
            'superstruct',
            'uuid',
            'wif',
          ],
        },
      },
      // Runs after the shared setup files. `mergeConfig` appends this array.
      setupFiles: [resolve(packageRoot, 'vitest.setup.ts')],
      coverage: {
        exclude: ['src/utils/logger.ts'],
        thresholds: {
          branches: 78.55,
          functions: 68.87,
          lines: 86.53,
          statements: 86.5,
        },
      },
    },
  }),
);
/* eslint-enable import-x/no-nodejs-modules */
