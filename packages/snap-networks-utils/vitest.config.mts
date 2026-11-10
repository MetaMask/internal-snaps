import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageRoot, '../..');

/**
 * Jest's SVG transformer default-exports the file text. Vite would otherwise
 * turn an `.svg` import into a URL, which breaks icon comparisons in tests.
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

export default defineConfig({
  plugins: [svgStringPlugin()],
  // Vite 8 transforms with Oxc. `esbuild.jsx` is ignored when Oxc is enabled.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@metamask/snaps-sdk',
      // Production runtime matches ts-jest. The dev runtime rejects null children.
      development: false,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // One heap per worker. `forks` starts a child process per worker.
    pool: 'threads',
    // Reuse the module graph across files. This package has no top-level
    // `vi.mock`; tests spy with `vi.spyOn` or pass `vi.fn()` directly.
    isolate: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [
      resolve(repoRoot, 'tests/vitest/polyfill-fetch.mts'),
      resolve(repoRoot, 'tests/setupAfterEnv/nock.ts'),
      resolve(repoRoot, 'tests/setupAfterEnv/matchers.ts'),
    ],
    // Same lifecycle as `resetMocks` / `restoreMocks` in `jest.config.packages.js`.
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
        autoUpdate:
          process.env.CI || process.env.npm_lifecycle_event !== 'test'
            ? false
            : (value: number) => Math.floor(value * 100) / 100,
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
