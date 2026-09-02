import { InFlightCoalescer } from './InFlightCoalescer';

describe('InFlightCoalescer', () => {
  it('returns the result of the wrapped function', async () => {
    const coalescer = new InFlightCoalescer();

    const result = await coalescer.run('key', async () => 'value');

    expect(result).toBe('value');
  });

  it('shares one in-flight run between concurrent callers with the same key', async () => {
    const coalescer = new InFlightCoalescer();
    let resolveRun: (value: string) => void = () => undefined;
    const fn = jest.fn(
      async () =>
        new Promise<string>((resolve) => {
          resolveRun = resolve;
        }),
    );

    const first = coalescer.run('key', fn);
    const second = coalescer.run('key', fn);
    await Promise.resolve();
    resolveRun('shared');

    expect(await first).toBe('shared');
    expect(await second).toBe('shared');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight run with a same-key reentrant caller', async () => {
    const coalescer = new InFlightCoalescer();
    let reentrant: Promise<string> | undefined;
    const fn = jest.fn(async () => {
      reentrant = coalescer.run('key', async () => 'duplicate');
      return 'shared';
    });

    const result = await coalescer.run('key', fn);

    expect(result).toBe('shared');
    expect(await reentrant).toBe('shared');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs again once the previous run for the key has settled', async () => {
    const coalescer = new InFlightCoalescer();
    const fn = jest.fn(async () => 'value');

    await coalescer.run('key', fn);
    await coalescer.run('key', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs concurrent callers with different keys independently', async () => {
    const coalescer = new InFlightCoalescer();
    const fnA = jest.fn(async () => 'a');
    const fnB = jest.fn(async () => 'b');

    const [resultA, resultB] = await Promise.all([
      coalescer.run('a', fnA),
      coalescer.run('b', fnB),
    ]);

    expect(resultA).toBe('a');
    expect(resultB).toBe('b');
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('propagates rejections to coalesced callers and clears the entry', async () => {
    const coalescer = new InFlightCoalescer();
    let rejectRun: (error: Error) => void = () => undefined;
    const failing = jest.fn(
      async () =>
        new Promise<string>((_resolve, reject) => {
          rejectRun = reject;
        }),
    );

    const first = coalescer.run('key', failing);
    const second = coalescer.run('key', failing);
    await Promise.resolve();
    rejectRun(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    expect(failing).toHaveBeenCalledTimes(1);

    expect(await coalescer.run('key', async () => 'ok')).toBe('ok');
  });
});
