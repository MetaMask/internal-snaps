import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent, TrxAccountType, TrxScope } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { assert, pattern, string } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { hexToBytes } from '@metamask/utils';
import { TronWeb } from 'tronweb';

import type { AccountsRepository } from './AccountsRepository';
import type { CreateAccountOptions } from './types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import {
  asStrictKeyringAccount,
  type TronKeyringAccount,
} from '../../entities';
import { getLowestUnusedIndex } from '../../utils/getLowestUnusedIndex';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { AssetsService } from '../assets/AssetsService';
import type { ConfigProvider } from '../config';
import type { TransactionsService } from '../transactions/TransactionsService';

/**
 * Validates a Tron derivation path following the format: m/44'/195'/...
 */
const DERIVATION_PATH_REGEX = /^m\/44'\/195'/u;
export const DerivationPathStruct = pattern(string(), DERIVATION_PATH_REGEX);

/**
 * Elliptic curve for TRON (same as Ethereum)
 */
const CURVE = 'secp256k1' as const;

export class AccountsService {
  readonly #accountsRepository: AccountsRepository;

  readonly #configProvider: ConfigProvider;

  readonly #logger: ILogger;

  readonly #assetsService: AssetsService;

  readonly #transactionsService: TransactionsService;

  readonly #snapClient: SnapClient;

  constructor({
    accountsRepository,
    configProvider,
    logger,
    assetsService,
    snapClient,
    transactionsService,
  }: {
    accountsRepository: AccountsRepository;
    configProvider: ConfigProvider;
    logger: ILogger;
    assetsService: AssetsService;
    snapClient: SnapClient;
    transactionsService: TransactionsService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 AccountsService]');
    this.#configProvider = configProvider;
    this.#accountsRepository = accountsRepository;
    this.#assetsService = assetsService;
    this.#transactionsService = transactionsService;
    this.#snapClient = snapClient;
  }

