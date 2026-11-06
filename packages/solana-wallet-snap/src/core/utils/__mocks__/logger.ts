import type { Logger } from '@metamask/snap-networks-utils';
import { Logger as LoggerClass, LogLevel } from '@metamask/snap-networks-utils';
import type { Mocked } from 'vitest';

export const mockLogger = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  withPrefix(): Logger {
    return mockLogger;
  },
} as unknown as Mocked<Logger>;

export const noOpLogger = new LoggerClass({ level: LogLevel.SILENT });

export default mockLogger;
