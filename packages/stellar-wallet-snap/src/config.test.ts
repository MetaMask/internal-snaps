import { LogLevel } from '@metamask/snap-networks-utils';
import { assert, create, StructError } from '@metamask/superstruct';

import { LogLevelStruct } from './config';

describe('LogLevelStruct', () => {
  it.each(Object.values(LogLevel))(
    'accepts valid log level: %s',
    (logLevel) => {
      expect(() => assert(logLevel, LogLevelStruct)).not.toThrow();
    },
  );

  it.each(['ERROR', 'Warn', 'INFO', 'Debug', 'TRACE', 'Silent'])(
    'coerces "%s" to lowercase',
    (logLevel) => {
      expect(create(logLevel, LogLevelStruct)).toBe(logLevel.toLowerCase());
    },
  );

  it.each([undefined, ''])(
    'defaults empty or missing log level to silent: %j',
    (logLevel) => {
      expect(create(logLevel, LogLevelStruct)).toBe(LogLevel.SILENT);
    },
  );

  it('rejects an invalid log level', () => {
    expect(() => assert('invalid-log-level', LogLevelStruct)).toThrow(
      StructError,
    );
  });
});
