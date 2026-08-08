import { config } from 'dotenv';

config();

const testDefaults: Record<string, string> = {
  ENVIRONMENT: 'test',
  RPC_URL_LIST_MAINNET: 'https://example.com/tron-mainnet',
  RPC_URL_LIST_NILE_TESTNET: 'https://example.com/tron-nile',
  RPC_URL_LIST_SHASTA_TESTNET: 'https://example.com/tron-shasta',
  EXPLORER_MAINNET_BASE_URL: 'https://tronscan.org/',
  EXPLORER_NILE_BASE_URL: 'https://nile.tronscan.org/',
  EXPLORER_SHASTA_BASE_URL: 'https://shasta.tronscan.org/',
  PRICE_API_BASE_URL: 'https://example.com/price/',
  TOKEN_API_BASE_URL: 'https://example.com/token/',
  STATIC_API_BASE_URL: 'https://example.com/static/',
  SECURITY_ALERTS_API_BASE_URL: 'https://example.com/security/',
  NFT_API_BASE_URL: 'https://example.com/nft/',
  LOCAL_API_BASE_URL: 'http://127.0.0.1:3000',
  TRONGRID_BASE_URL_MAINNET: 'https://example.com/trongrid-mainnet/',
  TRONGRID_BASE_URL_NILE: 'https://example.com/trongrid-nile/',
  TRONGRID_BASE_URL_SHASTA: 'https://example.com/trongrid-shasta/',
  TRON_HTTP_BASE_URL_MAINNET: 'https://example.com/tron-http-mainnet/',
  TRON_HTTP_BASE_URL_NILE: 'https://example.com/tron-http-nile/',
  TRON_HTTP_BASE_URL_SHASTA: 'https://example.com/tron-http-shasta/',
};

for (const [key, value] of Object.entries(testDefaults)) {
  // eslint-disable-next-line no-restricted-globals
  process.env[key] ||= value;
}
