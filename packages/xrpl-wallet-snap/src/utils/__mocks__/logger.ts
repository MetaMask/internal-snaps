import { Logger, LogLevel } from '@metamask/snap-networks-utils';
import type { Mocked } from 'vitest';

export const logger = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  withPrefix: (prefix: string): Logger => createPrefixedLogger([prefix]),
} as unknown as Mocked<Logger>;

export const noOpLogger = new Logger({ level: LogLevel.SILENT });

function createPrefixedLogger(prefixes: string[]): Logger {
  return new Proxy(logger, {
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
