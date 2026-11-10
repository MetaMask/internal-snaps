import { config } from 'dotenv';
// eslint-disable-next-line import-x/no-nodejs-modules
import { dirname, resolve } from 'node:path';
// eslint-disable-next-line import-x/no-nodejs-modules
import { fileURLToPath } from 'node:url';

import { registerMockSnap } from '../../tests/vitest/mock-snap';
import { mockSnapDefaultEnv } from '../../tests/vitest/mock-snap-env';

const packageRoot = dirname(fileURLToPath(import.meta.url));

// `.env` is optional. Fill any missing variables from `.env.example` so a
// checkout without a local env file can still construct `configProvider`.
config({ quiet: true });
config({
  path: resolve(packageRoot, '.env.example'),
  quiet: true,
  override: false,
});

// Globally mock the snap
registerMockSnap();

// Mock the default environment for the Snap
mockSnapDefaultEnv();
