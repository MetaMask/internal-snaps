import { assert } from '@metamask/superstruct';

import { HttpError } from '../../utils/errors';
import type { FetchPolicyError } from '../../utils/fetchPolicy/createFetchPolicy';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '../../utils/fetchPolicy/createFetchPolicy';
import type { FetchPolicy } from '../../utils/fetchPolicy/executeWithFetchPolicy';
import {
  executeWithFetchPolicy,
  parseRetryAfter,
} from '../../utils/fetchPolicy/executeWithFetchPolicy';
import type { Logger } from '../../utils/logger/Logger';
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
  /**
   * Logger for the fetch policy's retries and circuit breaks. Required when a
   * policy is given.
   */
  logger?: Pick<Logger, 'warn'>;
};

/**
 * Map an {@link HttpError} thrown by the request to the fetch-policy shape.
 *
 * Non-2xx errors already carry an `httpStatus` (attached when thrown) and pass
 * through before this mapper runs. The remaining errors are classified by
 * their cause: timeouts and network failures are transient,
 * malformed-response and abort causes are not.
 *
 * @param error - The error to map.
 * @returns The error in the fetch-policy shape.
 */
function mapScanError(error: unknown): FetchPolicyError {
  const httpError = error as HttpError;
  const { cause } = error as Error & { cause?: unknown };
  if (cause instanceof Error) {
    if (cause.name === 'TimeoutError') {
      return createFetchPolicyError(httpError.message, {
        name: FetchPolicyErrorName.Timeout,
        cause,
      });
    }
    if (cause.name !== 'AbortError' && !(cause instanceof SyntaxError)) {
      return createFetchPolicyError(httpError.message, {
        name: FetchPolicyErrorName.Network,
        cause,
      });
    }
  }

  return httpError;
}

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
   * @param options.logger - Logger for the policy; required with a policy.
   */
  constructor({
    scanUrl,
    fetch: fetchFn = globalThis.fetch,
    policy,
    logger,
  }: SecurityAlertsApiClientOptions) {
    assert(scanUrl, UrlStruct);
    if (policy && !logger) {
      throw new Error('A logger is required when a fetch policy is given.');
    }

    this.#fetch = fetchFn;
    this.#scanUrl = scanUrl;
    this.#policy = policy;
  }

  /**
   * Scans a transaction by posting the request body to the scan endpoint.
   *
   * @param body - The chain-specific scan request body.
   * @returns The parsed scan response.
   * @throws HttpError if the request fails, the API responds with a non-2xx
   * status, or the response body cannot be parsed as JSON. With a policy,
   * throws a fetch-policy error instead when the retries are exhausted or the
   * circuit is open.
   */
  async scanTransaction(body: unknown): Promise<unknown> {
    const request = async (): Promise<unknown> => {
      try {
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
              retryAfterMs: parseRetryAfter(
                response.headers.get('Retry-After'),
              ),
            },
          );
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
    };

    if (!this.#policy) {
      return request();
    }

    return executeWithFetchPolicy(this.#policy, request, mapScanError);
  }
}
