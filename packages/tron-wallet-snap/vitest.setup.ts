import { config } from 'dotenv';
// eslint-disable-next-line import-x/no-nodejs-modules
import { dirname, resolve } from 'node:path';
// eslint-disable-next-line import-x/no-nodejs-modules
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import-x/no-nodejs-modules
import { runInThisContext } from 'node:vm';

const packageRoot = dirname(fileURLToPath(import.meta.url));
// `.env` is optional. Fill any missing variables from `.env.example` so a
// checkout without a local env file can still construct `configProvider`.
config({ path: resolve(packageRoot, '.env'), quiet: true });
config({
  path: resolve(packageRoot, '.env.example'),
  quiet: true,
  override: false,
});

// `getSnapProvider` returns the Snap runtime global `snap`. Give tests one
// object they can replace via `globalThis.snap`.
const snapGlobal = globalThis as typeof globalThis & {
  snap?: { request: (...args: unknown[]) => Promise<unknown> };
};
snapGlobal.snap ??= {
  request: vi.fn(() => Promise.resolve(undefined)),
};
runInThisContext('var snap = globalThis.snap');

// Set default environment for tests if not already set
// eslint-disable-next-line no-restricted-globals
process.env.ENVIRONMENT ??= 'test';
// eslint-disable-next-line no-restricted-globals
process.env.LOG_LEVEL ??= 'error';
