const FETCH_POLYFILL_KEY = '__VitestFetchPolyfill';

type FetchPolyfill = Pick<
  typeof globalThis,
  'fetch' | 'Headers' | 'Request' | 'Response'
>;

async function installFetchPolyfill(): Promise<void> {
  const holder = globalThis as typeof globalThis & {
    [FETCH_POLYFILL_KEY]?: FetchPolyfill;
  };

  // The `isomorphic-fetch` import only import once when vitest setup `isolate: false`
  // Without the cached function, the fetch function will be deleted and has no way to get it back.
  let polyfill = holder[FETCH_POLYFILL_KEY];
  if (!polyfill) {
    // @ts-expect-error Intentionally clearing native globals so isomorphic-fetch installs node-fetch.
    delete globalThis.fetch;
    // @ts-expect-error Intentionally clearing native globals so isomorphic-fetch installs node-fetch.
    delete globalThis.Headers;
    // @ts-expect-error Intentionally clearing native globals so isomorphic-fetch installs node-fetch.
    delete globalThis.Request;
    // @ts-expect-error Intentionally clearing native globals so isomorphic-fetch installs node-fetch.
    delete globalThis.Response;

    // @ts-expect-error `isomorphic-fetch` ships no type declarations.
    await import('isomorphic-fetch');

    polyfill = {
      fetch: globalThis.fetch,
      Headers: globalThis.Headers,
      Request: globalThis.Request,
      Response: globalThis.Response,
    };
    holder[FETCH_POLYFILL_KEY] = polyfill;
  }

  Object.assign(globalThis, polyfill);
}

await installFetchPolyfill();
