import { ALLOWED_REQUEST_PATHS, REQUEST_TIMEOUT_MS } from './constants';

let allowedUrls: ReadonlySet<string> = new Set();

const controllers = new Set<AbortController>();

const pendingRequests = new Set<Promise<void>>();

let allowedRequestFailed = false;

/**
 * Blocked `fetch` replacement exposed to the SDK and browser shims so free
 * `fetch` and `window.fetch` calls fail instead of bypassing
 * {@link GuardedXMLHttpRequest}.
 *
 * @returns A rejected promise.
 */
export const blockedFetch: typeof globalThis.fetch = async () =>
  Promise.reject(
    new TypeError('Direct fetch is disabled; use XMLHttpRequest.'),
  );

/**
 * Reset the per-request allowed-network failure tracker.
 */
export function resetRequestFailures(): void {
  allowedRequestFailed = false;
}

/**
 * Whether any allowlisted network request failed or returned an HTTP error
 * status (>= 400) since the last {@link resetRequestFailures}.
 *
 * @returns True when an allowed request failed.
 */
export function hasRequestFailure(): boolean {
  return allowedRequestFailed;
}

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
 * on top of `fetch`, and only lets `POST` requests through when they target an
 * allowed URL.
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
    this.#requestHeaders[String(name)] = String(value);
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

  async #run(body: string): Promise<RequestOutcome> {
    if (this.#method !== 'POST' || !allowedUrls.has(this.#url)) {
      return { type: 'error' };
    }

    const controller = new AbortController();
    controllers.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

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

      const responseBody = await response.text();
      if (response.status >= 400) {
        allowedRequestFailed = true;
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
      allowedRequestFailed = true;
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
