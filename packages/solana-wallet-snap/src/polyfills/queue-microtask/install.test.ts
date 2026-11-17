import { install } from '.';

const originalDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'queueMicrotask',
);

describe('install', () => {
  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'queueMicrotask', originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'queueMicrotask');
    }
  });

  it('adds a global queueMicrotask function', () => {
    install();

    expect(typeof globalThis.queueMicrotask).toBe('function');
  });

  it('defines the global as writable, configurable and enumerable', () => {
    install();

    expect(
      Object.getOwnPropertyDescriptor(globalThis, 'queueMicrotask'),
    ).toStrictEqual({
      value: expect.any(Function),
      writable: true,
      configurable: true,
      enumerable: true,
    });
  });

  it('runs the callback asynchronously', async () => {
    install();

    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'queueMicrotask',
    );

    // The installed polyfill resolves before invoking the callback, so awaiting
    // it is the documented way to wait for the callback to run.
    const queueMicrotaskPolyfill = descriptor?.value as (
      callback: () => void,
    ) => Promise<void>;

    const callback = vi.fn();

    await queueMicrotaskPolyfill(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
