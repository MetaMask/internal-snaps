/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals -- Snap configuration executes in Node.js. */
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
    // RPC
    RPC_URL_LIST_MAINNET: process.env.RPC_URL_LIST_MAINNET ?? '',
    RPC_URL_LIST_NILE_TESTNET: process.env.RPC_URL_LIST_NILE_TESTNET ?? '',
    RPC_URL_LIST_SHASTA_TESTNET: process.env.RPC_URL_LIST_SHASTA_TESTNET ?? '',
    // Block explorer
    EXPLORER_MAINNET_BASE_URL: process.env.EXPLORER_MAINNET_BASE_URL ?? '',
    EXPLORER_NILE_BASE_URL: process.env.EXPLORER_NILE_BASE_URL ?? '',
    EXPLORER_SHASTA_BASE_URL: process.env.EXPLORER_SHASTA_BASE_URL ?? '',
    // APIs
    PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL ?? '',
    TOKEN_API_BASE_URL: process.env.TOKEN_API_BASE_URL ?? '',
    STATIC_API_BASE_URL: process.env.STATIC_API_BASE_URL ?? '',
    SECURITY_ALERTS_API_BASE_URL:
      process.env.SECURITY_ALERTS_API_BASE_URL ?? '',
    NFT_API_BASE_URL: process.env.NFT_API_BASE_URL ?? '',
    LOCAL_API_BASE_URL: process.env.LOCAL_API_BASE_URL ?? '',
    // TronGrid API
    TRONGRID_BASE_URL_MAINNET: process.env.TRONGRID_BASE_URL_MAINNET ?? '',
    TRONGRID_BASE_URL_NILE: process.env.TRONGRID_BASE_URL_NILE ?? '',
    TRONGRID_BASE_URL_SHASTA: process.env.TRONGRID_BASE_URL_SHASTA ?? '',
    // Tron HTTP API
    TRON_HTTP_BASE_URL_MAINNET: process.env.TRON_HTTP_BASE_URL_MAINNET ?? '',
    TRON_HTTP_BASE_URL_NILE: process.env.TRON_HTTP_BASE_URL_NILE ?? '',
    TRON_HTTP_BASE_URL_SHASTA: process.env.TRON_HTTP_BASE_URL_SHASTA ?? '',
  },
  polyfills: {
    assert: true,
    buffer: true,
    crypto: true,
    events: true,
    http: true,
    https: true,
    punycode: true,
    stream: true,
    string_decoder: true,
    url: true,
    util: true,
    zlib: true,
  },
  preinstalled: {
    removable: false,
    hideSnapBranding: true,
  },
};

export default config;
