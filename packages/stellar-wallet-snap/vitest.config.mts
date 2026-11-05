import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageRoot, '../..');

/**
 * Jest's SVG transformer default-exports the file text. Vite would otherwise
 * turn an `.svg` import into a URL, which breaks logo comparisons in tests.
 */
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

function loggerMockPlugin(): Plugin {
  const realLogger = resolve(packageRoot, 'src/utils/logger.ts');
  const mockLogger = resolve(packageRoot, 'src/utils/__mocks__/logger.ts');
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
        return mockLogger;
      }

      return null;
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
    environment: 'node',
    globals: true,
    // Node has no DOM to rebuild per file. Sharing the module graph across
    // files in a worker is the fast path; `threads` keeps that state in one
    // heap instead of a child process per worker. `vitest doctor` measured
    // this pool as the fastest it compares, with 4 workers slightly ahead
    // of the default.
    pool: 'threads',
    isolate: false,
    maxWorkers: 4,
    server: {
      deps: {
        // Published ESM namespaces cannot be spied. Inlining makes Vitest
        // transform them so `vi.spyOn` can replace an export in place.
        inline: [
          '@metamask/keyring-snap-sdk',
          '@metamask/keyring-snap-sdk/v2',
        ],
      },
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [
      resolve(packageRoot, 'jest.setup.ts'),
      resolve(repoRoot, 'tests/setupAfterEnv/index.ts'),
    ],
    // Same lifecycle as `resetMocks` / `restoreMocks` in `jest.config.packages.js`.
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/index.ts',
        'src/**/constants.ts',
        'src/**/constants/**',
        'src/utils/logger.ts',
        'src/**/permissions.ts',
        'src/**/context.ts',
        'src/utils/snap.ts',
        'src/shims/eventsource.ts',
        'src/**/__mocks__/*.ts',
      ],
      thresholds: {
        branches: 77.72,
        functions: 87.29,
        lines: 88.33,
        statements: 88.29,
      },
    },
  },
});
