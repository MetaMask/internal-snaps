// eslint-disable-next-line import-x/no-named-as-default
import BigNumber from 'bignumber.js';
import { config } from 'dotenv';

import { registerMockSnap } from '../../tests/vitest/mock-snap';
import { mockSnapDefaultEnv } from '../../tests/vitest/mock-snap-env';

// Load the environment variables for the Snap
config({ quiet: true });

// Globally mock the snap
registerMockSnap();

// Mock the default environment for the Snap
mockSnapDefaultEnv();

// Lowest precision we ever go for: MicroLamports represented in Sol amount.
BigNumber.config({ EXPONENTIAL_AT: 16 });

// Fake timers are process-wide when `isolate` is false. A file that turns them
// on must not leave the next file waiting on a timer that never fires.
beforeEach(() => {
  vi.useRealTimers();
});

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
