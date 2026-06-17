/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  KeyringEvent,
  ListAccountAssetsResponseStruct,
  type Balance,
  type CreateAccountOptions as KeyringBatchCreateAccountOptions,
  type DiscoveredAccount,
  type EntropySourceId,
  type Keyring,
  type KeyringAccount,
  type KeyringRequest,
  type KeyringResponse,
  type Pagination,
  type ResolvedAccountAddress,
  type Transaction,
} from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  handleKeyringRequest,
} from '@metamask/keyring-snap-sdk';
import {
  InvalidParamsError,
  SnapError,
  UserRejectedRequestError,
} from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { array, assert } from '@metamask/superstruct';
import type {
  CaipAssetType,
  CaipAssetTypeOrId,
  CaipChainId,
} from '@metamask/utils';
import { sortBy } from 'lodash';

import type { SnapClient } from '../clients/snap/SnapClient';
import { ESSENTIAL_ASSETS, type Network } from '../constants';
import { BackgroundEventMethod } from './cronjob';
import { TronMultichainMethod } from './keyring-types';
import {
  asStrictKeyringAccount,
  type TronKeyringAccount,
} from '../entities/keyring-account';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { CreateAccountOptions } from '../services/accounts/types';
import type { AssetsService } from '../services/assets/AssetsService';
import type { ConfirmationHandler } from '../services/confirmation/ConfirmationHandler';
import type { TransactionExpirationRefresherService } from '../services/transaction-expiration-refresher/TransactionExpirationRefresherService';
import type { TransactionsService } from '../services/transactions/TransactionsService';
import type { WalletService } from '../services/wallet/WalletService';
import { sanitizeSensitiveError } from '../utils/errors';
import { createPrefixedLogger, type ILogger } from '../utils/logger';
import {
  CreateAccountOptionsStruct,
  DeleteAccountStruct,
  DiscoverAccountsStruct,
  GetAccounBalancesResponseStruct,
  GetAccountBalancesStruct,
  GetAccountStruct,
  ListAccountAssetsStruct,
  ListAccountTransactionsStruct,
  SignTransactionRequestStruct,
  TronKeyringRequestStruct,
  type TronWalletKeyringRequest,
  UuidStruct,
} from '../validation/structs';
import {
  validateOrigin,
  validateRequest,
  validateResponse,
} from '../validation/validators';

export class KeyringHandler implements Keyring {
  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #transactionsService: TransactionsService;

  readonly #walletService: WalletService;

  readonly #confirmationHandler: ConfirmationHandler;

  readonly #transactionExpirationRefresherService: TransactionExpirationRefresherService;

