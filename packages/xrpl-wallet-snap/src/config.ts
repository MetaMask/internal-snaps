import {
  BaseConfigProvider,
  LogLevelStruct,
  parseIntegerStruct,
  parseFloatStruct,
  UrlStruct,
  Environment,
} from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import { enums, object } from '@metamask/superstruct';

/* eslint-disable no-restricted-globals */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { KnownCaip2ChainId } from './api';
import { getSupportedScopes } from './utils/scopes';

const DEFAULT_TOKEN_API_BASE_URL = 'https://tokens.api.cx.metamask.io';

const DEFAULT_STATIC_API_BASE_URL = 'https://static.cx.metamask.io';

const DEFAULT_PRICE_API_BASE_URL = 'https://price.api.cx.metamask.io';

const DEFAULT_SECURITY_ALERTS_API_BASE_URL =
  'https://security-alerts.api.cx.metamask.io';

const DEFAULT_EXPLORER_MAINNET_BASE_URL = 'https://xrpl.expert/explorer/public';

const networkConfigStruct = object({
  rpcUrl: UrlStruct,
  clioUrl: UrlStruct,
  explorerBaseUrl: UrlStruct,
  timeout: parseIntegerStruct(100, 10_000),
});

/**
 * The network config type.
 */
export type NetworkConfig = Infer<typeof networkConfigStruct>;

/**
 * A struct for validating the config.
 */
