import {
  BaseConfigProvider,
  defaultedUrlStruct,
  LogLevelStruct,
  parseIntegerStruct,
  parseFloatStruct,
  UrlStruct,
} from '@metamask/snap-networks-utils';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  assign,
  coerce,
  defaulted,
  enums,
  object,
  string,
} from '@metamask/superstruct';

/* eslint-disable no-restricted-globals */
import { Environment, KnownCaip2ChainId } from './api';
import { getSupportedScopes } from './utils/scopes';

const DEFAULT_TOKEN_API_BASE_URL = 'https://tokens.api.cx.metamask.io';

const DEFAULT_STATIC_API_BASE_URL = 'https://static.cx.metamask.io';

const DEFAULT_PRICE_API_BASE_URL = 'https://price.api.cx.metamask.io';

const DEFAULT_SECURITY_ALERTS_API_BASE_URL =
  'https://security-alerts.api.cx.metamask.io';

const DEFAULT_EXPLORER_MAINNET_BASE_URL =
  'https://stellar.expert/explorer/public';

const DEFAULT_EXPLORER_TESTNET_BASE_URL =
  'https://stellar.expert/explorer/testnet';

const networkConfigStruct = object({
  rpcUrl: UrlStruct,
  horizonUrl: UrlStruct,
  explorerBaseUrl: UrlStruct,
});

/**
 * The network config type.
 */
export type NetworkConfig = Infer<typeof networkConfigStruct>;

/**
 * A struct for validating the network config, with a fallback explorer base
 * URL for unset or empty values.
 *
 * @param explorerBaseUrl - The explorer URL to use when the variable is unset
 * or empty.
 * @returns A struct for validating the network config.
 */
const createNetworkConfigStruct = (
  explorerBaseUrl: string,
): Struct<NetworkConfig> =>
  assign(
    networkConfigStruct,
    object({
      explorerBaseUrl: defaultedUrlStruct(explorerBaseUrl),
    }),
  );

const mainnetNetworkConfigStruct = createNetworkConfigStruct(
  DEFAULT_EXPLORER_MAINNET_BASE_URL,
);

const testnetNetworkConfigStruct = createNetworkConfigStruct(
  DEFAULT_EXPLORER_TESTNET_BASE_URL,
);

/**
 * A struct to validate and coerce the selected network from env.
 * Converts the selected network to lowercase and checks if it is a valid selected network.
 * If the selected network is empty, it returns the default selected network.
 *
 * @returns A struct for validating the selected network.
 */
const selectedNetworkStruct = coerce(
  defaulted(enums(getSupportedScopes()), KnownCaip2ChainId.Mainnet),
  string(),
  (value: string) => (value === '' ? undefined : value.toLowerCase()),
);

/**
 * A struct for validating the config.
 */
export const ConfigStruct = object({
  environment: enums(Object.values(Environment)),
  logLevel: LogLevelStruct,
  networks: object({
    [KnownCaip2ChainId.Mainnet]: mainnetNetworkConfigStruct,
    [KnownCaip2ChainId.Testnet]: testnetNetworkConfigStruct,
  }),
  selectedNetwork: selectedNetworkStruct,
  transaction: object({
    timeout: parseIntegerStruct(100, 180),
    pollingAttempts: parseIntegerStruct(0, 10),
    /**
     * Maximum background reschedules for the track-transaction cron job while Horizon has not
     * indexed the transaction (404). Each reschedule is a separate cron run via
     * `scheduleBackgroundEvent`, not an in-process retry loop.
     */
    trackTransactionMaxReschedules: parseIntegerStruct(0, 10),
    /**
     * Multiplier applied to the Stellar network base fee to set the per-operation inclusion fee on
     * submitted transactions. Inclusion fee determines ledger ordering; it is separate from
     * the Soroban resource fee returned by simulation.
     *
     * @see https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering
     */
    baseFeeMultiplier: parseFloatStruct(1, 10),
    /**
     * The maximum fee threshold in XLM for the Stellar network.
     */
    maxFeeThresholdInXLM: parseFloatStruct(1, 1),
    /**
     * The maximum number of Horizon not-found reconcile attempts for a pending transaction.
     * Used with `maxPendingTransactionAge` to evict stale pending txs from snap state;
     * both limits must be exceeded before a pending tx is dropped.
     * Minimum value is 2 to avoid dropping the pending transaction too early.
     */
    maxReconcileAttempts: parseIntegerStruct(2, 5),
    /**
     * The maximum age of a pending transaction in milliseconds.
     * Used with `maxReconcileAttempts` to evict stale pending txs from snap state;
     * both limits must be exceeded before a pending tx is dropped.
     * Minimum value is 15000 to avoid dropping the pending transaction too early.
     */
    maxPendingTransactionAge: parseIntegerStruct(15000, 30000),
  }),
  api: object({
    tokenApi: object({
      baseUrl: defaultedUrlStruct(DEFAULT_TOKEN_API_BASE_URL),
    }),
    staticApi: object({
      baseUrl: defaultedUrlStruct(DEFAULT_STATIC_API_BASE_URL),
    }),
    priceApi: object({
      baseUrl: defaultedUrlStruct(DEFAULT_PRICE_API_BASE_URL),
    }),
    securityAlertsApi: object({
      baseUrl: defaultedUrlStruct(DEFAULT_SECURITY_ALERTS_API_BASE_URL),
    }),
  }),
  cache: object({
    ttlMilliseconds: object({
      // 1 hour
      spotPrices: parseIntegerStruct(1000, 60 * 60 * 1000 * 1),
      // 1 hour
      baseFee: parseIntegerStruct(1000, 60 * 60 * 1000 * 1),
      // 10 minutes (Horizon account payload; aligns with on-chain account cache usage)
      loadOnChainAccount: parseIntegerStruct(1000, 10 * 60 * 1000 * 1),
      // Short: simulation is sequence- and footprint-sensitive
      simulateTransaction: parseIntegerStruct(1000, 10 * 1000),
      // SEP-41 balance reads (multicall on mainnet)
      sep41AssetBalance: parseIntegerStruct(1000, 30 * 1000),
    }),
  }),
});

