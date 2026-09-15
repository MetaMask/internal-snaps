import { object, string } from '@metamask/superstruct';

import { parseEnv } from './parseEnv';

describe('parseEnv', () => {
  it('returns the parsed value for a valid environment', () => {
    const struct = object({ ENVIRONMENT: string() });

    expect(parseEnv({ ENVIRONMENT: 'production' }, struct)).toStrictEqual({
      ENVIRONMENT: 'production',
    });
  });

  it('throws when the environment is invalid', () => {
    const struct = object({ ENVIRONMENT: string() });

    expect(() => parseEnv({}, struct)).toThrow(
      'Invalid environment configuration',
    );
  });

  it('includes the underlying validation reason in the error', () => {
    const struct = object({ RPC_URL: string() });

    expect(() => parseEnv({ RPC_URL: 123 }, struct)).toThrow(
      'Invalid environment configuration: At path: RPC_URL',
    );
  });
});
