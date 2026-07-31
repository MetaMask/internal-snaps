/**
 * Minimal console logger shared by network snaps.
 *
 * This is a scaffold example for `@metamask/snap-networks-utils`. Later MONO-2
 * tickets will expand shared utilities; snaps can start importing from here.
 */

export type Logger = {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

/**
 * Default logger that forwards to `console`.
 */
export const logger: Logger = {
  log: (...args: unknown[]) => {
    console.log(...args);
  },
  info: (...args: unknown[]) => {
    console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  debug: (...args: unknown[]) => {
    console.debug(...args);
  },
};

/**
 * Logger that discards all messages. Useful in unit tests.
 */
export const noOpLogger: Logger = {
  log: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

/**
 * Returns a logger that prefixes every message.
 *
 * @param baseLogger - Logger to wrap.
 * @param prefix - Prefix prepended to each call.
 * @returns Prefixed logger.
 */
export function createPrefixedLogger(
  baseLogger: Logger,
  prefix: string,
): Logger {
  return {
    log: (...args: unknown[]) => baseLogger.log(prefix, ...args),
    info: (...args: unknown[]) => baseLogger.info(prefix, ...args),
    warn: (...args: unknown[]) => baseLogger.warn(prefix, ...args),
    error: (...args: unknown[]) => baseLogger.error(prefix, ...args),
    debug: (...args: unknown[]) => baseLogger.debug(prefix, ...args),
  };
}
