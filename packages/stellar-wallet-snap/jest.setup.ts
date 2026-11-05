import { config } from 'dotenv';
import { runInThisContext } from 'node:vm';

type FetchPolyfill = {
  fetch: typeof globalThis.fetch;
  Headers: typeof globalThis.Headers;
  Request: typeof globalThis.Request;
  Response: typeof globalThis.Response;
};

const FETCH_POLYFILL_KEY = '__stellarVitestFetchPolyfill';

// Setup runs again for every file, but `isomorphic-fetch` only assigns globals
// the first time it evaluates. Later files used to delete `fetch` and then
// import the cached module, which left `fetch` missing.
async function installFetchPolyfill(): Promise<void> {
  const holder = globalThis as typeof globalThis & {
    [FETCH_POLYFILL_KEY]?: FetchPolyfill;
  };
  let polyfill = holder[FETCH_POLYFILL_KEY];
  if (!polyfill) {
    // Node's native fetch uses undici, which nock cannot intercept.
    // @ts-expect-error Replace native fetch so nock can intercept node-fetch instead.
    delete globalThis.fetch;
    // @ts-expect-error Clearing the global so isomorphic-fetch can install node-fetch.
    delete globalThis.Headers;
    // @ts-expect-error Clearing the global so isomorphic-fetch can install node-fetch.
    delete globalThis.Request;
    // @ts-expect-error Clearing the global so isomorphic-fetch can install node-fetch.
    delete globalThis.Response;
    // @ts-expect-error isomorphic-fetch ships without type declarations.
    await import('isomorphic-fetch');
    polyfill = {
      fetch: globalThis.fetch,
      Headers: globalThis.Headers,
      Request: globalThis.Request,
      Response: globalThis.Response,
    };
    holder[FETCH_POLYFILL_KEY] = polyfill;
  }

  globalThis.fetch = polyfill.fetch;
  globalThis.Headers = polyfill.Headers;
  globalThis.Request = polyfill.Request;
  globalThis.Response = polyfill.Response;
}

await installFetchPolyfill();

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
