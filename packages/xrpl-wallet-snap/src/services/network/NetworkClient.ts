import type { Struct } from '@metamask/superstruct';
import { is } from '@metamask/superstruct';
import { RIPPLED_API_V2 } from 'xrpl';

import type { AnyErrorConstructor } from '../../utils';
import { rethrowIfInstanceElseThrow } from '../../utils';
import {
  assertHttpRequestParams,
  assertHttpResponse,
  InvalidHttpRequestParamsException,
  InvalidHttpResponseException,
} from '../../utils/errors';
import type {
  AccountInfoRequest,
  AccountInfoResponse,
  AccountLinesRequest,
  AccountLinesResponse,
  AccountMptokensRequest,
  AccountMptokensResponse,
  FetchAccountTransactionsRequest,
  FetchAccountTransactionsResponse,
  BaseRpcResponse,
  BaseTxResponse,
  BaseTxResult,
  DepositAuthorizedRequest,
  DepositAuthorizedResponse,
  LedgerEntryRequest,
  LedgerEntryResponse,
  LedgerIndex,
  LedgerRequest,
  LedgerResponse,
  PageMarker,
  RpcErrorResponse,
  ServerInfoResponse,
  SimulateRequest,
  SimulateResponse,
  SubmitRequest,
  SubmitResponse,
  TrustLine,
  AccountMptoken,
  TxRequest,
} from './api';
import {
  AccountInfoRequestStruct,
  AccountInfoResponseStruct,
  AccountLinesRequestStruct,
  AccountLinesResponseStruct,
  AccountMptokensRequestStruct,
  AccountMptokensResponseStruct,
  FetchAccountTransactionsRequestStruct,
  FetchAccountTransactionsResponseStruct,
  BaseTxResponseStruct,
  DepositAuthorizedRequestStruct,
  DepositAuthorizedResponseStruct,
  LedgerEntryRequestStruct,
  LedgerEntryResponseStruct,
  LedgerRequestStruct,
  LedgerResponseStruct,
  KnownRpcError,
  LedgerState,
  RpcErrorResponseStruct,
  ServerInfoRequestStruct,
  ServerInfoResponseStruct,
  SimulateRequestStruct,
  SimulateResponseStruct,
  SubmitRequestStruct,
  SubmitResponseStruct,
  TxRequestStruct,
} from './api';
import { NetworkServiceException, RpcResponseException } from './exceptions';

/** Reads sent together by {@link JsonRpcClient.batchRead}.
 */
export type JsonRpcRead<Params, Response> = {
  method: string;
  params: Params;
  paramsStruct: Struct<Params>;
  resultStruct: Struct<Response>;
};

/** Chunk size and pause used by {@link JsonRpcClient.batchRead}.
 */
export type JsonRpcBatchOptions = {
  /** Reads started together. Defaults to 10.
   */
  chunkSize?: number;
  /**
   * Milliseconds to wait before the next chunk when a response carries
   * `warning: "load"`. Defaults to 1 second. No delay otherwise.
 
  */
  delayMs?: number;
};

const DEFAULT_RPC_BATCH_CHUNK_SIZE = 10;

const DEFAULT_RPC_CHUNK_DELAY_MS = 1000;

const RPC_LOAD_WARNING = 'load';

/** Default `limit` for XRPL paginated account reads (server clamps to 10–400).
 */
const DEFAULT_PAGE_LIMIT = 400;

type LedgerScopedRequest = {
  ledger_index?: LedgerRequest['ledger_index'];
  ledger_hash?: LedgerRequest['ledger_hash'];
};

type LedgerPage = {
  marker?: PageMarker;
  ledger_index?: number;
};

type MarkerPage = {
  marker?: PageMarker;
};

/**
 * Reads the latest validated ledger unless the caller already chose one.
 *
 * @param params - Request that accepts `ledger_index` or `ledger_hash`.
 * @returns The same request, with `ledger_index: 'validated'` when neither selector is set.
 */
function withValidatedLedger<Params extends LedgerScopedRequest>(
  params: Params,
): Params {
  if (params.ledger_hash === undefined && params.ledger_index === undefined) {
    return { ...params, ledger_index: 'validated' };
  }
  return params;
}

/**
 * Walks XRPL ledger-scoped pages: first call uses `validated`, then pins the
 * numeric `ledger_index` from that response and follows `marker`.
 *
 * Stops when there is no marker, when `shouldStop` returns true, or when a
 * marker is present but no ledger index is available to pin (unsafe to continue).
 *
 * @param fetchPage - One page request.
 * @param itemsOf - Items to keep from each page.
 * @param options - Page size and optional early stop.
 * @returns Flattened items across pages.
 * @see https://xrpl.org/docs/references/http-websocket-apis/api-conventions/markers-and-pagination
 */
