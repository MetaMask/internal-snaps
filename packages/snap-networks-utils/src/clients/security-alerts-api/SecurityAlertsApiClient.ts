import { assert } from '@metamask/superstruct';

import { HttpError } from '../../utils/errors';
import { UrlStruct } from '../../utils/urlStruct/urlStruct';

/**
 * Headers sent with every Security Alerts API request.
 */
export const SECURITY_ALERTS_REQUEST_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  accept: 'application/json',
};

/**
 * Options for a `SecurityAlertsApiClient` constructor.
 */
export type SecurityAlertsApiClientOptions = {
  /**
   * The full scan endpoint URL, e.g. `https://security-alerts.api.cx.metamask.io/tron/transaction/scan`.
   */
  scanUrl: string;
  /** The fetch implementation to use. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
};

/**
 * HTTP client for a Security Alerts API scan endpoint.
 *
 * Owns the request envelope shared by every chain — POSTing the JSON body,
 * wrapping request failures, non-2xx responses, and malformed JSON bodies as
 * {@link HttpError}, and parsing the JSON response — and nothing
 * else.
 *
 * The request body is a chain-specific Blockaid contract: the caller
 * supplies a typed body (e.g. checked with `satisfies` against a per-snap
 * body type) and is responsible for validating the parsed response payload.
 */
export class SecurityAlertsApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #scanUrl: string;

  /**
   * Creates a new SecurityAlertsApiClient.
   *
   * @param options - The client options.
   * @param options.scanUrl - The full scan endpoint URL. Validated once, so
   * an invalid URL fails fast at construction.
   * @param options.fetch - Optional fetch implementation; defaults to
   * `globalThis.fetch`.
   */
  constructor({
    scanUrl,
    fetch: fetchFn = globalThis.fetch,
  }: SecurityAlertsApiClientOptions) {
    assert(scanUrl, UrlStruct);

    this.#fetch = fetchFn;
    this.#scanUrl = scanUrl;
  }

  /**
   * Scans a transaction by posting the request body to the scan endpoint.
   *
   * @param body - The chain-specific scan request body.
   * @returns The parsed scan response.
   * @throws HttpError if the request fails, the API responds
   * with a non-2xx status, or the response body cannot be parsed as JSON.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async scanTransaction(body: unknown): Promise<any> {
    try {
      const response = await this.#fetch(this.#scanUrl, {
        headers: { ...SECURITY_ALERTS_REQUEST_HEADERS },
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new HttpError(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError('Security Alerts API error', {
        cause: error,
      });
    }
  }
}
