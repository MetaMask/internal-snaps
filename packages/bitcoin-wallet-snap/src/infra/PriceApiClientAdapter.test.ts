import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import type { PriceApiConfig } from '../entities';
import { PriceApiClientAdapter } from './PriceApiClientAdapter';

const response = {
  price: 50_000,
  marketCap: 1,
  allTimeHigh: 2,
  allTimeLow: 3,
  totalVolume: 4,
  circulatingSupply: 5,
  pricePercentChange1h: 6,
  pricePercentChange1d: 7,
  pricePercentChange7d: 8,
  pricePercentChange14d: 9,
  pricePercentChange30d: 10,
  pricePercentChange200d: 11,
  pricePercentChange1y: 12,
};

describe('PriceApiClientAdapter', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof globalThis.fetch>;
  const config: PriceApiConfig = { url: 'https://price.example' };
  const logger = new Logger({ level: LogLevel.SILENT });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('retries transient failures and parses the response', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(response),
      } as unknown as Response);
    const client = new PriceApiClientAdapter(config, logger, fetchMock);

    expect(await client.spotPrices()).toMatchObject({
      price: 50_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    } as unknown as Response);
    const client = new PriceApiClientAdapter(config, logger, fetchMock);

    await expect(client.spotPrices()).rejects.toThrow(
      'Network failure while fetching spot prices',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry malformed JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'not JSON',
    } as Response);
    const client = new PriceApiClientAdapter(config, logger, fetchMock);

    await expect(client.spotPrices()).rejects.toThrow(
      'Network failure while fetching spot prices',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