async function collectLedgerPages<TPage extends LedgerPage, TItem>(
  fetchPage: (params: {
    ledger_index: LedgerIndex;
    marker?: PageMarker;
    limit: number;
  }) => Promise<TPage>,
  itemsOf: (page: TPage) => readonly TItem[],
  options?: {
    limit?: number;
    shouldStop?: (items: TItem[], page: TPage) => boolean;
  },
): Promise<TItem[]> {
  const limit = options?.limit ?? DEFAULT_PAGE_LIMIT;
  const items: TItem[] = [];
  let marker: PageMarker | undefined;
  let ledgerIndex: number | undefined;
  let reading = true;

  while (reading) {
    const page = await fetchPage({
      ledger_index: ledgerIndex ?? LedgerState.Validated,
      limit,
      ...(marker === undefined ? {} : { marker }),
    });
    items.push(...itemsOf(page));

    if (
      options?.shouldStop?.(items, page) === true ||
      page.marker === undefined
    ) {
      reading = false;
    } else if (ledgerIndex === undefined && page.ledger_index === undefined) {
      throw new NetworkServiceException(
        'Paginated response has a marker but no ledger_index to pin',
      );
    } else {
      if (ledgerIndex === undefined && page.ledger_index !== undefined) {
        ledgerIndex = page.ledger_index;
      }
      marker = page.marker;
    }
  }

  return items;
}

/**
 * Walks XRPL marker-only pages (e.g. `account_tx`), where the marker alone
 * resumes the result set without pinning a ledger index.
 *
 * @param fetchPage - One page request.
 * @param itemsOf - Items to keep from each page.
 * @param options - Page size.
 * @returns Flattened items across pages.
 */
async function collectMarkerPages<TPage extends MarkerPage, TItem>(
  fetchPage: (params: { marker?: PageMarker; limit: number }) => Promise<TPage>,
  itemsOf: (page: TPage) => readonly TItem[],
  options?: {
    limit?: number;
  },
): Promise<TItem[]> {
  const limit = options?.limit ?? DEFAULT_PAGE_LIMIT;
  const items: TItem[] = [];
  let marker: PageMarker | undefined;
  let reading = true;

  while (reading) {
    const page = await fetchPage({
      limit,
      ...(marker === undefined ? {} : { marker }),
    });
    items.push(...itemsOf(page));
    if (page.marker === undefined) {
      reading = false;
    } else {
      marker = page.marker;
    }
  }

  return items;
}

export class HttpClient {
  readonly #url: string;

  readonly #fetch: typeof globalThis.fetch;

  readonly #timeout: number;

  constructor(url: string, timeout: number, fetchFn: typeof globalThis.fetch) {
    this.#url = url;
    this.#timeout = timeout;
    this.#fetch = fetchFn;
  }

  async get(options: RequestInit = {}): Promise<Response> {
    return this.#request('GET', options);
  }

  async post(options: RequestInit = {}): Promise<Response> {
    return this.#request('POST', options);
  }

  async put(options: RequestInit = {}): Promise<Response> {
    return this.#request('PUT', options);
  }

  async delete(options: RequestInit = {}): Promise<Response> {
    return this.#request('DELETE', options);
  }

  #request(method: string, options: RequestInit): Promise<Response> {
    return this.#fetch(this.#url, {
      ...options,
      method,
      signal: options.signal ?? AbortSignal.timeout(this.#timeout),
    });
  }
}

/**
 * JSON-RPC POST client shared by Xrpld ({@link RpcClient}) and Clio
 * ({@link ClioClient}). Validates the request params and the `result` object
 * with superstruct before returning.
 */
class JsonRpcClient {
  readonly #httpClient: HttpClient;

  constructor(url: string, timeout: number) {
    this.#httpClient = new HttpClient(url, timeout, fetch);
  }

  async request(options: RequestInit): Promise<Response> {
    return this.#httpClient.post(options);
  }

