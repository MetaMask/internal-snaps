import { create } from '@metamask/superstruct';

import { LogLevel } from '../logger/Logger';
import { LogLevelStruct } from './logLevelStruct';

describe('LogLevelStruct', () => {
  it('accepts valid log levels', () => {
    expect(create('error', LogLevelStruct)).toBe(LogLevel.ERROR);
  });

  it('is case-insensitive', () => {
    expect(create('DEBUG', LogLevelStruct)).toBe(LogLevel.DEBUG);
  });

  it('defaults to silent when the value is undefined', () => {
    expect(create(undefined, LogLevelStruct)).toBe(LogLevel.SILENT);
  });

  it('defaults to silent when the value is an empty string', () => {
    expect(create('', LogLevelStruct)).toBe(LogLevel.SILENT);
  });

  it('rejects unknown log levels', () => {
    expect(() => create('not-a-level', LogLevelStruct)).toThrow(
      'Expected one of',
    );
  });
});
