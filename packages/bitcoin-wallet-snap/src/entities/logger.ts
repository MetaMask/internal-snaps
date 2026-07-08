export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace',
  SILENT = 'silent',
}

/**
 * A Logger.
 */
export type Logger = {
  /**
   * Logs at the `ERROR` level.
   *
   * @param data - The data to log.
   */
  // TODO: Replace `any` with type
   
  error(...data: any[]): void;

  /**
   * Logs at the `WARN` level.
   *
   * @param data - The data to log.
   */
  // TODO: Replace `any` with type
   
  warn(...data: any[]): void;

  /**
   * Logs at the `INFO` level.
   *
   * @param data - The data to log.
   */
  // TODO: Replace `any` with type
   
  info(...data: any[]): void;

  /**
   * Logs at the `DEBUG` level.
   *
   * @param data - The data to log.
   */
  // TODO: Replace `any` with type
   
  debug(...data: any[]): void;

  /**
   * Logs at the `TRACE` level.
   *
   * @param data - The data to log.
   */
  // TODO: Replace `any` with type
   
  trace(...data: any[]): void;
};
