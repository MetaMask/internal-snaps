import type { JsonBIP44Node } from '@metamask/key-tree';
import type {
  CreateAccountOptions as KeyringBatchCreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
  assertCreateAccountOptionIsSupported,
  KeyringEvent,
  TrxAccountType,
} from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  getSelectedAccounts,
} from '@metamask/keyring-snap-sdk';
import { InFlightCoalescer } from '@metamask/snap-networks-utils/dedupe';
import type { Json } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { hexToBytes } from '@metamask/utils';
import { computeAddress } from 'ethers';
import { TronWeb } from 'tronweb';

import snapManifest from '../../../snap.manifest.json';
import type { SnapClient } from '../../clients/snap/SnapClient';
import { Network } from '../../constants';
import { asStrictKeyringAccount } from '../../entities/keyring-account';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import { createTronBip44AddressDeriver } from '../../utils/deriveTronFromCoinTypeNode';
import { sanitizeSensitiveError } from '../../utils/errors';
import { getLowestUnusedIndex } from '../../utils/getLowestUnusedIndex';
import { createPrefixedLogger } from '../../utils/logger';
import type { ILogger } from '../../utils/logger';
import { DerivationPathStruct } from '../../validation/structs';
import type { AssetsService } from '../assets/AssetsService';
import type { ConfigProvider } from '../config';
import type { TransactionsService } from '../transactions/TransactionsService';
import type { AccountsRepository } from './AccountsRepository';
import type { CreateAccountOptions } from './types';

/**
 * Elliptic curve for TRON (same as Ethereum)
 */
const CURVE = 'secp256k1' as const;

/**
 * Maximum BIP44 account index.
 */
const MAX_BIP44_ACCOUNT_INDEX = 0x7fffffff;

export const SUPPORTED_SCOPES = snapManifest.initialPermissions[
  'endowment:keyring'
].capabilities.scopes as readonly Network[];

/**
 * Range of inclusive account indices to create.
 *
 * @param from - The starting index.
 * @param to - The ending index.
 */
type AccountCreationRange = {
  from: number;
  to: number;
};

/**
 * A function that derives a TRON address from a BIP44 account index.
 */
type TronAddressDeriver = Awaited<
  ReturnType<typeof createTronBip44AddressDeriver>
>;

/**
 * Validates account creation ranges before any expensive state or entropy work.
 *
 * @param range - Inclusive account index range to validate.
 */
function validateAccountCreationRange(range: AccountCreationRange): void {
  if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to)) {
    throw new Error('Invalid account creation range: bounds must be integers');
  }

  if (range.from < 0 || range.to < 0) {
    throw new Error(
      'Invalid account creation range: bounds must be non-negative',
    );
  }

  if (
    range.from > MAX_BIP44_ACCOUNT_INDEX ||
    range.to > MAX_BIP44_ACCOUNT_INDEX
  ) {
    throw new Error(
      `Invalid account creation range: bounds must be at most ${MAX_BIP44_ACCOUNT_INDEX}`,
    );
  }

  if (range.from > range.to) {
    throw new Error(
      'Invalid account creation range: "from" must be less than or equal to "to"',
    );
  }
}

export class AccountsService {
  readonly #accountsRepository: AccountsRepository;

  readonly #configProvider: ConfigProvider;

  readonly #logger: ILogger;

  readonly #assetsService: AssetsService;

  readonly #transactionsService: TransactionsService;

  readonly #snapClient: SnapClient;

