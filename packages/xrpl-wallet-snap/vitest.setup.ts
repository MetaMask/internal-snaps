/* eslint-disable n/no-process-env */
import { config } from 'dotenv';

import { registerMockSnap } from '../../tests/vitest/mock-snap';
import { mockSnapDefaultEnv } from '../../tests/vitest/mock-snap-env';

// Load the environment variables for the Snap
config({ quiet: true });

// Globally mock the snap
registerMockSnap();

// Mock the default environment for the Snap
mockSnapDefaultEnv();

// Network URLs are required by AppConfig; .env may omit Clio. Prefer existing
// values so local .env still wins when present.
process.env.XRPL_RPC_URL_MAINNET ||= 'https://xrplcluster.com';
process.env.XRPL_CLIO_URL_MAINNET ||= process.env.XRPL_RPC_URL_MAINNET;
/* eslint-enable n/no-process-env */
