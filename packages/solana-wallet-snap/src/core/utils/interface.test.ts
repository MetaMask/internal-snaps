import {
  endTrace,
  listEntropySources,
  scheduleBackgroundEvent,
  startTrace,
  withInterfaceLock,
} from './interface';

const setupSnapRequest = (): { mockSnapRequest: ReturnType<typeof vi.fn> } => {
  vi.clearAllMocks();

  const mockSnapRequest = vi.fn();
  Object.assign(globalThis, {
    snap: {
      request: mockSnapRequest,
    },
  });

  return { mockSnapRequest };
};

describe('withInterfaceLock', () => {
  it('serializes work for one interface while allowing another to proceed', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];

    const first = withInterfaceLock('one', async () => {
      calls.push('first');
      await pending;
    });
    const second = withInterfaceLock('one', async () => {
      calls.push('second');
    });
    await withInterfaceLock('two', async () => {
      calls.push('other');
    });

    expect(calls).toStrictEqual(['first', 'other']);

    release();
    await Promise.all([first, second]);

    expect(calls).toStrictEqual(['first', 'other', 'second']);
  });

  it('releases the lock after an error', async () => {
    await expect(
      withInterfaceLock('one', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');

    expect(await withInterfaceLock('one', async () => 42)).toBe(42);
  });

  it('returns the callback result', async () => {
    expect(await withInterfaceLock('one', async () => 'value')).toBe('value');
  });
});

describe('scheduleBackgroundEvent', () => {
  it('schedules the event with the given duration and empty params by default', async () => {
    const { mockSnapRequest } = setupSnapRequest();
    mockSnapRequest.mockResolvedValueOnce('event-id');

    expect(
      await scheduleBackgroundEvent({
        method: 'refreshConfirmationEstimation',
        duration: 'PT20S',
      }),
    ).toBe('event-id');

    expect(mockSnapRequest).toHaveBeenCalledWith({
      method: 'snap_scheduleBackgroundEvent',
      params: {
        duration: 'PT20S',
        request: {
          method: 'refreshConfirmationEstimation',
          params: {},
        },
      },
    });
  });

  it('passes the given params to the background event', async () => {
    const { mockSnapRequest } = setupSnapRequest();

    await scheduleBackgroundEvent({
      method: 'onTransactionAdded',
      params: { interfaceId: 'interface-id' },
      duration: 'PT1S',
    });

    expect(mockSnapRequest).toHaveBeenCalledWith({
      method: 'snap_scheduleBackgroundEvent',
      params: {
        duration: 'PT1S',
        request: {
          method: 'onTransactionAdded',
          params: { interfaceId: 'interface-id' },
        },
      },
    });
  });
});

describe('listEntropySources', () => {
  it('returns the entropy sources from the snap', async () => {
    const { mockSnapRequest } = setupSnapRequest();
    const sources = [{ id: 'primary', primary: true, name: 'Primary' }];
    mockSnapRequest.mockResolvedValueOnce(sources);

    expect(await listEntropySources()).toStrictEqual(sources);
    expect(mockSnapRequest).toHaveBeenCalledWith({
      method: 'snap_listEntropySources',
    });
  });
});

describe('startTrace', () => {
  it('returns the trace ID from the snap', async () => {
    const { mockSnapRequest } = setupSnapRequest();
    mockSnapRequest.mockResolvedValueOnce(7);

    expect(await startTrace('trace-name')).toBe(7);
    expect(mockSnapRequest).toHaveBeenCalledWith({
      method: 'snap_startTrace',
      params: { name: 'trace-name' },
    });
  });

  it('returns null when the snap rejects the trace', async () => {
    const { mockSnapRequest } = setupSnapRequest();
    mockSnapRequest.mockRejectedValueOnce(new Error('unsupported'));

    expect(await startTrace('trace-name')).toBeNull();
  });
});

describe('endTrace', () => {
  it('ends the trace with the snap', async () => {
    const { mockSnapRequest } = setupSnapRequest();
    mockSnapRequest.mockResolvedValueOnce('ended');

    expect(await endTrace('trace-name')).toBe('ended');
    expect(mockSnapRequest).toHaveBeenCalledWith({
      method: 'snap_endTrace',
      params: { name: 'trace-name' },
    });
  });

  it('returns null when the snap rejects the end of the trace', async () => {
    const { mockSnapRequest } = setupSnapRequest();
    mockSnapRequest.mockRejectedValueOnce(new Error('unknown trace'));

    expect(await endTrace('trace-name')).toBeNull();
  });
});
