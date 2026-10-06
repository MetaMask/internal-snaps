import type {
  CreateAccountOptions as KeyringApiCreateAccountOptions,
  KeyringAccount,
  KeyringRequest,
  Pagination,
  ResolvedAccountAddress,
  Transaction,
  Balance,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
  assertCreateAccountOptionIsSupported,
} from '@metamask/keyring-api';
import type {
  ExportAccountOptions,
  ExportedAccount,
  KeyringSnapRpc,
} from '@metamask/keyring-api/v2';
import { handleKeyringRequest } from '@metamask/keyring-snap-sdk/v2';
import {
  asStrictKeyringAccount,
  InMemoryCache,
  useCache,
  validateOrigin,
} from '@metamask/snap-networks-utils';
import type { Logger } from '@metamask/snap-networks-utils';
import { InvalidParamsError } from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { is } from '@metamask/superstruct';
import type {
  CaipAssetType,
  CaipAssetTypeOrId,
  CaipChainId,
} from '@metamask/utils';

import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip2ChainId,
} from '../../api';
import { StellarSecretKeyStruct } from '../../api';
import { AppConfig } from '../../config';
import { originPermissions } from '../../permissions';
import type { AccountService } from '../../services/account';
import { AccountNotFoundException } from '../../services/account/exceptions';
import { AccountNotActivatedException } from '../../services/network/exceptions';
import {
  OnChainAccount,
  toClassicBalanceEntry,
  getDefaultBalanceEntry,
  toNativeBalanceEntry,
  toStandardBalanceEntry,
} from '../../services/on-chain-account';
import type {
  OnChainAccountSerializableFull,
  OnChainAccountService,
} from '../../services/on-chain-account';
import type { TransactionService } from '../../services/transaction/TransactionService';
import type { WalletService } from '../../services/wallet';
import {
  Duration,
  getSlip44AssetId,
  isClassicAssetId,
  isSlip44Id,
  rethrowIfInstanceElseThrow,
  validateRequest,
} from '../../utils';
import { getSupportedScopes } from '../../utils/scopes';
import { SyncAccountsHandler } from '../cronjob/syncAccounts';
import type { GetAccountRequest, MultichainMethod } from './api';
import {
  DeleteAccountRequestStruct,
  ExportAccountRequestStruct,
  GetAccountRequestStruct,
  ListAccountTransactionsRequestStruct,
  MultichainMethodStruct,
  ResolveAccountAddressRequestStruct,
  SetSelectedAccountsRequestStruct,
  ListAccountAssetsRequestStruct,
  GetAccountBalancesRequestStruct,
} from './api';
import type { IKeyringRequestHandler } from './base';
import { ExportAccountException } from './exceptions';

export const KEYRING_HANDLER_LOGGER_PREFIX = '[🔑 KeyringHandler]';

export class KeyringHandler implements KeyringSnapRpc {
  readonly #logger: Logger;

  readonly #accountService: AccountService;

  readonly #onChainAccountService: OnChainAccountService;

  readonly #transactionService: TransactionService;

  readonly #walletService: WalletService;

  readonly #handlers: Record<MultichainMethod, IKeyringRequestHandler>;

  readonly #liveOnChainAccountCache: InMemoryCache;

