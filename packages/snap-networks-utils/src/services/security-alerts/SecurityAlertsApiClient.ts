import { assert } from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';

import { UrlStruct } from '../../utils/urlStruct/urlStruct';

/**
 * Headers sent with every Security Alerts API request.
 */
export const SECURITY_ALERTS_REQUEST_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  accept: 'application/json',
};

/**
 * Error thrown when the Security Alerts API responds with a non-2xx status.
 */
export class SecurityAlertsHttpError extends Error {
  readonly statusCode: number;

  readonly responseBody: string | null;

  /**
   * Creates a new SecurityAlertsHttpError.
   *
   * @param statusCode - The HTTP status code of the response.
   * @param responseBody - The raw response body, when it could be read.
   */
  constructor(statusCode: number, responseBody: string | null) {
    super(
      `Security Alerts API error: ${statusCode}${
        responseBody ? ` - ${responseBody}` : ''
      }`,
    );

    this.name = 'SecurityAlertsHttpError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

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
 * reporting non-2xx responses as {@link SecurityAlertsHttpError}, and parsing
 * the JSON response — and nothing else.
 *
 * The request body and response payload are chain-specific Blockaid
 * contracts: the caller supplies a typed body (e.g. checked with `satisfies`
 * against a per-snap body type) and a Superstruct struct for the response,
 * so both are type-checked and validated at the call site.
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
   * @param responseStruct - Superstruct struct validating the
   * chain-specific response payload.
   * @returns The validated scan response.
   * @throws SecurityAlertsHttpError if the API responds with a non-2xx status.
   */
  async scanTransaction<BodyT extends Record<string, unknown>, ResponseT>(
    body: BodyT,
    responseStruct: Struct<ResponseT>,
  ): Promise<ResponseT> {
    const response = await this.#fetch(this.#scanUrl, {
      headers: { ...SECURITY_ALERTS_REQUEST_HEADERS },
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let responseBody: string | null = null;
      try {
        responseBody = await response.text();
      } catch {
        responseBody = null;
      }

      throw new SecurityAlertsHttpError(response.status, responseBody);
    }

    const data = await response.json();
    assert(data, responseStruct);

    return data;
  }
}
