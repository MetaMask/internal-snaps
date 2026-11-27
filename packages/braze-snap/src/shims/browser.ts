import { GuardedXMLHttpRequest, blockedFetch } from '../network';

const noop = (): undefined => undefined;

const page = Object.freeze({
  href: 'https://metamask.invalid/',
  origin: 'https://metamask.invalid',
  protocol: 'https:',
  host: 'metamask.invalid',
  hostname: 'metamask.invalid',
  port: '',
  pathname: '/',
  search: '',
  hash: '',
});

export const locationShim = page;

export const navigatorShim = Object.freeze({
  userAgent: '',
  platform: '',
  language: '',
  cookieEnabled: false,
  onLine: true,
  maxTouchPoints: 0,
});

export const screenShim = Object.freeze({ width: 0, height: 0 });

export const addEventListenerShim = noop;

export const removeEventListenerShim = noop;

export const dispatchEventShim = (): boolean => true;

export class CustomEventShim {
  readonly type: string;

  readonly detail: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

/**
 * A minimal anchor element, used by the SDK to resolve its base URL.
 */
class Anchor {
  #url = new URL(page.href);

  get href(): string {
    return this.#url.href;
  }

  set href(value: string) {
    this.#url = new URL(value, page.href);
  }

  get pathname(): string {
    return this.#url.pathname;
  }

  toString(): string {
    return this.#url.href;
  }
}

const inertElement = Object.freeze({
  style: Object.freeze({}),
  setAttribute: noop,
  appendChild: noop,
});

/**
 * Create a minimal anchor or inert element stub.
 *
 * @param tagName - The tag name.
 * @returns An anchor stub for `a`, or an inert element stub.
 */
function createElement(tagName: 'a'): Anchor;
function createElement(tagName: string): Anchor | typeof inertElement;
function createElement(tagName: string): Anchor | typeof inertElement {
  return tagName === 'a' ? new Anchor() : inertElement;
}

export const documentShim = Object.freeze({
  hidden: true,
  visibilityState: 'hidden',
  location: page,
  get cookie(): string {
    return '';
  },
  set cookie(_value: string) {
    // Cookies are never stored.
  },
  addEventListener: noop,
  removeEventListener: noop,
  querySelectorAll: (): never[] => [],
  getElementsByClassName: (): never[] => [],
  createElement,
});

/**
 * The `window` the SDK sees. It has no DOM, no storage, and no network
 * access besides {@link GuardedXMLHttpRequest}.
 */
export const windowShim = Object.freeze({
  location: page,
  navigator: navigatorShim,
  screen: screenShim,
  document: documentShim,
  addEventListener: addEventListenerShim,
  removeEventListener: removeEventListenerShim,
  dispatchEvent: dispatchEventShim,
  CustomEvent: CustomEventShim,
  XMLHttpRequest: GuardedXMLHttpRequest,
  fetch: blockedFetch,
  crypto: Object.freeze({
    getRandomValues: <Type extends ArrayBufferView | null>(array: Type): Type =>
      globalThis.crypto.getRandomValues(array),
  }),
  atob: (data: string): string => globalThis.atob(data),
  btoa: (data: string): string => globalThis.btoa(data),
  setTimeout: (
    handler: (...args: unknown[]) => void,
    timeout?: number,
    ...args: unknown[]
  ): unknown => globalThis.setTimeout(handler, timeout, ...args),
  clearTimeout: (id: Parameters<typeof globalThis.clearTimeout>[0]): void =>
    globalThis.clearTimeout(id),
  setInterval: (
    handler: (...args: unknown[]) => void,
    timeout?: number,
    ...args: unknown[]
  ): unknown => globalThis.setInterval(handler, timeout, ...args),
  clearInterval: (id: Parameters<typeof globalThis.clearInterval>[0]): void =>
    globalThis.clearInterval(id),
});
