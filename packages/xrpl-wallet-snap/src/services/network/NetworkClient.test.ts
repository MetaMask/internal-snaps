import { boolean, object, optional, string, type } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { encode, RIPPLED_API_V2 } from 'xrpl';

import {
  InvalidHttpRequestParamsException,
  InvalidHttpResponseException,
} from '../../utils/errors';
import { LedgerState } from './api';
import { NetworkServiceException, RpcResponseException } from './exceptions';
import { ClioClient, RpcClient } from './NetworkClient';
import type { JsonRpcRead } from './NetworkClient';

const url = 'https://example.test';
const timeoutMs = 5_000;
const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const transactionHash =
  'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
const ledgerHash =
  'A6C5A4E7B2F1D0C9B8A796857463524110FEDCBBA9876543210FEDCBA9876543';
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptokenIndex =
  'A6C5A4E7B2F1D0C9B8A796857463524110FEDCBBA9876543210FEDCBA9876543';
const txBlob = encode({
  TransactionType: 'Payment',
  Account: account,
  Destination: destination,
  Amount: '1000000',
  Fee: '12',
  Sequence: 1,
});

const accountFlags = {
  defaultRipple: false,
  depositAuth: false,
  disableMasterKey: false,
  disallowIncomingXRP: false,
  globalFreeze: false,
  noFreeze: false,
  passwordSpent: false,
  requireAuthorization: false,
  requireDestinationTag: false,
};

type RpcRequestBody = {
  method: string;
  params: Record<string, unknown>[];
};

const paramsStruct = object({ id: string() });
/** Minimal envelope matching {@link BaseRpcResponse} for batchRead tests. */
const resultStruct = type({
  result: type({
    status: string(),
    validated: boolean(),
    value: string(),
  }),
  warning: optional(string()),
});

type PingResponse = Infer<typeof resultStruct>;

function read(id: string): JsonRpcRead<{ id: string }, PingResponse> {
  return {
    method: 'ping',
    params: { id },
    paramsStruct,
    resultStruct,
  };
}

function rpcResponseBody(
  result: Record<string, unknown>,
  warning?: string,
): {
  result: Record<string, unknown>;
  warning?: string;
} {
  return {
    result: {
      status: 'success',
      validated: true,
      ...result,
    },
    ...(warning === undefined ? {} : { warning }),
  };
}

function rpcResponse(
  result: Record<string, unknown>,
  warning?: string,
): Response {
  return new Response(JSON.stringify(rpcResponseBody(result, warning)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rpcError(error = 'entryNotFound'): Response {
  return new Response(
    JSON.stringify({
      result: {
        error,
        error_message: 'missing',
        status: 'error',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function pingResponse(value: string, warning?: string): Response {
  return rpcResponse({ value }, warning);
}

async function flushPromiseCall(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await Promise.resolve();
  }
}

function parseRequestBody(body: BodyInit | null | undefined): RpcRequestBody {
  if (typeof body !== 'string') {
    throw new TypeError('Expected fetch body to be a JSON string');
  }
  return JSON.parse(body) as RpcRequestBody;
}

function requestBodyFromCall(
  call: [unknown, RequestInit | undefined],
): RpcRequestBody {
  return parseRequestBody(call[1]?.body ?? null);
}

function stubFetch(
  handler: (body: RpcRequestBody) => Response | Promise<Response> = () =>
    rpcResponse({}),
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_requestUrl: string, init?: RequestInit) => {
    return handler(parseRequestBody(init?.body ?? null));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubFetchResponses(
  ...responses: Response[]
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RpcClient.batchRead', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs chunks back-to-back when there is no load warning', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (): Promise<Response> => {
        const id = String(calls.length + 1);
        calls.push(id);
        return pingResponse(id);
      }),
    );

    const results = await new RpcClient(url, timeoutMs).batchRead(
      [read('1'), read('2'), read('3')],
      { chunkSize: 2 },
    );

    expect(calls).toStrictEqual(['1', '2', '3']);
    expect(results).toStrictEqual([
      { value: '1', status: 'success', validated: true },
      { value: '2', status: 'success', validated: true },
      { value: '3', status: 'success', validated: true },
    ]);
  });

  it('waits before the next chunk when a response warns that the server is under load', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const warnings = ['load', undefined];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (): Promise<Response> => {
        const warning = warnings[calls.length];
        const id = String(calls.length + 1);
        calls.push(id);
        return pingResponse(id, warning);
      }),
    );

    const client = new RpcClient(url, timeoutMs);
    const pending = client.batchRead([read('1'), read('2')], {
      chunkSize: 1,
      delayMs: 5,
    });

    await flushPromiseCall();
    expect(calls).toStrictEqual(['1']);

    await vi.advanceTimersByTimeAsync(5);
    await flushPromiseCall();
    expect(calls).toStrictEqual(['1', '2']);

    const results = await pending;
    expect(results).toStrictEqual([
      { value: '1', status: 'success', validated: true },
      { value: '2', status: 'success', validated: true },
    ]);
  });

  it('returns null for a missing ledger entry', async () => {
    const fetchMock = stubFetchResponses(
      pingResponse('1'),
      rpcError('entryNotFound'),
      pingResponse('3'),
    );

    const results = await new RpcClient(url, timeoutMs).batchRead(
      [read('1'), read('2'), read('3')],
      { chunkSize: 3 },
    );

    expect(results).toStrictEqual([
      { value: '1', status: 'success', validated: true },
      null,
      { value: '3', status: 'success', validated: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects the batch when rippled returns a non-missing-entry error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (): Promise<Response> => rpcError('noNetwork')),
    );

    await expect(
      new RpcClient(url, timeoutMs).batchRead([read('1')]),
    ).rejects.toBeInstanceOf(NetworkServiceException);
  });

  it('rejects the batch when a query fails before rippled answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> => new Response('nope', { status: 500 }),
      ),
    );

    await expect(
      new RpcClient(url, timeoutMs).batchRead([read('1')]),
    ).rejects.toBeInstanceOf(NetworkServiceException);
  });

  it('rejects a chunk size below 1', async () => {
    const client = new RpcClient(url, timeoutMs);
    await expect(client.batchRead([], { chunkSize: 0 })).rejects.toThrow(
      RangeError,
    );
  });
});