export const ConfigStruct = object({
  environment: enums(Object.values(Environment)),
  logLevel: LogLevelStruct,
  networks: object({
    [KnownCaip2ChainId.Mainnet]: networkConfigStruct,
  }),
  selectedNetwork: enums(getSupportedScopes()),
  transaction: object({
    timeout: parseIntegerStruct(100, 180),
    pollingAttempts: parseIntegerStruct(0, 10),
    /**
     * Maximum background reschedules for the track-transaction cron job.
     */
    trackTransactionMaxReschedules: parseIntegerStruct(0, 10),
    /**
     * Multiplier applied to the Xrpl network base fee.
     *
     * @see https://developers.xrpl.org/docs/learn/fundamentals/fees-resource-limits-metering
     */
    baseFeeMultiplier: parseFloatStruct(1, 10),
    /**
     * The maximum fee threshold in XRP for the Xrpl network.
     */
    maxFeeThresholdInXRP: parseFloatStruct(1, 1),
    /**
     * The maximum number of ledger not-found reconcile attempts for a pending transaction.
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
      baseUrl: UrlStruct,
    }),
    staticApi: object({
      baseUrl: UrlStruct,
    }),
    priceApi: object({
      baseUrl: UrlStruct,
    }),
    securityAlertsApi: object({
      baseUrl: UrlStruct,
    }),
  }),
  cache: object({
    ttlMilliseconds: object({
      // 1 hour
      spotPrices: parseIntegerStruct(1000, 60 * 60 * 1000 * 1),
      // 1 hour
      baseFee: parseIntegerStruct(1000, 60 * 60 * 1000 * 1),
      // 10 minutes. Account payload used while resolving an account.
      loadOnChainAccount: parseIntegerStruct(1000, 10 * 60 * 1000 * 1),
      // 5 seconds. Keyring asset and balance reads reuse this snapshot.
      fetchOnChainAccount: parseIntegerStruct(1000, 5 * 1000),
      // Short: simulation is sequence- and footprint-sensitive
      simulateTransaction: parseIntegerStruct(1000, 10 * 1000),
      // 1 hour — token API asset catalog. Account sync hot-reloads when older.
      assetMetadata: parseIntegerStruct(1000, 60 * 60 * 1000),
      // NetworkService reads. `sendTransaction` is not cached.
      depositAuthorized: parseIntegerStruct(1000, 10 * 30 * 1000),
      accountInfo: parseIntegerStruct(1000, 10 * 1000),
      accountTrustlines: parseIntegerStruct(1000, 10 * 1000),
      accountMptokens: parseIntegerStruct(1000, 10 * 1000),
      transaction: parseIntegerStruct(1000, 10 * 1000),
      validatedLedgerIndex: parseIntegerStruct(1000, 5 * 1000),
      mptIssuances: parseIntegerStruct(1000, 60 * 60 * 1000),
      accountTransactions: parseIntegerStruct(1000, 10 * 1000),
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
      // TODO: remove the default values once the env vars are set
      rpcUrl: process.env.XRPL_RPC_URL_MAINNET || "https://xrplcluster.com",
      clioUrl: process.env.XRPL_CLIO_URL_MAINNET || "https://s1.ripple.com:51234",
      explorerBaseUrl:
        process.env.XRPL_EXPLORER_MAINNET_BASE_URL ||
        DEFAULT_EXPLORER_MAINNET_BASE_URL,
    },
  },
  selectedNetwork: KnownCaip2ChainId.Mainnet,
  transaction: {
    timeout: process.env.XRPL_TRANSACTION_TIMEOUT,
    pollingAttempts: process.env.XRPL_TRANSACTION_POLLING_ATTEMPTS,
    trackTransactionMaxReschedules:
      process.env.XRPL_TRACK_TRANSACTION_MAX_RESCHEDULES,
    baseFeeMultiplier: process.env.XRPL_BASE_FEE_MULTIPLIER,
    maxFeeThresholdInXRP: process.env.XRPL_MAX_FEE_THRESHOLD_IN_XRP,
    maxReconcileAttempts: process.env.XRPL_MAX_RECONCILE_ATTEMPTS,
    maxPendingTransactionAge: process.env.XRPL_MAX_PENDING_TRANSACTION_AGE,
  },
  api: {
    tokenApi: {
      baseUrl: process.env.TOKEN_API_BASE_URL || DEFAULT_TOKEN_API_BASE_URL,
    },
    staticApi: {
      baseUrl: process.env.STATIC_API_BASE_URL || DEFAULT_STATIC_API_BASE_URL,
    },
    priceApi: {
      baseUrl: process.env.PRICE_API_BASE_URL || DEFAULT_PRICE_API_BASE_URL,
    },
    securityAlertsApi: {
      baseUrl:
        process.env.SECURITY_ALERTS_API_BASE_URL ||
        DEFAULT_SECURITY_ALERTS_API_BASE_URL,
    },
  },
  cache: {
    ttlMilliseconds: {
      spotPrices: process.env.XRPL_SPOT_PRICES_TTL_MILLISECONDS,
      baseFee: process.env.XRPL_BASE_FEE_TTL_MILLISECONDS,
      loadOnChainAccount:
        process.env.XRPL_LOAD_ON_CHAIN_ACCOUNT_TTL_MILLISECONDS,
      simulateTransaction:
        process.env.XRPL_SIMULATE_TRANSACTION_TTL_MILLISECONDS,
      fetchOnChainAccount:
        process.env.XRPL_KEYRING_LIVE_ACCOUNT_TTL_MILLISECONDS,
      assetMetadata: process.env.XRPL_ASSET_METADATA_TTL_MILLISECONDS,
      depositAuthorized: process.env.XRPL_DEPOSIT_AUTHORIZED_TTL_MILLISECONDS,
      accountInfo: process.env.XRPL_ACCOUNT_INFO_TTL_MILLISECONDS,
      accountTrustlines: process.env.XRPL_ACCOUNT_TRUSTLINES_TTL_MILLISECONDS,
      accountMptokens: process.env.XRPL_ACCOUNT_MPTOKENS_TTL_MILLISECONDS,
      transaction: process.env.XRPL_TRANSACTION_TTL_MILLISECONDS,
      validatedLedgerIndex:
        process.env.XRPL_VALIDATED_LEDGER_INDEX_TTL_MILLISECONDS,
      mptIssuances: process.env.XRPL_MPT_ISSUANCES_TTL_MILLISECONDS,
      accountTransactions:
        process.env.XRPL_ACCOUNT_TRANSACTIONS_TTL_MILLISECONDS,
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

/* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
