/* eslint-disable no-empty-function */

/**
 * A simple logger utility that provides methods for logging messages at different levels.
 * For now, it's just a wrapper around console.
 *
 * @namespace logger
 */

export type ILogger = {
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: (...args: any[]) => void;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...args: any[]) => void;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => void;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => void;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => void;
};

const withErrorLogging =
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (logFn: (...args: any[]) => void) =>
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]): void => {
      logFn(...args);
    };

/**
 * A decorator function that noops if the environment is not local,
 * and runs the decorated function otherwise.
 *
 * @param fn - The function to wrap.
 * @returns The wrapped function.
 */
const withNoopInProduction =
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fn: (...args: any[]) => void) =>
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]): void => {
      // eslint-disable-next-line no-restricted-globals
      if (process.env.ENVIRONMENT === 'production') {
        return;
      }
      fn(...args);
    };

/**
 * A basic logger that wraps the console, extending its functionality to properly log Tron errors.
 */
const logger: ILogger = {
  log: withNoopInProduction(console.log),
  info: withNoopInProduction(console.info),
  warn: withNoopInProduction(console.warn),
  debug: withNoopInProduction(console.debug),
  error: withNoopInProduction(withErrorLogging(console.error)),
};

export const noOpLogger: ILogger = {
  log: () => {},
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
};

export const createPrefixedLogger = (
  _logger: ILogger,
  prefix: string,
): ILogger => {
  return new Proxy(_logger, {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(target, prop: keyof ILogger): any {
      const method = target[prop];
      if (typeof method === 'function') {
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (message: string, ...args: any[]) => {
          return method.call(target, prefix, message, ...args);
        };
      }
      return method;
    },
  });
};

export default logger;
