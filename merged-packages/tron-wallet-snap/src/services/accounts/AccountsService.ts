import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent, TrxAccountType, TrxScope } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { assert, integer } from '@metamask/superstruct';

import type { SnapClient } from '../../clients/snap/SnapClient';
import {
  asStrictKeyringAccount,
  type TronKeyringAccount,
} from '../../entities';
import { deriveTronKeypair } from '../../utils/deriveTronKeypair';
import { getLowestUnusedIndex } from '../../utils/getLowestUnusedIndex';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { AssetsService } from '../assets/AssetsService';
import type { ConfigProvider } from '../config';
import type { AccountsRepository } from './AccountsRepository';
import type { CreateAccountOptions } from './types';

export class AccountsService {
  readonly #accountsRepository: AccountsRepository;

  readonly #configProvider: ConfigProvider;

  readonly #logger: ILogger;

  readonly #assetsService: AssetsService;

  readonly #snapClient: SnapClient;

  constructor({
    accountsRepository,
    configProvider,
    logger,
    assetsService,
    snapClient,
  }: {
    accountsRepository: AccountsRepository;
    configProvider: ConfigProvider;
    logger: ILogger;
    assetsService: AssetsService;
    snapClient: SnapClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 AccountsService]');
    this.#configProvider = configProvider;
    this.#accountsRepository = accountsRepository;
    this.#assetsService = assetsService;
    this.#snapClient = snapClient;
  }

  async create(
    id: string,
    options?: CreateAccountOptions,
  ): Promise<KeyringAccount> {
    const accounts = await this.#accountsRepository.getAll();

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

    const tronKeyringAccount: TronKeyringAccount = {
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

    await this.#accountsRepository.create(tronKeyringAccount);

    const keyringAccount = asStrictKeyringAccount(tronKeyringAccount);

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
  }

  async getAll(): Promise<TronKeyringAccount[]> {
    return this.#accountsRepository.getAll();
  }

  async findById(id: string): Promise<TronKeyringAccount | null> {
    return this.#accountsRepository.findById(id);
  }

  async findByAddress(address: string): Promise<TronKeyringAccount | null> {
    return this.#accountsRepository.findByAddress(address);
  }

  async delete(id: string): Promise<void> {
    return this.#accountsRepository.delete(id);
  }

  async synchronize(accounts: KeyringAccount[]): Promise<void> {
    const scopes = this.#configProvider.get().activeNetworks;
    const combinations = accounts.flatMap((account) =>
      scopes.map((scope) => ({ account, scope })),
    );

    // Synchronize assets
    const assetResponses = await Promise.allSettled(
      combinations.map(async ({ account, scope }) => {
        return this.#assetsService.fetchAssetsAndBalancesByAccount(
          scope,
          account,
        );
      }),
    );

    const assets = assetResponses.flatMap((response) =>
      response.status === 'fulfilled' ? response.value : [],
    );

    await this.#assetsService.saveMany(assets);
  }

  /**
   * Synchronizes only assets for the given accounts.
   * This method can be called independently to sync assets without syncing transactions.
   *
   * @param accounts - The accounts to synchronize assets for.
   */
  async synchronizeAssets(accounts: KeyringAccount[]): Promise<void> {
    const scopes = this.#configProvider.get().activeNetworks;
    const combinations = accounts.flatMap((account) =>
      scopes.map((scope) => ({ account, scope })),
    );

    // Synchronize assets only
    const assetResponses = await Promise.allSettled(
      combinations.map(async ({ account, scope }) => {
        return this.#assetsService.fetchAssetsAndBalancesByAccount(
          scope,
          account,
        );
      }),
    );

    const assets = assetResponses.flatMap((response) =>
      response.status === 'fulfilled' ? response.value : [],
    );

    await this.#assetsService.saveMany(assets);
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
    const entropySources = await this.#snapClient.listEntropySources();
    const defaultEntropySource = entropySources.find(({ primary }) => primary);

    if (!defaultEntropySource) {
      throw new Error(
        'No default entropy source found - this can never happen',
      );
    }

    return defaultEntropySource.id;
  }
}
