import type { Logger } from '@metamask/snap-networks-utils';
import { Types as TronwebTypes } from 'tronweb';

import type { ConfigProvider } from '../../services/config';
import { mockLogger } from '../../utils/mockLogger';
import { SecurityAlertsApiClient } from './SecurityAlertsApiClient';
import * as securityAlertsUtils from './utils';

const VALID_TRANSACTION_RAW_DATA: TronwebTypes.Transaction['raw_data'] = {
  contract: [
    {
      type: TronwebTypes.ContractType.TransferContract,
      parameter: {
        type_url: 'type.googleapis.com/protocol.TransferContract',
        value: {
          owner_address: `41${'a'.repeat(40)}`,
          to_address: `41${'b'.repeat(40)}`,
          amount: 1_000_000,
        },
      },
    },
  ],
  ref_block_bytes: '0000',
  ref_block_hash: '0'.repeat(16),
  expiration: Date.now() + 60_000,
  timestamp: Date.now(),
};

const VALID_SCAN_RESPONSE = {
  simulation: {
    status: 'Success',
  },
  validation: {
    status: 'Success',
    result_type: 'Benign',
  },
};

describe('SecurityAlertsApiClient', () => {
  const configProvider = {
    config: {
      securityAlertsApi: {
        baseUrl: 'https://security-alerts.example.com',
      },
    },
  } as ConfigProvider;

  it('scans a supported transaction through the fetch policy', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(VALID_SCAN_RESPONSE)),
    });
    const client = new SecurityAlertsApiClient(
      configProvider,
      mockLogger as unknown as Logger,
      fetchMock as unknown as typeof globalThis.fetch,
    );

    const result = await client.scanTransaction({
      accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
      transactionRawData: VALID_TRANSACTION_RAW_DATA,
      origin: 'https://example.com',
    });

    expect(result).toStrictEqual(VALID_SCAN_RESPONSE);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://security-alerts.example.com/tron/transaction/scan',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('retries transient HTTP failures and does not retry 400 responses', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: jest
          .fn()
          .mockResolvedValueOnce(JSON.stringify(VALID_SCAN_RESPONSE)),
      });
    const client = new SecurityAlertsApiClient(
      configProvider,
      mockLogger as unknown as Logger,
      fetchMock as unknown as typeof globalThis.fetch,
    );

    expect(
      await client.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: VALID_TRANSACTION_RAW_DATA,
        origin: 'https://example.com',
      }),
    ).toStrictEqual(VALID_SCAN_RESPONSE);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
    });

    await expect(
      client.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: VALID_TRANSACTION_RAW_DATA,
        origin: 'https://example.com',
      }),
    ).rejects.toThrow('HTTP error! status: 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the transaction is not supported for scanning', async () => {
    const fetchMock = jest.fn();
    const client = new SecurityAlertsApiClient(
      configProvider,
      mockLogger as unknown as Logger,
      fetchMock as unknown as typeof globalThis.fetch,
    );

    await expect(
      client.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: {
          ...VALID_TRANSACTION_RAW_DATA,
          contract: [],
        },
        origin: 'https://example.com',
      }),
    ).rejects.toThrow('Transaction is not supported for scanning.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      SecurityAlertsApiClient.isContractTypeSupported({
        ...VALID_TRANSACTION_RAW_DATA,
        contract: [],
      }),
    ).toBe(false);
  });

  it('throws when scan parameters cannot be extracted from the transaction', async () => {
    const extractSpy = jest
      .spyOn(securityAlertsUtils, 'extractScanParametersFromTransactionData')
      .mockReturnValueOnce(null);
    const fetchMock = jest.fn();
    const client = new SecurityAlertsApiClient(
      configProvider,
      mockLogger as unknown as Logger,
      fetchMock as unknown as typeof globalThis.fetch,
    );

    try {
      await expect(
        client.scanTransaction({
          accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
          transactionRawData: VALID_TRANSACTION_RAW_DATA,
          origin: 'https://example.com',
        }),
      ).rejects.toThrow('Could not extract scan parameters from transaction.');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      extractSpy.mockRestore();
    }
  });
});
