import type { Logger } from '@metamask/snap-networks-utils';

export const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  withPrefix: (prefix: string): Logger => createPrefixedLogger([prefix]),
} as unknown as jest.Mocked<Logger>;

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
