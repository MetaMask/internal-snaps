import { Logger, LogLevel } from './Logger';

const loggerMethodConfigurations = [
  { method: 'log', consoleMethod: 'info', filteredAt: LogLevel.WARN },
  { method: 'info', consoleMethod: 'info', filteredAt: LogLevel.WARN },
  { method: 'warn', consoleMethod: 'warn', filteredAt: LogLevel.ERROR },
  { method: 'error', consoleMethod: 'error', filteredAt: LogLevel.SILENT },
  { method: 'debug', consoleMethod: 'debug', filteredAt: LogLevel.INFO },
  { method: 'trace', consoleMethod: 'trace', filteredAt: LogLevel.DEBUG },
] as const;

type MockConsole = Record<
  (typeof loggerMethodConfigurations)[number]['consoleMethod'],
  jest.SpyInstance
>;

type SetupTestResult = {
  loggerMethods: typeof loggerMethodConfigurations;
  mockConsole: MockConsole;
};

const setupTest = (): SetupTestResult => {
  jest.restoreAllMocks();

  return {
    loggerMethods: loggerMethodConfigurations,
    mockConsole: {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      trace: jest.spyOn(console, 'trace').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
    },
  };
};

describe('Logger', () => {
  it('forwards calls to the matching console method', () => {
    const { loggerMethods, mockConsole } = setupTest();

    const logger = new Logger({ level: LogLevel.TRACE });

    for (const { method, consoleMethod } of loggerMethods) {
      logger[method]('hello', 42);

      expect(mockConsole[consoleMethod]).toHaveBeenCalledWith('hello', 42);
    }
  });

  it('prefixes messages with a derived logger', () => {
    const { mockConsole } = setupTest();

    const logger = new Logger({ level: LogLevel.TRACE });

    const prefixed = logger.withPrefix('[snap-networks-utils]');

    prefixed.info('a');
    prefixed.warn('b');
    prefixed.error('c');
    prefixed.debug('d');
    prefixed.trace('e');

    expect(mockConsole.info).toHaveBeenCalledWith('[snap-networks-utils]', 'a');
    expect(mockConsole.warn).toHaveBeenCalledWith('[snap-networks-utils]', 'b');
    expect(mockConsole.error).toHaveBeenCalledWith(
      '[snap-networks-utils]',
      'c',
    );
    expect(mockConsole.debug).toHaveBeenCalledWith(
      '[snap-networks-utils]',
      'd',
    );
    expect(mockConsole.trace).toHaveBeenCalledWith(
      '[snap-networks-utils]',
      'e',
    );
  });

  it('combines prefixes from derived loggers', () => {
    const { mockConsole } = setupTest();

    const logger = new Logger({ level: LogLevel.TRACE });

    const parentLogger = logger.withPrefix('[parent]');
    const childLogger = parentLogger.withPrefix('[child]');

    childLogger.info('message');

    expect(mockConsole.info).toHaveBeenCalledWith(
      '[parent] [child]',
      'message',
    );
  });

  it('logs trace messages at the trace level', () => {
    const { mockConsole } = setupTest();

    const logger = new Logger({ level: LogLevel.TRACE });

    logger.trace('trace');

    expect(mockConsole.trace).toHaveBeenCalledWith('trace');
  });

  it('throws when given an invalid log level', () => {
    expect(() => new Logger({ level: '' as LogLevel })).toThrow(
      'Expected one of `"silent","error","warn","info","debug","trace"`, but received: ""',
    );
    expect(() => new Logger({ level: 'verbose' as LogLevel })).toThrow(
      'Expected one of `"silent","error","warn","info","debug","trace"`, but received: "verbose"',
    );
  });

  it('runs decorators through the configured output', () => {
    const decorator = jest.fn((next: (...args: unknown[]) => void) => {
      next('decoded error');
    });
    const { mockConsole } = setupTest();

    const baseLogger = new Logger({
      level: LogLevel.TRACE,
      decorators: { error: decorator },
    });

    const logger = baseLogger.withPrefix('[Solana]');

    logger.error('original error');

    expect(decorator).toHaveBeenCalledWith(
      expect.any(Function),
      'original error',
    );
    expect(mockConsole.error).toHaveBeenCalledWith('[Solana]', 'decoded error');
  });

  it('does not run decorators at the silent level', () => {
    const decorator = jest.fn();
    const { mockConsole } = setupTest();

    const logger = new Logger({
      level: LogLevel.SILENT,
      decorators: { error: decorator },
    });

    logger.error('silent');

    expect(decorator).not.toHaveBeenCalled();
    expect(mockConsole.error).not.toHaveBeenCalled();
  });

  it('does not log calls at the silent level', () => {
    const { loggerMethods, mockConsole } = setupTest();

    const logger = new Logger({
      level: LogLevel.SILENT,
    });

    for (const { method, consoleMethod } of loggerMethods) {
      logger[method]('silent');

      expect(mockConsole[consoleMethod]).not.toHaveBeenCalled();
    }
  });

  it('filters messages above the configured level', () => {
    const { loggerMethods, mockConsole } = setupTest();

    for (const { method, consoleMethod, filteredAt } of loggerMethods) {
      const logger = new Logger({
        level: filteredAt,
      });

      logger[method]('filtered');

      expect(mockConsole[consoleMethod]).not.toHaveBeenCalled();
    }
  });
});
