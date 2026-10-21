import { assert } from '@metamask/superstruct';

import { HttpError } from '../../utils/errors';
import { FetchPolicyErrorName } from '../../utils/fetchPolicy/createFetchPolicy';
import type { FetchPolicy } from '../../utils/fetchPolicy/executeWithFetchPolicy';
import {
  executeWithFetchPolicy,
  parseRetryAfter,
} from '../../utils/fetchPolicy/executeWithFetchPolicy';
import { UrlStruct } from '../../utils/urlStruct/urlStruct';

/**
 * The timeout for a single scan request, in milliseconds.
 */
const REQUEST_TIMEOUT_MS = 10_000;

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
  /**
   * Optional fetch policy (see `createFetchPolicy`). When given, transient
   * failures are retried with backoff and a circuit breaker. Without one, the
   * request is made directly.
   */
  policy?: FetchPolicy;
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

  readonly #policy?: FetchPolicy;

  /**
   * Creates a new SecurityAlertsApiClient.
   *
   * @param options - The client options.
   * @param options.scanUrl - The full scan endpoint URL. Validated once, so
   * an invalid URL fails fast at construction.
   * @param options.fetch - Optional fetch implementation; defaults to
   * `globalThis.fetch`.
   * @param options.policy - Optional fetch policy for retries and circuit
   * breaking.
   */
  constructor({
    scanUrl,
    fetch: fetchFn = globalThis.fetch,
    policy,
  }: SecurityAlertsApiClientOptions) {
    assert(scanUrl, UrlStruct);

    this.#fetch = fetchFn;
    this.#scanUrl = scanUrl;
    this.#policy = policy;
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
    const request = async (): Promise<unknown> => {
      const response = await this.#fetch(this.#scanUrl, {
        headers: { ...SECURITY_ALERTS_REQUEST_HEADERS },
        method: 'POST',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw Object.assign(
          new HttpError(`HTTP error! status: ${response.status}`),
          {
            httpStatus: response.status,
            retryAfterMs: parseRetryAfter(response.headers?.get('Retry-After')),
          },
        );
      }

      return await response.json();
    };

    try {
      return await (this.#policy
        ? executeWithFetchPolicy(this.#policy, request)
        : request());
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError('Security Alerts API error', {
        cause:
          error instanceof Error &&
          error.name === FetchPolicyErrorName.Network &&
          error.cause !== undefined
            ? error.cause
            : error,
      });
    }
  }
}
