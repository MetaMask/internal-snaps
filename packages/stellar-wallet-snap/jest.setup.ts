import { config } from 'dotenv';

// Node's native fetch uses undici, which nock cannot intercept. Replace it
// after the deletes. A static import would be hoisted above these deletes
// under Vitest's ESM loader.
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

config();

// Set default environment for tests if not already set
// eslint-disable-next-line no-restricted-globals
process.env.ENVIRONMENT ??= 'test';
// eslint-disable-next-line no-restricted-globals
process.env.LOG_LEVEL ??= 'error';
