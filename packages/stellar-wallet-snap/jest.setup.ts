import { config } from 'dotenv';
// eslint-disable-next-line import-x/no-nodejs-modules
import { runInThisContext } from 'node:vm';

// `getSnapProvider` returns the Snap runtime global `snap`. Give tests one
// object they can replace via `globalThis.snap`.
const snapGlobal = globalThis as typeof globalThis & {
  snap?: { request: (...args: unknown[]) => Promise<unknown> };
};
snapGlobal.snap ??= {
  request: vi.fn(() => Promise.resolve(undefined)),
};
runInThisContext('var snap = globalThis.snap');

config({ quiet: true });

// Set default environment for tests if not already set
// eslint-disable-next-line no-restricted-globals
process.env.ENVIRONMENT ??= 'test';
// eslint-disable-next-line no-restricted-globals
process.env.LOG_LEVEL ??= 'error';
