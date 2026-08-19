import { ListAccountAssetsResponseStruct } from '@metamask/keyring-api';
import type {
  Balance,
  CreateAccountOptions as KeyringBatchCreateAccountOptions,
  KeyringAccount,
  KeyringRequest,
  Pagination,
  ResolvedAccountAddress,
  Transaction,
} from '@metamask/keyring-api';
import type {
  ExportAccountOptions,
  ExportedAccount,
  KeyringSnapRpc,
} from '@metamask/keyring-api/v2';
import { handleKeyringRequest } from '@metamask/keyring-snap-sdk/v2';
import type { Logger } from '@metamask/snap-networks-utils';
import {
  InvalidParamsError,
  SnapError,
  UserRejectedRequestError,
} from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { array, assert, is, sensitive } from '@metamask/superstruct';
import type {
  CaipAssetType,
  CaipAssetTypeOrId,
  CaipChainId,
} from '@metamask/utils';
import { sortBy } from 'lodash';

import type { SnapClient } from '../../clients/snap/SnapClient';
import { ESSENTIAL_ASSETS } from '../../constants';
import type { Network } from '../../constants';
import { asStrictKeyringAccount } from '../../entities/keyring-account';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import type { AccountsService } from '../../services/accounts/AccountsService';
import type { AssetsService } from '../../services/assets/AssetsService';
import type { ConfirmationHandler } from '../../services/confirmation/ConfirmationHandler';
import type { TransactionsService } from '../../services/transactions/TransactionsService';
import type { WalletService } from '../../services/wallet/WalletService';
import { sanitizeSensitiveError } from '../../utils/errors';
import {
  DeleteAccountStruct,
  ExportAccountRequestStruct,
  GetAccounBalancesResponseStruct,
  GetAccountBalancesStruct,
  GetAccountStruct,
  ListAccountAssetsStruct,
  ListAccountTransactionsStruct,
  PrivateKeyHexStruct,
  SignTransactionRequestStruct,
  TronKeyringRequestStruct,
  UuidStruct,
} from '../../validation/structs';
import type { TronWalletKeyringRequest } from '../../validation/structs';
import {
  validateOrigin,
  validateRequest,
  validateResponse,
} from '../../validation/validators';
import { BackgroundEventMethod } from '../cronjob/cronjob';
import { TronMultichainMethod } from './keyring-types';

export class KeyringHandler implements KeyringSnapRpc {
  readonly #logger: Logger;

  readonly #snapClient: SnapClient;

  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #transactionsService: TransactionsService;

  readonly #walletService: WalletService;

  readonly #confirmationHandler: ConfirmationHandler;

  constructor({
    logger,
    snapClient,
    accountsService,
    assetsService,
    transactionsService,
    walletService,
    confirmationHandler,
  }: {
    logger: Logger;
    snapClient: SnapClient;
    accountsService: AccountsService;
    assetsService: AssetsService;
    transactionsService: TransactionsService;
    walletService: WalletService;
    confirmationHandler: ConfirmationHandler;
  }) {
    this.#logger = logger.withPrefix('[🔑 KeyringHandler]');
    this.#snapClient = snapClient;
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#transactionsService = transactionsService;
    this.#walletService = walletService;
    this.#confirmationHandler = confirmationHandler;
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    validateOrigin(origin, request.method);
    const result = await handleKeyringRequest(this, request);
    return result ?? null;
  }

