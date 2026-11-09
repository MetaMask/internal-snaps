import { Network } from '../constants';
import { configProvider } from '../services/config/ConfigProvider';
import { getExplorerUrl } from './getExplorerUrl';

const explorerBaseUrls = {
  [Network.Mainnet]: 'https://tronscan.org',
  [Network.Nile]: 'https://nile.tronscan.org',
  [Network.Shasta]: '',
};

describe('getExplorerUrl', () => {
  const mockAddress = 'TJRabPrwbZy45savqYt9XgVjvjQvQnQqQq';
  const mockTx =
    '4RPWUVqAqW6jHbVuZH5qJuvoJM6EeX9m9Q6PC1RkcYBW3J4zY9LuZPZqNiYNXGm5qL6GJgCB7JqhXqV8vkKxnAHd';
  const realConfig = configProvider.config;

  beforeEach(() => {
    vi.spyOn(configProvider, 'config', 'get').mockReturnValue({
      ...realConfig,
      explorerApi: { baseUrls: explorerBaseUrls },
    });
  });

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
