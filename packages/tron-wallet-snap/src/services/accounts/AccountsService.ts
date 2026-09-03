import type { JsonBIP44Node } from '@metamask/key-tree';
import type {
  CreateAccountOptions as KeyringBatchCreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
  assertCreateAccountOptionIsSupported,
  TrxAccountType,
} from '@metamask/keyring-api';
import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import type { Logger } from '@metamask/snap-networks-utils';
import { InFlightCoalescer } from '@metamask/snap-networks-utils';
import { assert } from '@metamask/superstruct';
import { hexToBytes } from '@metamask/utils';
import { computeAddress } from 'ethers';
import { TronWeb } from 'tronweb';

import snapManifest from '../../../snap.manifest.json';
import type { SnapClient } from '../../clients/snap/SnapClient';
import { Network } from '../../constants';
import { asStrictKeyringAccount } from '../../entities/keyring-account';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import {
  createTronBip44AddressDeriver,
  createTronBip44KeypairDeriver,
} from '../../utils/deriveTronFromCoinTypeNode';
import { sanitizeSensitiveError } from '../../utils/errors';
import { DerivationPathStruct } from '../../validation/structs';
import type { AssetsService } from '../assets/AssetsService';
import type { ConfigProvider } from '../config';
import type { TransactionsService } from '../transactions/TransactionsService';
import type { AccountsRepository } from './AccountsRepository';

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
 * A function that derives a TRON keypair from a BIP44 account index.
 */
type TronKeypairDeriver = Awaited<
  ReturnType<typeof createTronBip44KeypairDeriver>
>;

/**
 * Key material derived for one TRON account.
 */
export type DerivedTronKeypair = {
  privateKeyBytes: Uint8Array;
  publicKeyBytes: Uint8Array;
  privateKeyHex: string;
  address: string;
};

/**
 * Result for one account in a batch TRON keypair derivation.
 */
export type DerivedTronKeypairBatchResult =
  | DerivedTronKeypair
  | { error: string };

const DEFAULT_TRON_DERIVATION_PATH_REGEX = /^m\/44'\/195'\/0'\/0\/([0-9]+)$/u;

/**
 * Converts an unknown thrown value into a JSON-serializable error message.
 *
 * @param error - The thrown value.
 * @returns A string error message.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Extracts the address index from the default TRON BIP-44 derivation path.
 *
 * Batch derivation starts at the coin-type node (`m/44'/195'`), so it only
 * supports the snap's default `m/44'/195'/0'/0/index` path shape.
 *
 * @param account - The TRON account whose derivation path should be parsed.
 * @returns The BIP-44 address index.
 */
function getDefaultTronAddressIndex(account: TronKeyringAccount): number {
  const match = DEFAULT_TRON_DERIVATION_PATH_REGEX.exec(account.derivationPath);

  if (!match?.[1]) {
    throw new Error(
      `Unsupported Tron derivation path: ${account.derivationPath}`,
    );
  }

  const addressIndex = Number(match[1]);
  if (!Number.isSafeInteger(addressIndex) || addressIndex !== account.index) {
    throw new Error(
      `Tron derivation path index (${addressIndex}) does not match account index (${account.index})`,
    );
  }

  return addressIndex;
}

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

  readonly #logger: Logger;

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
    logger: Logger;
    assetsService: AssetsService;
    snapClient: SnapClient;
    transactionsService: TransactionsService;
  }) {
    this.#logger = logger.withPrefix('[🔑 AccountsService]');
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
  }): Promise<DerivedTronKeypair> {
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

  /**
   * Derives keypairs for multiple TRON accounts with one coin-type entropy
   * fetch per entropy source.
   *
   * Results are returned in input order. Individual account derivation failures
   * are returned as item-level errors so callers can preserve partial success.
   *
   * @param accounts - The accounts to derive key material for.
   * @returns One derivation result per account, in input order.
   */
  async deriveTronKeypairs(
    accounts: TronKeyringAccount[],
  ): Promise<DerivedTronKeypairBatchResult[]> {
    const results: DerivedTronKeypairBatchResult[] = new Array(accounts.length);
    const accountsByEntropySource = new Map<
      EntropySourceId,
      { index: number; account: TronKeyringAccount }[]
    >();

    accounts.forEach((account, index) => {
      const sourceAccounts =
        accountsByEntropySource.get(account.entropySource) ?? [];
      sourceAccounts.push({ index, account });
      accountsByEntropySource.set(account.entropySource, sourceAccounts);
    });

    await Promise.all(
      [...accountsByEntropySource.entries()].map(
        async ([entropySource, sourceAccounts]) => {
          try {
            const keypairDeriver =
              await this.#createTronKeypairDeriver(entropySource);

            for (const { index, account } of sourceAccounts) {
              try {
                const addressIndex = getDefaultTronAddressIndex(account);
                results[index] = await keypairDeriver(addressIndex);
              } catch (error) {
                results[index] = { error: getErrorMessage(error) };
              }
            }
          } catch (error) {
            for (const { index } of sourceAccounts) {
              results[index] = { error: getErrorMessage(error) };
            }
          }
        },
      ),
    );

    return results;
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
    let created = 0;
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
      const { merged, added } =
        await this.#accountsRepository.mergeKeyringAccounts(newAccounts);
      mergeMs = Date.now() - mergeStartMs;
      created = Object.keys(added).length;

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
        created,
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

  /**
   * Finds multiple TRON keyring accounts.
   *
   * Missing accounts are logged but not thrown so callers can decide whether
   * partial results are acceptable.
   *
   * @param ids - Account IDs to resolve.
   * @returns The matching accounts.
   */
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

  /**
   * Creates a TRON keypair deriver from the coin-type node.
   *
   * @param entropySource - Entropy source used to fetch the coin-type node.
   * @returns A deriver for `m/44'/195'/0'/0/index` keypairs.
   */
  async #createTronKeypairDeriver(
    entropySource: EntropySourceId,
  ): Promise<TronKeypairDeriver> {
    const bip44Node = (await this.#snapClient.getBip32Entropy({
      entropySource,
      path: ['m', "44'", "195'"],
      curve: CURVE,
    })) as JsonBIP44Node;

    return createTronBip44KeypairDeriver(bip44Node);
  }

  static getDefaultDerivationPath(index: number): `m/${string}` {
    return `m/44'/195'/0'/0/${index}`;
  }
}