  async #listAccounts(): Promise<TronKeyringAccount[]> {
    try {
      const keyringAccounts = await this.#accountsService.getAll();

      return sortBy(keyringAccounts, ['entropySource', 'index']);
    } catch (error) {
      this.#logger.error({ error }, 'Error listing accounts');
      throw new Error('Error listing accounts', { cause: error });
    }
  }

  async getAccounts(): Promise<KeyringAccount[]> {
    try {
      return (await this.#listAccounts()).map(asStrictKeyringAccount);
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error listing accounts');
      throw new SnapError(error as Error);
    }
  }

  async #getAccount(
    accountId: string,
  ): Promise<TronKeyringAccount | undefined> {
    try {
      const account =
        (await this.#accountsService.findById(accountId)) ?? undefined;

      return account;
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error getting account');
      throw new SnapError(error as Error);
    }
  }

  async getAccount(accountId: string): Promise<KeyringAccount> {
    try {
      validateRequest({ accountId }, GetAccountStruct);

      const account = await this.#getAccountOrThrow(accountId);

      return asStrictKeyringAccount(account);
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error getting account');
      throw new SnapError(error as Error);
    }
  }

  async #getAccountOrThrow(accountId: string): Promise<TronKeyringAccount> {
    const account = await this.#getAccount(accountId);

    if (!account) {
      throw new Error(`Account "${accountId}" not found`);
    }

    return account;
  }

  async createAccounts(
    options: KeyringBatchCreateAccountOptions,
  ): Promise<KeyringAccount[]> {
    try {
      return await this.#accountsService.createAccounts(options);
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error creating accounts');
      throw sanitizeSensitiveError(error);
    }
  }

  async getAccountAssets(accountId: string): Promise<CaipAssetTypeOrId[]> {
    try {
      validateRequest({ accountId }, ListAccountAssetsStruct);

      await this.#getAccountOrThrow(accountId);

      this.#logger.info('Listing account assets', { accountId });

      const assetEntities =
        await this.#assetsService.getAccountAssets(accountId);
      const result = assetEntities
        .filter(
          (asset) =>
            ESSENTIAL_ASSETS.includes(asset.assetType) ||
            Number(asset.rawAmount) > 0,
        )
        .map((asset) => asset.assetType);

      this.#logger.info('Account assets', { accountId, result });

      validateResponse(result, ListAccountAssetsResponseStruct);
      return result;
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error listing account assets');
      throw error;
    }
  }

  /**
   * Fetch transactions from the Snap's state.
   *
   * @param accountId - The id of the account.
   * @param pagination - The pagination options.
   * @param pagination.limit - The limit of the transactions to fetch.
   * @param pagination.next - The next signature to fetch from.
   * @returns The transactions for the given account.
   */
  async getAccountTransactions(
    accountId: string,
    pagination: Pagination,
  ): Promise<{
    data: Transaction[];
    next: string | null;
  }> {
    try {
      validateRequest({ accountId, pagination }, ListAccountTransactionsStruct);

      this.#logger.info('Listing account transactions...');
      const { limit, next } = pagination;

      const keyringAccount = await this.#getAccount(accountId);

      if (!keyringAccount) {
        throw new Error('Account not found');
      }

      const transactions = await this.#transactionsService.findByAccounts([
        keyringAccount,
      ]);

      // Find the starting index based on the 'next' signature
      const startIndex = next
        ? transactions.findIndex((tx) => tx.id === next)
        : 0;

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
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error listing account transactions');
      throw error;
    }
  }

  async getAccountBalances(
    accountId: string,
    assets: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    try {
      validateRequest({ accountId, assets }, GetAccountBalancesStruct);

      this.#logger.info('Getting account balances', { accountId, assets });

      await this.#getAccountOrThrow(accountId);

      const assetsList = await this.#assetsService.getAccountAssets(accountId);

      const assetsToUse = assetsList
        .filter((asset) => assets.includes(asset.assetType))
        // Remove token assets with zero balance
        .filter(
          (asset) =>
            ESSENTIAL_ASSETS.includes(asset.assetType) ||
            Number(asset.rawAmount) > 0,
        );

      const result = assetsToUse.reduce<Record<CaipAssetType, Balance>>(
        (acc, asset) => {
          acc[asset.assetType] = {
            unit: asset.symbol,
            amount: asset.uiAmount,
          };
          return acc;
        },
        {},
      );

      this.#logger.info('Account balances', { accountId, result });

      validateResponse(result, GetAccounBalancesResponseStruct);
      return result;
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error getting account balances');
      throw error;
    }
  }

  /**
   * Resolves an account address from a request.
   * Routes to WalletService for address resolution and validation.
   *
   * @param scope - The CAIP-2 chain ID.
   * @param request - The JSON-RPC request containing the address parameter.
   * @returns The resolved account address in CAIP-10 format, or null if resolution fails.
   */
  async resolveAccountAddress(
    scope: CaipChainId,
    request: JsonRpcRequest,
  ): Promise<ResolvedAccountAddress> {
    this.#logger.info('Resolving account address', { scope, request });

    // Get all keyring accounts
    const keyringAccounts = await this.#listAccounts();

    // Resolve the address using the wallet service
    const caip10Address = await this.#walletService.resolveAccountAddress(
      keyringAccounts,
      scope as Network,
      request,
    );

    return caip10Address;
  }

  async exportAccount(
    accountId: string,
    options?: ExportAccountOptions,
  ): Promise<ExportedAccount> {
    validateRequest({ accountId, options }, ExportAccountRequestStruct);

    const account = await this.#getAccountOrThrow(accountId);

    const encoding = options?.encoding ?? 'hexadecimal';
    if (encoding !== 'hexadecimal') {
      throw new Error('Only hexadecimal private key export is supported');
    }

    try {
      const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
        entropySource: account.entropySource,
        derivationPath: account.derivationPath,
      });

      // SECURITY: Wrap the struct with sensitive() so that any assertion
      // failure redacts the actual value from the error message and
      // StructError.value, preventing the private key from leaking into logs.A
      if (!is(privateKeyHex, sensitive(PrivateKeyHexStruct))) {
        throw new Error('Derived private key failed encoding validation');
      }

      return {
        type: 'private-key',
        encoding,
        privateKey: privateKeyHex,
      };
    } catch {
      const errorMsg = 'Error exporting account';
      this.#logger.error(errorMsg);
      throw new SnapError(errorMsg);
    }
  }

  async deleteAccount(accountId: string): Promise<void> {
    try {
      validateRequest({ accountId }, DeleteAccountStruct);

      await this.#getAccountOrThrow(accountId);

      // No AccountDeleted event: deletion is client-initiated in keyring v2,
      // and v2 clients reject v1 lifecycle events (which would abort the
      // deletion below).
      await this.#accountsService.delete(accountId);
    } catch (error: unknown) {
      this.#logger.error({ error }, 'Error deleting account');
      throw error;
    }
  }

  async submitRequest(request: KeyringRequest): Promise<Json> {
    return this.#handleSubmitRequest(request);
  }

  #prepareRequestForConfirmation(
    request: TronWalletKeyringRequest,
  ): TronWalletKeyringRequest {
    if (request.request.method !== TronMultichainMethod.SignTransaction) {
      return request;
    }

    // Validate the transaction params, but never modify the payload. The dApp
    // broadcasts using its original TxID, so the snap must sign exactly what it
    // received — refreshing expiration/TAPOS here would break the broadcast.
    assert(request.request.params, SignTransactionRequestStruct);

    return request;
  }

  async #handleSubmitRequest(request: KeyringRequest): Promise<Json> {
    assert(request, TronKeyringRequestStruct);

    this.#logger.log('Handling submitRequest', {
      method: request.request.method,
    });

    const {
      request: { method, params = {} },
      scope,
      account: accountId,
    } = request;

    const account = await this.#getAccountOrThrow(accountId);

    if (scope && !account.scopes.includes(scope)) {
      throw new Error(`Scope "${scope}" is not allowed for this account`);
    }

    if (!account.methods.includes(method)) {
      throw new Error(`Method "${method}" is not allowed for this account`);
    }

    const requestToHandle = this.#prepareRequestForConfirmation(request);

    const isConfirmed = await this.#confirmationHandler.handleKeyringRequest({
      request: requestToHandle,
      account,
    });

    if (!isConfirmed) {
      throw new UserRejectedRequestError() as unknown as Error;
    }

    const result = await this.#walletService.handleKeyringRequest({
      account,
      scope: requestToHandle.scope,
      method: requestToHandle.request.method as TronMultichainMethod,
      params: requestToHandle.request.params ?? params,
    });

    return result;
  }

  /**
   * Endpoint that the client can use to inform the snap that certain accounts are selected.
   *
   * @param accountIds - The IDs of the accounts to set as selected.
   */
  async setSelectedAccounts(accountIds: string[]): Promise<void> {
    validateRequest(accountIds, array(UuidStruct));

    const existingIds = new Set(
      (await this.#listAccounts()).map((account) => account.id),
    );
    if (!accountIds.every((id) => existingIds.has(id))) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw new InvalidParamsError(
        'Account IDs were not part of existing accounts.',
      );
    }

    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.SynchronizeSelectedAccounts,
      params: { accountIds },
      duration: 'PT1S',
    });
  }
}
