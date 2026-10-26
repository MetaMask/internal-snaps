import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip19Sep41AssetId } from '../../api';
import { KnownCaip2ChainId } from '../../api';
import {
  entries,
  getAssetReference,
  getSlip44AssetId,
  getSnapProvider,
  parseClassicAssetCodeIssuer,
  rethrowIfInstanceElseThrow,
  toSmallestUnit,
  trackError,
} from '../../utils';
import { assertSameAddress } from '../account/utils';
import type {
  AssetMetadataService,
  Sep41StellarAssetMetadata,
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
import { getDefaultBalanceEntry } from './keyringBalance';
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
import { calculateLedgerMetaFromMinReserve } from './utils';

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
    const sep41Assets =
      await this.#assetMetadataService.fetchAndPersistSep41AssetMetadata({
        scope,
        assetIds,
      });

    // if there are no asset metadata, we can return early.
    // This can happen if there are no SEP-41 assets for the scope.
    if (sep41Assets.length === 0) {
      return onChainAccount;
    }

    const sep41AssetIds: KnownCaip19Sep41AssetId[] = [];
    const sep41AssetMetadataMap: Map<
      KnownCaip19Sep41AssetId,
      Sep41StellarAssetMetadata
    > = new Map();
    for (const asset of sep41Assets) {
      sep41AssetMetadataMap.set(asset.assetId, asset);
      sep41AssetIds.push(asset.assetId);
    }

    const balancesByAccount = await this.#networkService.getSep41AssetBalances({
      accounts: [onChainAccount.accountId],
      assetIds: sep41AssetIds,
      scope,
    });
    // Safe guard to throw an error if it is mainnet
    // It is unexpected we don't have any balances.
    if (
      scope === KnownCaip2ChainId.Mainnet &&
      balancesByAccount[onChainAccount.accountId] === undefined
    ) {
      throw new OnChainAccountSep41BalanceNotFoundException(
        onChainAccount.accountId,
      );
    }

    const sep41Balances = balancesByAccount[onChainAccount.accountId] ?? {};
    for (const [assetId, balance] of entries(sep41Balances)) {
      const assetMetadata = sep41AssetMetadataMap.get(assetId);
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
    assetMetadata: Sep41StellarAssetMetadata;
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
   * @note Do not use this method to build a transaction for sign and execute.
   * @param keyringAccountId - The keyring account id to load the on-chain account for.
   * @param accountAddress - Stellar G-address for the account header.
   * @param scope - The CAIP-2 chain id to load the on-chain account for.
   * @returns The on-chain account, or `null` if not found.
   * @throws {OnChainAccountException} When the assets migration is on and AssetsController holdings cannot be mapped.
   */
  async getOnChainAccountSnapshot(
    keyringAccountId: string,
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount | null> {
    if (await this.#assetsService.isMigrationEnabled()) {
      return this.#getOnChainAccountFromAssetsController(
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
  async #getOnChainAccountFromAssetsController(
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
      const serializable = this.#mapAssetsControllerAssetsToSerializable({
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
   * - Derived reserve meta from native balance metadata `minimumReserveBalance`
   *   (including `numSponsored` when the reserve is below two base reserves)
   * - Set `sequenceNumber` to `0` when no ledger overlay is supplied
   *
   * @param params - Account header and AssetsController assets for one scope.
   * @param params.accountAddress - Stellar G-address for the snapshot header.
   * @param params.scope - CAIP-2 network.
   * @param params.assets - Assets held by the account.
   * @param params.ledger - Optional ledger overlay for sequence, meta, and native stroops.
   * @returns Full serializable binding for {@link OnChainAccount.fromSerializable}.
   */
  #mapAssetsControllerAssetsToSerializable({
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
        // When ledger meta is missing, derive reserve meta from AssetsController XLM metadata.
        if (ledger === undefined) {
          const { minimumReserveBalance } = asset.balance.metadata;
          const reserveMeta = calculateLedgerMetaFromMinReserve(
            minimumReserveBalance,
          );
          accountLedgerMeta.rawNativeBalance = balance;
          accountLedgerMeta.subentryCount = reserveMeta.subentryCount;
          accountLedgerMeta.numSponsoring = reserveMeta.numSponsoring;
          accountLedgerMeta.numSponsored = reserveMeta.numSponsored;
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
            ...(asset.balance.metadata.sponsor
              ? { sponsor: asset.balance.metadata.sponsor }
              : {}),
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
   * Records keyring accounts the network confirmed as unfunded (not created on-chain) on `scope`.
   *
   * @param keyringAccountIds - MetaMask keyring account ids.
   * @param scope - CAIP-2 network.
   * @returns The ids that were not already marked as unfunded.
   */
  async markAccountsUnfunded(
    keyringAccountIds: string[],
    scope: KnownCaip2ChainId,
  ): Promise<string[]> {
    // With the assets migration on, AssetsController owns fungible holdings: the snap neither
    // persists account snapshots nor emits keyring balance events (see `synchronize`).
    if (await this.#assetsService.isMigrationEnabled()) {
      return [];
    }

    const newlyMarked = await this.#onChainAccountRepository.markUnfunded(
      keyringAccountIds,
      scope,
    );

    // The client may hold these balances as unavailable (getAccountBalances fails until the
    // account is confirmed unfunded): tell it the confirmed 0 once, best effort.
    if (newlyMarked.length > 0) {
      const nativeAssetId = getSlip44AssetId(scope);
      try {
        await emitSnapKeyringEvent(
          getSnapProvider(),
          KeyringEvent.AccountBalancesUpdated,
          {
            balances: Object.fromEntries(
              newlyMarked.map((id) => [
                id,
                { [nativeAssetId]: getDefaultBalanceEntry() },
              ]),
            ),
          },
        );
      } catch (error: unknown) {
        await trackError(error);
      }
    }

    return newlyMarked;
  }

  /**
   * Whether the network last confirmed the account as unfunded on `scope`, as opposed to an
   * account that was never synchronized (e.g. every load failed), whose balance is unknown.
   * Always `true` while the assets migration is on (AssetsController owns the holdings).
   *
   * @param keyringAccountId - MetaMask keyring account id.
   * @param scope - CAIP-2 network.
   * @returns `true` if the account is confirmed unfunded.
   */
  async isConfirmedUnfunded(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<boolean> {
    // With the assets migration on, the snapshot comes from AssetsController and the snap does
    // not synchronize accounts, so no unfunded marker is ever written. An account without
    // AssetsController holdings keeps the previous meaning: not activated, native balance 0.
    if (await this.#assetsService.isMigrationEnabled()) {
      return true;
    }
    return this.#onChainAccountRepository.isConfirmedUnfunded(
      keyringAccountId,
      scope,
    );
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
    sep41Assets: Sep41StellarAssetMetadata[],
  ): Promise<void> {
    if (await this.#assetsService.isMigrationEnabled()) {
      this.#logger.debug(
        'Skipping on-chain account synchronization; assets migration is on',
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
