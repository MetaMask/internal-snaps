import { defineConfig } from 'vitest/config';

/**
 * Unit tests for `scripts/`. The create-package templates are not executed
 * here. They are copied into `packages/` and run with the shared Vitest config.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // `describe`, `it`, `expect`, `vi`, and the hooks are globals, including
    // inside `tests/scripts-setup.ts`.
    globals: true,
    // Each file mocks `fs`, `./utils`, or `./cli` differently. A shared module
    // graph would let the first `vi.mock` win for every file.
    isolate: true,
    include: ['scripts/**/*.{test,spec}.ts'],
    exclude: [
      'scripts/create-package/snap-template/**',
      'scripts/create-package/library-template/**',
    ],
    setupFiles: ['./tests/scripts-setup.ts'],
    // Same lifecycle as `resetMocks` / `restoreMocks` in the old Jest config.
    mockReset: true,
    restoreMocks: true,
    testTimeout: 5000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'scripts/coverage',
      include: ['scripts/create-package/**/*.ts'],
      exclude: [
        'scripts/create-package/**/*.test.ts',
        'scripts/create-package/snap-template/**',
        'scripts/create-package/library-template/**',
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
