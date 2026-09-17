import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip2ChainId } from '../../api';
import { BASE_RESERVE_STROOPS } from '../../constants';
import {
  getAssetReference,
  parseClassicAssetCodeIssuer,
  toSmallestUnit,
} from '../../utils';
import { assertSameAddress } from '../account/utils';
import type { StellarAssetMetadata } from '../asset-metadata';
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
import { OnChainAccount } from './OnChainAccount';
import type { OnChainAccountRepository } from './OnChainAccountRepository';
import {
  OnChainAccountSerializableFullStruct,
  SerializableClassicSpendableBalanceStruct,
  SerializableSep41SpendableBalanceStruct,
} from './OnChainAccountSerializable';
import type { SerializableSpendableBalance } from './OnChainAccountSerializable';
import { OnChainAccountSynchronizeService } from './OnChainAccountSynchronizeService';

/**
 * Stellar on-chain account operations: activation checks and loading {@link OnChainAccount}
 * via {@link NetworkService}.
 */
export class OnChainAccountService {
  readonly #networkService: NetworkService;

  readonly #onChainAccountSynchronizeService: OnChainAccountSynchronizeService;

  readonly #onChainAccountRepository: OnChainAccountRepository;

  readonly #assetsService: AssetsService;

  readonly #logger: Logger;

  constructor({
    networkService,
    onChainAccountRepository,
    logger,
    assetsService,
  }: {
    networkService: NetworkService;
    onChainAccountRepository: OnChainAccountRepository;
    logger: Logger;
    assetsService: AssetsService;
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
   * @returns Loaded {@link OnChainAccount} for simulation, fees, and sequence.
   * @throws {AccountNotActivatedException} When the account is not funded (from {@link NetworkService.loadOnChainAccount}).
   * @throws {DerivedAccountAddressMismatchException} When loaded id does not match `accountAddress`.
   */
  async resolveOnChainAccount(
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount> {
    const loaded = await this.#networkService.loadOnChainAccount(
      accountAddress,
      scope,
    );
    assertSameAddress(accountAddress, loaded.accountId);
    return loaded;
  }

  /**
   * Loads the on-chain account for the given keyring account id from snap state.
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
    if ((await this.#assetsService.isMigrationEnabled())) {
      return this.resolveOnChainAccountFromCore(scope, keyringAccountId, accountAddress);
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
   * Binds balances from AssetsController when the Stellar migration flag is on.
   * Protocol fields (sequence, subentries, sponsorship, native stroops) come from
   * {@link NetworkService.getAccountLedgerMeta} when `resolveAccountFromNetwork` is set;
   * otherwise sequence is `0`, sponsorships are 0, and `subentryCount` is derived from Core
   * native `minimumReserveBalance`.
   * Not a substitute for live Horizon for send / fee / ChangeTrust.
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
    if (!(await this.#assetsService.isMigrationEnabled())) {
      return null;
    }

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

    return OnChainAccount.fromSerializable(
      this.#toSerializableFromCoreAssets({
        accountAddress,
        scope,
        assets,
        ledger,
      }),
    );
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
  }): ReturnType<typeof OnChainAccountSerializableFullStruct.create> {
    const balances: SerializableSpendableBalance[] = [];
    let rawNativeBalance = ledger?.rawNativeBalance ?? '0';
    let subentryCount = 0;

    for (const asset of assets) {
      if (asset.chainId !== scope) {
        continue;
      }

      const { decimals, symbol } = asset.metadata;
      const balance = toSmallestUnit(
        new BigNumber(asset.balance.amount),
        decimals,
      ).toFixed(0);

      if (isCoreNativeAsset(asset)) {
        if (ledger === undefined) {
          rawNativeBalance = balance;
          const { minimumReserveBalance } = asset.balance.metadata;
          const reserveUnits = new BigNumber(minimumReserveBalance).div(
            BASE_RESERVE_STROOPS,
          );
          // minReserve = (2 + subentryCount) * BASE when sponsoring/sponsored are 0.
          subentryCount = BigNumber.maximum(reserveUnits.minus(2), 0).toNumber();
        }
        continue;
      }

      if (isCoreClassicAsset(asset)) {
        const { limit, authorized, sponsored } = asset.balance.metadata;
        const address =
          asset.metadata.address ??
          parseClassicAssetCodeIssuer(getAssetReference(asset.id)).assetIssuer;
        balances.push(
          SerializableClassicSpendableBalanceStruct.create({
            assetId: asset.id,
            symbol,
            balance,
            limit: toSmallestUnit(new BigNumber(limit), decimals).toFixed(0),
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
            assetId: asset.id,
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
      this.#logger.debug('Skipping on-chain account synchronization; Core migration is on');
      return;
    }

    await this.#onChainAccountSynchronizeService.synchronize(
      activatedAccountPairs,
      scope,
      sep41Assets,
    );
  }
}
