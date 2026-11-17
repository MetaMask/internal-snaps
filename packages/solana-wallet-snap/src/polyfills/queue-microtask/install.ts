const queueMicrotaskPolyfill = async (callback: () => void): Promise<void> => {
  await Promise.resolve();
  callback();
};

/**
 * Adds support for the window#queueMicrotask() function.
 */
export function install(): void {
  Object.defineProperty(globalThis, 'queueMicrotask', {
    value: queueMicrotaskPolyfill,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