  protected async call<Params, Response extends BaseRpcResponse>(
    method: string,
    params: Params,
    paramsStruct: Struct<Params>,
    resultStruct: Struct<Response>,
  ): Promise<Response['result']> {
    const executed = await this.#execute(
      method,
      params,
      paramsStruct,
      resultStruct,
    );
    return executed.result;
  }

  /**
   * Runs reads in chunks of 10.
   *
   * Each chunk uses `Promise.all`. A missing ledger entry (`entryNotFound`) is
   * `null` in that slot, and the other reads in the chunk are kept. Any other
   * RPC, HTTP, or transport failure rejects the batch. Chunks run back-to-back
   * unless a response carries `warning: "load"`, in which case the client waits
   * `delayMs` before the next chunk.
   *
   * @param reads - JSON-RPC reads. Order is preserved in the result.
   * @param options - Chunk size and load-backoff delay. `delayMs` defaults to 1 second.
   * @returns One validated result per read. `null` is a missing ledger entry.
 
  */
  async batchRead<Params, Response extends BaseRpcResponse>(
    reads: readonly JsonRpcRead<Params, Response>[],
    options: JsonRpcBatchOptions = {},
  ): Promise<(Response['result'] | null)[]> {
    const chunkSize = options.chunkSize ?? DEFAULT_RPC_BATCH_CHUNK_SIZE;
    const delayMs = options.delayMs ?? DEFAULT_RPC_CHUNK_DELAY_MS;
    if (chunkSize < 1) {
      throw new RangeError('chunkSize must be at least 1');
    }

    const results: (Response['result'] | null)[] = [];
    for (let index = 0; index < reads.length; index += chunkSize) {
      const chunk = reads.slice(index, index + chunkSize);
      const responses = await Promise.all(
        chunk.map(async (read) => {
          try {
            return await this.#execute(
              read.method,
              read.params,
              read.paramsStruct,
              read.resultStruct,
            );
          } catch (error: unknown) {
            if (
              error instanceof RpcResponseException &&
              error.errorCode === KnownRpcError.entryNotFound
            ) {
              return null;
            }
            throw error;
          }
        }),
      );
      for (const response of responses) {
        results.push(response === null ? null : response.result);
      }

      const hasMore = index + chunkSize < reads.length;
      if (
        hasMore &&
        responses.some((response) => response?.warning === RPC_LOAD_WARNING)
      ) {
        await this.#sleep(delayMs);
      }
    }

    return results;
  }

  async #execute<Params, Response extends BaseRpcResponse>(
    method: string,
    params: Params,
    paramsStruct: Struct<Params>,
    resultStruct: Struct<Response>,
  ): Promise<Response> {
    try {
      assertHttpRequestParams(params, paramsStruct);

      const response = await this.#httpClient.post({
        headers: {
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
        },
        body: JSON.stringify({
          method,
          params: [
            {
              ...params,
              // Always use API v2
              api_version: RIPPLED_API_V2,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new NetworkServiceException(
          `HTTP ${response.status} calling ${method}`,
        );
      }

      const jsonResponse: unknown = await response.json();
      const rpcError = this.#extractRpcError(jsonResponse);
      if (rpcError !== undefined) {
        throw new RpcResponseException(
          method,
          rpcError.error,
          rpcError.error_message,
        );
      }

      assertHttpResponse(jsonResponse, resultStruct);

      return jsonResponse;
    } catch (error: unknown) {
      return this.#throwError(error, `Failed to call ${method}`);
    }
  }

  #extractRpcError(body: unknown): RpcErrorResponse | undefined {
    // Top-level error
    if (is(body, RpcErrorResponseStruct)) {
      return body;
    }
    // Result error, e.g. account not found, invalid parameters, etc.
    if (typeof body === 'object' && body !== null) {
      const { result } = body as { result?: unknown };
      if (is(result, RpcErrorResponseStruct)) {
        return result;
      }
    }
    return undefined;
  }

  #sleep(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  #throwError(error: unknown, fallbackError: string): never {
    const exceptionClasses: readonly AnyErrorConstructor[] = [
      NetworkServiceException,
      InvalidHttpRequestParamsException,
      InvalidHttpResponseException,
    ];
    return rethrowIfInstanceElseThrow(
      error,
      exceptionClasses,
      new NetworkServiceException(fallbackError, { cause: error }),
    );
  }
}

/**
 * Clio JSON-RPC. `account_mptokens` is served by Clio v2.7.0+, not by an
 * Xrpld node.
 */
export class ClioClient extends JsonRpcClient {
  /**
   * Lists an account's MPT holder objects and balances.
   *
   * @param params - Account to read, plus an optional validated-ledger selector and page.
   * @returns One page of MPT balances. `marker` is set when another page remains.
 
  */
  async fetchAccountMptokens(
    params: AccountMptokensRequest,
  ): Promise<AccountMptokensResponse> {
    return this.call(
      'account_mptokens',
      withValidatedLedger(params),
      AccountMptokensRequestStruct,
      AccountMptokensResponseStruct,
    );
  }

