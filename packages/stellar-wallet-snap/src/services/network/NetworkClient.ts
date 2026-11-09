import type {
  FetchPolicy,
  FetchPolicyError,
} from '@metamask/snap-networks-utils';
import {
  createFetchPolicyError,
  executeWithFetchPolicy,
  FetchPolicyErrorName,
  parseRetryAfter,
} from '@metamask/snap-networks-utils';
import { Horizon, rpc } from '@stellar/stellar-sdk';

import { HttpError, KnownHttpErrorCode } from '../../utils';

/**
 * HTTP client installed by `rpc.Server` and `Horizon.Server`.
 */
type StellarHttpClient = rpc.Server['httpClient']; // Both rpc.Server and Horizon.Server shared the same `httpClient` type.

/**
 * Transport function from the SDK HTTP client.
 */
type StellarHttpAdapter = NonNullable<StellarHttpClient['defaults']['adapter']>;

/**
 * Request config type from the SDK HTTP adapter.
 */
type StellarHttpRequestConfig = Parameters<StellarHttpAdapter>[0];

/**
 * Fetch-style header lookup. The default SDK client uses this.
 */
type DefaultHttpResponseHeaders = {
  get(name: string): string | null;
};

/**
 * Plain header map. The axios build uses this.
 */
type AxiosHttpResponseHeaders = Record<string, unknown>;

/**
 * Header map from the SDK HTTP client.
 */
type HttpResponseHeaders =
  | DefaultHttpResponseHeaders
  | AxiosHttpResponseHeaders;

/**
 * Extra mapping applied after the shared policy error is created.
 *
 * @param error - The error thrown by the SDK HTTP adapter.
 * @param policyError - The mapped fetch-policy error.
 * @returns The error the fetch policy decides on.
 */
type CustomPolicyErrorMapper = (
  error: unknown,
  policyError: FetchPolicyError,
) => FetchPolicyError;

/**
 * Check if the headers are a default http response headers by whether it has a `get` method.
 *
 * @param headers - Response headers from the HTTP client.
 * @returns True if the headers are a default http response headers, false otherwise.
 */
function isDefaultHttpResponseHeaders(
  headers: HttpResponseHeaders,
): headers is DefaultHttpResponseHeaders {
  return typeof headers.get === 'function';
}

/**
 * Installs a fetch policy on a Stellar SDK HTTP client by replacing its adapter.
 */
class PolicyInstaller {
  readonly #fetchPolicy: FetchPolicy;

  readonly #timeout: number;

  readonly #customPolicyErrorMapper?: CustomPolicyErrorMapper;

  /**
   * @param fetchPolicy - Retry and circuit-breaker policy for this client.
   * @param timeout - Request timeout copied onto the SDK client, in milliseconds.
   * @param customPolicyErrorMapper - Optional mapping applied after the shared policy error is created.
   */
  constructor(
    fetchPolicy: FetchPolicy,
    timeout: number,
    customPolicyErrorMapper?: CustomPolicyErrorMapper,
  ) {
    this.#fetchPolicy = fetchPolicy;
    this.#timeout = timeout;
    this.#customPolicyErrorMapper = customPolicyErrorMapper;
  }

  /**
   * Replaces the SDK adapter with one that runs inside the fetch policy.
   *
   * @param httpClient - The SDK server's HTTP client.
   */
  installPolicy(httpClient: StellarHttpClient): void {
    const { adapter } = httpClient.defaults;
    if (!adapter) {
      throw new Error(
        'HTTP client has no request adapter to attach the fetch policy to',
      );
    }

    httpClient.defaults.timeout = this.#timeout;
    httpClient.defaults.adapter = (
      config: StellarHttpRequestConfig,
    ): ReturnType<StellarHttpAdapter> =>
      executeWithFetchPolicy(
        this.#fetchPolicy,
        () => adapter(config),
        (error: unknown) => this.#mapError(error),
      );
  }

