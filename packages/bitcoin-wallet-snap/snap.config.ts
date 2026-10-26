/* eslint-disable import-x/no-nodejs-modules -- Snap configuration executes in Node.js. */
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
    LOG_LEVEL: process.env.LOG_LEVEL,
    DEFAULT_ADDRESS_TYPE: process.env.DEFAULT_ADDRESS_TYPE,
    ESPLORA_BITCOIN: process.env.ESPLORA_BITCOIN,
    ESPLORA_BITCOIN_FALLBACK: process.env.ESPLORA_BITCOIN_FALLBACK,
    ESPLORA_TESTNET: process.env.ESPLORA_TESTNET,
    ESPLORA_TESTNET4: process.env.ESPLORA_TESTNET4,
    ESPLORA_SIGNET: process.env.ESPLORA_SIGNET,
    ESPLORA_REGTEST: process.env.ESPLORA_REGTEST,
    PRICE_API_URL: process.env.PRICE_API_URL,
    BITCOIN_EXPLORER: process.env.BITCOIN_EXPLORER,
    TESTNET_EXPLORER: process.env.TESTNET_EXPLORER,
    TESTNET4_EXPLORER: process.env.TESTNET4_EXPLORER,
    SIGNET_EXPLORER: process.env.SIGNET_EXPLORER,
    REGTEST_EXPLORER: process.env.REGTEST_EXPLORER,
  },
  polyfills: true,
  experimental: { wasm: true },
  // `createFetchPolicy` (cockatiel) times calls with `performance.now()`,
  // which snaps don't have.
  customizeWebpackConfig: (webpackConfig) =>
    merge(webpackConfig, {
      plugins: [
        new ProvidePlugin({
          performance: '@metamask/snap-networks-utils/performance-shim',
        }),
      ],
    }),
  preinstalled: {
    removable: false,
    hidden: true,
    hideSnapBranding: true,
  },
};

export default config;
