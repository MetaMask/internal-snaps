import { BrokenCircuitError } from '@metamask/snap-networks-utils';

import {
  isCircuitOpen,
  isOpenCircuitError,
  OPEN_CIRCUIT_BYPASS_INTERVAL_MS,
  OPEN_CIRCUIT_BYPASS_RESULT_TTL_MS,
  OPEN_CIRCUIT_ERROR_MESSAGE,
  OpenCircuitBypass,
} from './openCircuitBypass';

describe('isOpenCircuitError', () => {
  it('detects the open-circuit error and wrapping errors', () => {
    const open = new BrokenCircuitError();

    expect(isOpenCircuitError(open)).toBe(true);
    expect(
      isOpenCircuitError(
        new Error('Failed to fetch account info', {
          cause: new Error('wrapped', { cause: open }),
        }),
      ),
    ).toBe(true);
  });

  it('does not match other errors', () => {
    expect(isOpenCircuitError(new Error('HTTP 500'))).toBe(false);
    expect(
      isOpenCircuitError(new Error('outer', { cause: new Error('inner') })),
    ).toBe(false);
    expect(isOpenCircuitError(undefined)).toBe(false);
    expect(isOpenCircuitError('BrokenCircuitError')).toBe(false);
  });
});

describe('OpenCircuitBypass', () => {
  const key = 'tron:728126428 GET https://example.test/v1/accounts/T1';

  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  it('returns the guarded result without a direct attempt', async () => {
    const bypass = new OpenCircuitBypass();
    const direct = jest.fn();

    expect(
      await bypass.run(
        key,
        { bypassOpenCircuit: true },
        async () => 'guarded',
        direct,
      ),
    ).toBe('guarded');
    expect(direct).not.toHaveBeenCalled();
  });

  it('makes one direct attempt when the circuit is open on an explicit request', async () => {
    const bypass = new OpenCircuitBypass();
    const direct = jest.fn().mockResolvedValue('direct');

    expect(
      await bypass.run(
        key,
        { bypassOpenCircuit: true },
        async () => {
          throw new BrokenCircuitError();
        },
        direct,
      ),
    ).toBe('direct');
    expect(direct).toHaveBeenCalledTimes(1);
  });

  it('does not bypass the circuit for background reads', async () => {
    const bypass = new OpenCircuitBypass();
    const direct = jest.fn();
    const guarded = async (): Promise<string> => {
      throw new BrokenCircuitError();
    };

    await expect(
      bypass.run(key, undefined, guarded, direct),
    ).rejects.toBeInstanceOf(BrokenCircuitError);
    await expect(
      bypass.run(key, { bypassOpenCircuit: false }, guarded, direct),
    ).rejects.toBeInstanceOf(BrokenCircuitError);
    expect(direct).not.toHaveBeenCalled();
  });

  it('rethrows other errors without a direct attempt', async () => {
    const bypass = new OpenCircuitBypass();
    const direct = jest.fn();
    const failure = new Error('HTTP 500');

    await expect(
      bypass.run(
        key,
        { bypassOpenCircuit: true },
        async () => {
          throw failure;
        },
        direct,
      ),
    ).rejects.toBe(failure);
    expect(direct).not.toHaveBeenCalled();
  });

  it('bypasses the circuit at most once per interval for the same request', async () => {
    const bypass = new OpenCircuitBypass();
    const direct = jest.fn().mockRejectedValue(new Error('HTTP 429'));
    const guarded = async (): Promise<string> => {
      throw new BrokenCircuitError();
    };
    const run = async (requestKey: string): Promise<string> =>
      bypass.run(requestKey, { bypassOpenCircuit: true }, guarded, direct);

    await expect(run(key)).rejects.toThrow('HTTP 429');
    now += OPEN_CIRCUIT_BYPASS_INTERVAL_MS - 1;
    await expect(run(key)).rejects.toBeInstanceOf(BrokenCircuitError);
    expect(direct).toHaveBeenCalledTimes(1);

    // Another upstream request has its own interval.
    await expect(run(`${key}-other`)).rejects.toThrow('HTTP 429');
    expect(direct).toHaveBeenCalledTimes(2);

    now += 1;
    await expect(run(key)).rejects.toThrow('HTTP 429');
    expect(direct).toHaveBeenCalledTimes(3);
  });

  it('shares an in-flight direct attempt between identical requests', async () => {
    const bypass = new OpenCircuitBypass();
    let resolveDirect: (value: string) => void = () => undefined;
    const direct = jest.fn(
      async () =>
        new Promise<string>((resolve) => {
          resolveDirect = resolve;
        }),
    );
    const guarded = async (): Promise<string> => {
      throw new BrokenCircuitError();
    };

    const first = bypass.run(key, { bypassOpenCircuit: true }, guarded, direct);
    const second = bypass.run(
      key,
      { bypassOpenCircuit: true },
      guarded,
      direct,
    );
    // Let both guarded calls fail.
    await new Promise((resolve) => setImmediate(resolve));
    resolveDirect('direct');

    expect(await first).toBe('direct');
    expect(await second).toBe('direct');
    expect(direct).toHaveBeenCalledTimes(1);
  });
});

