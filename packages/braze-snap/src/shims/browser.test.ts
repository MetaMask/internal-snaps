import { GuardedXMLHttpRequest } from '../network';
import {
  CustomEventShim,
  addEventListenerShim,
  dispatchEventShim,
  documentShim,
  locationShim,
  navigatorShim,
  removeEventListenerShim,
  windowShim,
} from './browser';
import * as globals from './globals';
import type { ProvidedGlobal } from './provided-globals';
import { PROVIDED_GLOBALS } from './provided-globals';

const shims: Record<ProvidedGlobal, unknown> = globals;

describe('browser shims', () => {
  it('provides every global the bundler maps', () => {
    for (const name of PROVIDED_GLOBALS) {
      expect(shims[name]).toBeDefined();
    }
  });

  it('reports no device details through navigator', () => {
    expect(navigatorShim.userAgent).toBe('');
    expect(navigatorShim.platform).toBe('');
    expect(navigatorShim.language).toBe('');
    expect(navigatorShim.cookieEnabled).toBe(false);
    expect(windowShim.navigator).toBe(navigatorShim);
  });

  it('never stores cookies', () => {
    const shimmedDocument = documentShim as { cookie: string };

    shimmedDocument.cookie = 'test=1';

    expect(shimmedDocument.cookie).toBe('');
  });

  it('has no DOM content', () => {
    expect(documentShim.querySelectorAll()).toStrictEqual([]);
    expect(documentShim.getElementsByClassName()).toStrictEqual([]);
    expect(documentShim.hidden).toBe(true);
  });

  it('resolves URLs with anchors', () => {
    const anchor = documentShim.createElement('a');
    expect(anchor.pathname).toBe('/');

    anchor.href = 'https://sdk.iad-01.braze.com';

    expect(anchor.href).toBe('https://sdk.iad-01.braze.com/');
    expect(anchor.pathname).toBe('/');
    expect(`${anchor.toString()}api/v3`).toBe(
      'https://sdk.iad-01.braze.com/api/v3',
    );
  });

  it('returns inert stubs for other elements', () => {
    const element = documentShim.createElement('div') as {
      style: object;
      setAttribute: (name: string, value: string) => void;
      appendChild: (child: unknown) => void;
    };

    expect(element.style).toStrictEqual({});
    expect(element.setAttribute('id', 'x')).toBeUndefined();
    expect(element.appendChild({})).toBeUndefined();
  });

  it('uses a placeholder location', () => {
    expect(locationShim.href).toBe('https://metamask.invalid/');
    expect(documentShim.location).toBe(locationShim);
    expect(windowShim.location).toBe(locationShim);
  });

  it('ignores events', () => {
    expect(addEventListenerShim()).toBeUndefined();
    expect(removeEventListenerShim()).toBeUndefined();
    expect(dispatchEventShim()).toBe(true);
    expect(new CustomEventShim('braze', { detail: 1 })).toMatchObject({
      type: 'braze',
      detail: 1,
    });
    expect(new CustomEventShim('braze').detail).toBeUndefined();
  });

  it('exposes the guarded XMLHttpRequest on window', () => {
    expect(windowShim.XMLHttpRequest).toBe(GuardedXMLHttpRequest);
  });

  it('forwards randomness, encoding, and timers to the snap globals', () => {
    const values = windowShim.crypto.getRandomValues(new Uint8Array(16));
    expect(values.some((value) => value !== 0)).toBe(true);

    expect(windowShim.btoa('braze')).toBe('YnJhemU=');
    expect(windowShim.atob('YnJhemU=')).toBe('braze');

    vi.useFakeTimers();
    const timeoutHandler = vi.fn();
    const intervalHandler = vi.fn();
    (windowShim.setTimeout as (...args: unknown[]) => unknown)(
      timeoutHandler,
      10,
      'arg',
    );
    const cleared = windowShim.setTimeout(timeoutHandler, 10);
    windowShim.clearTimeout(cleared as ReturnType<typeof setTimeout>);
    const interval = (
      windowShim.setInterval as (...args: unknown[]) => unknown
    )(intervalHandler, 10, 'tick');
    vi.advanceTimersByTime(25);
    windowShim.clearInterval(interval as ReturnType<typeof setInterval>);
    vi.advanceTimersByTime(25);
    vi.useRealTimers();

    expect(timeoutHandler).toHaveBeenCalledTimes(1);
    expect(timeoutHandler).toHaveBeenCalledWith('arg');
    expect(intervalHandler).toHaveBeenCalledTimes(2);
    expect(intervalHandler).toHaveBeenCalledWith('tick');
  });
});
