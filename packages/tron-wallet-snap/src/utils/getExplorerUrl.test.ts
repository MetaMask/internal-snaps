import { getExplorerUrl } from './getExplorerUrl';

describe('getExplorerUrl', () => {
  const mockAddress = 'TJRabPrwbZy45savqYt9XgVjvjQvQnQqQq';
  const mockTx =
    '4RPWUVqAqW6jHbVuZH5qJuvoJM6EeX9m9Q6PC1RkcYBW3J4zY9LuZPZqNiYNXGm5qL6GJgCB7JqhXqV8vkKxnAHd';

  it('generates an address URL from the given base URL', () => {
    const url = getExplorerUrl('https://tronscan.org', 'address', mockAddress);

    expect(url).toBe(`https://tronscan.org/#/address/${mockAddress}`);
  });

  it('generates a transaction URL from the given base URL', () => {
    const url = getExplorerUrl('https://tronscan.org', 'transaction', mockTx);

    expect(url).toBe(`https://tronscan.org/#/transaction/${mockTx}`);
  });

  it('accepts base URLs with a trailing slash', () => {
    const url = getExplorerUrl('https://tronscan.org/', 'address', mockAddress);

    expect(url).toBe(`https://tronscan.org/#/address/${mockAddress}`);
  });

  it('uses the base URL it is given, so each explorer can differ', () => {
    const mainnetUrl = getExplorerUrl(
      'https://tronscan.org',
      'address',
      mockAddress,
    );
    const nileUrl = getExplorerUrl(
      'https://nile.tronscan.org',
      'address',
      mockAddress,
    );

    expect(mainnetUrl).toBe(`https://tronscan.org/#/address/${mockAddress}`);
    expect(nileUrl).toBe(`https://nile.tronscan.org/#/address/${mockAddress}`);
  });

  it('throws when the base URL is empty', () => {
    expect(() => getExplorerUrl('', 'address', mockAddress)).toThrow(
      'Invalid URL format',
    );
  });
});
