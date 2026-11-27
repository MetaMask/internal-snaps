import type {
  ICache,
  Logger,
  Serializable,
} from '@metamask/snap-networks-utils';
import { useCache } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import { hashes } from 'xrpl';

import type {
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  XrplTransactionString,
} from '../../api';
import { KnownCaip2ChainId } from '../../api';
import type { NetworkConfig } from '../../config';
import { AppConfig } from '../../config';
import {
  BASE_FEE_XRP,
  DEFAULT_LOAD_FACTOR,
  XRPL_DECIMAL_PLACES,
} from '../../constants';
import type { AnyErrorConstructor } from '../../utils';
import {
  parseMptIssuanceId,
  rethrowIfInstanceElseThrow,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
  toSmallestUnit,
} from '../../utils';
import type {
  AccountInfoResponse,
  AccountMptoken,
  BaseTxResponse,
  BaseTxResult,
  TrustLine,
} from './api';
import { LedgerState } from './api';
import {
  AccountNotActivatedException,
  DestinationAccountNotActivatedException,
  NetworkServiceException,
  TransactionNotFoundException,
  TransactionSendException,
} from './exceptions';
import { ClioClient, RpcClient } from './NetworkClient';
import {
  isAccountNotFoundError,
  isTransactionNotFoundError,
  isAcceptedSubmitResult,
  isDestAccountNotFoundError,
} from './utils';

/** Network read cache. Omitted or `false` skips the cache. */
type NetworkCacheOptions = {
  /** `true` stores the read. Omitted means no cache. */
  cache?: boolean;
};

/**
 * XRPL network access through Xrpld and Clio.
 *
 * Reads the transaction fee, loads account state (`account_info`,
 * `account_lines`, `account_mptokens`), looks up transactions, and submits
 * signed transactions.
 */
export class NetworkService {
  readonly #logger: Logger;

  readonly #cache: ICache<Serializable>;

  readonly #rpcClientMap = new Map<KnownCaip2ChainId, RpcClient>();

  readonly #clioClientMap = new Map<KnownCaip2ChainId, ClioClient>();

  constructor({
    logger,
    cache,
  }: {
    logger: Logger;
    cache: ICache<Serializable>;
  }) {
    this.#logger = logger.withPrefix('[🌐 NetworkService]');
    this.#cache = cache;
  }