  /**
   * Derives a TRON private and public key from a given derivation path using BIP44.
   * The derivation path follows the format: m/44'/195'/account'/change/index
   * where 195 is TRON's coin type.
   *
   * @param params - The parameters for the TRON key derivation.
   * @param params.entropySource - The entropy source to use for key derivation.
   * @param params.derivationPath - The derivation path to use for key derivation.
   * @returns A Promise that resolves to the private key bytes, public key bytes, private key hex WITHOUT the `0x` prefix, and address.
   * @throws {Error} If unable to derive private key or if derivation fails.
   */
  async deriveTronKeypair({
    entropySource,
    derivationPath,
  }: {
    entropySource?: EntropySourceId | undefined;
    derivationPath: string;
  }): Promise<{
    privateKeyBytes: Uint8Array;
    publicKeyBytes: Uint8Array;
    privateKeyHex: string;
    address: string;
  }> {
    this.#logger.log({ derivationPath }, 'Generating TRON wallet');

    assert(derivationPath, DerivationPathStruct);

    const path = derivationPath.split('/');

    const node = await this.#snapClient.getBip32Entropy({
      entropySource,
      path,
      curve: CURVE,
    });

    if (!node.privateKey || !node.publicKey) {
      throw new Error('Unable to derive private key');
    }

    const privateKeyBytes = hexToBytes(node.privateKey);
    const publicKeyBytes = hexToBytes(node.publicKey);
    const privateKeyHex = node.privateKey.slice(2);

    const address = TronWeb.address.fromPrivateKey(privateKeyHex);

    if (!address) {
      throw new Error('Unable to derive address');
    }

    return {
      privateKeyBytes,
      publicKeyBytes,
      privateKeyHex,
      address,
    };
  }

  async deriveAccount({
    entropySource,
    index,
  }: {
    entropySource: EntropySourceId;
    index: number;
  }): Promise<TronKeyringAccount> {
    const derivationPath = AccountsService.getDefaultDerivationPath(index);
    const { address } = await this.deriveTronKeypair({
      entropySource,
      derivationPath,
    });

    return {
      id: '',
      entropySource,
      derivationPath,
      index,
      type: TrxAccountType.Eoa,
      address,
      scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
      options: {
        entropy: {
          type: 'mnemonic',
          id: entropySource,
          derivationPath,
          groupIndex: index,
        },
        exportable: true,
      },
      methods: ['signMessageV2', 'verifyMessageV2'],
    };
  }

  async create(
    id: string,
    options?: CreateAccountOptions,
  ): Promise<KeyringAccount> {
    const accounts = await this.#accountsRepository.getAll();

    const entropySource =
      options?.entropySource ?? (await this.#getDefaultEntropySource());
    const index =
      options?.groupIndex ??
      this.#getLowestUnusedKeyringAccountIndex(accounts, entropySource);

    /**
     * Now that we have the `entropySource` and `derivationPath` ready,
     * we need to make sure that they do not correspond to an existing account already.
     */
    const sameAccount = accounts.find(
      (account) =>
        account.index === index && account.entropySource === entropySource,
    );

    if (sameAccount) {
      this.#logger.warn(
        '[🔑 Keyring] An account already exists with the same derivation path and entropy source. Skipping account creation.',
      );
      return asStrictKeyringAccount(sameAccount);
    }

    const derivedAccount = await this.deriveAccount({
      entropySource,
      index,
    });

    const { metamask: metamaskOptions, ...remainingOptions } = options ?? {};

    const tronKeyringAccount: TronKeyringAccount = {
      ...derivedAccount,
      id,
      options: {
        ...derivedAccount.options,
        ...(Object.fromEntries(
          Object.entries(remainingOptions).filter(
            ([, value]) => value !== undefined,
          ),
        ) as Record<string, Json>),
      },
    };

    await this.#accountsRepository.create(tronKeyringAccount);

    const keyringAccount = asStrictKeyringAccount(tronKeyringAccount);

    /**
     * Fetch the account's assets before we send it to the UI so that
     * it's loaded with data already in place.
     */
    await this.synchronizeAssets([keyringAccount]);

    await emitSnapKeyringEvent(snap, KeyringEvent.AccountCreated, {
      /**
       * We can't pass the `keyringAccount` object because it contains the index
       * and the snaps sdk does not allow extra properties.
       */
      account: keyringAccount,
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

  /**
   * Retrieves an account by ID and throws an error if not found.
   * This is a convenience method that combines findById with validation.
   *
   * @param id - The account ID to retrieve.
   * @returns The account if found.
   * @throws {Error} If the account is not found.
   */
  async findByIdOrThrow(id: string): Promise<TronKeyringAccount> {
    const account = await this.#accountsRepository.findById(id);

    if (!account) {
      throw new Error(`Account with ID ${id} not found`);
    }

    return account;
  }

  async findByAddress(address: string): Promise<TronKeyringAccount | null> {
    return this.#accountsRepository.findByAddress(address);
  }

  async delete(id: string): Promise<void> {
    return this.#accountsRepository.delete(id);
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

    const assetResponses = await Promise.allSettled(
      combinations.map(async ({ account, scope }) => {
        return this.#assetsService.fetchAssetsAndBalancesForAccount(
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

  async synchronizeTransactions(accounts: KeyringAccount[]): Promise<void> {
    const scopes = this.#configProvider.get().activeNetworks;
    const combinations = accounts.flatMap((account) =>
      scopes.map((scope) => ({ account, scope })),
    );

    const transactionResponses = await Promise.allSettled(
      combinations.map(async ({ account, scope }) => {
        return this.#transactionsService.fetchTransactionsForAccount(
          scope,
          account,
        );
      }),
    );

    const transactions = transactionResponses.flatMap((response) =>
      response.status === 'fulfilled' ? response.value : [],
    );

    await this.#transactionsService.saveMany(transactions);
  }

  async synchronize(accounts: KeyringAccount[]): Promise<void> {
    await Promise.all([
      this.synchronizeAssets(accounts),
      this.synchronizeTransactions(accounts),
    ]);
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

  static getDefaultDerivationPath(index: number): `m/${string}` {
    return `m/44'/195'/0'/0/${index}`;
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
