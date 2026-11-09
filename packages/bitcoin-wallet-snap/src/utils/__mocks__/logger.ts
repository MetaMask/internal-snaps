import type { Logger } from '@metamask/snap-networks-utils';
import { vi } from 'vitest';
import type { Mocked } from 'vitest';

const mockLogger = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  withPrefix(): Logger {
    return mockLogger;
  },
} as unknown as Mocked<Logger>;

export default mockLogger;
