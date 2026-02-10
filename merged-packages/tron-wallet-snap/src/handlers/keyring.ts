/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  KeyringEvent,
  ListAccountAssetsResponseStruct,
  type Balance,
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
import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';
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
import { asStrictKeyringAccount, type TronKeyringAccount } from '../entities';
import { BackgroundEventMethod } from './cronjob';
import type { TronMultichainMethod } from './keyring-types';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { CreateAccountOptions } from '../services/accounts/types';
import type { AssetsService } from '../services/assets/AssetsService';
import type { ConfirmationHandler } from '../services/confirmation/ConfirmationHandler';
import type { TransactionsService } from '../services/transactions/TransactionsService';
import type { WalletService } from '../services/wallet/WalletService';
import { withCatchAndThrowSnapError } from '../utils/errors';
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
  TronKeyringRequestStruct,
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

  constructor({
    logger,
    snapClient,
    accountsService,
    assetsService,
    transactionsService,
    walletService,
    confirmationHandler,
  }: {
    logger: ILogger;
    snapClient: SnapClient;
    accountsService: AccountsService;
    assetsService: AssetsService;
    transactionsService: TransactionsService;
    walletService: WalletService;
    confirmationHandler: ConfirmationHandler;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 KeyringHandler]');
    this.#snapClient = snapClient;
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#transactionsService = transactionsService;
    this.#walletService = walletService;
    this.#confirmationHandler = confirmationHandler;
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    validateOrigin(origin, request.method);

    const result =
      (await withCatchAndThrowSnapError(async () =>
        handleKeyringRequest(this, request),
      )) ?? null;

    return result;
  }

  async #listAccounts(): Promise<TronKeyringAccount[]> {
    try {
      const keyringAccounts = await this.#accountsService.getAll();

      return sortBy(keyringAccounts, ['entropySource', 'index']);
    } catch (error) {
      this.#logger.error({ error }, 'Error listing accounts');
      throw new Error('Error listing accounts');
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

    const id = globalThis.crypto.randomUUID();

    try {
      const account = await this.#accountsService.create(id, options);

      return account;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.#logger.error({ error }, 'Error creating account');
      await this.#accountsService.delete(id);

      throw new Error(`Error creating account: ${error.message}`);
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

      const account = await this.#accountsService.deriveAccount({
        entropySource,
        index: groupIndex,
      });

      const activityChecksPromises = [];

      for (const scope of scopes) {
        activityChecksPromises.push(
          this.#transactionsService.fetchNewTransactionsForAccount(
            scope as Network,
            account,
          ),
        );
      }

      const transactionsOnAllScopes = await Promise.all(activityChecksPromises);

      const hasActivity = transactionsOnAllScopes.some(
        (transactions) => transactions.length > 0,
      );

      if (!hasActivity) {
        return [];
      }

      return [
        {
          type: 'bip44',
          scopes,
          derivationPath: account.derivationPath,
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

    const isConfirmed = await this.#confirmationHandler.handleKeyringRequest({
      request,
      account,
    });

    if (!isConfirmed) {
      throw new UserRejectedRequestError() as unknown as Error;
    }

    const result = await this.#walletService.handleKeyringRequest({
      account,
      scope,
      method: method as TronMultichainMethod,
      params,
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

    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.SynchronizeSelectedAccounts,
      params: { accountIds },
      duration: 'PT1S',
    });
  }
}
