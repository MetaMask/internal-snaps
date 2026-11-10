/* eslint-disable import-x/no-nodejs-modules */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// `Plugin` is also the DOM lib global. Package tsconfigs include that lib, and
// they pull this file in through `import`.
import type { Plugin as VitePlugin } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Jest's SVG transformer default-exports the file text. Vite would otherwise
 * turn an `.svg` import into a URL.
 *
 * @returns A Vite plugin that loads `.svg` files as string default exports.
 */
function svgStringPlugin(): VitePlugin {
  return {
    name: 'svg-string',
    enforce: 'pre',
    load(id: string): string | null {
      const filename = id.split('?', 1)[0];
      if (!filename?.endsWith('.svg')) {
        return null;
      }

      const source = readFileSync(filename, 'utf8');
      return `export default ${JSON.stringify(source)};`;
    },
  };
}

/**
 * Modules that import `logger` bind its methods at load time. Redirect every
 * import of the real logger to the shared mock so those bindings are the mock
 * functions. An import specifier that contains `__mocks__` keeps the real module.
 *
 * @param realLogger - Absolute path of the real logger module.
 * @param mockLogger - Absolute path of the mock logger module.
 * @returns A Vite plugin that rewrites logger imports to the mock.
 */
export function loggerMockPlugin(
  realLogger: string,
  mockLogger: string,
): VitePlugin {
  return {
    name: 'logger-mock',
    enforce: 'pre',
    async resolveId(source, importer, options): Promise<string | null> {
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

/**
 * Same mapping as `paths` in `tsconfig.packages.json`. Bare `@metamask/*`
 * specifiers that live in
 * this repo resolve to source. Published packages, and subpath exports, stay
 * on Node resolution.
 *
 * @returns A Vite plugin that remaps workspace `@metamask/*` imports to source.
 */
function workspaceSourcePlugin(): VitePlugin {
  return {
    name: 'workspace-source',
    enforce: 'pre',
    resolveId(source: string): string | null {
      const match = /^@metamask\/([^/]+)$/u.exec(source);
      if (!match?.[1]) {
        return null;
      }

      const base = resolve(repoRoot, 'packages', match[1], 'src', 'index');
      if (existsSync(`${base}.ts`)) {
        return `${base}.ts`;
      }
      if (existsSync(`${base}.tsx`)) {
        return `${base}.tsx`;
      }

      return null;
    },
  };
}

const packageVitestConfig = defineConfig({
  plugins: [svgStringPlugin(), workspaceSourcePlugin()],
  // Vite 8 transforms with Oxc. `esbuild.jsx` is ignored when Oxc is enabled.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@metamask/snaps-sdk',
      // Production runtime matches the old ts-jest output. The dev runtime
      // rejects null children.
      development: false,
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    // No DOM. jsdom/happy-dom would build a window these suites do not use.
    environment: 'node',
    // `describe`, `it`, `expect`, `vi`, and the hooks are globals, including
    // inside the shared setup files below.
    globals: true,
    // One heap per worker. `forks` starts a child process per worker.
    pool: 'threads',
    // Reuse the module graph across files. Isolation re-imports every
    // dependency per file.
    // A top-level `vi.mock` only works when that file is the only importer and
    // the real module must not load. Anything else should `vi.spyOn` in `beforeEach`.
    isolate: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [
      resolve(repoRoot, 'tests/vitest/polyfill-fetch.mts'),
      resolve(repoRoot, 'tests/setupAfterEnv/nock.ts'),
      resolve(repoRoot, 'tests/setupAfterEnv/matchers.ts'),
    ],
    // `mockReset` restores the implementation passed to `vi.fn(impl)`.
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      // `src/**/index.ts` matches the old Jest `coveragePathIgnorePatterns`.
      exclude: ['src/**/index.ts', 'src/**/__mocks__/**'],
      thresholds: {
        // A local `yarn test` may raise thresholds. CI and the other scripts do not.
        /* eslint-disable no-restricted-globals -- Node config; `process` is available */
        autoUpdate:
          process.env.CI || process.env.npm_lifecycle_event !== 'test'
            ? false
            : (value: number): number => Math.floor(value * 100) / 100,
        /* eslint-enable no-restricted-globals */
      },
    },
  },
});

export default packageVitestConfig;
/* eslint-enable import-x/no-nodejs-modules */