/**
 * The config type.
 */
export type Config = Infer<typeof ConfigStruct>;

/**
 * The environment consumed by the snap. Each `process.env` reference is
 * replaced with its build-time value (see `snap.config.ts`).
 */
const ENVIRONMENT = {
  environment: process.env.ENVIRONMENT,
  logLevel: process.env.LOG_LEVEL,
  networks: {
    [KnownCaip2ChainId.Mainnet]: {
      rpcUrl: process.env.STELLAR_RPC_URL_MAINNET,
      horizonUrl: process.env.STELLAR_HORIZON_URL_MAINNET,
      explorerBaseUrl: process.env.STELLAR_EXPLORER_MAINNET_BASE_URL,
    },
    [KnownCaip2ChainId.Testnet]: {
      rpcUrl: process.env.STELLAR_RPC_URL_TESTNET,
      horizonUrl: process.env.STELLAR_HORIZON_URL_TESTNET,
      explorerBaseUrl: process.env.STELLAR_EXPLORER_TESTNET_BASE_URL,
    },
  },
  selectedNetwork: KnownCaip2ChainId.Mainnet,
  transaction: {
    timeout: process.env.STELLAR_TRANSACTION_TIMEOUT,
    pollingAttempts: process.env.STELLAR_TRANSACTION_POLLING_ATTEMPTS,
    trackTransactionMaxReschedules:
      process.env.STELLAR_TRACK_TRANSACTION_MAX_RESCHEDULES,
    baseFeeMultiplier: process.env.STELLAR_BASE_FEE_MULTIPLIER,
    maxFeeThresholdInXLM: process.env.STELLAR_MAX_FEE_THRESHOLD_IN_XLM,
    maxReconcileAttempts: process.env.STELLAR_MAX_RECONCILE_ATTEMPTS,
    maxPendingTransactionAge: process.env.STELLAR_MAX_PENDING_TRANSACTION_AGE,
  },
  api: {
    tokenApi: {
      baseUrl: process.env.TOKEN_API_BASE_URL,
    },
    staticApi: {
      baseUrl: process.env.STATIC_API_BASE_URL,
    },
    priceApi: {
      baseUrl: process.env.PRICE_API_BASE_URL,
    },
    securityAlertsApi: {
      baseUrl: process.env.SECURITY_ALERTS_API_BASE_URL,
    },
  },
  cache: {
    ttlMilliseconds: {
      spotPrices: process.env.STELLAR_SPOT_PRICES_TTL_MILLISECONDS,
      baseFee: process.env.STELLAR_BASE_FEE_TTL_MILLISECONDS,
      loadOnChainAccount:
        process.env.STELLAR_LOAD_ON_CHAIN_ACCOUNT_TTL_MILLISECONDS,
      simulateTransaction:
        process.env.STELLAR_SIMULATE_TRANSACTION_TTL_MILLISECONDS,
      sep41AssetBalance:
        process.env.STELLAR_SEP41_ASSET_BALANCE_TTL_MILLISECONDS,
    },
  },
};

/**
 * The configuration provider of the snap.
 * The environment is parsed and the config built exactly once, when this
 * module is imported.
 *
 * @example
 * const { selectedNetwork } = configProvider.config;
 */
export const configProvider = new BaseConfigProvider(ENVIRONMENT, ConfigStruct);

/**
 * The app config.
 * Built once from env vars injected at build time (see snap.config.ts).
 * Validation throws if the config is invalid; ensure required env vars are
 * set when building the Snap.
 */
export const AppConfig = configProvider.config;
