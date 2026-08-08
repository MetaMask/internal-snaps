/* eslint-disable n/no-process-env */
import type { SnapConfig } from '@metamask/snaps-cli';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config();

const defaultUrl = (value: string | undefined, fallback: string): string =>
  value && value.length > 0 ? value : fallback;

const environment = {
  // Empty ENVIRONMENT must fall back; `??` would keep ''.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  ENVIRONMENT: process.env.ENVIRONMENT || 'local',
  RPC_URL_MAINNET_LIST: defaultUrl(
    process.env.RPC_URL_MAINNET_LIST,
    'https://example.com/solana-mainnet',
  ),
  RPC_URL_DEVNET_LIST: defaultUrl(
    process.env.RPC_URL_DEVNET_LIST,
    'https://example.com/solana-devnet',
  ),
  RPC_URL_TESTNET_LIST: defaultUrl(
    process.env.RPC_URL_TESTNET_LIST,
    'https://example.com/solana-testnet',
  ),
  RPC_URL_LOCALNET_LIST: defaultUrl(
    process.env.RPC_URL_LOCALNET_LIST,
    'http://127.0.0.1:8899',
  ),
  RPC_WEB_SOCKET_URL_MAINNET: defaultUrl(
    process.env.RPC_WEB_SOCKET_URL_MAINNET,
    'wss://example.com/solana-mainnet',
  ),
  RPC_WEB_SOCKET_URL_DEVNET: defaultUrl(
    process.env.RPC_WEB_SOCKET_URL_DEVNET,
    'wss://example.com/solana-devnet',
  ),
  RPC_WEB_SOCKET_URL_TESTNET: defaultUrl(
    process.env.RPC_WEB_SOCKET_URL_TESTNET,
    'wss://example.com/solana-testnet',
  ),
  RPC_WEB_SOCKET_URL_LOCALNET: defaultUrl(
    process.env.RPC_WEB_SOCKET_URL_LOCALNET,
    'wss://example.com/solana-localnet',
  ),
  EXPLORER_BASE_URL: defaultUrl(
    process.env.EXPLORER_BASE_URL,
    'https://solscan.io',
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
};

const config: SnapConfig = {
  input: resolve(__dirname, 'src/index.ts'),
  server: {
    port: 8080,
  },
  environment,
  polyfills: {
    buffer: true,
    crypto: true,
  },
};

export default config;
