import { withInterfaceLock } from './interfaceLock';

describe('withInterfaceLock', () => {
  it('serializes work per interface without blocking other interfaces', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const first = withInterfaceLock('one', async () => {
      calls.push('first');
      await gate;
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

  it('releases the lock if the callback fails', async () => {
    await expect(
      withInterfaceLock('one', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(await withInterfaceLock('one', async () => 42)).toBe(42);
  });
});
