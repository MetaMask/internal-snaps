import { ALLOWED_REQUEST_PATHS, NETWORK_LIMITS } from './constants';

const HEADER_NAME_REGEX = /^[A-Za-z0-9-]{1,64}$/u;

const MAX_HEADER_VALUE_LENGTH = 1024;

let allowedUrls: ReadonlySet<string> = new Set();

const controllers = new Set<AbortController>();

const pendingRequests = new Set<Promise<void>>();

/**
 * Only allow the SDK to send requests to the allowed paths on this endpoint.
 * Pass `null` to block all requests.
 *
 * @param endpoint - The Braze SDK endpoint host, e.g. `sdk.iad-01.braze.com`.
 */
export function setAllowedEndpoint(endpoint: string | null): void {
  allowedUrls = new Set(
    endpoint === null
      ? []
      : ALLOWED_REQUEST_PATHS.map(
          (path) => new URL(path, `https://${endpoint}`).href,
        ),
  );
}

/**
 * Abort every request that is still running. Their `onerror` callbacks run
 * as usual, so the SDK keeps the data it could not send.
 */
export function abortRequests(): void {
  for (const controller of controllers) {
    controller.abort();
  }
}

/**
 * Wait until every request has settled and the SDK callbacks have run.
 */
export async function drainRequests(): Promise<void> {
  while (pendingRequests.size > 0) {
    await Promise.allSettled([...pendingRequests]);
  }
}

/**
 * Get the length of a string in bytes once UTF-8 encoded.
 *
 * @param value - The string.
 * @returns The length in bytes.
 */
function getByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Call an SDK callback, ignoring its errors. An error escaping a request
 * would otherwise terminate the snap.
 *
 * @param callback - The callback set by the SDK.
 */
function callSafely(callback: (() => void) | null): void {
  try {
    callback?.();
  } catch {
    // The SDK handles its own failures.
  }
}

type RequestOutcome =
  | { type: 'load'; status: number; body: string; headers: string }
  | { type: 'error' }
  | { type: 'timeout' };

/**
 * The `XMLHttpRequest` the SDK sees. It implements the subset the SDK uses
 * on top of `fetch`, and only lets requests through when they target an
 * allowed URL and stay within {@link NETWORK_LIMITS}.
 */
export class GuardedXMLHttpRequest {
  readyState = 0;

  status = 0;

  responseText = '';

  onload: (() => void) | null = null;

  onerror: (() => void) | null = null;

  ontimeout: (() => void) | null = null;

  #method = '';

  #url = '';

  #requestHeaders: Record<string, string> = {};

  #responseHeaders = '';

  open(method: string, url: string): void {
    this.#method = String(method).toUpperCase();
    this.#url = String(url);
    this.#requestHeaders = {};
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string): void {
    const headerName = String(name);
    const headerValue = String(value);
    if (
      HEADER_NAME_REGEX.test(headerName) &&
      headerValue.length <= MAX_HEADER_VALUE_LENGTH
    ) {
      this.#requestHeaders[headerName] = headerValue;
    }
  }

  getAllResponseHeaders(): string {
    return this.#responseHeaders;
  }

  send(body?: string | null): void {
    const request = this.#run(body ?? '').then((outcome) => {
      this.#complete(outcome);
    });
    pendingRequests.add(request);
    // `#run` never rejects and `#complete` ignores SDK errors.
    // eslint-disable-next-line no-void
    void request.finally(() => pendingRequests.delete(request));
  }

  /**
   * Check whether the request may be sent.
   *
   * @param body - The request body.
   * @returns Whether the request is allowed.
   */
  #isAllowed(body: string): boolean {
    return (
      this.#method === 'POST' &&
      allowedUrls.has(this.#url) &&
      getByteLength(body) <= NETWORK_LIMITS.maxRequestBodyBytes &&
      controllers.size < NETWORK_LIMITS.maxConcurrentRequests
    );
  }

  async #run(body: string): Promise<RequestOutcome> {
    if (!this.#isAllowed(body)) {
      return { type: 'error' };
    }

    const controller = new AbortController();
    controllers.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, NETWORK_LIMITS.requestTimeoutMs);

    try {
      const response = await globalThis.fetch(this.#url, {
        method: 'POST',
        headers: this.#requestHeaders,
        body,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });

      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > NETWORK_LIMITS.maxResponseBodyBytes) {
        return { type: 'error' };
      }

      const responseBody = await response.text();
      if (getByteLength(responseBody) > NETWORK_LIMITS.maxResponseBodyBytes) {
        return { type: 'error' };
      }

      let headers = '';
      response.headers.forEach((value, name) => {
        headers += `${name}: ${value}\r\n`;
      });

      return {
        type: 'load',
        status: response.status,
        body: responseBody,
        headers,
      };
    } catch {
      return timedOut ? { type: 'timeout' } : { type: 'error' };
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  }

  #complete(outcome: RequestOutcome): void {
    this.readyState = 4;

    if (outcome.type === 'load') {
      this.status = outcome.status;
      this.responseText = outcome.body;
      this.#responseHeaders = outcome.headers;
      callSafely(this.onload);
      return;
    }

    this.status = 0;
    this.responseText = '';
    this.#responseHeaders = '';
    callSafely(outcome.type === 'timeout' ? this.ontimeout : this.onerror);
  }
}
