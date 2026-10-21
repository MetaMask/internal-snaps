import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import type { KnownCaip19Sep41AssetId } from '../../api';
import {
  entries,
  getAssetReference,
  isSep41Id,
  keys,
  parseClassicAssetCodeIssuer,
  rethrowIfInstanceElseThrow,
  toSmallestUnit,
  trackError,
} from '../../utils';
import { assertSameAddress } from '../account/utils';
import type {
  AssetMetadataService,
  StellarAssetMetadata,
} from '../asset-metadata';
import type { AssetsService } from '../assets';
import {
  isCoreClassicAsset,
  isCoreNativeAsset,
  isCoreSep41Asset,
} from '../assets/api';
import type { CoreAsset } from '../assets/api';
import { AccountNotActivatedException } from '../network';
import type { AccountLedgerMeta, NetworkService } from '../network';
import type { ActivatedAccountPair } from '../sync/api';
import {
  OnChainAccountException,
  OnChainAccountSep41BalanceNotFoundException,
} from './exceptions';
import { OnChainAccount } from './OnChainAccount';
import type { OnChainAccountRepository } from './OnChainAccountRepository';
import {
  OnChainAccountSerializableFullStruct,
  SerializableClassicSpendableBalanceStruct,
  SerializableSep41SpendableBalanceStruct,
} from './OnChainAccountSerializable';
import type {
  OnChainAccountSerializableFull,
  SerializableSpendableBalance,
} from './OnChainAccountSerializable';
import { OnChainAccountSynchronizeService } from './OnChainAccountSynchronizeService';
import { calculateSubentryFromMinReserve } from './utils';

/**
 * Stellar on-chain account operations: activation checks and loading {@link OnChainAccount}
 * via {@link NetworkService}.
 */
export class OnChainAccountService {
  readonly #networkService: NetworkService;

  readonly #onChainAccountSynchronizeService: OnChainAccountSynchronizeService;

  readonly #onChainAccountRepository: OnChainAccountRepository;

  readonly #assetsService: AssetsService;

  readonly #assetMetadataService: AssetMetadataService;

  readonly #logger: Logger;

  constructor({
    networkService,
    onChainAccountRepository,
    logger,
    assetsService,
    assetMetadataService,
  }: {
    networkService: NetworkService;
    onChainAccountRepository: OnChainAccountRepository;
    logger: Logger;
    assetsService: AssetsService;
    assetMetadataService: AssetMetadataService;
  }) {
    this.#networkService = networkService;
    this.#onChainAccountSynchronizeService =
      new OnChainAccountSynchronizeService({
        networkService,
        onChainAccountRepository,
        logger,
      });
    this.#logger = logger.withPrefix('💼 OnChainAccountService');
    this.#onChainAccountRepository = onChainAccountRepository;
    this.#assetsService = assetsService;
    this.#assetMetadataService = assetMetadataService;
  }

