/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  KeyringEvent,
  ListAccountAssetsResponseStruct,
  type Balance,
  type DiscoveredAccount,
  type EntropySourceId,
  type Keyring,
  type KeyringAccount,
  type KeyringAccountData,
  type KeyringRequest,
  type KeyringResponse,
  type Paginated,
  type Pagination,
  type ResolvedAccountAddress,
  type Transaction,
} from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  handleKeyringRequest,
} from '@metamask/keyring-snap-sdk';
import { SnapError } from '@metamask/snaps-sdk';
import type {
  CaipAssetType,
  CaipAssetTypeOrId,
  CaipChainId,
  Json,
  JsonRpcRequest,
} from '@metamask/utils';
import { sortBy } from 'lodash';

import type { TronKeyringAccount } from '../entities';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { CreateAccountOptions } from '../services/accounts/types';
import type { AssetsService } from '../services/assets/AssetsService';
import { withCatchAndThrowSnapError } from '../utils/errors';
import { createPrefixedLogger, type ILogger } from '../utils/logger';
import {
  DeleteAccountStruct,
  GetAccounBalancesResponseStruct,
  GetAccountBalancesStruct,
  ListAccountAssetsStruct,
} from '../validation/structs';
import {
  validateOrigin,
  validateRequest,
  validateResponse,
} from '../validation/validators';

export class KeyringHandler implements Keyring {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  constructor({
    logger,
    accountsService,
    assetsService,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    assetsService: AssetsService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 KeyringHandler]');
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    validateOrigin(origin, request.method);

    const result =
      (await withCatchAndThrowSnapError(async () =>
        handleKeyringRequest(this, request),
      )) ?? null;

    return result;
  }

  async listAccounts(): Promise<TronKeyringAccount[]> {
    try {
      const keyringAccounts = await this.#accountsService.getAll();

      return sortBy(keyringAccounts, ['entropySource', 'index']);
    } catch (error: any) {
      this.#logger.error({ error }, 'Error listing accounts');
      throw new Error('Error listing accounts');
    }
  }

  async getAccount(accountId: string): Promise<TronKeyringAccount | undefined> {
    try {
      const account =
        (await this.#accountsService.findById(accountId)) ?? undefined;

      return account;
    } catch (error: any) {
      this.#logger.error({ error }, 'Error getting account');
      throw new SnapError(error);
    }
  }

  async #getAccountOrThrow(accountId: string): Promise<TronKeyringAccount> {
    const account = await this.getAccount(accountId);

    if (!account) {
      throw new Error(`Account "${accountId}" not found`);
    }

    return account;
  }

  async createAccount(options?: CreateAccountOptions): Promise<KeyringAccount> {
    const id = globalThis.crypto.randomUUID();

    try {
      const account = await this.#accountsService.create(id, options);

      await this.#accountsService.synchronize([account]);

      return account;
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

      const assets = await this.#assetsService.getByKeyringAccountId(accountId);

      const result = assets.map((asset) => asset.assetType);

      this.#logger.info('Account assets', { accountId, result });

      validateResponse(result, ListAccountAssetsResponseStruct);
      return result;
    } catch (error: any) {
      this.#logger.error({ error }, 'Error listing account assets');
      throw error;
    }
  }

  async listAccountTransactions?(
    id: string,
    pagination: Pagination,
  ): Promise<Paginated<Transaction>> {
    // TODO: Implement me
    return {
      data: [],
      next: null,
    };
  }

  async discoverAccounts?(
    scopes: CaipChainId[],
    entropySource: EntropySourceId,
    groupIndex: number,
  ): Promise<DiscoveredAccount[]> {
    // TODO: Implement me
    return [];
  }

  async getAccountBalances(
    accountId: string,
    assets: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    try {
      validateRequest({ accountId, assets }, GetAccountBalancesStruct);

      await this.#getAccountOrThrow(accountId);

      const assetsList =
        await this.#assetsService.getByKeyringAccountId(accountId);
      const assetsOnlyRequestedAssetTypes = assetsList.filter((asset) =>
        assets.includes(asset.assetType),
      );

      const result = assetsOnlyRequestedAssetTypes.reduce<
        Record<CaipAssetType, Balance>
      >((acc, asset) => {
        acc[asset.assetType] = {
          unit: asset.symbol,
          amount: asset.uiAmount,
        };
        return acc;
      }, {});

      validateResponse(result, GetAccounBalancesResponseStruct);
      return result;
    } catch (error: any) {
      this.#logger.error({ error }, 'Error getting account balances');
      throw error;
    }
  }

  resolveAccountAddress?(
    scope: CaipChainId,
    request: JsonRpcRequest,
  ): Promise<ResolvedAccountAddress | null> {
    throw new Error('Method not implemented.');
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
    } catch (error: any) {
      this.#logger.error({ error }, 'Error deleting account');
      throw error;
    }
  }

  exportAccount?(id: string): Promise<KeyringAccountData> {
    throw new Error('Method not implemented.');
  }

  listRequests?(): Promise<KeyringRequest[]> {
    throw new Error('Method not implemented.');
  }

  getRequest?(id: string): Promise<KeyringRequest | undefined> {
    throw new Error('Method not implemented.');
  }

  async submitRequest(request: KeyringRequest): Promise<KeyringResponse> {
    throw new Error('Method not implemented.');
  }

  approveRequest?(id: string, data?: Record<string, Json>): Promise<void> {
    throw new Error('Method not implemented.');
  }

  rejectRequest?(id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
