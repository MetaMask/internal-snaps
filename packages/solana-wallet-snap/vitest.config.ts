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
        resolve(packageRoot, 'src/core/utils/logger.ts'),
        resolve(packageRoot, 'src/core/utils/__mocks__/logger.ts'),
      ),
    ],
    test: {
      // Solana tests start a mock RPC on a fixed port (8899). Parallel workers collide.
      maxWorkers: 1,
      server: {
        deps: {
          // With `isolate: false`, the first import of a package is reused.
          // Spying the published ESM fails unless Vitest inlines and transforms it.
          inline: [
            '@metamask/keyring-snap-sdk',
            '@metamask/keyring-snap-sdk/v2',
            '@solana/kit',
            '@solana-program/token-2022',
            '@solana-name-service/sns-sdk-kit',
          ],
        },
      },
      // These install the built snap through `@metamask/snaps-jest`. The Jest APIs
      // are already written as `vi.*`, but the files are not executed.
      exclude: [
        'src/index.test.ts',
        'src/features/confirmation/views/ConfirmSignIn/render.test.tsx',
        'src/features/confirmation/views/ConfirmSignMessage/render.test.tsx',
        'src/features/confirmation/views/ConfirmTransactionRequest/render.test.tsx',
      ],
      // Runs after the shared setup files. `mergeConfig` appends this array.
      setupFiles: [resolve(packageRoot, 'vitest.setup.ts')],
      coverage: {
        exclude: ['src/core/utils/logger.ts'],
        thresholds: {
          branches: 71.9,
          functions: 80.58,
          lines: 85.24,
          statements: 85.3,
        },
      },
    },
  }),
);
/* eslint-enable import-x/no-nodejs-modules */
