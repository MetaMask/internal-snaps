import { BaseConfigProvider, LogLevel } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from './api/network';
import { ConfigStruct } from './config';

/**
 * The same raw environment variables consumed before the shared
 * `BaseConfigProvider` was adopted. Values mirror the build-time injection
 * defaults (see `snap.config.ts`).
 */
const FULL_ENVIRONMENT = {
  environment: 'production',
  logLevel: 'error',
  networks: {
    [KnownCaip2ChainId.Mainnet]: {
      rpcUrl: 'https://rpc.mainnet.example.com',
      clioUrl: 'https://clio.mainnet.example.com',
      explorerBaseUrl: 'https://explorer.mainnet.example.com',
      timeout: '5000',
    },
  },
  selectedNetwork: KnownCaip2ChainId.Mainnet,
  transaction: {
    timeout: '120',
    pollingAttempts: '5',
    trackTransactionMaxReschedules: '3',
    baseFeeMultiplier: '2.5',
    maxFeeThresholdInXRP: '1',
    maxReconcileAttempts: '4',
    maxPendingTransactionAge: '25000',
  },
  api: {
    tokenApi: {
      baseUrl: 'https://tokens.example.com',
    },
    staticApi: {
      baseUrl: 'https://static.example.com',
    },
    priceApi: {
      baseUrl: 'https://price.example.com',
    },
    securityAlertsApi: {
      baseUrl: 'https://alerts.example.com',
    },
  },
  cache: {
    ttlMilliseconds: {
      spotPrices: '60000',
      baseFee: '45000',
      loadOnChainAccount: '30000',
      simulateTransaction: '8000',
      fetchOnChainAccount: '5000',
      assetMetadata: '900000',
      depositAuthorized: '120000',
      accountInfo: '7000',
      accountTrustlines: '8000',
      accountMptokens: '9000',
      transaction: '6000',
      validatedLedgerIndex: '4000',
      mptIssuances: '800000',
      accountTransactions: '7500',
    },
  },
};

