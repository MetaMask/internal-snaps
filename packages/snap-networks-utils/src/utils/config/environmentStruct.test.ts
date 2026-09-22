import { create } from '@metamask/superstruct';

import { Environment } from './environmentStruct';
import { EnvironmentStruct } from './environmentStruct';

describe('EnvironmentStruct', () => {
  it('accepts valid environments', () => {
    expect(create('local', EnvironmentStruct)).toBe(Environment.Local);
    expect(create('test', EnvironmentStruct)).toBe(Environment.Test);
    expect(create('production', EnvironmentStruct)).toBe(
      Environment.Production,
    );
  });

  it('rejects unknown environments', () => {
    expect(() => create('staging', EnvironmentStruct)).toThrow(
      'Expected one of',
    );
  });

  it('rejects empty strings', () => {
    expect(() => create('', EnvironmentStruct)).toThrow('Expected one of');
  });

  it('rejects undefined', () => {
    expect(() => create(undefined, EnvironmentStruct)).toThrow(
      'Expected one of',
    );
  });
});
