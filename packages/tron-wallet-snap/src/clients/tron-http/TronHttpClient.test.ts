import {
  BaseConfigProvider,
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
});
