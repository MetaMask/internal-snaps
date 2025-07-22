import { Network } from '../constants';
import { getExplorerUrl } from './getExplorerUrl';

describe('getExplorerUrl', () => {
  // Set up environment variables for testing
  beforeAll(() => {
    // eslint-disable-next-line no-restricted-globals
    process.env.EXPLORER_MAINNET_BASE_URL = 'https://tronscan.org';
    // eslint-disable-next-line no-restricted-globals
    process.env.EXPLORER_NILE_BASE_URL = 'https://tronscan.org';
    // eslint-disable-next-line no-restricted-globals
    process.env.EXPLORER_SHASTA_BASE_URL = 'https://tronscan.org';
  });

  const mockAddress = 'TJRabPrwbZy45savqYt9XgVjvjQvQnQqQq';
  const mockTx =
    '4RPWUVqAqW6jHbVuZH5qJuvoJM6EeX9m9Q6PC1RkcYBW3J4zY9LuZPZqNiYNXGm5qL6GJgCB7JqhXqV8vkKxnAHd';

  it('should generate mainnet URL for address without cluster param', () => {
    const url = getExplorerUrl(Network.Mainnet, 'address', mockAddress);
    expect(url).toBe(`https://tronscan.org/#/address/${mockAddress}`);
  });

  it('should generate nile URL for address with cluster param', () => {
    const url = getExplorerUrl(Network.Nile, 'address', mockAddress);
    expect(url).toBe(`https://tronscan.org/#/address/${mockAddress}`);
  });

  it('should generate shasta URL for address with cluster param', () => {
    const url = getExplorerUrl(Network.Shasta, 'address', mockAddress);
    expect(url).toBe(`https://tronscan.org/#/address/${mockAddress}`);
  });

  it('should generate mainnet URL for transaction without cluster param', () => {
    const url = getExplorerUrl(Network.Mainnet, 'transaction', mockTx);
    expect(url).toBe(`https://tronscan.org/#/transaction/${mockTx}`);
  });

  it('should generate nile URL for transaction with cluster param', () => {
    const url = getExplorerUrl(Network.Nile, 'transaction', mockTx);
    expect(url).toBe(`https://tronscan.org/#/transaction/${mockTx}`);
  });

  it('should generate shasta URL for transaction with cluster param', () => {
    const url = getExplorerUrl(Network.Shasta, 'transaction', mockTx);
    expect(url).toBe(`https://tronscan.org/#/transaction/${mockTx}`);
  });
});
