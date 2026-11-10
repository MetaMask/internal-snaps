import { vi } from 'vitest';
import type { Mocked } from 'vitest';

import type { Logger } from '../Logger';

export const mockLogger = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  withPrefix: (prefix: string): Logger => createPrefixedLogger([prefix]),
} as unknown as Mocked<Logger>;

function createPrefixedLogger(prefixes: string[]): Logger {
  return new Proxy(mockLogger, {
    get(target, property: keyof Logger): unknown {
      if (property === 'withPrefix') {
        return (prefix: string) => createPrefixedLogger([...prefixes, prefix]);
      }

      const method = target[property];
      return typeof method === 'function'
        ? (...args: unknown[]): unknown => method(...prefixes, ...args)
        : method;
    },
  });
}