  /**
   * Reads every `account_mptokens` page for one account on the validated ledger.
   *
   * Walks {@link ClioClient.fetchAccountMptokens} until there is no `marker`
   * (pinning `ledger_index` after the first page). Returns flattened holdings,
   * not the JSON-RPC envelope.
   *
   * @param params - Account, optional page size, filter, and early stop.
   * @param params.account - XRPL account address.
   * @param params.limit - Page size. Defaults to 400.
   * @param params.filter - Keep only matching holdings. Omit to keep every holding.
   * @param params.shouldStop - Stop after a page even when a marker remains.
   * @returns Flattened holdings across pages.
 
  */
  async fetchAllAccountMptokens(params: {
    account: string;
    limit?: number;
    filter?: (holding: AccountMptoken) => boolean;
    shouldStop?: (holdings: AccountMptoken[]) => boolean;
  }): Promise<AccountMptoken[]> {
    const { account, limit, filter, shouldStop } = params;
    return collectLedgerPages(
      async (page) =>
        this.fetchAccountMptokens({
          account,
          ...page,
        }),
      (response) =>
        filter === undefined
          ? response.mptokens
          : response.mptokens.filter(filter),
      {
        limit,
        shouldStop:
          shouldStop === undefined
            ? undefined
            : (holdings) => shouldStop(holdings),
      },
    );
  }
}

/** Xrpld JSON-RPC for account, ledger, fee, transaction reads, simulate, and submit.
 */
export class RpcClient extends JsonRpcClient {
  /**
   * Reads reserve requirements, the reference transaction cost, and load factor.
   *
   * @returns The `server_info` result.
 
  */
  async fetchServerInfo(): Promise<ServerInfoResponse> {
    return this.call(
      'server_info',
      {},
      ServerInfoRequestStruct,
      ServerInfoResponseStruct,
    );
  }

  /**
   * Reads a ledger header. Defaults to the latest validated ledger so callers
   * can set `LastLedgerSequence`.
   *
   * @param params - Optional ledger selector. Defaults to `ledger_index: 'validated'`.
   * @returns The ledger hash and index.
 
  */
  async fetchLedgerInfo(params: LedgerRequest = {}): Promise<LedgerResponse> {
    return this.call(
      'ledger',
      withValidatedLedger(params),
      LedgerRequestStruct,
      LedgerResponseStruct,
    );
  }

  /**
   * Reads an MPT issuance or an MPT holder object.
   *
   * @param params - `mpt_issuance`, or `mptoken` as an index or holder key.
   * @returns The ledger entry node plus its index.
 
  */
  async fetchLedgerEntry(
    params: LedgerEntryRequest,
  ): Promise<LedgerEntryResponse> {
    return this.call(
      'ledger_entry',
      withValidatedLedger(params),
      LedgerEntryRequestStruct,
      LedgerEntryResponseStruct,
    );
  }

  /**
   * Reads an account's XRP balance, reserve owner count, sequence, and flags.
   *
   * @param params - Account to read. Defaults to the validated ledger.
   * @returns Account root fields and parsed `account_flags`.
 
  */
  async fetchAccountInfo(
    params: AccountInfoRequest,
  ): Promise<AccountInfoResponse> {
    return this.call(
      'account_info',
      withValidatedLedger(params),
      AccountInfoRequestStruct,
      AccountInfoResponseStruct,
    );
  }

  /**
   * Reads trust lines and IOU balances, including authorization, rippling, and freeze flags.
   *
   * @param params - Account to read, plus an optional peer filter and page.
   * @returns One page of trust lines. `marker` is set when another page remains.
 
  */
  async fetchAccountTrustlines(
    params: AccountLinesRequest,
  ): Promise<AccountLinesResponse> {
    return this.call(
      'account_lines',
      withValidatedLedger(params),
      AccountLinesRequestStruct,
      AccountLinesResponseStruct,
    );
  }

  /**
   * Reads every `account_lines` page for one account on the validated ledger.
   *
   * Walks {@link RpcClient.fetchAccountTrustlines} until there is no `marker`
   * (pinning `ledger_index` after the first page). Returns flattened lines,
   * not the JSON-RPC envelope.
   *
   * @param params - Account, optional peer, page size, filter, and early stop.
   * @param params.account - XRPL account address.
   * @param params.peer - Issuer to filter by, when set.
   * @param params.limit - Page size. Defaults to 400.
   * @param params.filter - Keep only matching lines. Omit to keep every line.
   * @param params.shouldStop - Stop after a page even when a marker remains.
   * @returns Flattened trust lines across pages.
 
  */
  async fetchAllAccountTrustlines(params: {
    account: string;
    peer?: string;
    limit?: number;
    filter?: (line: TrustLine) => boolean;
    shouldStop?: (lines: TrustLine[]) => boolean;
  }): Promise<TrustLine[]> {
    const { account, peer, limit, filter, shouldStop } = params;
    return collectLedgerPages(
      async (page) =>
        this.fetchAccountTrustlines({
          account,
          ...(peer === undefined ? {} : { peer }),
          ...page,
        }),
      (response) =>
        filter === undefined ? response.lines : response.lines.filter(filter),
      {
        limit,
        shouldStop:
          shouldStop === undefined ? undefined : (lines) => shouldStop(lines),
      },
    );
  }

