import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent, TrxAccountType, TrxScope } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { assert, integer } from '@metamask/superstruct';
import type { Account } from 'tronweb/lib/esm/types';

import type { AccountsRepository } from './AccountsRepository';
import type { CreateAccountOptions } from './types';
import type { Network } from '../../constants';
import {
  asStrictKeyringAccount,
  type TronKeyringAccount,
} from '../../entities';
import { deriveTronKeypair } from '../../utils/deriveTronKeypair';
import { getLowestUnusedIndex } from '../../utils/getLowestUnusedIndex';
import { listEntropySources } from '../../utils/interface';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { AssetsService } from '../assets/AssetsService';
import type { ConfigProvider } from '../config';
import type { Connection } from '../connection/Connection';

export class AccountsService {
  readonly #accountsRepository: AccountsRepository;

  readonly #configProvider: ConfigProvider;

  readonly #logger: ILogger;

  readonly #connection: Connection;

  readonly #assetsService: AssetsService;

  constructor(
    accountsRepository: AccountsRepository,
    configProvider: ConfigProvider,
    logger: ILogger,
    connection: Connection,
    assetsService: AssetsService,
  ) {
    this.#accountsRepository = accountsRepository;
    this.#configProvider = configProvider;
    this.#logger = createPrefixedLogger(logger, '[🔑 AccountsService]');
    this.#connection = connection;
    this.#assetsService = assetsService;
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

  async fetch(account: KeyringAccount, scope: Network): Promise<Account> {
    this.#logger.info('Fetching account', { address: account.address, scope });

    const tronAccount = await this.#connection
      .getConnection(scope)
      .trx.getAccount(account.address);

    return tronAccount;
  }

  async synchronize(accounts: KeyringAccount[]): Promise<void> {
    const scopes = this.#configProvider.get().activeNetworks;
    const combinations = accounts.flatMap((account) =>
      scopes.map((scope) => ({ account, scope })),
    );

    await Promise.all(
      combinations.map(async ({ account, scope }) => {
        const tronAccount = await this.fetch(account, scope);
        const assets = await this.#assetsService.fetchAssetsByAccount(
          account,
          scope,
          tronAccount,
        );

        await this.#assetsService.saveMany(assets);
      }),
    );
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
}
