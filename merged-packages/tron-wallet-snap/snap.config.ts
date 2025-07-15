import type { SnapConfig } from '@metamask/snaps-cli';
import { config as dotenv } from 'dotenv';
import { resolve } from 'path';

dotenv();

const config: SnapConfig = {
  input: resolve(__dirname, 'src/index.ts'),
  server: {
    port: 8080,
  },
  environment: {
    ENVIRONMENT: process.env.ENVIRONMENT ?? '',
    // RPC
    RPC_URL_MAINNET: process.env.RPC_URL_MAINNET ?? '',
    RPC_URL_SHASTA_TESTNET: process.env.RPC_URL_SHASTA_TESTNET ?? '',
    RPC_URL_NILE_TESTNET: process.env.RPC_URL_NILE_TESTNET ?? '',
    RPC_URL_LOCALNET: process.env.RPC_URL_LOCALNET ?? '',
    // Block explorer
    EXPLORER_BASE_URL: process.env.EXPLORER_BASE_URL ?? '',
    // APIs
    PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL ?? '',
    LOCAL_API_BASE_URL: process.env.LOCAL_API_BASE_URL ?? '',
  },
  polyfills: true,
  experimental: { wasm: true },
};

export default config;
