import { coerce, defaulted, enums, string } from '@metamask/superstruct';

export const LogLevel = {
  ALL: 'all',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  SILENT: 'silent',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * A struct to validate and coerce log level from env.
 * Converts the log level to lowercase and checks if it is a valid log level.
 * If the log level is empty, it returns the default log level.
 */
export const LogLevelStruct = coerce(
  defaulted(enums(Object.values(LogLevel)), LogLevel.ERROR),
  string(),
  (value: string) => (value === '' ? undefined : value.toLowerCase()),
);