describe('RpcClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('request shaping', () => {
    it.each([
      {
        scenario: 'fetchServerInfo',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchServerInfo(),
        method: 'server_info',
        expectedParams: {},
        response: {
          info: {
            load_factor: 1,
            validated_ledger: {
              age: 1,
              base_fee_xrp: 0.00001,
              hash: ledgerHash,
              reserve_base_xrp: 10,
              reserve_inc_xrp: 2,
              seq: 88_901_200,
            },
          },
        },
      },
      {
        scenario: 'fetchLedgerInfo defaults to validated',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchLedgerInfo(),
        method: 'ledger',
        expectedParams: { ledger_index: LedgerState.Validated },
        response: {
          ledger: {
            ledger_hash: ledgerHash,
            ledger_index: 88_901_200,
          },
        },
      },
      {
        scenario: 'fetchAccountInfo defaults to validated',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchAccountInfo({ account }),
        method: 'account_info',
        expectedParams: {
          account,
          ledger_index: LedgerState.Validated,
        },
        response: {
          account_data: {
            Account: account,
            Balance: '1000000',
            Flags: 0,
            LedgerEntryType: 'AccountRoot',
            OwnerCount: 0,
            Sequence: 1,
          },
          account_flags: accountFlags,
        },
      },
      {
        scenario: 'fetchAccountTrustlines defaults to validated',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchAccountTrustlines({ account }),
        method: 'account_lines',
        expectedParams: {
          account,
          ledger_index: LedgerState.Validated,
        },
        response: {
          account,
          lines: [],
        },
      },
      {
        scenario: 'fetchLedgerEntry for mpt_issuance',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchLedgerEntry({ mpt_issuance: issuanceId }),
        method: 'ledger_entry',
        expectedParams: {
          mpt_issuance: issuanceId,
          ledger_index: LedgerState.Validated,
        },
        response: {
          index: mptokenIndex,
          node: {
            LedgerEntryType: 'MPTokenIssuance',
            Flags: 0,
            Issuer: issuer,
            Sequence: 1,
            OutstandingAmount: '1000000',
            OwnerNode: '0',
            PreviousTxnID: transactionHash,
            PreviousTxnLgrSeq: 88_901_200,
          },
        },
      },
      {
        scenario: 'fetchDepositAuthorized defaults to validated',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchDepositAuthorized({
            source_account: account,
            destination_account: destination,
          }),
        method: 'deposit_authorized',
        expectedParams: {
          source_account: account,
          destination_account: destination,
          ledger_index: LedgerState.Validated,
        },
        response: {
          deposit_authorized: true,
          source_account: account,
          destination_account: destination,
        },
      },
      {
        scenario: 'fetchTransactionInfo',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchTransactionInfo({ transaction: transactionHash }),
        method: 'tx',
        expectedParams: { transaction: transactionHash },
        response: {
          hash: transactionHash,
          validated: true,
          meta: { TransactionResult: 'tesSUCCESS' },
          tx_json: {
            TransactionType: 'Payment',
            Account: account,
          },
        },
      },
      {
        scenario: 'fetchAccountTransactions',
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchAccountTransactions({ account }),
        method: 'account_tx',
        expectedParams: { account },
        response: {
          transactions: [
            {
              hash: transactionHash,
              meta: { TransactionResult: 'tesSUCCESS' },
            },
          ],
        },
      },
      {
        scenario: 'simulateTransaction',
        call: async (client: RpcClient): Promise<unknown> =>
          client.simulateTransaction({
            tx_json: {
              TransactionType: 'Payment',
              Account: account,
            },
          }),
        method: 'simulate',
        expectedParams: {
          tx_json: {
            TransactionType: 'Payment',
            Account: account,
          },
        },
        response: {
          applied: false,
          engine_result: 'tesSUCCESS',
          engine_result_code: 0,
          engine_result_message: 'The transaction was applied.',
          ledger_index: 88_901_200,
          tx_json: {
            TransactionType: 'Payment',
            Account: account,
          },
        },
      },
      {
        scenario: 'submitTransaction always sets fail_hard',
        call: async (client: RpcClient): Promise<unknown> =>
          client.submitTransaction(txBlob),
        method: 'submit',
        expectedParams: {
          tx_blob: txBlob,
          fail_hard: true,
        },
        response: {
          engine_result: 'tesSUCCESS',
          engine_result_code: 0,
          engine_result_message: 'The transaction was applied.',
          tx_blob: txBlob,
          tx_json: {
            TransactionType: 'Payment',
            Account: account,
          },
          hash: transactionHash,
        },
      },
    ])(
      '$scenario posts the method and params',
      async ({ call, method, expectedParams, response }) => {
        const fetchMock = stubFetch(() => rpcResponse(response));
        const client = new RpcClient(url, timeoutMs);

        const result = await call(client);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(
          requestBodyFromCall(
            fetchMock.mock.calls[0] as [unknown, RequestInit | undefined],
          ),
        ).toStrictEqual({
          method,
          params: [
            {
              ...expectedParams,
              api_version: RIPPLED_API_V2,
            },
          ],
        });
        expect(result).toMatchObject({
          status: 'success',
          ...response,
        });
      },
    );

    it('keeps an explicit ledger selector instead of defaulting', async () => {
      const fetchMock = stubFetch(() =>
        rpcResponse({
          account_data: {
            Account: account,
            Balance: '1000000',
            Flags: 0,
            LedgerEntryType: 'AccountRoot',
            OwnerCount: 0,
            Sequence: 1,
          },
          account_flags: accountFlags,
        }),
      );

      await new RpcClient(url, timeoutMs).fetchAccountInfo({
        account,
        ledger_index: 12,
      });

      expect(
        requestBodyFromCall(
          fetchMock.mock.calls[0] as [unknown, RequestInit | undefined],
        ).params[0],
      ).toMatchObject({
        account,
        ledger_index: 12,
        api_version: RIPPLED_API_V2,
      });
    });
  });

  describe('errors', () => {
    it.each([
      {
        scenario: 'invalid request params',
        setup: (): void => undefined,
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchAccountInfo({ account: 'not-an-address' }),
        expected: InvalidHttpRequestParamsException,
      },
      {
        scenario: 'HTTP failure',
        setup: (): void => {
          vi.stubGlobal(
            'fetch',
            vi.fn(
              async (): Promise<Response> =>
                new Response('nope', { status: 500 }),
            ),
          );
        },
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchServerInfo(),
        expected: NetworkServiceException,
      },
      {
        scenario: 'RPC error body',
        setup: (): void => {
          stubFetch(() => rpcError('actNotFound'));
        },
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchAccountInfo({ account }),
        expected: RpcResponseException,
      },
      {
        scenario: 'invalid response body',
        setup: (): void => {
          stubFetch(
            () =>
              new Response(JSON.stringify({ result: { status: 'success' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
          );
        },
        call: async (client: RpcClient): Promise<unknown> =>
          client.fetchServerInfo(),
        expected: InvalidHttpResponseException,
      },
    ])('$scenario', async ({ setup, call, expected }) => {
      setup();
      await expect(call(new RpcClient(url, timeoutMs))).rejects.toBeInstanceOf(
        expected,
      );
    });
  });

  describe('fetchAllAccountTrustlines', () => {
    const line = {
      account: issuer,
      balance: '10',
      currency: 'USD',
      limit: '100',
      quality_in: 0,
      quality_out: 0,
    };

    it('pages until the marker is gone and pins ledger_index', async () => {
      const fetchMock = stubFetchResponses(
        rpcResponse({
          account,
          lines: [line],
          marker: { ledger: 88_901_200, seq: 1 },
          ledger_index: 88_901_200,
        }),
        rpcResponse({
          account,
          lines: [{ ...line, balance: '20' }],
          ledger_index: 88_901_200,
        }),
      );

      const lines = await new RpcClient(
        url,
        timeoutMs,
      ).fetchAllAccountTrustlines({ account, limit: 10 });

      expect(lines).toStrictEqual([line, { ...line, balance: '20' }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        requestBodyFromCall(
          fetchMock.mock.calls[0] as [unknown, RequestInit | undefined],
        ).params[0],
      ).toMatchObject({
        account,
        ledger_index: LedgerState.Validated,
        limit: 10,
      });
      expect(
        requestBodyFromCall(
          fetchMock.mock.calls[1] as [unknown, RequestInit | undefined],
        ).params[0],
      ).toMatchObject({
        account,
        ledger_index: 88_901_200,
        marker: { ledger: 88_901_200, seq: 1 },
        limit: 10,
      });
    });

    it('applies filter and shouldStop', async () => {
      stubFetch(() =>
        rpcResponse({
          account,
          lines: [
            line,
            { ...line, currency: 'EUR', balance: '5' },
            { ...line, currency: 'BTC', balance: '1' },
          ],
          marker: { ledger: 1, seq: 1 },
          ledger_index: 88_901_200,
        }),
      );

      const lines = await new RpcClient(
        url,
        timeoutMs,
      ).fetchAllAccountTrustlines({
        account,
        filter: (trustLine): boolean => trustLine.currency !== 'EUR',
        shouldStop: (collected): boolean => collected.length >= 1,
      });

      expect(lines).toStrictEqual([
        line,
        { ...line, currency: 'BTC', balance: '1' },
      ]);
    });

    it('throws when a marker arrives without ledger_index', async () => {
      stubFetch(() =>
        rpcResponse({
          account,
          lines: [line],
          marker: { ledger: 1, seq: 1 },
        }),
      );

      await expect(
        new RpcClient(url, timeoutMs).fetchAllAccountTrustlines({ account }),
      ).rejects.toBeInstanceOf(NetworkServiceException);
    });
  });

  describe('fetchAllAccountTransactions', () => {
    it('follows marker-only pages', async () => {
      const first = {
        hash: transactionHash,
        meta: { TransactionResult: 'tesSUCCESS' },
      };
      const secondHash =
        '1111111111111111111111111111111111111111111111111111111111111111';
      const second = {
        hash: secondHash,
        meta: { TransactionResult: 'tesSUCCESS' },
      };

      const fetchMock = stubFetchResponses(
        rpcResponse({
          transactions: [first],
          marker: 'page-2',
        }),
        rpcResponse({ transactions: [second] }),
      );

      const transactions = await new RpcClient(
        url,
        timeoutMs,
      ).fetchAllAccountTransactions({ account, limit: 50 });

      expect(transactions).toStrictEqual([first, second]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        requestBodyFromCall(
          fetchMock.mock.calls[1] as [unknown, RequestInit | undefined],
        ).params[0],
      ).toMatchObject({
        account,
        marker: 'page-2',
        limit: 50,
      });
      expect(
        requestBodyFromCall(
          fetchMock.mock.calls[1] as [unknown, RequestInit | undefined],
        ).params[0]?.ledger_index,
      ).toBeUndefined();
    });
  });
});

describe('ClioClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const holding = {
    mpt_id: mptokenIndex,
    account,
    mpt_issuance_id: issuanceId,
    mpt_amount: '100',
  };

  it('fetchAccountMptokens defaults to the validated ledger', async () => {
    const fetchMock = stubFetch(() =>
      rpcResponse({
        account,
        mptokens: [holding],
      }),
    );

    const result = await new ClioClient(url, timeoutMs).fetchAccountMptokens({
      account,
    });

    expect(result.mptokens).toStrictEqual([holding]);
    expect(
      requestBodyFromCall(
        fetchMock.mock.calls[0] as [unknown, RequestInit | undefined],
      ),
    ).toStrictEqual({
      method: 'account_mptokens',
      params: [
        {
          account,
          ledger_index: LedgerState.Validated,
          api_version: RIPPLED_API_V2,
        },
      ],
    });
  });

  it('fetchAllAccountMptokens pages, filters, and can stop early', async () => {
    const other = {
      ...holding,
      mpt_issuance_id: '15FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3',
      mpt_amount: '5',
    };
    stubFetch(() =>
      rpcResponse({
        account,
        mptokens: [holding, other],
        marker: { ledger: 1, seq: 1 },
        ledger_index: 88_901_200,
      }),
    );

    const holdings = await new ClioClient(
      url,
      timeoutMs,
    ).fetchAllAccountMptokens({
      account,
      filter: (token): boolean => token.mpt_amount === '100',
      shouldStop: (): boolean => true,
    });

    expect(holdings).toStrictEqual([holding]);
  });
});