describe('open-circuit detection without the class (v6)', () => {
  it('matches by message, flag or name, also in the cause chain', () => {
    // What the keyring SDK rethrows: a plain Error with the same message.
    expect(isOpenCircuitError(new Error(OPEN_CIRCUIT_ERROR_MESSAGE))).toBe(
      true,
    );
    expect(isOpenCircuitError({ isBrokenCircuitError: true })).toBe(true);
    const named = new Error('x');
    named.name = 'IsolatedCircuitError';
    expect(isOpenCircuitError(named)).toBe(true);
    expect(
      isOpenCircuitError(
        new Error('Failed to fetch account info', {
          cause: { message: OPEN_CIRCUIT_ERROR_MESSAGE },
        }),
      ),
    ).toBe(true);
    expect(isOpenCircuitError(new Error('Failed to fetch account info'))).toBe(
      false,
    );
  });

  it('reads the circuit state from the policy', () => {
    expect(isCircuitOpen(undefined)).toBe(false);
    expect(isCircuitOpen({})).toBe(false);
    expect(isCircuitOpen({ getRemainingCircuitOpenDuration: () => null })).toBe(
      false,
    );
    expect(isCircuitOpen({ getRemainingCircuitOpenDuration: () => 0 })).toBe(
      false,
    );
    expect(
      isCircuitOpen({ getRemainingCircuitOpenDuration: () => 12_000 }),
    ).toBe(true);
  });
});

describe('OpenCircuitBypass (v6)', () => {
  const key = 'tron:728126428 GET https://example.test/v1/accounts/T1';

  let now: number;

  beforeEach(() => {
    now = 2_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  it('bypasses an error that only carries the open-circuit message', async () => {
    const bypass = new OpenCircuitBypass();
    const direct = jest.fn().mockResolvedValue('direct');

    expect(
      await bypass.run(
        key,
        { bypassOpenCircuit: true },
        async () => {
          throw new Error(OPEN_CIRCUIT_ERROR_MESSAGE);
        },
        direct,
      ),
    ).toBe('direct');
    expect(direct).toHaveBeenCalledTimes(1);
  });

  it('goes direct without the guarded call when the policy reports an open circuit', async () => {
    const bypass = new OpenCircuitBypass();
    const guarded = jest.fn();
    const direct = jest.fn().mockResolvedValue('direct');
    const policy = {
      getRemainingCircuitOpenDuration: (): number => 20_000,
      reset: jest.fn(),
    };

    expect(
      await bypass.run(
        key,
        { bypassOpenCircuit: true },
        guarded,
        direct,
        policy,
      ),
    ).toBe('direct');
    expect(guarded).not.toHaveBeenCalled();
    expect(policy.reset).toHaveBeenCalledTimes(1);
  });

  it('does not check the state of background reads', async () => {
    const bypass = new OpenCircuitBypass();
    const guarded = jest.fn().mockResolvedValue('guarded');
    const direct = jest.fn();

    expect(
      await bypass.run(key, undefined, guarded, direct, {
        getRemainingCircuitOpenDuration: (): number => 20_000,
      }),
    ).toBe('guarded');
    expect(direct).not.toHaveBeenCalled();
  });

  it('reuses a successful direct result for the result TTL', async () => {
    const bypass = new OpenCircuitBypass();
    const guarded = async (): Promise<string> => {
      throw new BrokenCircuitError();
    };
    const direct = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const run = async (): Promise<string> =>
      bypass.run(key, { bypassOpenCircuit: true }, guarded, direct);

    expect(await run()).toBe('first');
    now += OPEN_CIRCUIT_BYPASS_RESULT_TTL_MS - 1;
    expect(await run()).toBe('first');
    expect(direct).toHaveBeenCalledTimes(1);

    // Expired, and within the bypass interval: the circuit error again.
    now += 1;
    await expect(run()).rejects.toBeInstanceOf(BrokenCircuitError);

    now += OPEN_CIRCUIT_BYPASS_INTERVAL_MS;
    expect(await run()).toBe('second');
  });

  it('does not reset the policy after a failed direct attempt', async () => {
    const bypass = new OpenCircuitBypass();
    const policy = { reset: jest.fn() };

    await expect(
      bypass.run(
        key,
        { bypassOpenCircuit: true },
        async () => {
          throw new BrokenCircuitError();
        },
        async () => {
          throw new Error('offline');
        },
        policy,
      ),
    ).rejects.toThrow('offline');
    expect(policy.reset).not.toHaveBeenCalled();
  });
});
