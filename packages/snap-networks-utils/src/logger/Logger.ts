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

const logLevelPriority = {
  [LogLevel.SILENT]: 0,
  [LogLevel.ERROR]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.INFO]: 3,
  [LogLevel.DEBUG]: 4,
  [LogLevel.TRACE]: 5,
};

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
 */
export type LoggerOptions = {
  /** Whether this logger should forward messages to the console. */
  enabled: boolean;
  /** The most verbose severity level that should be logged. */
  level?: LogLevel;
  /** An optional prefix prepended to every message. */
  prefix?: string;
  /** Optional behavior to apply to individual log methods. */
  decorators?: LoggerDecorators;
};

/**
 * A console logger for network snaps.
 *
 * Consumers are responsible for resolving environment-specific configuration
 * before creating an instance. For example, a Snap can set `enabled` to false
 * when its injected `ENVIRONMENT` value is `production`.
 */
export class Logger {
  readonly #enabled: boolean;

  readonly #level: LogLevel;

  readonly #prefix?: string;

  readonly #decorators?: LoggerDecorators;

  constructor({
    enabled,
    level = LogLevel.TRACE,
    prefix,
    decorators,
  }: LoggerOptions) {
    this.#enabled = enabled;
    this.#level = level;
    this.#prefix = prefix;
    this.#decorators = decorators;
  }

  /**
   * Returns a logger with an additional prefix.
   *
   * The returned logger has the same enabled state and log level as this one.
   *
   * @param prefix - The prefix to add to each message.
   * @returns A derived logger.
   */
  withPrefix(prefix: string): Logger {
    return new Logger({
      enabled: this.#enabled,
      level: this.#level,
      prefix: this.#prefix ? `${this.#prefix} ${prefix}` : prefix,
      decorators: this.#decorators,
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

  #shouldLog(level: LoggerMethod): boolean {
    return (
      this.#enabled && logLevelPriority[level] <= logLevelPriority[this.#level]
    );
  }

  #write(
    level: LoggerMethod,
    writeToConsole: (...args: unknown[]) => void,
    args: unknown[],
  ): void {
    if (!this.#shouldLog(level)) return;

    const next: LogMethod = this.#prefix
      ? (...nextArgs) => writeToConsole(this.#prefix, ...nextArgs)
      : writeToConsole;

    const decorator = this.#decorators?.[level];

    if (decorator) {
      decorator(next, ...args);
      return;
    }

    next(...args);
  }
}
