import type { SnapConfig } from '@metamask/snaps-cli';
import { config as dotenv } from 'dotenv';
import { resolve } from 'path';

dotenv();

const config: SnapConfig = {
  input: resolve(__dirname, 'src/index.ts'),
  typescript: {
    enabled: true,
  },
  server: {
    port: 8080,
  },
  environment: {
    ENVIRONMENT: process.env.ENVIRONMENT ?? '',
    LOG_LEVEL: process.env.LOG_LEVEL ?? '',
    STELLAR_RPC_URL_MAINNET: process.env.STELLAR_RPC_URL_MAINNET ?? '',
    STELLAR_HORIZON_URL_MAINNET: process.env.STELLAR_HORIZON_URL_MAINNET ?? '',
    STELLAR_EXPLORER_MAINNET_BASE_URL:
      process.env.STELLAR_EXPLORER_MAINNET_BASE_URL ?? '',
    STELLAR_RPC_URL_TESTNET: process.env.STELLAR_RPC_URL_TESTNET ?? '',
    STELLAR_HORIZON_URL_TESTNET: process.env.STELLAR_HORIZON_URL_TESTNET ?? '',
    STELLAR_EXPLORER_TESTNET_BASE_URL:
      process.env.STELLAR_EXPLORER_TESTNET_BASE_URL ?? '',
    STELLAR_TRANSACTION_TIMEOUT: process.env.STELLAR_TRANSACTION_TIMEOUT ?? '',
    STELLAR_TRANSACTION_POLLING_ATTEMPTS:
      process.env.STELLAR_TRANSACTION_POLLING_ATTEMPTS ?? '',
    STELLAR_TRACK_TRANSACTION_MAX_RESCHEDULES:
      process.env.STELLAR_TRACK_TRANSACTION_MAX_RESCHEDULES ?? '',
    TOKEN_API_BASE_URL: process.env.TOKEN_API_BASE_URL ?? '',
    STATIC_API_BASE_URL: process.env.STATIC_API_BASE_URL ?? '',
    PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL ?? '',
    SECURITY_ALERTS_API_BASE_URL:
      process.env.SECURITY_ALERTS_API_BASE_URL ?? '',
    STELLAR_SPOT_PRICES_TTL_MILLISECONDS:
      process.env.STELLAR_SPOT_PRICES_TTL_MILLISECONDS ?? '',
    STELLAR_BASE_FEE_TTL_MILLISECONDS:
      process.env.STELLAR_BASE_FEE_TTL_MILLISECONDS ?? '',
    STELLAR_LOAD_ON_CHAIN_ACCOUNT_TTL_MILLISECONDS:
      process.env.STELLAR_LOAD_ON_CHAIN_ACCOUNT_TTL_MILLISECONDS ?? '',
    STELLAR_SIMULATE_TRANSACTION_TTL_MILLISECONDS:
      process.env.STELLAR_SIMULATE_TRANSACTION_TTL_MILLISECONDS ?? '',
    STELLAR_SEP41_ASSET_BALANCE_TTL_MILLISECONDS:
      process.env.STELLAR_SEP41_ASSET_BALANCE_TTL_MILLISECONDS ?? '',
    STELLAR_BASE_FEE_MULTIPLIER: process.env.STELLAR_BASE_FEE_MULTIPLIER ?? '',
    STELLAR_MAX_FEE_THRESHOLD_IN_XLM:
      process.env.STELLAR_MAX_FEE_THRESHOLD_IN_XLM ?? '',
    STELLAR_MAX_RECONCILE_ATTEMPTS:
      process.env.STELLAR_MAX_RECONCILE_ATTEMPTS ?? '',
    STELLAR_MAX_PENDING_TRANSACTION_AGE:
      process.env.STELLAR_MAX_PENDING_TRANSACTION_AGE ?? '',
  },
  polyfills: true,
  preinstalled: {
    removable: false,
    hidden: true,
    hideSnapBranding: true,
  },
};

export default config;