  readonly #syncCoalescer = new InFlightCoalescer();

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
    try {
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

      // Derive address from public key (cheaper than from private key)
      const hexAddress = computeAddress(node.publicKey);
      const address = TronWeb.address.fromHex(hexAddress);

      if (!address) {
        throw new Error('Unable to derive address');
      }

      return {
        privateKeyBytes,
        publicKeyBytes,
        privateKeyHex,
        address,
      };
    } catch (error) {
      // Sanitize errors to prevent leaking sensitive cryptographic information
      throw sanitizeSensitiveError(error);
    }
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
      id: globalThis.crypto.randomUUID(),
      entropySource,
      derivationPath,
      index,
      type: TrxAccountType.Eoa,
      address,
      scopes: SUPPORTED_SCOPES as unknown as Network[],
      options: {
        entropy: {
          type: 'mnemonic',
          id: entropySource,
          derivationPath,
          groupIndex: index,
        },
        exportable: true,
      },
      methods: ['signMessage', 'signTransaction'],
    };
  }

  async create(options?: CreateAccountOptions): Promise<KeyringAccount> {
    const accounts = await this.#accountsRepository.getAll();

    const entropySource =
      options?.entropySource ?? (await this.#getDefaultEntropySource());
    const index =
      options?.index ??
      this.#getLowestUnusedKeyringAccountIndex(accounts, entropySource);

    /**
     * Now that we have the `entropySource` and `index` ready,
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
      options: {
        ...derivedAccount.options,
        ...(Object.fromEntries(
          Object.entries(remainingOptions).filter(
            ([, value]) => value !== undefined,
          ),
        ) as Record<string, Json>),
        groupIndex: index,
      },
    };

    const persistedAccount =
      await this.#accountsRepository.create(tronKeyringAccount);

    if (persistedAccount.id !== tronKeyringAccount.id) {
      this.#logger.warn(
        '[🔑 Keyring] An account already exists with the same derivation path and entropy source. Skipping account creation.',
      );
      return asStrictKeyringAccount(persistedAccount);
    }

    try {
      const keyringAccount = asStrictKeyringAccount(tronKeyringAccount);

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
    } catch (error) {
      // Rollback: if the event emission fails after the account was persisted,
      // remove it from state so we don't end up with an orphaned record.
      try {
        await this.#accountsRepository.delete(tronKeyringAccount.id);
      } catch (deleteError) {
        this.#logger.error(
          { deleteError, accountId: tronKeyringAccount.id },
          'Failed to rollback account creation',
        );
      }
      throw error;
    }
  }

  /**
   * Batch-creates Tron accounts for a BIP-44 index or index range. Existing accounts for the
   * same entropy source and index are returned without duplicate state writes.
   *
   * @param options - The options for the account creation.
   * @param options.entropySource - The entropy source to use for the account creation.
   * @param options.type - The type of account creation.
   * @param options.groupIndex - The group index to use for the account creation.
   * @returns The created accounts.
   */
  async createAccounts(
    options: KeyringBatchCreateAccountOptions,
  ): Promise<KeyringAccount[]> {
    assertCreateAccountOptionIsSupported(options, [
      `${AccountCreationType.Bip44DeriveIndex}`,
      `${AccountCreationType.Bip44DeriveIndexRange}`,
      `${AccountCreationType.Bip44Discover}`,
    ]);

    const { entropySource } = options;

    // For discovery, only proceed if the account at groupIndex has on-chain
    // activity. No activity signals end-of-discovery; return [] to the client.
    // The deriver created here doubles as the entropy fetch for the derivation
    // below, so discovery costs a single `snap_getBip32Entropy` call.
    let discoverDeriver: TronAddressDeriver | undefined;
    if (options.type === AccountCreationType.Bip44Discover) {
      const { groupIndex } = options;
      discoverDeriver = await this.#createTronAddressDeriver(entropySource);
      const { address } = await discoverDeriver(groupIndex);
      const activityChecks = await Promise.all(
        SUPPORTED_SCOPES.map((scope) =>
          this.#transactionsService.checkAddressActivity(scope, address),
        ),
      );
      if (!activityChecks.some(Boolean)) {
        return [];
      }
    }

    // Get the range of accounts to create
    let range: AccountCreationRange;
    if (options.type === AccountCreationType.Bip44DeriveIndexRange) {
      range = options.range;
    } else {
      // Bip44DeriveIndex | Bip44Discover — a single group index. Ranges are
      // inclusive, so `from` and `to` are the same.
      range = { from: options.groupIndex, to: options.groupIndex };
    }
    validateAccountCreationRange(range);

    const startMs = Date.now();

    // The existing-accounts read and the coin-type entropy fetch are
    // independent RPCs, so overlap them. This makes the entropy fetch
    // speculative when every requested index already exists, but that only
    // happens on idempotent retries.
    const [existingAccounts, tronAddressDeriver] = await Promise.all([
      this.#accountsRepository.findByEntropySourceAndRange(
        entropySource,
        range,
      ),
      discoverDeriver ?? this.#createTronAddressDeriver(entropySource),
    ]);
    const readAndEntropyMs = Date.now() - startMs;

    const allAccounts = new Map<number, TronKeyringAccount>();
    for (const account of existingAccounts) {
      allAccounts.set(account.index, account);
    }

    const missingIndices: number[] = [];
    for (let groupIndex = range.from; groupIndex <= range.to; groupIndex += 1) {
      if (!allAccounts.has(groupIndex)) {
        missingIndices.push(groupIndex);
      }
    }

    const newAccounts: Record<string, TronKeyringAccount> = {};
    let deriveMs = 0;
    let mergeMs = 0;

    if (missingIndices.length > 0) {
      const deriveStartMs = Date.now();

      for (const groupIndex of missingIndices) {
        const id = globalThis.crypto.randomUUID();
        const derivationPath =
          AccountsService.getDefaultDerivationPath(groupIndex);
        const { address } = await tronAddressDeriver(groupIndex);

        const tronKeyringAccount: TronKeyringAccount = {
          id,
          entropySource,
          derivationPath,
          index: groupIndex,
          type: TrxAccountType.Eoa,
          address,
          scopes: SUPPORTED_SCOPES as unknown as Network[],
          options: {
            entropy: {
              type: 'mnemonic',
              id: entropySource,
              derivationPath,
              groupIndex,
            },
            exportable: true,
          },
          methods: ['signMessage', 'signTransaction'],
        };

        allAccounts.set(groupIndex, tronKeyringAccount);
        newAccounts[id] = tronKeyringAccount;
      }

      deriveMs = Date.now() - deriveStartMs;

      const mergeStartMs = Date.now();
      const { merged } =
        await this.#accountsRepository.mergeKeyringAccounts(newAccounts);
      mergeMs = Date.now() - mergeStartMs;

      // Resolve the persisted account for each requested index from the merge
      // result: for indices lost to a concurrent writer, `merged` holds the
      // winner's account rather than the one derived above.
      for (const account of Object.values(merged)) {
        if (
          account.entropySource === entropySource &&
          account.index >= range.from &&
          account.index <= range.to
        ) {
          allAccounts.set(account.index, account);
        }
      }
    }

    // Stringified so the values survive in the console after the snap's
    // execution environment is torn down (live objects become unexpandable).
    this.#logger.log(
      `[createAccounts] Phase timings ${JSON.stringify({
        range,
        created: missingIndices.length,
        readAndEntropyMs,
        deriveMs,
        mergeMs,
        totalMs: Date.now() - startMs,
      })}`,
    );

    const result: KeyringAccount[] = [];
    for (let groupIndex = range.from; groupIndex <= range.to; groupIndex += 1) {
      const account = allAccounts.get(groupIndex);
      if (account) {
        result.push(asStrictKeyringAccount(account));
      }
    }

    return result;
  }

  async getAll(): Promise<TronKeyringAccount[]> {
    return this.#accountsRepository.getAll();
  }

  async getAllSelected(): Promise<TronKeyringAccount[]> {
    const [allAccounts, selectedAccountIds] = await Promise.all([
      this.#accountsRepository.getAll(),
      getSelectedAccounts(snap),
    ]);

    return allAccounts.filter((account) =>
      selectedAccountIds.includes(account.id),
    );
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

  async findByIds(ids: string[]): Promise<TronKeyringAccount[]> {
    const accounts = await this.#accountsRepository.findByIds(ids);

    if (ids.length !== accounts.length) {
      this.#logger.error('[findByIds] Some accounts not found');
    }

    return accounts;
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
  async synchronizeAssets(accounts: TronKeyringAccount[]): Promise<void> {
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

  async synchronizeTransactions(accounts: TronKeyringAccount[]): Promise<void> {
    const scopes = this.#configProvider.get().activeNetworks;
    const combinations = accounts.flatMap((account) =>
      scopes.map((scope) => ({ account, scope })),
    );

    const transactionResponses = await Promise.allSettled(
      combinations.map(async ({ account, scope }) => {
        return this.#transactionsService.fetchNewTransactionsForAccount(
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

  async synchronize(accounts: TronKeyringAccount[]): Promise<void> {
    // Sync triggers stack up (60s cronjob, a background event scheduled by
    // every `setSelectedAccounts` call, post-transaction refreshes), so
    // concurrent invocations for the same accounts share one run instead of
    // duplicating network fetches, state writes, and keyring events.
    const key = accounts
      .map(({ id }) => id)
      .sort()
      .join(',');

    await this.#syncCoalescer.run(key, async () => {
      await Promise.allSettled([
        this.synchronizeAssets(accounts),
        this.synchronizeTransactions(accounts),
      ]);
    });
  }

  async #createTronAddressDeriver(
    entropySource: EntropySourceId,
  ): Promise<TronAddressDeriver> {
    const bip44Node = (await this.#snapClient.getBip32Entropy({
      entropySource,
      path: ['m', "44'", "195'"],
      curve: CURVE,
    })) as JsonBIP44Node;

    return createTronBip44AddressDeriver(bip44Node);
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
