/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  KeyringEvent,
  TrxAccountType,
  TrxScope,
  type Balance,
  type DiscoveredAccount,
  type EntropySourceId,
  type Keyring,
  type KeyringAccount,
  type KeyringAccountData,
  type KeyringRequest,
  type KeyringResponse,
  type MetaMaskOptions,
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
import { assert, integer } from '@metamask/superstruct';
import type {
  CaipAssetType,
  CaipAssetTypeOrId,
  CaipChainId,
  Json,
  JsonRpcRequest,
} from '@metamask/utils';
import { sortBy } from 'lodash';

import type { TronKeyringAccount } from '../entities';
import { asStrictKeyringAccount } from '../entities/keyring-account';
import type { AssetsService } from '../services/assets/AssetsService';
import type { State, UnencryptedStateValue } from '../services/state/State';
import type { TransactionsService } from '../services/transactions/TransactionsService';
import type { WalletService } from '../services/wallet/WalletService';
import { deriveTronKeypair } from '../utils/deriveTronKeypair';
import { withCatchAndThrowSnapError } from '../utils/errors';
import { getLowestUnusedIndex } from '../utils/getLowestUnusedIndex';
import { listEntropySources } from '../utils/interface';
import type { ILogger } from '../utils/logger';
import { DeleteAccountStruct } from '../validation/structs';
import { validateOrigin, validateRequest } from '../validation/validators';

export class KeyringHandler implements Keyring {
  readonly #logger: ILogger;

  readonly #state: State<UnencryptedStateValue>;

  constructor({
    logger,
    state,
    assetsService,
    transactionService,
    walletService,
  }: {
    logger: ILogger;
    state: State<UnencryptedStateValue>;
    assetsService: AssetsService;
    transactionService: TransactionsService;
    walletService: WalletService;
  }) {
    this.#logger = logger;
    this.#state = state;
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
      const keyringAccounts =
        (await this.#state.getKey<UnencryptedStateValue['keyringAccounts']>(
          'keyringAccounts',
        )) ?? {};

