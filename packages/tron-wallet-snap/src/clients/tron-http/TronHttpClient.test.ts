import {
  BaseConfigProvider,
  BrokenCircuitError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';

import { Network } from '../../constants';
import {
  ConfigStruct,
  ENVIRONMENT,
} from '../../services/config/ConfigProvider';
import { TronHttpClient } from './TronHttpClient';

describe('TronHttpClient', () => {
  const originalFetch = global.fetch;
  const configProvider = new BaseConfigProvider(ENVIRONMENT, ConfigStruct);

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries when reading the response body fails', async () => {
    const failedResponse = new globalThis.Response('', { status: 200 });
    jest.spyOn(failedResponse, 'text').mockRejectedValueOnce(
      Object.assign(new Error('Body failed'), {
        name: FetchPolicyErrorName.Network,
      }),
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(
        new globalThis.Response(JSON.stringify({ freeNetUsed: 1 }), {
          status: 200,
        }),
      );
    const client = new TronHttpClient({ configProvider });

    expect(
      await client.getAccountResources(Network.Mainnet, 'address'),
    ).toStrictEqual({ freeNetUsed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves allowed 404 transaction responses', async () => {
    const response = new globalThis.Response('', { status: 404 });
    const textMock = jest
      .spyOn(response, 'text')
      .mockRejectedValueOnce(new Error('Body failed'));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response);
    const client = new TronHttpClient({ configProvider });

    expect(
      await client.getTransactionInfoById(Network.Mainnet, 'tx-id'),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(textMock).not.toHaveBeenCalled();
  });

  describe('request cache', () => {
    it('serves identical requests from the cache within the TTL', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new globalThis.Response(JSON.stringify({ freeNetUsed: 1 }), {
            status: 200,
          }),
      );
      const client = new TronHttpClient({ configProvider });

      const first = await client.getAccountResources(
        Network.Mainnet,
        'address',
      );
      const cached = await client.getAccountResources(
        Network.Mainnet,
        'address',
      );

      expect(first).toStrictEqual({ freeNetUsed: 1 });
      expect(cached).toStrictEqual({ freeNetUsed: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refetches identical requests after the cache TTL elapses', async () => {
      jest.useFakeTimers();
      try {
        const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
          async () =>
            new globalThis.Response(JSON.stringify({ freeNetUsed: 1 }), {
              status: 200,
            }),
        );
        const client = new TronHttpClient({ configProvider });

        await client.getAccountResources(Network.Mainnet, 'address');
        jest.advanceTimersByTime(5_001);
        await client.getAccountResources(Network.Mainnet, 'address');

        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not deduplicate requests with different arguments', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new globalThis.Response(JSON.stringify({ freeNetUsed: 1 }), {
            status: 200,
          }),
      );
      const client = new TronHttpClient({ configProvider });

      await Promise.all([
        client.getAccountResources(Network.Mainnet, 'address-1'),
        client.getAccountResources(Network.Mainnet, 'address-2'),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('open circuit bypass (v5)', () => {
    /**
     * Opens the fetch policy circuit with non-retryable server failures.
     *
     * @param client - The client.
     */
    async function openCircuit(client: TronHttpClient): Promise<void> {
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(
          async () => new globalThis.Response('', { status: 501 }),
        );
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          await client.getReward(Network.Mainnet, `address-${attempt}`);
        } catch (error) {
          if (error instanceof BrokenCircuitError) {
            return;
          }
        }
      }
      throw new Error('The circuit did not open');
    }

    it('lets an explicit request reach the network once while the circuit is open', async () => {
      const client = new TronHttpClient({ configProvider });
      await openCircuit(client);
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new globalThis.Response(JSON.stringify({ reward: 7 }), {
            status: 200,
          }),
      );

      // The spy is reused: forget the calls that opened the circuit.
      fetchMock.mockClear();

      await expect(
        client.getReward(Network.Mainnet, 'address'),
      ).rejects.toBeInstanceOf(BrokenCircuitError);
      expect(fetchMock).not.toHaveBeenCalled();

      expect(
        await client.getReward(Network.Mainnet, 'address', {
          bypassOpenCircuit: true,
        }),
      ).toBe(7);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The next explicit call for the same request (the balances call that
      // follows `listAccountAssets`) reuses the direct result.
      expect(
        await client.getReward(Network.Mainnet, 'address', {
          bypassOpenCircuit: true,
        }),
      ).toBe(7);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The service answered: the circuit is closed again for every read.

      expect(
        await client.getAccountResources(Network.Mainnet, 'address', {
          bypassOpenCircuit: true,
        }),
      ).toStrictEqual({ reward: 7 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
