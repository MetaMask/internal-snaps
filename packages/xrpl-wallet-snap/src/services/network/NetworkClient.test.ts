import { boolean, object, optional, string, type } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import { NetworkServiceException } from './exceptions';
import { RpcClient } from './NetworkClient';
import type { JsonRpcRead } from './NetworkClient';

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

function rpcResponse(value: string, warning?: string): Response {
  const payload: {
    result: { value: string; status: string; validated: boolean };
    warning?: string;
  } = {
    result: { value, status: 'success', validated: true },
  };
  if (warning !== undefined) {
    payload.warning = warning;
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function flushPromiseCall(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await Promise.resolve();
  }
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
      vi.fn(async () => {
        const id = String(calls.length + 1);
        calls.push(id);
        return rpcResponse(id);
      }),
    );

    const results = await new RpcClient(
      'https://example.test',
      5_000,
    ).batchRead([read('1'), read('2'), read('3')], { chunkSize: 2 });

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
      vi.fn(async () => {
        const warning = warnings[calls.length];
        const id = String(calls.length + 1);
        calls.push(id);
        return rpcResponse(id, warning);
      }),
    );

    const client = new RpcClient('https://example.test', 5_000);
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
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(rpcResponse('1'));
    fetchMock.mockResolvedValueOnce(rpcError('entryNotFound'));
    fetchMock.mockResolvedValueOnce(rpcResponse('3'));
    vi.stubGlobal('fetch', fetchMock);

    const results = await new RpcClient(
      'https://example.test',
      5_000,
    ).batchRead([read('1'), read('2'), read('3')], { chunkSize: 3 });

    expect(results).toStrictEqual([
      { value: '1', status: 'success', validated: true },
      null,
      { value: '3', status: 'success', validated: true },
    ]);
  });

  it('rejects the batch when rippled returns a non-missing-entry error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => rpcError('noNetwork')),
    );

    await expect(
      new RpcClient('https://example.test', 5_000).batchRead([read('1')]),
    ).rejects.toBeInstanceOf(NetworkServiceException);
  });

  it('rejects the batch when a query fails before rippled answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(
      new RpcClient('https://example.test', 5_000).batchRead([read('1')]),
    ).rejects.toBeInstanceOf(NetworkServiceException);
  });

  it('rejects a chunk size below 1', async () => {
    const client = new RpcClient('https://example.test', 5_000);
    await expect(client.batchRead([], { chunkSize: 0 })).rejects.toThrow(
      RangeError,
    );
  });
});