describe('ConfigProvider', () => {
  describe('log level', () => {
    it.each(Object.values(LogLevel))(
      'accepts valid log level: %s',
      (logLevel) => {
        const { config } = new BaseConfigProvider(
          { ...FULL_ENVIRONMENT, logLevel },
          ConfigStruct,
        );

        expect(config.logLevel).toBe(logLevel);
      },
    );

    it.each(['ERROR', 'Warn', 'INFO', 'Debug', 'TRACE', 'Silent'])(
      'coerces "%s" to lowercase',
      (logLevel) => {
        const { config } = new BaseConfigProvider(
          { ...FULL_ENVIRONMENT, logLevel },
          ConfigStruct,
        );

        expect(config.logLevel).toBe(logLevel.toLowerCase());
      },
    );

    it.each([undefined, ''])(
      'defaults empty or missing log level to silent: %j',
      (logLevel) => {
        const { config } = new BaseConfigProvider(
          { ...FULL_ENVIRONMENT, logLevel },
          ConfigStruct,
        );

        expect(config.logLevel).toBe(LogLevel.SILENT);
      },
    );

    it('rejects an invalid log level', () => {
      expect(
        () =>
          new BaseConfigProvider(
            { ...FULL_ENVIRONMENT, logLevel: 'invalid-log-level' },
            ConfigStruct,
          ),
      ).toThrow('Invalid environment configuration');
    });
  });

  describe('networks', () => {
    it('builds the configured network URLs', () => {
      const { config } = new BaseConfigProvider(FULL_ENVIRONMENT, ConfigStruct);

      expect(config.networks).toStrictEqual({
        [KnownCaip2ChainId.Mainnet]: {
          rpcUrl: 'https://rpc.mainnet.example.com',
          clioUrl: 'https://clio.mainnet.example.com',
          explorerBaseUrl: 'https://explorer.mainnet.example.com',
          timeout: 5000,
        },
      });
      expect(config.selectedNetwork).toBe(KnownCaip2ChainId.Mainnet);
    });

    it('defaults an empty network timeout', () => {
      const { config } = new BaseConfigProvider(
        {
          ...FULL_ENVIRONMENT,
          networks: {
            ...FULL_ENVIRONMENT.networks,
            [KnownCaip2ChainId.Mainnet]: {
              ...FULL_ENVIRONMENT.networks[KnownCaip2ChainId.Mainnet],
              timeout: '',
            },
          },
        },
        ConfigStruct,
      );

      expect(config.networks[KnownCaip2ChainId.Mainnet].timeout).toBe(10_000);
    });

    it.each([
      [
        'a malformed RPC URL',
        {
          networks: {
            ...FULL_ENVIRONMENT.networks,
            [KnownCaip2ChainId.Mainnet]: {
              ...FULL_ENVIRONMENT.networks[KnownCaip2ChainId.Mainnet],
              rpcUrl: 'not-a-url',
            },
          },
        },
      ],
      [
        'a malformed Clio URL',
        {
          networks: {
            ...FULL_ENVIRONMENT.networks,
            [KnownCaip2ChainId.Mainnet]: {
              ...FULL_ENVIRONMENT.networks[KnownCaip2ChainId.Mainnet],
              clioUrl: 'not-a-url',
            },
          },
        },
      ],
      [
        'a malformed explorer URL',
        {
          networks: {
            ...FULL_ENVIRONMENT.networks,
            [KnownCaip2ChainId.Mainnet]: {
              ...FULL_ENVIRONMENT.networks[KnownCaip2ChainId.Mainnet],
              explorerBaseUrl: 'not-a-url',
            },
          },
        },
      ],
      [
        'a network timeout below the minimum',
        {
          networks: {
            ...FULL_ENVIRONMENT.networks,
            [KnownCaip2ChainId.Mainnet]: {
              ...FULL_ENVIRONMENT.networks[KnownCaip2ChainId.Mainnet],
              timeout: '50',
            },
          },
        },
      ],
    ])('fails fast for %s', (_label, overrides) => {
      expect(
        () =>
          new BaseConfigProvider(
            { ...FULL_ENVIRONMENT, ...overrides },
            ConfigStruct,
          ),
      ).toThrow('Invalid environment configuration');
    });
  });

  describe('transaction', () => {
    it('builds the configured transaction values', () => {
      const { config } = new BaseConfigProvider(FULL_ENVIRONMENT, ConfigStruct);

      expect(config.transaction).toStrictEqual({
        timeout: 120,
        pollingAttempts: 5,
        trackTransactionMaxReschedules: 3,
        baseFeeMultiplier: 2.5,
        maxFeeThresholdInXRP: 1,
        maxReconcileAttempts: 4,
        maxPendingTransactionAge: 25000,
      });
    });

    it('uses the defaults for unset or empty values', () => {
      const { config } = new BaseConfigProvider(
        {
          ...FULL_ENVIRONMENT,
          transaction: {
            timeout: '',
            pollingAttempts: undefined,
            trackTransactionMaxReschedules: '',
            baseFeeMultiplier: undefined,
            maxFeeThresholdInXRP: '',
            maxReconcileAttempts: undefined,
            maxPendingTransactionAge: '',
          },
        },
        ConfigStruct,
      );

      expect(config.transaction).toStrictEqual({
        timeout: 180,
        pollingAttempts: 10,
        trackTransactionMaxReschedules: 10,
        baseFeeMultiplier: 10,
        maxFeeThresholdInXRP: 1,
        maxReconcileAttempts: 5,
        maxPendingTransactionAge: 30000,
      });
    });

    it.each([
      ['a malformed integer', { timeout: 'abc' }],
      ['a float below the minimum', { baseFeeMultiplier: '0.5' }],
      ['an integer below the minimum', { maxReconcileAttempts: '0' }],
    ])('fails fast for %s', (_label, overrides) => {
      expect(
        () =>
          new BaseConfigProvider(
            {
              ...FULL_ENVIRONMENT,
              transaction: { ...FULL_ENVIRONMENT.transaction, ...overrides },
            },
            ConfigStruct,
          ),
      ).toThrow('Invalid environment configuration');
    });
  });

  describe('apis', () => {
    it('builds the configured API base URLs', () => {
      const { config } = new BaseConfigProvider(FULL_ENVIRONMENT, ConfigStruct);

      expect(config.api).toStrictEqual({
        tokenApi: { baseUrl: 'https://tokens.example.com' },
        staticApi: { baseUrl: 'https://static.example.com' },
        priceApi: { baseUrl: 'https://price.example.com' },
        securityAlertsApi: { baseUrl: 'https://alerts.example.com' },
      });
    });

    it('fails fast for a malformed API URL', () => {
      expect(
        () =>
          new BaseConfigProvider(
            {
              ...FULL_ENVIRONMENT,
              api: {
                ...FULL_ENVIRONMENT.api,
                tokenApi: { baseUrl: 'not-a-url' },
              },
            },
            ConfigStruct,
          ),
      ).toThrow('Invalid environment configuration');
    });
  });

  describe('cache', () => {
    it('builds the configured cache TTLs', () => {
      const { config } = new BaseConfigProvider(FULL_ENVIRONMENT, ConfigStruct);

      expect(config.cache.ttlMilliseconds).toStrictEqual({
        spotPrices: 60000,
        baseFee: 45000,
        loadOnChainAccount: 30000,
        simulateTransaction: 8000,
        fetchOnChainAccount: 5000,
        assetMetadata: 900000,
        depositAuthorized: 120000,
        accountInfo: 7000,
        accountTrustlines: 8000,
        accountMptokens: 9000,
        transaction: 6000,
        validatedLedgerIndex: 4000,
        mptIssuances: 800000,
        accountTransactions: 7500,
      });
    });

    it('uses the defaults for unset or empty TTLs', () => {
      const { config } = new BaseConfigProvider(
        {
          ...FULL_ENVIRONMENT,
          cache: {
            ttlMilliseconds: {
              spotPrices: '',
              baseFee: undefined,
              loadOnChainAccount: '',
              simulateTransaction: undefined,
              fetchOnChainAccount: undefined,
              assetMetadata: '',
              depositAuthorized: '',
              accountInfo: undefined,
              accountTrustlines: '',
              accountMptokens: undefined,
              transaction: '',
              validatedLedgerIndex: undefined,
              mptIssuances: '',
              accountTransactions: undefined,
            },
          },
        },
        ConfigStruct,
      );

      expect(config.cache.ttlMilliseconds).toStrictEqual({
        spotPrices: 60 * 60 * 1000,
        baseFee: 60 * 60 * 1000,
        loadOnChainAccount: 10 * 60 * 1000,
        simulateTransaction: 10 * 1000,
        fetchOnChainAccount: 5 * 1000,
        assetMetadata: 60 * 60 * 1000,
        depositAuthorized: 10 * 30 * 1000,
        accountInfo: 10 * 1000,
        accountTrustlines: 10 * 1000,
        accountMptokens: 10 * 1000,
        transaction: 10 * 1000,
        validatedLedgerIndex: 5 * 1000,
        mptIssuances: 60 * 60 * 1000,
        accountTransactions: 10 * 1000,
      });
    });
  });

  it('fails fast for an invalid environment', () => {
    expect(
      () =>
        new BaseConfigProvider(
          { ...FULL_ENVIRONMENT, environment: 'staging' },
          ConfigStruct,
        ),
    ).toThrow('Invalid environment configuration');
  });
});