  constructor({
    logger,
    accountService,
    onChainAccountService,
    transactionService,
    walletService,
    handlers,
  }: {
    logger: Logger;
    accountService: AccountService;
    onChainAccountService: OnChainAccountService;
    transactionService: TransactionService;
    walletService: WalletService;
    handlers: Record<MultichainMethod, IKeyringRequestHandler>;
  }) {
    this.#logger = logger.withPrefix(KEYRING_HANDLER_LOGGER_PREFIX);
    this.#liveOnChainAccountCache = new InMemoryCache(this.#logger);
    this.#accountService = accountService;
    this.#onChainAccountService = onChainAccountService;
    this.#transactionService = transactionService;
    this.#walletService = walletService;
    this.#handlers = handlers;
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    this.#logger.debug('Handle keyring request', {
      origin,
      method: request.method,
    });
    validateOrigin(origin, request.method, originPermissions);
    const result = await handleKeyringRequest(this, request);
    this.#logger.debug('Keyring request handled', {
      origin,
      method: request.method,
    });
    return result ?? null;
  }

  async getAccount(accountId: GetAccountRequest): Promise<KeyringAccount> {
    validateRequest(accountId, GetAccountRequestStruct);
    const account = await this.#accountService.findById(accountId);
    if (!account) {
      throw new AccountNotFoundException(accountId);
    }
    return asStrictKeyringAccount(account);
  }

  async getAccounts(): Promise<KeyringAccount[]> {
    const accounts = await this.#accountService.listAccounts();
    return accounts.map(asStrictKeyringAccount);
  }

  /**
   * Batch account creation for the Snap keyring v2 path (no `AccountCreated` events).
   *
   * @param options - BIP-44 derive-index or derive-index-range options from the keyring API.
   * @returns Keyring accounts created or already present for each index.
   */
  async createAccounts(
    options: KeyringApiCreateAccountOptions,
  ): Promise<KeyringAccount[]> {
    assertCreateAccountOptionIsSupported(options, [
      `${AccountCreationType.Bip44DeriveIndex}`,
      `${AccountCreationType.Bip44DeriveIndexRange}`,
      `${AccountCreationType.Bip44Discover}`,
    ] as const);

    const walletResolverPromise = this.#walletService.getWalletResolver(
      options.entropySource,
    );

    // For discovery, only create the account if it has on-chain activity. No
    // activity means we've reached the end of the discoverable accounts, so we
    // return nothing and the client stops discovering.
    if (options.type === AccountCreationType.Bip44Discover) {
      // One entropy call at the coin-type path (m/44'/148'); the resolver is
      // passed into batchCreate so it doesn't re-fetch.
      const walletResolver = await walletResolverPromise;
      const wallet = await walletResolver(options.groupIndex);

      if (
        !(await this.#hasOnChainActivity(wallet.address, getSupportedScopes()))
      ) {
        return [];
      }

      const createdAccounts = await this.#accountService.batchCreate({
        entropySource: options.entropySource,
        fromIndex: options.groupIndex,
        toIndex: options.groupIndex,
        walletResolver,
      });

      return createdAccounts.map(asStrictKeyringAccount);
    }

    let range;
    if (options.type === AccountCreationType.Bip44DeriveIndexRange) {
      range = options.range;
    } else {
      // Bip44DeriveIndex — a single group index. Ranges are inclusive, so
      // `from` and `to` are the same.
      range = { from: options.groupIndex, to: options.groupIndex };
    }

    const createdAccounts = await this.#accountService.batchCreate({
      entropySource: options.entropySource,
      fromIndex: range.from,
      toIndex: range.to,
      walletResolver: walletResolverPromise,
    });

    return createdAccounts.map(asStrictKeyringAccount);
  }

  async getAccountAssets(accountId: string): Promise<CaipAssetTypeOrId[]> {
    validateRequest(accountId, ListAccountAssetsRequestStruct);

    const scope = AppConfig.selectedNetwork;
    const onChainAccount = await this.#resolveAccountByAccountId({
      accountId,
      scope,
      // Always refresh the cache to get the latest on-chain account.
      refresh: true,
    });

    // Unfunded accounts have no trustlines. Return native so the client can ask for a zero balance.
    if (onChainAccount === null) {
      return [getSlip44AssetId(scope)];
    }

    // Visible assets only (see {@link OnChainAccount.assetIds}).
    return onChainAccount.assetIds;
  }

  async getAccountTransactions(
    accountId: string,
    pagination: Pagination,
  ): Promise<{
    data: Transaction[];
    next: string | null;
  }> {
    validateRequest(
      { accountId, pagination },
      ListAccountTransactionsRequestStruct,
    );

    const { limit, next } = pagination;

    // It is not necessary to check if the account is activated
    // because we are not fetching the transactions from the network.
    const { account: keyringAccount } =
      await this.#accountService.resolveAccount({
        accountId,
      });

    const transactions = await this.#transactionService.findByAccountId(
      keyringAccount.id,
    );

    // Find the starting index based on the 'next' signature
    const startIndex = next
      ? transactions.findIndex((tx) => tx.id === next)
      : 0;

    // Safeguard: If the next cursor is invalid, throw the account-based exception
    // with the correct account identifier.
    if (next !== undefined && next !== null && startIndex === -1) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- InvalidParamsError is the JSON-RPC snap error surface
      throw new InvalidParamsError(
        `Invalid transaction pagination cursor ${next}`,
      );
    }

    // Get transactions from startIndex to startIndex + limit
    const accountTransactions = transactions.slice(
      startIndex,
      startIndex + limit,
    );

    // Determine the next signature for pagination
    const hasMore = startIndex + pagination.limit < transactions.length;
    const nextSignature = hasMore
      ? (transactions[startIndex + pagination.limit]?.id ?? null)
      : null;

    return {
      data: accountTransactions,
      next: nextSignature,
    };
  }

  /**
   * Checks whether the given account is activated on any of the given scopes.
   *
   * @param address - The address of the account to check.
   * @param scopes - The scopes to check for on-chain activity.
   * @returns Whether the account is activated on at least one scope.
   */
  async #hasOnChainActivity(
    address: string,
    scopes: KnownCaip2ChainId[],
  ): Promise<boolean> {
    const activityOnScopes = await Promise.all(
      scopes.map(async (scope) =>
        this.#onChainAccountService.isAccountActivated({
          accountAddress: address,
          scope,
        }),
      ),
    );

    return activityOnScopes.some((active) => active);
  }

  async getAccountBalances(
    accountId: string,
    assets: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    const { assets: knownAssets } = validateRequest(
      { accountId, assets },
      GetAccountBalancesRequestStruct,
    );

    const scope = AppConfig.selectedNetwork;
    const assetBalances = {} as Record<KnownCaip19AssetIdOrSlip44Id, Balance>;

    const onChainAccount = await this.#resolveAccountByAccountId({
      accountId,
      scope,
      refresh: false,
    });

    // Unfunded accounts have no trustlines. Return native zero when it was requested.
    if (onChainAccount === null) {
      const nativeAssetId = knownAssets.find(isSlip44Id);
      if (nativeAssetId !== undefined) {
        assetBalances[nativeAssetId] = getDefaultBalanceEntry();
      }
      return assetBalances;
    }

    for (const assetId of knownAssets) {
      const asset = onChainAccount.getAsset(assetId);
      // Skip when the asset is not visible (tombstone, zero SEP-41, or missing entry).
      if (asset === undefined) {
        continue;
      }

      if (isSlip44Id(assetId)) {
        assetBalances[assetId] = toNativeBalanceEntry({
          nativeBalance: onChainAccount.nativeRawBalance,
          spendableBalance: onChainAccount.nativeSpendableBalance,
          minimumReserveBalance: onChainAccount.minimumReserveBalance,
        });
      } else if (isClassicAssetId(assetId)) {
        assetBalances[assetId] = toClassicBalanceEntry(asset);
      } else {
        assetBalances[assetId] = toStandardBalanceEntry(asset);
      }
    }
    return assetBalances;
  }

  async resolveAccountAddress(
    scope: CaipChainId,
    request: JsonRpcRequest,
  ): Promise<ResolvedAccountAddress | null> {
    const { scope: knownScope, request: sep43Request } = validateRequest(
      {
        request,
        scope,
      },
      ResolveAccountAddressRequestStruct,
    );

    try {
      const { account } = await this.#accountService.resolveAccount({
        scope: knownScope,
        accountAddress: sep43Request.params.opts.address,
      });
      return { address: `${knownScope}:${account.address}` };
    } catch (error: unknown) {
      // Return `null` signals "this snap does not
      // own the requested address" so MetaMask's routing layer will fallback to
      // the current connected account.
      if (error instanceof AccountNotFoundException) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Exports the Stellar secret seed for an account (`S…` strkey / base32).
   * Triggered by the client when the user requests a private-key export.
   *
   * @param accountId - The id of the account to export.
   * @param options - Export options. Encoding must be `base32`; omitted
   * `options` / `encoding` default to `base32`.
   * @returns The exported private key (`type`, `encoding`, `privateKey`).
   * @throws {ExportAccountException} If the derived seed fails validation, or
   * another error occurs while reading it (the latter uses a generic message
   * so the secret is not leaked).
   */
  async exportAccount(
    accountId: string,
    options?: ExportAccountOptions,
  ): Promise<ExportedAccount> {
    const { options: exportOptions } = validateRequest(
      { accountId, options },
      ExportAccountRequestStruct,
    );

    const { account } = await this.#accountService.resolveAccount({
      accountId,
    });
    const wallet = await this.#walletService.resolveWallet(account);

    // For security reasons, we wrap the export in a try-catch block to avoid leaking the private key in case of an error.
    try {
      const privateKey = wallet.secret;
      // SECURITY: Use `is` rather than `assert`. A StructError would embed the
      // private key in its message.
      if (!is(privateKey, StellarSecretKeyStruct)) {
        throw new ExportAccountException(
          'Derived private key failed encoding validation',
        );
      }

      return {
        type: exportOptions.type,
        encoding: exportOptions.encoding,
        privateKey,
      };
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [ExportAccountException],
        new ExportAccountException('Error exporting account'),
      );
    }
  }

  async deleteAccount(accountId: string): Promise<void> {
    validateRequest(accountId, DeleteAccountRequestStruct);

    await this.#accountService.delete(accountId);
  }

  async setSelectedAccounts(accountIds: string[]): Promise<void> {
    validateRequest(accountIds, SetSelectedAccountsRequestStruct);
    const uniqueAccountIdsSet = new Set(accountIds);
    const deduplicatedAccountIds = Array.from(uniqueAccountIdsSet);

    const accounts = await this.#accountService.findByIds(
      deduplicatedAccountIds,
    );

    if (accounts.length !== deduplicatedAccountIds.length) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- InvalidParamsError is the JSON-RPC snap error surface
      throw new InvalidParamsError(
        'Account IDs were not part of existing accounts.',
      );
    }

    if (deduplicatedAccountIds.length > 0) {
      await SyncAccountsHandler.scheduleBackgroundEvent(
        {
          accountIds: deduplicatedAccountIds,
        },
        // Start immediately
        Duration.OneSecond,
      );
    }
  }

  async submitRequest(request: KeyringRequest): Promise<Json> {
    const { method } = request.request;

    this.#assertMethodIsValid(method);

    return this.#handlers[method].handle(request);
  }

  #assertMethodIsValid(method: string): asserts method is MultichainMethod {
    validateRequest(method, MultichainMethodStruct);
  }

  /**
   * Loads a Horizon account for the keyring asset/balance pair.
   *
   * `getAccountAssets` always refreshes and stores the result. `getAccountBalances`
   * reuses that entry until `AppConfig.cache.ttlMilliseconds.keyringLiveAccount`, then loads Horizon.
   * A failed load is not cached. An unactivated account is cached as `null`.
   *
   * @param params - Account id, scope, and whether to skip the cache.
   * @param params.accountId - Keyring account id.
   * @param params.scope - CAIP-2 network.
   * @param params.refresh - When true, load Horizon and replace the cache entry.
   * @returns The live account, or `null` when it is not activated.
   */
  async #resolveAccountByAccountId({
    accountId,
    scope,
    refresh,
  }: {
    accountId: string;
    scope: KnownCaip2ChainId;
    refresh: boolean;
  }): Promise<OnChainAccount | null> {
    const { account } = await this.#accountService.resolveAccount({
      accountId,
    });
    const serialized = await useCache(
      this.#resolveOnChainAccount.bind(this),
      this.#liveOnChainAccountCache,
      {
        logger: this.#logger,
        functionName: 'KeyringHandler:resolveOnChainAccount',
        ttlMilliseconds: AppConfig.cache.ttlMilliseconds.keyringLiveAccount,
        refreshCache: refresh,
      },
    )(account.address, scope);

    if (serialized === null) {
      return null;
    }

    return OnChainAccount.fromSerializable(serialized);
  }

  async #resolveOnChainAccount(
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccountSerializableFull | null> {
    try {
      const onChainAccount =
        await this.#onChainAccountService.resolveOnChainAccount(
          accountAddress,
          scope,
          { resolveWithFullBalance: true },
        );
      return onChainAccount.toSerializableFull();
    } catch (error: unknown) {
      if (error instanceof AccountNotActivatedException) {
        return null;
      }
      throw error;
    }
  }
}