  #mapError(error: unknown): FetchPolicyError {
    const policyError = this.#createPolicyError(error);
    return this.#customPolicyErrorMapper
      ? this.#customPolicyErrorMapper(error, policyError)
      : policyError;
  }

  #readRetryAfterFromHeaders(
    headers: HttpResponseHeaders | undefined,
  ): string | undefined {
    if (!headers) {
      return undefined;
    }

    if (isDefaultHttpResponseHeaders(headers)) {
      return (
        headers.get('retry-after') ?? headers.get('Retry-After') ?? undefined
      );
    }

    const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
    return typeof retryAfter === 'string' ? retryAfter : undefined;
  }

  /**
   * Maps an SDK HTTP failure into the shape {@link executeWithFetchPolicy}
   * decides on, without attaching the SDK response.
   *
   * - Map a thrown non-`Error` to a network failure.
   * - Map a numeric HTTP status to a network failure, with `Retry-After` when present.
   * - Map a timeout error to a timeout failure.
   * - Map a cancellation to an abort, which the policy must not retry or count toward the circuit.
   *
   * @param error - The error thrown by the SDK HTTP adapter.
   * @returns The policy error.
   */
  #createPolicyError(error: unknown): FetchPolicyError {
    if (!(error instanceof Error)) {
      return createFetchPolicyError('Network request failed', {
        name: FetchPolicyErrorName.Network,
        cause: error,
      });
    }

    const httpError = error as HttpError;
    const httpStatus = httpError.response?.status;
    if (typeof httpStatus === 'number') {
      const retryAfterMs = parseRetryAfter(
        this.#readRetryAfterFromHeaders(httpError.response?.headers),
      );
      return createFetchPolicyError(error.message, {
        httpStatus,
        retryAfterMs,
        cause: error,
      });
    }

    if (
      httpError.code === KnownHttpErrorCode.ConnectionAborted ||
      httpError.code === KnownHttpErrorCode.Timeout ||
      error.name === FetchPolicyErrorName.Timeout
    ) {
      return createFetchPolicyError(error.message, {
        name: FetchPolicyErrorName.Timeout,
        cause: error,
      });
    }

    if (
      error.name === KnownHttpErrorCode.CustomErrCanceled ||
      httpError.code === KnownHttpErrorCode.Canceled
    ) {
      return createFetchPolicyError(error.message, {
        name: KnownHttpErrorCode.AbortError,
        cause: error,
      });
    }

    return createFetchPolicyError(error.message, {
      name: FetchPolicyErrorName.Network,
      cause: error,
    });
  }
}

/**
 * Soroban RPC with fetch policy installed.
 */
export class RpcClient extends rpc.Server {
  /**
   * @param fetchPolicy - Retry and circuit-breaker policy for this server.
   * @param serverURL - Soroban RPC URL.
   * @param timeout - Timeout for the RPC client.
   * @param opts - Options forwarded to `rpc.Server`.
   */
  constructor(
    fetchPolicy: FetchPolicy,
    serverURL: string,
    timeout: number,
    opts?: rpc.Server.Options,
  ) {
    super(serverURL, opts);
    new PolicyInstaller(fetchPolicy, timeout).installPolicy(this.httpClient);
  }
}

/**
 * Horizon client with fetch policy installed.
 */
export class HorizonClient extends Horizon.Server {
  /**
   * @param fetchPolicy - Retry and circuit-breaker policy for this server.
   * @param serverURL - Horizon URL.
   * @param timeout - Timeout for the Horizon client.
   * @param opts - Options forwarded to `Horizon.Server`.
   */
  constructor(
    fetchPolicy: FetchPolicy,
    serverURL: string,
    timeout: number,
    opts?: Horizon.Server.Options,
  ) {
    super(serverURL, opts);
    new PolicyInstaller(fetchPolicy, timeout, (error, policyError) =>
      this.#attachSdkResponse(error, policyError),
    ).installPolicy(this.httpClient);
  }

  /**
   * Attach the Stellar SDK `response` onto the policy error.
   *
   * Stellar SDK reads Horizon `error.response` on the thrown error:
   * - A 404 becomes `NotFoundError`
   * - other status becomes `NetworkError`
   * - `submitTransaction` uses the body for `TransactionFailedError`
   * Map the response onto the policy error to reuse the same error shape that the SDK uses.
   * Thus, consumer will see the same error shape that the SDK uses.
   *
   * @param error - The error thrown by the HTTP adapter.
   * @param policyError - The mapped fetch-policy error.
   * @returns The policy error, with `response` when the Stellar SDK provided one.
   */
  #attachSdkResponse(
    error: unknown,
    policyError: FetchPolicyError,
  ): FetchPolicyError {
    const response = (error as HttpError | undefined)?.response;
    if (response && typeof response.status === 'number') {
      return Object.assign(policyError, { response });
    }
    return policyError;
  }
}
