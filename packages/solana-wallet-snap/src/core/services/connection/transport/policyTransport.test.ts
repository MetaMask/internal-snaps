import {
  createFetchPolicy,
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';
import type { FetchPolicy } from '@metamask/snap-networks-utils';
import type { RpcTransport } from '@solana/kit';

import { mockLogger } from '../../__mocks__/logger';
import { createFailoverTransport } from './failoverTransport';
import { createPolicyTransport } from './policyTransport';

const request = (method: string): Parameters<RpcTransport>[0] =>
  ({
    payload: { id: 1, jsonrpc: '2.0', method },
  }) as Parameters<RpcTransport>[0];

describe('createPolicyTransport', () => {
  const policy: FetchPolicy = {
    execute: jest.fn(async (operation: () => Promise<unknown>) =>
      operation(),
    ) as unknown as FetchPolicy['execute'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (policy.execute as unknown as jest.Mock).mockImplementation(
      async (operation: () => Promise<unknown>) => operation(),
    );
  });

  it.each([
    'getBalance',
    'getSlot',
    'getTokenLargestAccounts',
    'simulateTransaction',
  ])('applies the fetch policy to %s', async (method) => {
    const readTransport = jest.fn().mockResolvedValue({ result: 'ok' });
    const oneShotTransport = jest.fn();
    const transport = createPolicyTransport({
      oneShotTransport,
      policy,
      readTransport,
    });

    await transport(request(method));

    expect(policy.execute).toHaveBeenCalledTimes(1);
    expect(readTransport).toHaveBeenCalledTimes(1);
    expect(oneShotTransport).not.toHaveBeenCalled();
  });

  it.each(['sendTransaction', 'unknownMethod'])(
    'sends %s once without policy or failover',
    async (method) => {
      const readTransport = jest.fn();
      const oneShotTransport = jest.fn().mockResolvedValue({ result: 'ok' });
      const transport = createPolicyTransport({
        oneShotTransport,
        policy,
        readTransport,
      });

      await transport(request(method));

      expect(policy.execute).not.toHaveBeenCalled();
      expect(readTransport).not.toHaveBeenCalled();
      expect(oneShotTransport).toHaveBeenCalledTimes(1);
    },
  );

  it('fails over and retries transient read failures', async () => {
    const signals: AbortSignal[] = [];
    const firstTransport = jest.fn().mockRejectedValue(
      createFetchPolicyError('offline', {
        name: FetchPolicyErrorName.Network,
      }),
    );
    firstTransport.mockImplementation(
      async ({ signal }: Parameters<RpcTransport>[0]) => {
        signals.push(signal as AbortSignal);
        throw createFetchPolicyError('offline', {
          name: FetchPolicyErrorName.Network,
        });
      },
    );
    const secondTransport = jest.fn(
      async <Response>({ signal }: Parameters<RpcTransport>[0]) => {
        signals.push(signal as AbortSignal);
        return { result: 'ok' } as Response;
      },
    ) as RpcTransport;
    const transport = createPolicyTransport({
      oneShotTransport: firstTransport,
      policy: createFetchPolicy({
        service: 'solana_rpc',
        logger: mockLogger,
      }),
      readTransport: createFailoverTransport(
        [firstTransport, secondTransport],
        ['https://one.test', 'https://two.test'],
      ),
    });

    expect(await transport(request('getBalance'))).toStrictEqual({
      result: 'ok',
    });
    expect(firstTransport).toHaveBeenCalledTimes(1);
    expect(secondTransport).toHaveBeenCalledTimes(1);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  it('preserves Retry-After from an earlier endpoint when a fallback fails without one', async () => {
    jest.useFakeTimers();
    try {
      const firstTransport = jest
        .fn()
        .mockRejectedValueOnce(
          createFetchPolicyError('Rate limited', {
            httpStatus: 429,
            retryAfterMs: 30_000,
          }),
        )
        .mockResolvedValueOnce({ result: 'ok' });
      const fallbackError = createFetchPolicyError('offline', {
        name: FetchPolicyErrorName.Network,
      });
      const secondTransport = jest.fn().mockRejectedValue(fallbackError);
      const transport = createPolicyTransport({
        oneShotTransport: firstTransport,
        policy: createFetchPolicy({
          service: 'solana_rpc',
          logger: mockLogger,
        }),
        readTransport: createFailoverTransport(
          [firstTransport, secondTransport],
          ['https://one.test', 'https://two.test'],
        ),
      });

      const pending = transport(request('getBalance'));
      await jest.advanceTimersByTimeAsync(29_999);
      expect(firstTransport).toHaveBeenCalledTimes(1);
      expect(secondTransport).toHaveBeenCalledTimes(1);
      expect(fallbackError.retryAfterMs).toBeUndefined();

      await jest.advanceTimersByTimeAsync(1);
      expect(await pending).toStrictEqual({ result: 'ok' });
      expect(firstTransport).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not fail over non-transient read failures', async () => {
    const firstTransport = jest
      .fn()
      .mockRejectedValue(
        createFetchPolicyError('Bad request', { httpStatus: 400 }),
      );
    const secondTransport = jest.fn();
    const transport = createPolicyTransport({
      oneShotTransport: firstTransport,
      policy: createFetchPolicy({
        service: 'solana_rpc',
        logger: mockLogger,
      }),
      readTransport: createFailoverTransport(
        [firstTransport, secondTransport],
        ['https://one.test', 'https://two.test'],
      ),
    });

    let caught: unknown;
    try {
      await transport(request('getBalance'));
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      httpStatus: 400,
      currentUrl: 'https://one.test',
    });
    expect(firstTransport).toHaveBeenCalledTimes(1);
    expect(secondTransport).not.toHaveBeenCalled();
  });

  it('does not fail over response parsing failures', async () => {
    const error = new SyntaxError('Invalid JSON');
    const firstTransport = jest.fn().mockRejectedValue(error);
    const secondTransport = jest.fn();
    const transport = createPolicyTransport({
      oneShotTransport: firstTransport,
      policy: createFetchPolicy({
        service: 'solana_rpc',
        logger: mockLogger,
      }),
      readTransport: createFailoverTransport(
        [firstTransport, secondTransport],
        ['https://one.test', 'https://two.test'],
      ),
    });
    let caught: unknown;

    try {
      await transport(request('getBalance'));
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
    expect(firstTransport).toHaveBeenCalledTimes(1);
    expect(secondTransport).not.toHaveBeenCalled();
  });

  it('does not fail over when the caller signal aborts', async () => {
    const reason = Object.assign(new Error('Caller deadline exceeded'), {
      name: FetchPolicyErrorName.Timeout,
    });
    const controller = new AbortController();
    const firstTransport = jest.fn(
      async ({ signal }: Parameters<RpcTransport>[0]) => {
        controller.abort(reason);
        throw signal?.reason;
      },
    );
    const secondTransport = jest.fn();
    const transport = createPolicyTransport({
      oneShotTransport: firstTransport,
      policy: createFetchPolicy({
        service: 'solana_rpc',
        logger: mockLogger,
      }),
      readTransport: createFailoverTransport(
        [firstTransport, secondTransport],
        ['https://one.test', 'https://two.test'],
      ),
    });
    let caught: unknown;

    try {
      await transport({
        ...request('getBalance'),
        signal: controller.signal,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(reason);
    expect(firstTransport).toHaveBeenCalledTimes(1);
    expect(secondTransport).not.toHaveBeenCalled();
  });

  it('throws an abort error when the caller signal has no reason', async () => {
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'reason', {
      value: undefined,
    });
    const firstTransport = jest.fn().mockImplementation(async () => {
      controller.abort();
      throw new Error('Failed');
    });
    const secondTransport = jest.fn();
    const transport = createPolicyTransport({
      oneShotTransport: firstTransport,
      policy,
      readTransport: createFailoverTransport(
        [firstTransport, secondTransport],
        ['https://one.test', 'https://two.test'],
      ),
    });

    await expect(
      transport({
        ...request('getBalance'),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      message: 'RPC request aborted by caller',
      name: 'AbortError',
    });
    expect(firstTransport).toHaveBeenCalledTimes(1);
    expect(secondTransport).not.toHaveBeenCalled();
  });
});
