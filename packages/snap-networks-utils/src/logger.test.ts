import { logger, createPrefixedLogger, noOpLogger } from './logger';
import type { Logger } from './logger';

describe('logger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['log', 'log'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
  ] as const)('forwards %s calls to console.%s', (method, consoleMethod) => {
    const spy = jest.spyOn(console, consoleMethod).mockImplementation();

    logger[method]('hello', 42);

    expect(spy).toHaveBeenCalledWith('hello', 42);
  });

  it('prefixes messages with createPrefixedLogger', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const prefixed = createPrefixedLogger(logger, '[snap-networks-utils]');

    prefixed.log('a');
    prefixed.info('b');
    prefixed.warn('c');
    prefixed.error('d');
    prefixed.debug('e');

    expect(logSpy).toHaveBeenCalledWith('[snap-networks-utils]', 'a');
    expect(infoSpy).toHaveBeenCalledWith('[snap-networks-utils]', 'b');
    expect(warnSpy).toHaveBeenCalledWith('[snap-networks-utils]', 'c');
    expect(errorSpy).toHaveBeenCalledWith('[snap-networks-utils]', 'd');
    expect(debugSpy).toHaveBeenCalledWith('[snap-networks-utils]', 'e');
  });

  it('provides a no-op logger for tests', () => {
    const noop: Logger = noOpLogger;

    expect(() => {
      noop.log('silent');
      noop.info('silent');
      noop.warn('silent');
      noop.error('silent');
      noop.debug('silent');
    }).not.toThrow();
  });
});
