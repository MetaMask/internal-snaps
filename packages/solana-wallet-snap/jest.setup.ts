import { jest } from '@jest/globals';
import BigNumber from 'bignumber.js';
import dotenv from 'dotenv';

import logger from './src/core/utils/logger';

dotenv.config();

const testDefaults: Record<string, string> = {
  ENVIRONMENT: 'test',
  RPC_URL_MAINNET_LIST: 'https://example.com/solana-mainnet',
  RPC_URL_DEVNET_LIST: 'https://example.com/solana-devnet',
  RPC_URL_TESTNET_LIST: 'https://example.com/solana-testnet',
  RPC_URL_LOCALNET_LIST: 'http://127.0.0.1:8899',
  RPC_WEB_SOCKET_URL_MAINNET: 'wss://example.com/solana-mainnet',
  RPC_WEB_SOCKET_URL_DEVNET: 'wss://example.com/solana-devnet',
  RPC_WEB_SOCKET_URL_TESTNET: 'wss://example.com/solana-testnet',
  RPC_WEB_SOCKET_URL_LOCALNET: 'wss://example.com/solana-localnet',
  EXPLORER_BASE_URL: 'https://solscan.io',
  PRICE_API_BASE_URL: 'https://example.com/price/',
  TOKEN_API_BASE_URL: 'https://example.com/token/',
  STATIC_API_BASE_URL: 'https://example.com/static/',
  SECURITY_ALERTS_API_BASE_URL: 'https://example.com/security/',
  NFT_API_BASE_URL: 'https://example.com/nft/',
  LOCAL_API_BASE_URL: 'http://127.0.0.1:3000',
};

for (const [key, value] of Object.entries(testDefaults)) {
  process.env[key] ||= value;
}

// Lowest precision we ever go for: MicroLamports represented in Sol amount
BigNumber.config({ EXPONENTIAL_AT: 16 });

// Mock the console methods
jest.spyOn(logger, 'log').mockImplementation(() => {
  /* no-op */
});
jest.spyOn(logger, 'info').mockImplementation(() => {
  /* no-op */
});
jest.spyOn(logger, 'warn').mockImplementation(() => {
  /* no-op */
});
jest.spyOn(logger, 'error').mockImplementation(() => {
  /* no-op */
});
