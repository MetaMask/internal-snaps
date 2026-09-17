import { coerce, defaulted, enums, string } from '@metamask/superstruct';

import { LogLevel } from '../logger/Logger';

/**
 * A struct for parsing a log level from an environment variable.
 *
 * Log levels are tunables, so the value is case-insensitive and defaults to
 * {@link LogLevel.SILENT} when the variable is unset or empty (the build-time
 * injection default). Unknown values are rejected.
 */
export const LogLevelStruct = coerce(
  defaulted(
    enums(Object.values(LogLevel) as [LogLevel, ...LogLevel[]]),
    LogLevel.SILENT,
  ),
  string(),
  (value: string) => (value === '' ? undefined : value.toLowerCase()),
);
