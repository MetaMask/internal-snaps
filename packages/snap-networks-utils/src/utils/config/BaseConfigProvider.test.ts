import {
  coerce,
  defaulted,
  number,
  object,
  record,
  string,
} from '@metamask/superstruct';

import { BaseConfigProvider } from './BaseConfigProvider';

const TestConfigStruct = object({
  TEST_ENVIRONMENT: string(),
  TEST_PORT: coerce(number(), string(), (value) => Number(value)),
  TEST_RETRIES: coerce(defaulted(number(), 3), string(), (value) =>
    Number(value),
  ),
});

const NestedConfigStruct = object({
  TEST_NETWORKS: record(
    string(),
    object({
      TEST_URLS: coerce(defaulted(number(), 60_000), string(), (value) =>
        Number(value),
      ),
    }),
  ),
});

describe('BaseConfigProvider', () => {
  it('builds the config from the environment using the struct', () => {
    const provider = new BaseConfigProvider(
      {
        TEST_ENVIRONMENT: 'production',
        TEST_PORT: '8080',
      },
      TestConfigStruct,
    );

    expect(provider.config).toStrictEqual({
      TEST_ENVIRONMENT: 'production',
      TEST_PORT: 8080,
      TEST_RETRIES: 3,
    });
  });

  it('freezes the config, so later environment changes are not picked up', () => {
    const environment = { TEST_ENVIRONMENT: 'production', TEST_PORT: '8080' };

    const provider = new BaseConfigProvider(environment, TestConfigStruct);

    environment.TEST_ENVIRONMENT = 'test';

    expect(provider.config.TEST_ENVIRONMENT).toBe('production');
  });

  it('throws when the environment does not match the struct', () => {
    expect(
      () => new BaseConfigProvider({ TEST_PORT: '8080' }, TestConfigStruct),
    ).toThrow('Invalid environment configuration');
  });

  it('parses nested objects, records, and applies nested defaults', () => {
    const provider = new BaseConfigProvider(
      {
        TEST_NETWORKS: {
          mainnet: { TEST_URLS: '1' },
          devnet: {},
        },
      },
      NestedConfigStruct,
    );

    expect(provider.config).toStrictEqual({
      TEST_NETWORKS: {
        mainnet: { TEST_URLS: 1 },
        devnet: { TEST_URLS: 60_000 },
      },
    });
  });
});