  /**
   * Looks up a transaction by hash. A validated result includes `meta.TransactionResult`.
   *
   * @param params - Transaction hash and optional ledger search bounds.
   * @returns The unwrapped `tx` result. `validated` is omitted or `false` until the ledger closes.
 
  */
  async fetchTransactionInfo(params: TxRequest): Promise<BaseTxResponse> {
    return this.call('tx', params, TxRequestStruct, BaseTxResponseStruct);
  }

  /**
   * Reads one page of an account's transactions.
   *
   * @param params - Account and optional marker / filters.
   * @returns The unwrapped `account_tx` result. Entries are payloads, not envelopes.
 
  */
  async fetchAccountTransactions(
    params: FetchAccountTransactionsRequest,
  ): Promise<FetchAccountTransactionsResponse> {
    return this.call(
      'account_tx',
      params,
      FetchAccountTransactionsRequestStruct,
      FetchAccountTransactionsResponseStruct,
    );
  }

  /**
   * Reads every `account_tx` page for one account.
   *
   * `account_tx` resumes with `marker` alone (no ledger-index pin). Walks
   * {@link RpcClient.fetchAccountTransactions} until there is no `marker`.
   * Returns flattened entries, not the JSON-RPC envelope.
   *
   * @param params - Account and optional page size.
   * @param params.account - XRPL account address.
   * @param params.limit - Page size. Defaults to 400.
   * @returns Flattened transaction entries across pages.
 
  */
  async fetchAllAccountTransactions(params: {
    account: string;
    limit?: number;
  }): Promise<BaseTxResult[]> {
    const { account, limit } = params;
    return collectMarkerPages(
      async (page) =>
        this.fetchAccountTransactions({
          account,
          ...page,
        }),
      (response) => response.transactions,
      { limit },
    );
  }

  /**
   * Checks whether `source_account` may deposit to `destination_account`.
   *
   * @param params - Source and destination accounts. Defaults to the validated ledger.
   * @returns `deposit_authorized` for the selected ledger.
 
  */
  async fetchDepositAuthorized(
    params: DepositAuthorizedRequest,
  ): Promise<DepositAuthorizedResponse> {
    return this.call(
      'deposit_authorized',
      withValidatedLedger(params),
      DepositAuthorizedRequestStruct,
      DepositAuthorizedResponseStruct,
    );
  }

  /**
   * Dry-runs an unsigned transaction. Xrpld fills `Fee`, `Sequence`,
   * `SigningPubKey`, and `NetworkID` when they are omitted. Nothing is
   * submitted, and a later submission can differ because ledger state changes.
   *
   * @param params - Exactly one of `tx_blob` or `tx_json`, plus optional `binary`.
   * @returns The engine result and the simulated transaction. `meta` is omitted when the transaction would not be included in a ledger.
   * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/simulate
 
  */
  async simulateTransaction(
    params: SimulateRequest,
  ): Promise<SimulateResponse> {
    return this.call(
      'simulate',
      params,
      SimulateRequestStruct,
      SimulateResponseStruct,
    );
  }

  /**
   * Submits an already-signed transaction blob. This does not sign or autofill.
   * Always sends `fail_hard: true` so a local failure is not relayed to other
   * servers. Xrpld returns a preliminary `engine_result` for local failures as
   * well as success. {@link NetworkService.sendTransaction} decides which
   * results count as submitted.
   *
   * @param txBlob - Signed transaction hex (`tx_blob`).
   * @returns The preliminary `submit` result, including `engine_result` and `tx_json`.
 
  */
  async submitTransaction(
    txBlob: SubmitRequest['tx_blob'],
  ): Promise<SubmitResponse> {
    const params: SubmitRequest = {
      tx_blob: txBlob,
      fail_hard: true,
    };
    return this.call(
      'submit',
      params,
      SubmitRequestStruct,
      SubmitResponseStruct,
    );
  }
}
