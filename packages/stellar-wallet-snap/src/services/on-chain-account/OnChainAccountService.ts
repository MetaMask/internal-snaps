import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import { KnownCaip19Sep41AssetId, KnownCaip2ChainId } from '../../api';
import {
  entries,
  getAssetReference,
  isSep41Id,
  parseClassicAssetCodeIssuer,
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
  OnChainAccountBalanceNotAvailableException,
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
import { subentryCountFromMinimumReserveStroops } from './utils';

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
   * @param options.resolveWithFullBalance - When true, also read SEP-41 balances for the
   * persisted catalog and bind them onto the Horizon account.
   * @returns Loaded {@link OnChainAccount} for simulation, fees, and sequence.
   * @throws {AccountNotActivatedException} When the account is not funded (from {@link NetworkService.loadOnChainAccount}).
   * @throws {DerivedAccountAddressMismatchException} When loaded id does not match `accountAddress`.
   * @throws {OnChainAccountBalanceNotAvailableException} When `resolveWithFullBalance` is set and a
   * SEP-41 cell comes back unread (`null` or missing). A zero balance is bound.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When `resolveWithFullBalance` is set and
   * mainnet returns no SEP-41 map for the account. An empty catalog, or testnet, leaves SEP-41
   * unbound and does not throw.
   */
  async resolveOnChainAccount(
    accountAddress: string,
    scope: KnownCaip2ChainId,
    options?: {
      resolveWithFullBalance?: boolean;
    },
  ): Promise<OnChainAccount> {
    const loaded = await this.#networkService.loadOnChainAccount(
      accountAddress,
      scope,
    );

    if (options?.resolveWithFullBalance) {
      await this.#bindSep41Balances(loaded, scope);
    }

    assertSameAddress(accountAddress, loaded.accountId);
    return loaded;
  }

  /**
   * Reads SEP-41 balances for the persisted catalog and binds them onto `onChainAccount`.
   *
   * @param onChainAccount - Horizon account to attach SEP-41 entries to.
   * @param scope - CAIP-2 network.
   * @throws {OnChainAccountBalanceNotAvailableException} When a SEP-41 cell is `null` or missing.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When mainnet returns no map for the account.
   */
  async #bindSep41Balances(
    onChainAccount: OnChainAccount,
    scope: KnownCaip2ChainId,
  ): Promise<void> {
    const sep41Assets =
      await this.#assetMetadataService.fetchSep41AssetsOrSyncOnce(scope);
    const sep41AssetIds: KnownCaip19Sep41AssetId[] = [];
    const assetMetadataByAssetId: Record<
      KnownCaip19Sep41AssetId,
      StellarAssetMetadata
    > = {};

    for (const asset of sep41Assets) {
      const { assetId } = asset;
      if (isSep41Id(assetId)) {
        sep41AssetIds.push(assetId);
        assetMetadataByAssetId[assetId] = asset;
      }
    }

    if (sep41AssetIds.length === 0) {
      return;
    }

    const balancesByAccount = await this.#networkService.getSep41AssetBalances({
      accounts: [onChainAccount.accountId],
      assetIds: sep41AssetIds,
      scope,
    });
    const sep41Balances = balancesByAccount[onChainAccount.accountId];
    // If it is testnet, we won't have any balances, so we return early.
    // If it is mainnet, we throw an error as it is unexpected.
    if (sep41Balances === undefined) {
      if (scope === KnownCaip2ChainId.Mainnet) {
        throw new OnChainAccountSep41BalanceNotFoundException(
          onChainAccount.accountId,
        );
      }
      return;
    }

    for (const [assetId, assetMetadata] of entries(assetMetadataByAssetId)) {
      this.#setSep41BalanceForAccount({
        onChainAccount,
        assetId,
        balance: sep41Balances[assetId],
        assetMetadata,
      });
    }
  }

  /**
   * Binds one fetched SEP-41 balance, including zero, onto an account.
   *
   * @param params - Account, one SEP-41 id, its balance, and its metadata.
   * @param params.onChainAccount - Horizon account that receives the entry.
   * @param params.assetId - SEP-41 asset id to bind.
   * @param params.balance - Balance in smallest units. `null` or `undefined` means the cell was not read.
   * @param params.assetMetadata - Metadata for `assetId`, including symbol and decimals.
   * @throws {OnChainAccountBalanceNotAvailableException} When the cell is `null` or missing.
   */
  #setSep41BalanceForAccount({
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
    // Unread cell, not a zero balance. Omitting it would look like the token was removed.
    if (balance === null || balance === undefined) {
      throw new OnChainAccountBalanceNotAvailableException(assetId);
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
   * Loads the on-chain account for the given keyring account id from snap state or core.
   *
   * @param keyringAccountId - The keyring account id to load the on-chain account for.
   * @param accountAddress - Stellar G-address for the account header.
   * @param scope - The CAIP-2 chain id to load the on-chain account for.
   * @returns The on-chain account, or `null` if not found.
   */
  async resolveOnChainAccountByKeyringAccountId(
    keyringAccountId: string,
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount | null> {
    if (await this.#assetsService.isMigrationEnabled()) {
      return this.resolveOnChainAccountFromCore(
        scope,
        keyringAccountId,
        accountAddress,
      );
    }

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
   * Best-effort {@link OnChainAccount} from Core holdings for fast read paths.
   *
   * - When `resolveAccountFromNetwork` is set, sequence, subentries, sponsorship, and native stroops come from {@link NetworkService.getAccountLedgerMeta}.
   * - Otherwise sequence is `0`, sponsorships are `0`, and `subentryCount` is derived from Core native `minimumReserveBalance`.
   * - Not a substitute for live Horizon for send, fee, or ChangeTrust.
   *
   * @param scope - CAIP-2 network.
   * @param keyringAccountId - MetaMask keyring account id.
   * @param accountAddress - Stellar G-address for the account header.
   * @param options - Optional RPC ledger overlay.
   * @param options.resolveAccountFromNetwork - When true, overlay sequence / meta / native
   * from Soroban `getAccountEntry`.
   * @returns Bound account, or `null` when migration is off, Core is empty, or the
   * account is not activated on Horizon (when network load is requested).
   */
  async resolveOnChainAccountFromCore(
    scope: KnownCaip2ChainId,
    keyringAccountId: string,
    accountAddress: string,
    options?: {
      resolveAccountFromNetwork?: boolean;
    },
  ): Promise<OnChainAccount | null> {
    const { resolveAccountFromNetwork = false } = options ?? {};
    let ledger: AccountLedgerMeta | undefined;

    if (resolveAccountFromNetwork) {
      ledger = await this.#getAccountLedgerMetaSafe(accountAddress, scope);
      if (!ledger) {
        return null;
      }
    }

    const assets = await this.#assetsService.getAccountAssetsByScope(
      scope,
      keyringAccountId,
    );

    if (assets.length === 0) {
      // If the account has no assets from core,
      // Possiblly not indexed, or not activated
      // Return null to categorize it as not activated
      return null;
    }

    this.#logger.debug('Resolved on-chain account from core', {
      accountAddress,
      scope,
      assets,
      ledger,
    });

    try {
      const serializable = this.#toSerializableFromCoreAssets({
        accountAddress,
        scope,
        assets,
        ledger,
      });
      return OnChainAccount.fromSerializable(serializable);
    } catch (error: unknown) {
      await trackError(
        new Error('Error serializing on-chain account from core assets', {
          cause: error,
        }),
      );
      throw error;
    }
  }

  /**
   * Maps validated Core holdings into a full on-chain snapshot (best effort).
   *
   * @param params - Account header and Core assets for one scope.
   * @param params.accountAddress - Stellar G-address for the snapshot header.
   * @param params.scope - CAIP-2 network.
   * @param params.assets - Assets that are held by the account from core client controller.
   * @param params.ledger - Optional RPC ledger overlay (sequence, meta, native stroops).
   * @returns Full serializable binding for {@link OnChainAccount.fromSerializable}.
   */
  #toSerializableFromCoreAssets({
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
    let rawNativeBalance = ledger?.rawNativeBalance ?? '0';
    let subentryCount = 0;

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
        // When RPC ledger meta is missing, derive subentryCount from Core
        // `minimumReserveBalance` (stroops), assuming sponsoring fields are 0.
        if (ledger === undefined) {
          rawNativeBalance = balance;
          const { minimumReserveBalance } = asset.balance.metadata;
          subentryCount = subentryCountFromMinimumReserveStroops(
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
      sequenceNumber: ledger?.sequenceNumber ?? '0',
      scope,
      meta: {
        subentryCount: ledger?.subentryCount ?? subentryCount,
        numSponsoring: ledger?.numSponsoring ?? 0,
        numSponsored: ledger?.numSponsored ?? 0,
      },
      balances,
      rawNativeBalance,
    });
  }

  async #getAccountLedgerMetaSafe(
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<AccountLedgerMeta | undefined> {
    try {
      return await this.#networkService.getAccountLedgerMeta(
        accountAddress,
        scope,
      );
    } catch (error: unknown) {
      if (error instanceof AccountNotActivatedException) {
        return undefined;
      }
      throw error;
    }
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