  #getRpcClient(scope: KnownCaip2ChainId): RpcClient {
    let client = this.#rpcClientMap.get(scope);
    if (!client) {
      client = new RpcClient(
        this.#getNetworkConfig(scope).rpcUrl,
        this.#getNetworkConfig(scope).timeout,
      );
      this.#rpcClientMap.set(scope, client);
    }
    return client;
  }

  #getClioClient(scope: KnownCaip2ChainId): ClioClient {
    let client = this.#clioClientMap.get(scope);
    if (!client) {
      client = new ClioClient(
        this.#getNetworkConfig(scope).clioUrl,
        this.#getNetworkConfig(scope).timeout,
      );
      this.#clioClientMap.set(scope, client);
    }
    return client;
  }

  #getNetworkConfig(scope: KnownCaip2ChainId): NetworkConfig {
    const config = AppConfig.networks[scope];
    if (!config) {
      throw new NetworkServiceException(
        `Network not found for scope: ${scope}`,
      );
    }
    return config;
  }

  /**
   * Runs `read` through the cache only when `cache` is `true`.
   *
   * @param functionName - Cache key prefix.
   * @param ttlMilliseconds - How long a stored result stays valid.
   * @param cache - `true` stores the read. Omitted or `false` skips the cache.
   * @param args - Arguments that form the cache key and are passed to `read`.
   * @param read - Uncached read. The result must be JSON-compatible.
   * @returns The cached or freshly read value.
   */
  async #cached<TArgs extends Serializable[], TResult>(
    functionName: string,
    ttlMilliseconds: number,
    cache: boolean | undefined,
    args: TArgs,
    read: (...args: TArgs) => Promise<TResult>,
  ): Promise<TResult> {
    if (!cache) {
      return read(...args);
    }
    // Cache stores a serialized object. Response types may include `unknown`
    // (e.g. `meta`).
    const readCached = useCache(
      read as unknown as (...readArgs: TArgs) => Promise<Serializable>,
      this.#cache,
      {
        logger: this.#logger,
        functionName,
        ttlMilliseconds,
      },
    );
    return (await readCached(...args)) as unknown as TResult;
  }

  /**
   * Reads `server_info` and returns the reference transaction fee in drops.
   *
   * @param scope - The CAIP-2 chain ID.
   * @param options - Set `cache` to `true` to store the read. Omitted means no cache.
   * @returns The fee in drops.
   * @throws {NetworkServiceException} When `server_info` cannot be read.
   */
  async getBaseFee(
    scope: KnownCaip2ChainId,
    options?: NetworkCacheOptions,
  ): Promise<BigNumber> {
    try {
      return await this.#cached(
        'NetworkService:getBaseFee',
        AppConfig.cache.ttlMilliseconds.baseFee,
        options?.cache,
        [scope],
        async (chainId: KnownCaip2ChainId) => {
          const client = this.#getRpcClient(chainId);
          const serverInfo = await client.fetchServerInfo();
          const baseFeeXrp = new BigNumber(
            serverInfo.info.validated_ledger?.base_fee_xrp ?? BASE_FEE_XRP,
          );
          const factor = serverInfo.info.load_factor ?? DEFAULT_LOAD_FACTOR;
          const feeInXrp = baseFeeXrp.multipliedBy(factor);
          return new BigNumber(toSmallestUnit(feeInXrp, XRPL_DECIMAL_PLACES));
        },
      );
    } catch (error: unknown) {
      return this.#throwError({
        error,
        fallbackError: `Failed to get base fee for scope: ${scope}`,
      });
    }
  }

  /**
   * Whether `sourceAccount` may send to `destinationAccount` on the validated ledger.
   *
   * @param sourceAccount - Sending classic address.
   * @param destinationAccount - Receiving classic address.
   * @param scope - CAIP-2 chain ID.
   * @param options - Set `cache` to `true` to store the read. Omitted means no cache.
   * @returns `deposit_authorized` from Xrpld.
   * @throws {AccountNotActivatedException} When the source account is not found.
   * @throws {DestinationAccountNotActivatedException} When the destination account is not found.
   * @throws {NetworkServiceException} When the lookup fails for another reason.
   */
  async fetchDepositAuthorized(
    sourceAccount: string,
    destinationAccount: string,
    scope: KnownCaip2ChainId,
    options?: NetworkCacheOptions,
  ): Promise<boolean> {
    try {
      return await this.#cached(
        'NetworkService:fetchDepositAuthorized',
        AppConfig.cache.ttlMilliseconds.depositAuthorized,
        options?.cache,
        [sourceAccount, destinationAccount, scope],
        async (
          source: string,
          destination: string,
          chainId: KnownCaip2ChainId,
        ) => {
          const client = this.#getRpcClient(chainId);
          const response = await client.fetchDepositAuthorized({
            source_account: source,
            destination_account: destination,
            ledger_index: LedgerState.Validated,
          });
          return response.deposit_authorized;
        },
      );
    } catch (error: unknown) {
      if (isAccountNotFoundError(error)) {
        throw new AccountNotActivatedException(sourceAccount, scope, {
          cause: error,
        });
      }
      if (isDestAccountNotFoundError(error)) {
        throw new DestinationAccountNotActivatedException(
          destinationAccount,
          scope,
          {
            cause: error,
          },
        );
      }
      return this.#throwError({
        error,
        fallbackError: 'Failed to fetch deposit authorized',
      });
    }
  }

  /**
   * Reads `account_info` for one classic address.
   *
   * @param accountAddress - XRPL account address.
   * @param scope - CAIP-2 chain ID used to choose the Xrpld client.
   * @param ledgerIndex - Ledger selector. Defaults to the validated ledger.
   * @param options - Set `cache` to `true` to store the read. Omitted means no cache.
   * @returns The unwrapped `account_info` result (`account_data`, flags, `status`, `validated`).
   * @throws {AccountNotActivatedException} When the account is not found.
   * @throws {NetworkServiceException} When the lookup fails for another reason.
   */
  async fetchAccountInfo(
    accountAddress: string,
    scope: KnownCaip2ChainId,
    ledgerIndex: LedgerState = LedgerState.Validated,
    options?: NetworkCacheOptions,
  ): Promise<AccountInfoResponse> {
    try {
      return await this.#cached(
        'NetworkService:fetchAccountInfo',
        AppConfig.cache.ttlMilliseconds.accountInfo,
        options?.cache,
        [accountAddress, scope, ledgerIndex],
        async (
          address: string,
          chainId: KnownCaip2ChainId,
          ledger: LedgerState,
        ) => {
          const client = this.#getRpcClient(chainId);
          return client.fetchAccountInfo({
            account: address,
            ledger_index: ledger,
          });
        },
      );
    } catch (error: unknown) {
      if (isAccountNotFoundError(error)) {
        throw new AccountNotActivatedException(accountAddress, scope, {
          cause: error,
        });
      }
      return this.#throwError({
        error,
        fallbackError: 'Failed to load account info',
      });
    }
  }

  /**
   * Reads every `account_lines` page for one account on the validated ledger.
   *
   * - `assetIds` set: stop once every requested currency is found
   * - `assetIds` omitted: read every page
   * - `assetIds` empty: return no lines (no Xrpld call)
   * - Paginated reads are not cached
   *
   * @param params - Account, network, and optional currency filter.
   * @param params.accountAddress - XRPL account address.
   * @param params.scope - CAIP-2 network.
   * @param params.assetIds - IOU asset ids to keep. Omit to read every line.
   * @param params.peer - Issuer to filter by, when set.
   * @returns Trust lines. A requested currency that never appears is omitted.
   * @throws {AccountNotActivatedException} When the account is not found.
   * @throws {NetworkServiceException} When the lookup fails for another reason.
   */
  async fetchAccountTrustlines(params: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
    assetIds?: readonly KnownCaip19IouAssetId[];
    peer?: string;
  }): Promise<TrustLine[]> {
    const { accountAddress, scope, assetIds, peer } = params;
    if (assetIds?.length === 0) {
      return [];
    }

    const lookup = assetIds === undefined ? undefined : new Set(assetIds);

    try {
      return await this.#getRpcClient(scope).fetchAllAccountTrustlines({
        account: accountAddress,
        ...(peer === undefined ? {} : { peer }),
        filter:
          lookup === undefined
            ? undefined
            : (line) =>
                lookup.delete(
                  toCaip19IouAssetId(scope, line.currency, line.account),
                ),
        shouldStop: lookup === undefined ? undefined : () => lookup.size === 0,
      });
    } catch (error: unknown) {
      if (isAccountNotFoundError(error)) {
        throw new AccountNotActivatedException(accountAddress, scope, {
          cause: error,
        });
      }
      return this.#throwError({
        error,
        exceptionClasses: [AccountNotActivatedException],
        fallbackError: 'Failed to load account trustlines',
      });
    }
  }

  /**
   * Reads every `account_mptokens` page for one account on the validated ledger.
   *
   * - `assetIds` set: stop once every requested holding is found
   * - `assetIds` omitted: read every page
   * - `assetIds` empty: return no holdings (no Clio call)
   * - Paginated reads are not cached
   *
   * @param params - Account, network, and optional holding filter.
   * @param params.accountAddress - XRPL account address.
   * @param params.scope - CAIP-2 network.
   * @param params.assetIds - MPT asset ids to keep. Omit to read every holding.
   * @returns MPT holdings. A requested holding that never appears is omitted.
   * @throws {AccountNotActivatedException} When the account is not found.
   * @throws {NetworkServiceException} When the lookup fails for another reason.
   */
  async fetchAccountMptokens(params: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
    assetIds?: readonly KnownCaip19MptAssetId[];
  }): Promise<AccountMptoken[]> {
    const { accountAddress, scope, assetIds } = params;
    if (assetIds?.length === 0) {
      return [];
    }

    const lookup =
      assetIds === undefined
        ? undefined
        : new Set(
            assetIds.map((assetId) =>
              toCaip19MptAssetId(scope, parseMptIssuanceId(assetId)),
            ),
          );

    try {
      return await this.#getClioClient(scope).fetchAllAccountMptokens({
        account: accountAddress,
        filter:
          lookup === undefined
            ? undefined
            : (holding) =>
                lookup.delete(
                  toCaip19MptAssetId(scope, holding.mpt_issuance_id),
                ),
        shouldStop: lookup === undefined ? undefined : () => lookup.size === 0,
      });
    } catch (error: unknown) {
      if (isAccountNotFoundError(error)) {
        throw new AccountNotActivatedException(accountAddress, scope, {
          cause: error,
        });
      }
      return this.#throwError({
        error,
        exceptionClasses: [AccountNotActivatedException],
        fallbackError: 'Failed to load account MPT tokens',
      });
    }
  }

  /**
   * Looks up a transaction by hash.
   *
   * @param transactionHash - XRPL transaction hash.
   * @param scope - CAIP-2 chain ID used to choose the Xrpld client.
   * @param options - Set `cache` to `true` to store the read. Omitted means no cache.
   * @returns The unwrapped `tx` result. `validated` is omitted or `false` until the ledger closes.
   * @throws {TransactionNotFoundException} When the transaction is not found.
   * @throws {NetworkServiceException} When the lookup fails for another reason.
   */
  async fetchTransaction(
    transactionHash: string,
    scope: KnownCaip2ChainId,
    options?: NetworkCacheOptions,
  ): Promise<BaseTxResponse> {
    try {
      return await this.#cached(
        'NetworkService:fetchTransaction',
        AppConfig.cache.ttlMilliseconds.transaction,
        options?.cache,
        [transactionHash, scope],
        async (hash: string, chainId: KnownCaip2ChainId) => {
          const client = this.#getRpcClient(chainId);
          return await client.fetchTransactionInfo({
            transaction: hash,
          });
        },
      );
    } catch (error: unknown) {
      if (isTransactionNotFoundError(error)) {
        throw new TransactionNotFoundException(transactionHash, {
          cause: error,
        });
      }

      return this.#throwError({
        error,
        fallbackError: 'Failed to fetch transaction',
      });
    }
  }

  /**
   * Reads the latest validated ledger index. Autofill uses this, plus a
   * ledger offset, as `LastLedgerSequence`.
   *
   * @param scope - CAIP-2 chain ID used to choose the Xrpld client.
   * @param options - Set `cache` to `true` to store the read. Omitted means no cache.
   * @returns The validated ledger index from `ledger.ledger_index`.
   * @throws {NetworkServiceException} When `ledger` cannot be read.
   */
  async fetchValidatedLedgerIndex(
    scope: KnownCaip2ChainId,
    options?: NetworkCacheOptions,
  ): Promise<number> {
    try {
      return await this.#cached(
        'NetworkService:fetchValidatedLedgerIndex',
        AppConfig.cache.ttlMilliseconds.validatedLedgerIndex,
        options?.cache,
        [scope],
        async (chainId: KnownCaip2ChainId) => {
          const client = this.#getRpcClient(chainId);
          const ledger = await client.fetchLedgerInfo({
            ledger_index: LedgerState.Validated,
          });
          return ledger.ledger.ledger_index;
        },
      );
    } catch (error: unknown) {
      return this.#throwError({
        error,
        fallbackError: 'Failed to fetch validated ledger index',
      });
    }
  }

  /**
   * Reads every `account_tx` page for one account and flattens the entries.
   *
   * @param accountAddress - XRPL account address.
   * @param scope - CAIP-2 chain ID used to choose the Xrpld client.
   * @returns All transaction entries across pages, in response order.
   * @throws {AccountNotActivatedException} When the account is not found.
   * @throws {NetworkServiceException} When the lookup fails for another reason.
   */
  async fetchAccountTransactions(
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<BaseTxResult[]> {
    try {
      return await this.#getRpcClient(scope).fetchAllAccountTransactions({
        account: accountAddress,
      });
    } catch (error: unknown) {
      if (isAccountNotFoundError(error)) {
        throw new AccountNotActivatedException(accountAddress, scope, {
          cause: error,
        });
      }
      return this.#throwError({
        error,
        exceptionClasses: [AccountNotActivatedException],
        fallbackError: 'Failed to fetch account transactions',
      });
    }
  }

  /**
   * Submits an already-signed transaction.
   * Only `tesSUCCESS` returns the hash.
   * Other codes are consider failures.
   *
   * @param transactionBlob - Signed transaction hex (`tx_blob`).
   * @param scope - CAIP-2 chain ID used to choose the Xrpld client.
   * @returns The transaction hash.
   * @throws {TransactionSendException} When submission is rejected, including
   * sequence mismatches (`tefPAST_SEQ`, `terPRE_SEQ`), `tec*`, `terQUEUED`, and
   * `tefALREADY`.
   */
  async sendTransaction(
    transactionBlob: XrplTransactionString,
    scope: KnownCaip2ChainId,
  ): Promise<string> {
    try {
      const client = this.#getRpcClient(scope);
      const response = await client.submitTransaction(transactionBlob);
      const { engine_result: engineResult } = response;

      if (isAcceptedSubmitResult(engineResult)) {
        // API v2 puts `hash` next to `tx_json`; older nodes may nest it inside.
        return (
          response.hash ??
          response.tx_json.hash ??
          hashes.hashSignedTx(transactionBlob)
        );
      }

      throw new TransactionSendException(scope, engineResult);
    } catch (error: unknown) {
      return this.#throwError({
        error,
        fallbackError: new TransactionSendException(scope, 'unknown', {
          cause: error,
        }),
      });
    }
  }

  #throwError({
    error,
    exceptionClasses,
    fallbackError,
  }: {
    error: unknown;
    exceptionClasses?: readonly AnyErrorConstructor[];
    fallbackError: string | NetworkServiceException;
  }): never {
    return rethrowIfInstanceElseThrow(
      error,
      [NetworkServiceException, ...(exceptionClasses ?? [])],
      fallbackError instanceof Error
        ? fallbackError
        : new NetworkServiceException(String(fallbackError), { cause: error }),
    );
  }
}
