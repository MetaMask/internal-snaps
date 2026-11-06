/* eslint-disable no-restricted-globals */
// eslint-disable-next-line import-x/no-named-as-default
import BigNumber from 'bignumber.js';
import { config } from 'dotenv';
// eslint-disable-next-line import-x/no-nodejs-modules
import { dirname, resolve } from 'node:path';
// eslint-disable-next-line import-x/no-nodejs-modules
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import-x/no-nodejs-modules
import { runInThisContext } from 'node:vm';

const packageRoot = dirname(fileURLToPath(import.meta.url));
// Empty keys in `.env.example` are not valid URLs, so they are not filled in here.
config({ path: resolve(packageRoot, '.env'), quiet: true });

// `snap.config.ts` inlines these at build time. Fill any the local `.env`
// leaves empty so `configProvider` can be constructed when a test imports it.
const localApiBaseUrl =
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env.LOCAL_API_BASE_URL || 'http://localhost:8899';
for (const key of [
  'PRICE_API_BASE_URL',
  'TOKEN_API_BASE_URL',
  'STATIC_API_BASE_URL',
  'SECURITY_ALERTS_API_BASE_URL',
  'NFT_API_BASE_URL',
]) {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env[key] ||= localApiBaseUrl;
}

// Lowest precision we ever go for: MicroLamports represented in Sol amount.
BigNumber.config({ EXPONENTIAL_AT: 16 });

// `getSnapProvider` returns the Snap runtime global `snap`. Give tests one
// object they can replace via `globalThis.snap`.
const snapGlobal = globalThis as typeof globalThis & {
  snap?: { request: (...args: unknown[]) => Promise<unknown> };
};
snapGlobal.snap ??= {
  request: vi.fn(() => Promise.resolve(undefined)),
};
runInThisContext('var snap = globalThis.snap');

// Fake timers are process-wide when `isolate` is false. A file that turns them
// on must not leave the next file waiting on a timer that never fires.
beforeEach(() => {
  vi.useRealTimers();
});

process.env.ENVIRONMENT ??= 'test';
process.env.LOG_LEVEL ??= 'error';

// `@metamask/snaps-jest` adds these matchers to Jest's `expect`. The four
// `installSnap` files still call them, and Vitest does not run those files.
declare module 'vitest' {
  // Names and `interface` match Vitest's `Assertion` so the declarations merge.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
  interface Assertion<R extends void | Promise<void> = void, T = unknown> {
    toRespondWithError(error: unknown): R;
    toRender(component: unknown): R;
  }
}
/* eslint-enable no-restricted-globals */