  /**
   * Returns whether the given address has a funded account on the network.
   *
   * @param params - Options object.
   * @param params.accountAddress - The Stellar account address (public key).
   * @param params.scope - The CAIP-2 chain ID.
   * @returns `true` if the account exists and is funded, `false` if missing.
   */
  async isAccountActivated(params: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
  }): Promise<boolean> {
    const { accountAddress, scope } = params;
    try {
      await this.#networkService.getAccount(accountAddress, scope);
      return true;
    } catch (error: unknown) {
      if (error instanceof AccountNotActivatedException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Loads activated on-chain state for an address on the given network and verifies the loaded
   * account id matches that address.
   *
   * @param accountAddress - Stellar address (strkey) expected to match Horizon `account_id`.
   * @param scope - CAIP-2 network to load the account from (Horizon `loadAccount`).
   * @param options - Optional extra loads.
   * @param options.fetchWithSep41Balances - When true, also read SEP-41 balances for the
   * persisted catalog and bind them onto the Horizon account.
   * @returns Loaded {@link OnChainAccount} for simulation, fees, and sequence.
   * @throws {AccountNotActivatedException} When the account is not funded (from {@link NetworkService.loadOnChainAccount}).
   * @throws {DerivedAccountAddressMismatchException} When loaded id does not match `accountAddress`.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When `fetchWithSep41Balances` is set and
   * mainnet returns no SEP-41 map for the account.
   */
  async resolveOnChainAccount(
    accountAddress: string,
    scope: KnownCaip2ChainId,
    options?: {
      fetchWithSep41Balances?: boolean;
    },
  ): Promise<OnChainAccount> {
    const loaded = await this.#networkService.loadOnChainAccount(
      accountAddress,
      scope,
    );

    assertSameAddress(accountAddress, loaded.accountId);

    if (options?.fetchWithSep41Balances) {
      await this.fetchAndBindSep41Balances(loaded, scope);
    }

    return loaded;
  }

  /**
   * Fetches SEP-41 balances and binds them onto `onChainAccount`.
   *
   * When `assetIds` is omitted, balances are read for the persisted SEP-41 catalog.
   * When `assetIds` is set, only those ids are resolved.
   * Empty balance cells (`null` or missing) are skipped.
   *
   * @param onChainAccount - Horizon account to attach the SEP-41 entries to.
   * @param scope - CAIP-2 network.
   * @param assetIds - Optional SEP-41 asset ids.
   * @returns The same account, with any resolved balances bound.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When mainnet returns no map for the account.
   */
  async fetchAndBindSep41Balances(
    onChainAccount: OnChainAccount,
    scope: KnownCaip2ChainId,
    assetIds?: KnownCaip19Sep41AssetId[],
  ): Promise<OnChainAccount> {
    const assetMetadataByAssetId = await this.#getSep41AssetMetadata(
      scope,
      assetIds,
    );
    const assetIdsWithMetadata = keys(assetMetadataByAssetId);

    // if there are no asset metadata, we can return early.
    // This can happen if there are no SEP-41 assets for the scope.
    if (assetIdsWithMetadata.length === 0) {
      return onChainAccount;
    }

    const sep41Balances = await this.#fetchSep41Balances(
      onChainAccount.accountId,
      assetIdsWithMetadata,
      scope,
    );

    for (const [assetId, balance] of entries(sep41Balances)) {
      const assetMetadata = assetMetadataByAssetId[assetId];
      // Asset metadata is important for setting the correct decimals and symbol for the balance.
      if (assetMetadata === undefined) {
        // This is unexpected, but we can continue.
        await trackError(
          new Error(`Asset metadata not found for asset id: ${assetId}`),
        );
        continue;
      }
      this.#bindSep41BalanceForAccount({
        onChainAccount,
        assetId,
        balance,
        assetMetadata,
      });
    }

    return onChainAccount;
  }

  /**
   * Loads SEP-41 metadata for the requested ids, or the persisted catalog when ids are omitted.
   * Non-SEP-41 rows are skipped.
   *
   * @param scope - CAIP-2 network.
   * @param assetIds - SEP-41 asset ids. Omit to use the persisted catalog.
   * @returns Metadata keyed by SEP-41 asset id.
   */
  async #getSep41AssetMetadata(
    scope: KnownCaip2ChainId,
    assetIds?: KnownCaip19Sep41AssetId[],
  ): Promise<Record<KnownCaip19Sep41AssetId, StellarAssetMetadata>> {
    const sep41Assets =
      assetIds === undefined
        ? await this.#assetMetadataService.fetchSep41AssetsOrSyncOnce(scope)
        : await this.#assetMetadataService.fetchSep41AssetsByAssetIds(assetIds);

    const assetMetadataByAssetId: Record<
      KnownCaip19Sep41AssetId,
      StellarAssetMetadata
    > = {};
    for (const assetMetadata of sep41Assets) {
      const { assetId } = assetMetadata;
      if (!isSep41Id(assetId)) {
        continue;
      }
      assetMetadataByAssetId[assetId] = assetMetadata;
    }

    return assetMetadataByAssetId;
  }

  /**
   * Reads SEP-41 balances for one account.
   *
   * @param accountAddress - Stellar G-address.
   * @param assetIds - SEP-41 asset ids to read.
   * @param scope - CAIP-2 network.
   * @returns Balance by asset id. Empty on testnet when no map is returned.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When mainnet returns no map for the account.
   */
  async #fetchSep41Balances(
    accountAddress: string,
    assetIds: KnownCaip19Sep41AssetId[],
    scope: KnownCaip2ChainId,
  ): Promise<Record<KnownCaip19Sep41AssetId, BigNumber | null>> {
    const balancesByAccount = await this.#networkService.getSep41AssetBalances({
      accounts: [accountAddress],
      assetIds,
      scope,
    });
    const sep41Balances = balancesByAccount[accountAddress];
    // If it is testnet, we won't have any balances, so we return early.
    // If it is mainnet, we throw an error as it is unexpected.
    if (sep41Balances === undefined) {
      if (scope === KnownCaip2ChainId.Mainnet) {
        throw new OnChainAccountSep41BalanceNotFoundException(accountAddress);
      }
      return {};
    }

    return sep41Balances;
  }

  /**
   * Binds one fetched SEP-41 balance, including zero, onto an account.
   * Returns without binding when the balance is `null` or `undefined`.
   *
   * @param params - Account, one SEP-41 id, its balance, and its metadata.
   * @param params.onChainAccount - Horizon account that receives the entry.
   * @param params.assetId - SEP-41 asset id to bind.
   * @param params.balance - Balance in smallest units. `null` or `undefined` means the cell was not read.
   * @param params.assetMetadata - Metadata for `assetId`, including symbol and decimals.
   */
  #bindSep41BalanceForAccount({
    onChainAccount,
    assetId,
    balance,
    assetMetadata,
  }: {
    onChainAccount: OnChainAccount;
    assetId: KnownCaip19Sep41AssetId;
    balance: BigNumber | null | undefined;
    assetMetadata: StellarAssetMetadata;
  }): void {
    // A cell can fail without failing the batch, for example reading a
    // trustline asset through its SEP-41 contract when the account is not
    // authorized to hold it. Skip that asset and keep the rest.
    if (balance === null || balance === undefined) {
      return;
    }

    const { decimals } = assetMetadata.units[0];
    const { symbol } = assetMetadata;

    onChainAccount.setAsset(assetId, {
      balance,
      symbol,
      decimals,
    });
  }

  /**
   * Loads the on-chain account for the given keyring account id from snap state or AssetsController.
   *
   * @param keyringAccountId - The keyring account id to load the on-chain account for.
   * @param accountAddress - Stellar G-address for the account header.
   * @param scope - The CAIP-2 chain id to load the on-chain account for.
   * @returns The on-chain account, or `null` if not found.
   * @throws {OnChainAccountException} When the assets migration is on and AssetsController holdings cannot be mapped.
   */
  async resolveOnChainAccountByKeyringAccountId(
    keyringAccountId: string,
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount | null> {
    if (await this.#assetsService.isMigrationEnabled()) {
      return this.#getOnChainAccountFromCore(
        scope,
        keyringAccountId,
        accountAddress,
      );
    }
    return this.#getOnChainAccountFromState(keyringAccountId, scope);
  }

  /**
   * Gets a persisted on-chain snapshot for a keyring account.
   *
   * @param keyringAccountId - MetaMask keyring account id.
   * @param scope - CAIP-2 network.
   * @returns The on-chain account, or `null` when no snapshot exists.
   */
  async #getOnChainAccountFromState(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount | null> {
    const onChainAccount =
      await this.#onChainAccountRepository.findByKeyringAccountId(
        keyringAccountId,
        scope,
      );
    return onChainAccount
      ? OnChainAccount.fromSerializable(onChainAccount)
      : null;
  }

  /**
   * Gets an {@link OnChainAccount} from AssetsController holdings.
   *
   * @param scope - CAIP-2 network.
   * @param keyringAccountId - MetaMask keyring account id.
   * @param accountAddress - Stellar G-address for the account header.
   * @returns Bound account, or `null` when AssetsController has no holdings for the account.
   * @throws {OnChainAccountException} When AssetsController holdings cannot be mapped into a snapshot.
   */
  async #getOnChainAccountFromCore(
    scope: KnownCaip2ChainId,
    keyringAccountId: string,
    accountAddress: string,
  ): Promise<OnChainAccount | null> {
    const assets = await this.#assetsService.getAccountAssetsByScope(
      scope,
      keyringAccountId,
    );

    if (assets.length === 0) {
      // If the account has no assets from AssetsController,
      // Possibly not indexed, or not activated
      // Return null to categorize it as not activated
      return null;
    }

    this.#logger.debug('Resolved on-chain account from AssetsController', {
      accountAddress,
      scope,
      assets,
    });

    try {
      const serializable = this.#mapCoreAssetsToSerializable({
        accountAddress,
        scope,
        assets,
      });
      return OnChainAccount.fromSerializable(serializable);
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [OnChainAccountException],
        new OnChainAccountException(
          `Failed to map AssetsController assets for account ${accountAddress}`,
          { cause: error },
        ),
      );
    }
  }

  /**
   * Maps AssetsController holdings into a full on-chain snapshot.
   *
   * Best-effort account ledger metadata from AssetsController:
   * - Derived `subentryCount` from native balance metadata `minimumReserveBalance`
   * - Set `sequenceNumber` to `0`, `numSponsoring` to `0`, and `numSponsored` to `0`
   *
   * @param params - Account header and AssetsController assets for one scope.
   * @param params.accountAddress - Stellar G-address for the snapshot header.
   * @param params.scope - CAIP-2 network.
   * @param params.assets - Assets held by the account.
   * @param params.ledger - Optional ledger overlay for sequence, meta, and native stroops.
   * @returns Full serializable binding for {@link OnChainAccount.fromSerializable}.
   */
  #mapCoreAssetsToSerializable({
    accountAddress,
    scope,
    assets,
    ledger,
  }: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
    assets: CoreAsset[];
    ledger?: AccountLedgerMeta;
  }): OnChainAccountSerializableFull {
    const balances: SerializableSpendableBalance[] = [];
    const accountLedgerMeta: AccountLedgerMeta = ledger ?? {
      sequenceNumber: '0',
      subentryCount: 0,
      numSponsoring: 0,
      numSponsored: 0,
      rawNativeBalance: '0',
    };

    for (const asset of assets) {
      if (asset.chainId !== scope) {
        continue;
      }

      const assetId = asset.id;
      const { decimals, symbol } = asset.metadata;
      const balance = toSmallestUnit(
        new BigNumber(asset.balance.amount),
        decimals,
      ).toFixed(0);

      if (isCoreNativeAsset(asset)) {
        // When ledger meta is missing, derive subentryCount from AssetsController XLM metadata.
        if (ledger === undefined) {
          const { minimumReserveBalance } = asset.balance.metadata;
          accountLedgerMeta.rawNativeBalance = balance;
          accountLedgerMeta.subentryCount = calculateSubentryFromMinReserve(
            minimumReserveBalance,
          );
        }
        continue;
      }

      if (isCoreClassicAsset(asset)) {
        const { limit, authorized, sponsored } = asset.balance.metadata;
        const { assetIssuer: address } = parseClassicAssetCodeIssuer(
          getAssetReference(assetId),
        );
        balances.push(
          SerializableClassicSpendableBalanceStruct.create({
            assetId,
            symbol,
            balance,
            limit,
            address,
            authorized,
            sponsored,
          }),
        );
        continue;
      }

      if (isCoreSep41Asset(asset)) {
        balances.push(
          SerializableSep41SpendableBalanceStruct.create({
            assetId,
            symbol,
            balance,
            decimals,
          }),
        );
      }
    }

    return OnChainAccountSerializableFullStruct.create({
      accountId: accountAddress,
      sequenceNumber: accountLedgerMeta.sequenceNumber,
      scope,
      meta: {
        subentryCount: accountLedgerMeta.subentryCount,
        numSponsoring: accountLedgerMeta.numSponsoring,
        numSponsored: accountLedgerMeta.numSponsored,
      },
      balances,
      rawNativeBalance: accountLedgerMeta.rawNativeBalance,
    });
  }

  /**
   * Enriches accounts with SEP-41 balances, persists snapshots, then notifies the keyring when
   * balances or the tracked asset set changed. Delegates to {@link OnChainAccountSynchronizeService}.
   *
   * When the Stellar assets migration flag is on, skips persist and keyring events;
   * AssetsController owns fungible holdings.
   *
   * @param activatedAccountPairs - Activated account pairs to synchronize.
   * @param scope - CAIP-2 network.
   * @param sep41Assets - Preloaded SEP-41 assets from {@link SynchronizeService}.
   */
  async synchronize(
    activatedAccountPairs: ActivatedAccountPair[],
    scope: KnownCaip2ChainId,
    sep41Assets: StellarAssetMetadata[],
  ): Promise<void> {
    if (await this.#assetsService.isMigrationEnabled()) {
      this.#logger.debug(
        'Skipping on-chain account synchronization; Core migration is on',
      );
      return;
    }

    await this.#onChainAccountSynchronizeService.synchronize(
      activatedAccountPairs,
      scope,
      sep41Assets,
    );
  }
}
