import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageRoot, '../..');

/**
 * Jest's SVG transformer default-exports the file text. Vite would otherwise
 * turn an `.svg` import into a URL.
 */
/**
 * Modules that import `logger` bind its methods at load time. Redirect every
 * import of the real logger to the shared mock so those bindings are the mock
 * functions. Importers inside `__mocks__` keep the real module.
 */
function loggerMockPlugin(): Plugin {
  const realLogger = resolve(packageRoot, 'src/utils/logger.ts');
  const mockLoggerPath = resolve(packageRoot, 'src/utils/__mocks__/logger.ts');
  return {
    name: 'logger-mock',
    enforce: 'pre' as const,
    async resolveId(source, importer, options) {
      if (!importer || source.includes('__mocks__')) {
        return null;
      }

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      const resolvedId = resolved?.id.split('?', 1)[0];
      if (resolvedId === realLogger) {
        return mockLoggerPath;
      }

      return null;
    },
  };
}

function svgStringPlugin() {
  return {
    name: 'svg-string',
    enforce: 'pre' as const,
    load(id: string) {
      const filename = id.split('?', 1)[0];
      if (!filename?.endsWith('.svg')) {
        return null;
      }

      const source = readFileSync(filename, 'utf8');
      return `export default ${JSON.stringify(source)};`;
    },
  };
}

export default defineConfig({
  plugins: [svgStringPlugin(), loggerMockPlugin()],
  // Vite 8 transforms with Oxc. `esbuild.jsx` is ignored when Oxc is enabled.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@metamask/snaps-sdk',
      // Production runtime matches ts-jest. The dev runtime rejects null children.
      development: false,
    },
  },
  // Match `moduleNameMapper` in `jest.config.packages.js` for the one workspace
  // package this snap imports. Bare `@metamask/*` specifiers resolve to source;
  // subpath exports keep the published package.
  resolve: {
    alias: [
      {
        find: /^@metamask\/snap-networks-utils$/,
        replacement: resolve(
          repoRoot,
          'packages/snap-networks-utils/src/index.ts',
        ),
      },
    ],
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    // Performance: no DOM. jsdom/happy-dom would build a window this suite never uses.
    environment: 'node',
    // Publishes `describe`, `it`, `expect`, `vi`, and the hooks as globals so
    // the shared Jest setup files (`nock.ts`, `matchers.ts`) can call them.
    // This config is the unit suite only. Integration tests use
    // `jest.integration.config.mjs` and do not load it.
    globals: true,
    // Performance: one heap per worker. `forks` starts a child process per worker.
    pool: 'threads',
    // Performance: reuse the module graph across files. Isolation re-imports
    // every dependency per file, which was most of the runtime.
    // A top-level `vi.mock` only works when that file is the only importer and
    // the real module must not load. Anything else should `vi.spyOn` in `beforeEach`.
    isolate: false,
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // `integration-test/` stays on Jest. `@metamask/snaps-jest` cannot run here.
    setupFiles: [
      resolve(repoRoot, 'tests/vitest/polyfill-fetch.mts'),
      resolve(packageRoot, 'vitest.setup.ts'),
      resolve(repoRoot, 'tests/setupAfterEnv/nock.ts'),
      resolve(repoRoot, 'tests/setupAfterEnv/matchers.ts'),
    ],
    // Same lifecycle as `resetMocks` / `restoreMocks` in `jest.config.packages.js`.
    // `mockReset` restores the implementation passed to `vi.fn(impl)`.
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/index.ts', 'src/**/__mocks__/**'],
      thresholds: {
        // Same trigger as the old `coverage:ratchet` script: a local `yarn test` only.
        // `test:verbose` and `test:watch` do not pass `--coverage`.
        autoUpdate:
          process.env.CI || process.env.npm_lifecycle_event !== 'test'
            ? false
            : (value: number) => Math.floor(value * 100) / 100,
        branches: 80.65,
        functions: 71.95,
        lines: 87.54,
        statements: 87.49,
      },
    },
  },
});
