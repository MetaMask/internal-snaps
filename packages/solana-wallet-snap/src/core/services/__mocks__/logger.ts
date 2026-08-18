import type { Logger } from '@metamask/snap-networks-utils/logger';

export const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  withPrefix: jest.fn().mockReturnThis(),
} as unknown as Logger;
