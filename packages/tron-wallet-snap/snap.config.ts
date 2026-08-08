import type { SnapConfig } from '@metamask/snaps-cli';
import { config as dotenv } from 'dotenv';
import { resolve } from 'path';

dotenv();

const defaultUrl = (value: string | undefined, fallback: string): string =>
  value && value.length > 0 ? value : fallback;

const config: SnapConfig = {
  input: resolve(__dirname, 'src/index.ts'),
  server: {
    port: 8080,
  },
  environment: {
    ENVIRONMENT: process.env.ENVIRONMENT || 'local',
    RPC_URL_LIST_MAINNET: defaultUrl(
      process.env.RPC_URL_LIST_MAINNET,
      'https://example.com/tron-mainnet',
    ),
    RPC_URL_LIST_NILE_TESTNET: defaultUrl(
      process.env.RPC_URL_LIST_NILE_TESTNET,
      'https://example.com/tron-nile',
    ),
    RPC_URL_LIST_SHASTA_TESTNET: defaultUrl(
      process.env.RPC_URL_LIST_SHASTA_TESTNET,
      'https://example.com/tron-shasta',
    ),
    EXPLORER_MAINNET_BASE_URL: defaultUrl(
      process.env.EXPLORER_MAINNET_BASE_URL,
      'https://tronscan.org/',
    ),
    EXPLORER_NILE_BASE_URL: defaultUrl(
      process.env.EXPLORER_NILE_BASE_URL,
      'https://nile.tronscan.org/',
    ),
    EXPLORER_SHASTA_BASE_URL: defaultUrl(
      process.env.EXPLORER_SHASTA_BASE_URL,
      'https://shasta.tronscan.org/',
    ),
    PRICE_API_BASE_URL: defaultUrl(
      process.env.PRICE_API_BASE_URL,
      'https://example.com/price/',
    ),
    TOKEN_API_BASE_URL: defaultUrl(
      process.env.TOKEN_API_BASE_URL,
      'https://example.com/token/',
    ),
    STATIC_API_BASE_URL: defaultUrl(
      process.env.STATIC_API_BASE_URL,
      'https://example.com/static/',
    ),
    SECURITY_ALERTS_API_BASE_URL: defaultUrl(
      process.env.SECURITY_ALERTS_API_BASE_URL,
      'https://example.com/security/',
    ),
    NFT_API_BASE_URL: defaultUrl(
      process.env.NFT_API_BASE_URL,
      'https://example.com/nft/',
    ),
    LOCAL_API_BASE_URL: defaultUrl(
      process.env.LOCAL_API_BASE_URL,
      'http://127.0.0.1:3000',
    ),
    TRONGRID_BASE_URL_MAINNET: defaultUrl(
      process.env.TRONGRID_BASE_URL_MAINNET,
      'https://example.com/trongrid-mainnet/',
    ),
    TRONGRID_BASE_URL_NILE: defaultUrl(
      process.env.TRONGRID_BASE_URL_NILE,
      'https://example.com/trongrid-nile/',
    ),
    TRONGRID_BASE_URL_SHASTA: defaultUrl(
      process.env.TRONGRID_BASE_URL_SHASTA,
      'https://example.com/trongrid-shasta/',
    ),
    TRON_HTTP_BASE_URL_MAINNET: defaultUrl(
      process.env.TRON_HTTP_BASE_URL_MAINNET,
      'https://example.com/tron-http-mainnet/',
    ),
    TRON_HTTP_BASE_URL_NILE: defaultUrl(
      process.env.TRON_HTTP_BASE_URL_NILE,
      'https://example.com/tron-http-nile/',
    ),
    TRON_HTTP_BASE_URL_SHASTA: defaultUrl(
      process.env.TRON_HTTP_BASE_URL_SHASTA,
      'https://example.com/tron-http-shasta/',
    ),
  },
  polyfills: true,
};

export default config;
