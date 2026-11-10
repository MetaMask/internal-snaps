import { config } from 'dotenv';

import { registerMockSnap } from '../../tests/vitest/mock-snap';
import { mockSnapDefaultEnv } from '../../tests/vitest/mock-snap-env';

// Load the environment variables for the Snap
config({ quiet: true });

// Globally mock the snap
registerMockSnap();

// Mock the default environment for the Snap
mockSnapDefaultEnv();