      return sortBy(Object.values(keyringAccounts), ['entropySource', 'index']);
    } catch (error: any) {
      this.#logger.error({ error }, 'Error listing accounts');
      throw new Error('Error listing accounts');
    }
  }

  async getAccount(accountId: string): Promise<TronKeyringAccount | undefined> {
    try {
      const account = await this.#state.getKey<TronKeyringAccount>(
        `keyringAccounts.${accountId}`,
      );

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

  #getLowestUnusedKeyringAccountIndex(
    accounts: TronKeyringAccount[],
    entropySource: EntropySourceId,
  ): number {
    const accountsFilteredByEntropySourceId = accounts.filter(
      (account) => account.entropySource === entropySource,
    );

    return getLowestUnusedIndex(accountsFilteredByEntropySourceId);
  }

  #getDefaultDerivationPath(index: number): `m/${string}` {
    return `m/44'/195'/0'/0/${index}`;
  }

  #getIndexFromDerivationPath(derivationPath: `m/${string}`): number {
    const levels = derivationPath.split('/');
    const indexLevel = levels[3];

    if (!indexLevel) {
      throw new Error('Invalid derivation path');
    }

    const index = parseInt(indexLevel.replace("'", ''), 10);
    assert(index, integer());

    return index;
  }

  async #getDefaultEntropySource(): Promise<EntropySourceId> {
    const entropySources = await listEntropySources();
    const defaultEntropySource = entropySources.find(({ primary }) => primary);

    if (!defaultEntropySource) {
      throw new Error(
        'No default entropy source found - this can never happen',
      );
    }

    return defaultEntropySource.id;
  }

  async #deleteAccountFromState(accountId: string): Promise<void> {
    await Promise.all([
      this.#state.deleteKey(`keyringAccounts.${accountId}`),
      this.#state.deleteKey(`transactions.${accountId}`),
      this.#state.deleteKey(`assets.${accountId}`),
    ]);
  }

  async createAccount(
    options?: {
      entropySource?: EntropySourceId;
      derivationPath?: `m/${string}`;
      accountNameSuggestion?: string;
      [key: string]: Json | undefined;
    } & MetaMaskOptions,
  ): Promise<KeyringAccount> {
    const id = globalThis.crypto.randomUUID();

    try {
      const accounts = await this.listAccounts();

      const entropySource =
        options?.entropySource ?? (await this.#getDefaultEntropySource());

      const index = options?.derivationPath
        ? this.#getIndexFromDerivationPath(options.derivationPath)
        : this.#getLowestUnusedKeyringAccountIndex(accounts, entropySource);

      const derivationPath =
        options?.derivationPath ?? this.#getDefaultDerivationPath(index);

      /**
       * Now that we have the `entropySource` and `derivationPath` ready,
       * we need to make sure that they do not correspond to an existing account already.
       */
      const sameAccount = accounts.find(
        (account) =>
          account.derivationPath === derivationPath &&
          account.entropySource === entropySource,
      );

      if (sameAccount) {
        this.#logger.warn(
          '[🔑 Keyring] An account already exists with the same derivation path and entropy source. Skipping account creation.',
        );
        return asStrictKeyringAccount(sameAccount);
      }

      const { address: accountAddress } = await deriveTronKeypair({
        entropySource,
        derivationPath,
      });

      const {
        importedAccount,
        accountNameSuggestion,
        metamask: metamaskOptions,
        ...remainingOptions
      } = options ?? {};

      const solanaKeyringAccount: TronKeyringAccount = {
        id,
        entropySource,
        derivationPath,
        index,
        type: TrxAccountType.Eoa,
        address: accountAddress,
        scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
        options: {
          ...remainingOptions,
          /**
           * Make sure to save the `entropySource`, `derivationPath` and `index`
           * in the keyring account options..
           */
          entropySource,
          derivationPath,
          index,
        },
        methods: ['signMessageV2', 'verifyMessageV2'],
      };

      await this.#state.setKey(
        `keyringAccounts.${solanaKeyringAccount.id}`,
        solanaKeyringAccount,
      );

      const keyringAccount = asStrictKeyringAccount(solanaKeyringAccount);

      await emitSnapKeyringEvent(snap, KeyringEvent.AccountCreated, {
        /**
         * We can't pass the `keyringAccount` object because it contains the index
         * and the snaps sdk does not allow extra properties.
         */
        account: keyringAccount,
        accountNameSuggestion:
          accountNameSuggestion ?? `Tron Account ${index + 1}`,
        displayAccountNameSuggestion: !accountNameSuggestion,
        /**
         * Skip account creation confirmation dialogs to make it look like a native
         * account creation flow.
         */
        displayConfirmation: false,
        /**
         * Internal options to MetaMask that includes a correlation ID. We need
         * to also emit this ID to the Snap keyring.
         */
        ...(metamaskOptions
          ? {
              metamask: metamaskOptions,
            }
          : {}),
      });

      return keyringAccount;
    } catch (error: any) {
      this.#logger.error({ error }, 'Error creating account');
      await this.#deleteAccountFromState(id);

      throw new Error(`Error creating account: ${error.message}`);
    }
  }

  listAccountAssets?(id: string): Promise<CaipAssetTypeOrId[]> {
    throw new Error('Method not implemented.');
  }

  listAccountTransactions?(
    id: string,
    pagination: Pagination,
  ): Promise<Paginated<Transaction>> {
    throw new Error('Method not implemented.');
  }

  discoverAccounts?(
    scopes: CaipChainId[],
    entropySource: EntropySourceId,
    groupIndex: number,
  ): Promise<DiscoveredAccount[]> {
    throw new Error('Method not implemented.');
  }

  getAccountBalances?(
    id: string,
    assets: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    throw new Error('Method not implemented.');
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
        id: accountId,
      });

      await this.#deleteAccountFromState(accountId);
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
