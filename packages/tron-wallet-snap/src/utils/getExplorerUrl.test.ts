import { Network } from '../constants';
import { getExplorerUrl } from './getExplorerUrl';

jest.mock('../services/config/ConfigProvider', () => ({
  configProvider: {
    config: {
      explorerApi: {
        baseUrls: {
          'tron:728126428': 'https://tronscan.org',
          'tron:3448148188': 'https://nile.tronscan.org',
          'tron:2494104990': '',
        },
      },
    },
  },
}));

describe('getExplorerUrl', () => {
  const mockAddress = 'TJRabPrwbZy45savqYt9XgVjvjQvQnQqQq';
  const mockTx =
    '4RPWUVqAqW6jHbVuZH5qJuvoJM6EeX9m9Q6PC1RkcYBW3J4zY9LuZPZqNiYNXGm5qL6GJgCB7JqhXqV8vkKxnAHd';

  it('generates an address URL for the given scope', () => {
    const url = getExplorerUrl(Network.Mainnet, 'address', mockAddress);

    expect(url).toBe(`https://tronscan.org/#/address/${mockAddress}`);
  });

  it('generates a transaction URL for the given scope', () => {
    const url = getExplorerUrl(Network.Mainnet, 'transaction', mockTx);

    expect(url).toBe(`https://tronscan.org/#/transaction/${mockTx}`);
  });

  it('uses the base URL configured for each scope, so each explorer can differ', () => {
    const mainnetUrl = getExplorerUrl(Network.Mainnet, 'address', mockAddress);
    const nileUrl = getExplorerUrl(Network.Nile, 'address', mockAddress);

    expect(mainnetUrl).toBe(`https://tronscan.org/#/address/${mockAddress}`);
    expect(nileUrl).toBe(`https://nile.tronscan.org/#/address/${mockAddress}`);
  });

  it('throws when the base URL configured for the scope is empty', () => {
    expect(() =>
      getExplorerUrl(Network.Shasta, 'address', mockAddress),
    ).toThrow('Invalid URL format');
  });
});
