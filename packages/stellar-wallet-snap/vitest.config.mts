import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      ],
      thresholds: {
        branches: 78.22,
        functions: 86.47,
        lines: 88.49,
        statements: 88.44,
      },
    },
  },
});