  constructor({
    logger,
    snapClient,
    accountsService,
    assetsService,
    transactionsService,
    walletService,
    confirmationHandler,
    transactionExpirationRefresherService,
  }: {
    logger: ILogger;
    snapClient: SnapClient;
    accountsService: AccountsService;
    assetsService: AssetsService;
    transactionsService: TransactionsService;
    walletService: WalletService;
    confirmationHandler: ConfirmationHandler;
    transactionExpirationRefresherService: TransactionExpirationRefresherService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 KeyringHandler]');
    this.#snapClient = snapClient;
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#transactionsService = transactionsService;
    this.#walletService = walletService;
    this.#confirmationHandler = confirmationHandler;
    this.#transactionExpirationRefresherService =
      transactionExpirationRefresherService;
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

  async listAccounts(): Promise<KeyringAccount[]> {
    return (await this.#listAccounts()).map(asStrictKeyringAccount);
  }

  async #getAccount(
    accountId: string,
  ): Promise<TronKeyringAccount | undefined> {
    try {
      const account =
        (await this.#accountsService.findById(accountId)) ?? undefined;

      return account;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.#logger.error({ error }, 'Error getting account');
      throw new SnapError(error);
    }
  }

  async getAccount(accountId: string): Promise<KeyringAccount | undefined> {
    validateRequest({ accountId }, GetAccountStruct);

    const account = await this.#getAccount(accountId);

    return account ? asStrictKeyringAccount(account) : undefined;
  }

  async #getAccountOrThrow(accountId: string): Promise<TronKeyringAccount> {
    const account = await this.#getAccount(accountId);

    if (!account) {
      throw new Error(`Account "${accountId}" not found`);
    }

    return account;
  }

  async createAccount(options?: CreateAccountOptions): Promise<KeyringAccount> {
    validateRequest(options, CreateAccountOptionsStruct);

    try {
      return await this.#accountsService.create(options);
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.#logger.error({ error }, 'Error creating account');
      throw new Error(`Error creating account: ${error.message}`, {
        cause: error,
      });
    }
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

  async listAccountAssets(accountId: string): Promise<CaipAssetTypeOrId[]> {
    try {
      validateRequest({ accountId }, ListAccountAssetsStruct);

      await this.#getAccountOrThrow(accountId);

      this.#logger.info('Listing account assets', { accountId });

      const assetEntities =
        await this.#assetsService.getByKeyringAccountId(accountId);
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
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
  async listAccountTransactions(
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.#logger.error({ error }, 'Error listing account transactions');
      throw error;
    }
  }

  async discoverAccounts?(
    scopes: CaipChainId[],
    entropySource: EntropySourceId,
    groupIndex: number,
  ): Promise<DiscoveredAccount[]> {
    try {
      validateRequest(
        { scopes, entropySource, groupIndex },
        DiscoverAccountsStruct,
      );

      const derivedAccount = await this.#accountsService.deriveAccount({
        entropySource,
        index: groupIndex,
      });

      const activityChecksPromises = [];

      for (const scope of scopes) {
        activityChecksPromises.push(
          this.#transactionsService.checkAddressActivity(
            scope as Network,
            derivedAccount.address,
          ),
        );
      }

      const activityOnScopes = await Promise.all(activityChecksPromises);

      const hasActivity = activityOnScopes.some((active) => active);

      if (!hasActivity) {
        return [];
      }

      return [
        {
          type: 'bip44',
          scopes,
          derivationPath: derivedAccount.derivationPath,
        },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.#logger.error({ error }, 'Error discovering accounts');
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

      const assetsList =
        await this.#assetsService.getByKeyringAccountId(accountId);

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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
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

  async filterAccountChains(id: string, chains: string[]): Promise<string[]> {
    throw new Error('Method not implemented.');
  }

  async updateAccount(account: KeyringAccount): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async deleteAccount(accountId: string): Promise<void> {
    try {
      validateRequest({ accountId }, DeleteAccountStruct);

      const account = await this.#getAccountOrThrow(accountId);

      await emitSnapKeyringEvent(snap, KeyringEvent.AccountDeleted, {
        id: account.id,
      });

      await this.#accountsService.delete(accountId);
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.#logger.error({ error }, 'Error deleting account');
      throw error;
    }
  }

  async submitRequest(request: KeyringRequest): Promise<KeyringResponse> {
    return { pending: false, result: await this.#handleSubmitRequest(request) };
  }

  async #prepareRequestForConfirmation(
    request: TronWalletKeyringRequest,
  ): Promise<TronWalletKeyringRequest> {
    if (request.request.method !== TronMultichainMethod.SignTransaction) {
      return request;
    }

    assert(request.request.params, SignTransactionRequestStruct);

    const {
      scope,
      request: {
        params: {
          transaction: { rawDataHex, type },
        },
      },
    } = request;

    const freshTransaction =
      await this.#transactionExpirationRefresherService.ensureFreshSerializedTransaction(
        {
          scope,
          type,
          rawDataHex,
        },
      );

    return {
      ...request,
      request: {
        ...request.request,
        params: {
          ...request.request.params,
          transaction: {
            ...request.request.params.transaction,
            rawDataHex: freshTransaction.raw_data_hex,
          },
        },
      },
    };
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

    const requestToHandle = await this.#prepareRequestForConfirmation(request);

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
