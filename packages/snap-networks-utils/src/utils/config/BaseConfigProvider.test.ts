/* eslint-disable n/no-process-env -- Environment fixtures. */

import { BaseConfigProvider } from './BaseConfigProvider';

type TestConfig = {
  environment: string;
  chunkSize: number;
};

let parseCallCount: number;

class TestConfigProvider extends BaseConfigProvider<string, TestConfig> {
  protected parseEnvironment(): string {
    parseCallCount += 1;
    return process.env.TEST_ENVIRONMENT as string;
  }

  protected buildConfig(environment: string): TestConfig {
    return { environment, chunkSize: environment === 'test' ? 1 : 50 };
  }
}

describe('BaseConfigProvider', () => {
  beforeEach(() => {
    parseCallCount = 0;
  });

  afterEach(() => {
    delete process.env.TEST_ENVIRONMENT;
  });

  it('builds the config from the environment hooks', () => {
    process.env.TEST_ENVIRONMENT = 'production';

    const provider = new TestConfigProvider();

    expect(provider.get()).toStrictEqual({
      environment: 'production',
      chunkSize: 50,
    });
  });

  it('parses and builds the config exactly once', () => {
    process.env.TEST_ENVIRONMENT = 'production';

    const provider = new TestConfigProvider();
    provider.get();
    provider.get();

    expect(parseCallCount).toBe(1);
  });

  it('freezes the config, so later environment changes are not picked up', () => {
    process.env.TEST_ENVIRONMENT = 'production';

    const provider = new TestConfigProvider();

    process.env.TEST_ENVIRONMENT = 'test';

    expect(provider.get().environment).toBe('production');
  });

  it('propagates parse failures from the constructor', () => {
    delete process.env.TEST_ENVIRONMENT;

    class ThrowingProvider extends TestConfigProvider {
      protected parseEnvironment(): string {
        throw new Error('Invalid environment configuration');
      }
    }

    expect(() => new ThrowingProvider()).toThrow(
      'Invalid environment configuration',
    );
  });
});
