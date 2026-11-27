/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals -- Snap configuration executes in Node.js. */
import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';
import { config as dotenv } from 'dotenv';
import { resolve } from 'path';
import { ProvidePlugin } from 'webpack';

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
    XRPL_RPC_URL_MAINNET: process.env.XRPL_RPC_URL_MAINNET ?? '',
    XRPL_CLIO_URL_MAINNET: process.env.XRPL_CLIO_URL_MAINNET ?? '',
    XRPL_EXPLORER_MAINNET_BASE_URL:
      process.env.XRPL_EXPLORER_MAINNET_BASE_URL ?? '',
    XRPL_TRANSACTION_TIMEOUT: process.env.XRPL_TRANSACTION_TIMEOUT ?? '',
    XRPL_TRANSACTION_POLLING_ATTEMPTS:
      process.env.XRPL_TRANSACTION_POLLING_ATTEMPTS ?? '',
    XRPL_TRACK_TRANSACTION_MAX_RESCHEDULES:
      process.env.XRPL_TRACK_TRANSACTION_MAX_RESCHEDULES ?? '',
    TOKEN_API_BASE_URL: process.env.TOKEN_API_BASE_URL ?? '',
    STATIC_API_BASE_URL: process.env.STATIC_API_BASE_URL ?? '',
    PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL ?? '',
    SECURITY_ALERTS_API_BASE_URL:
      process.env.SECURITY_ALERTS_API_BASE_URL ?? '',
    XRPL_SPOT_PRICES_TTL_MILLISECONDS:
      process.env.XRPL_SPOT_PRICES_TTL_MILLISECONDS ?? '',
    XRPL_BASE_FEE_TTL_MILLISECONDS:
      process.env.XRPL_BASE_FEE_TTL_MILLISECONDS ?? '',
    XRPL_LOAD_ON_CHAIN_ACCOUNT_TTL_MILLISECONDS:
      process.env.XRPL_LOAD_ON_CHAIN_ACCOUNT_TTL_MILLISECONDS ?? '',
    XRPL_SIMULATE_TRANSACTION_TTL_MILLISECONDS:
      process.env.XRPL_SIMULATE_TRANSACTION_TTL_MILLISECONDS ?? '',
    XRPL_KEYRING_LIVE_ACCOUNT_TTL_MILLISECONDS:
      process.env.XRPL_KEYRING_LIVE_ACCOUNT_TTL_MILLISECONDS ?? '',
    XRPL_ASSET_METADATA_TTL_MILLISECONDS:
      process.env.XRPL_ASSET_METADATA_TTL_MILLISECONDS ?? '',
    XRPL_DEPOSIT_AUTHORIZED_TTL_MILLISECONDS:
      process.env.XRPL_DEPOSIT_AUTHORIZED_TTL_MILLISECONDS ?? '',
    XRPL_ACCOUNT_INFO_TTL_MILLISECONDS:
      process.env.XRPL_ACCOUNT_INFO_TTL_MILLISECONDS ?? '',
    XRPL_ACCOUNT_TRUSTLINES_TTL_MILLISECONDS:
      process.env.XRPL_ACCOUNT_TRUSTLINES_TTL_MILLISECONDS ?? '',
    XRPL_ACCOUNT_MPTOKENS_TTL_MILLISECONDS:
      process.env.XRPL_ACCOUNT_MPTOKENS_TTL_MILLISECONDS ?? '',
    XRPL_TRANSACTION_TTL_MILLISECONDS:
      process.env.XRPL_TRANSACTION_TTL_MILLISECONDS ?? '',
    XRPL_VALIDATED_LEDGER_INDEX_TTL_MILLISECONDS:
      process.env.XRPL_VALIDATED_LEDGER_INDEX_TTL_MILLISECONDS ?? '',
    XRPL_ACCOUNT_TRANSACTIONS_TTL_MILLISECONDS:
      process.env.XRPL_ACCOUNT_TRANSACTIONS_TTL_MILLISECONDS ?? '',
    XRPL_BASE_FEE_MULTIPLIER: process.env.XRPL_BASE_FEE_MULTIPLIER ?? '',
    XRPL_MAX_FEE_THRESHOLD_IN_XRP:
      process.env.XRPL_MAX_FEE_THRESHOLD_IN_XRP ?? '',
    XRPL_MAX_RECONCILE_ATTEMPTS: process.env.XRPL_MAX_RECONCILE_ATTEMPTS ?? '',
    XRPL_MAX_PENDING_TRANSACTION_AGE:
      process.env.XRPL_MAX_PENDING_TRANSACTION_AGE ?? '',
  },
  polyfills: true,
  preinstalled: {
    removable: false,
    hidden: true,
    hideSnapBranding: true,
  },
  customizeWebpackConfig: (webpackConfig) =>
    merge(webpackConfig, {
      plugins: [
        new ProvidePlugin({
          performance: '@metamask/snap-networks-utils/performance-shim',
        }),
      ],
      resolve: {
        alias: {
          eventsource: resolve(__dirname, 'src/shims/eventsource.ts'),
        },
      },
    }),
};

export default config;
/* eslint-enable no-restricted-globals */
