import { withInterfaceLock } from './interface';

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
