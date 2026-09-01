import { assert, enums } from '@metamask/superstruct';

/**
 * The severity levels supported by {@link Logger}.
 */
export const LogLevel = {
  SILENT: 'silent',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Defines the severity ordering used to filter log messages.
 *
 * Lower values are less verbose. Changing these numeric priorities changes
 * which messages are emitted for each configured {@link LogLevel}, including
 * in production.
 */
const logLevelPriority = {
  [LogLevel.SILENT]: 0,
  [LogLevel.ERROR]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.INFO]: 3,
  [LogLevel.DEBUG]: 4,
  [LogLevel.TRACE]: 5,
};

const LogLevelStruct = enums(Object.values(LogLevel));

export type LoggerMethod = Exclude<LogLevel, typeof LogLevel.SILENT>;

export type LogMethod = (...args: unknown[]) => void;

/**
 * A function that can add behavior around a logger method.
 *
 * Call `next` to forward a message through the logger's configured output.
 */
export type LogMethodDecorator = (next: LogMethod, ...args: unknown[]) => void;

export type LoggerDecorators = Partial<
  Record<LoggerMethod, LogMethodDecorator>
>;

/**
 * Configuration for a {@link Logger}.
 *
 * **Example: configure logging with `LOG_LEVEL`.**
 *
 * ```ts
 * const logger = new Logger({
 *   level: process.env.LOG_LEVEL
 * });
 * ```
 */
export type LoggerOptions = {
  /**
   * The most verbose severity level that should be logged. Use
   * {@link LogLevel.SILENT} to disable logging.
   */
  level: LogLevel;
  /**
   * An optional prefix prepended to every message.
   *
   * Use {@link Logger.withPrefix} to add prefixes after construction.
   */
  prefix?: string;
  /**
   * Optional behavior to apply to individual log methods.
   *
   * Decorators receive `next`, which preserves this logger's configured level,
   * prefix, and console output.
   */
  decorators?: LoggerDecorators;
};

/**
 * Logs network Snap messages to the console at configurable severity levels.
 *
 * Disable output with {@link LogLevel.SILENT}.
 *
 * **Example: create an enabled logger.**
 *
 * ```ts
 * import { Logger } from '@metamask/snap-networks-utils';
 *
 * const logger = new Logger({ level: LogLevel.TRACE });
 * logger.info('Account synced');
 * ```
 *
 * **Example: add a Snap or component prefix.**
 *
 * ```ts
 * const rootLogger = new Logger({ level: LogLevel.TRACE });
 * const snapLogger = rootLogger.withPrefix('[tron-wallet-snap]');
 * const accountsLogger = snapLogger.withPrefix('[accounts]');
 *
 * accountsLogger.debug('Refreshing account balances');
 * ```
 *
 * **Example: decorate a method with Snap-specific behavior.**
 *
 * ```ts
 * const logger = new Logger({
 *   level: LogLevel.TRACE,
 *   decorators: {
 *     error: (next, error) => {
 *       const details = getSolanaErrorDetails(error);
 *       next(details ?? error);
 *     },
 *   },
 * });
 * ```
 */
export class Logger {
  readonly #level: LogLevel;

  readonly #prefix: string | undefined;

  readonly #decorators: LoggerDecorators | undefined;

  constructor({ level, prefix, decorators }: LoggerOptions) {
    assert(level, LogLevelStruct);

    this.#level = level;
    this.#prefix = prefix;
    this.#decorators = decorators;
  }

  /**
   * Returns a logger with an additional prefix.
   *
   * The returned logger has the same log level and decorators as this one. Call
   * this method as many times as needed; each derived logger appends its prefix
   * to the existing prefix.
   *
   * @param prefix - The prefix to add to each message.
   * @returns A derived logger.
   */
  withPrefix(prefix: string): Logger {
    return new Logger({
      level: this.#level,
      prefix: this.#prefix ? `${this.#prefix} ${prefix}` : prefix,
      ...(this.#decorators && { decorators: this.#decorators }),
    });
  }

  error(...args: unknown[]): void {
    this.#write(LogLevel.ERROR, console.error, args);
  }

  warn(...args: unknown[]): void {
    this.#write(LogLevel.WARN, console.warn, args);
  }

  /**
   * Logs an informational message.
   *
   * @param args - The values to write to the console.
   * @deprecated Use {@link Logger.info} instead.
   */
  log(...args: unknown[]): void {
    this.info(...args);
  }

  info(...args: unknown[]): void {
    this.#write(LogLevel.INFO, console.info, args);
  }

  debug(...args: unknown[]): void {
    this.#write(LogLevel.DEBUG, console.debug, args);
  }

  trace(...args: unknown[]): void {
    this.#write(LogLevel.TRACE, console.trace, args);
  }

  #isLevelDisabled(level: LoggerMethod): boolean {
    return logLevelPriority[level] > logLevelPriority[this.#level];
  }

  #write(
    level: LoggerMethod,
    writeToConsole: (...args: unknown[]) => void,
    args: unknown[],
  ): void {
    if (this.#isLevelDisabled(level)) {
      return;
    }

    const next: LogMethod = this.#prefix
      ? (...nextArgs: unknown[]): void =>
          writeToConsole(this.#prefix, ...nextArgs)
      : writeToConsole;

    const decorator = this.#decorators?.[level];

    if (decorator) {
      decorator(next, ...args);
      return;
    }

    next(...args);
  }
}
