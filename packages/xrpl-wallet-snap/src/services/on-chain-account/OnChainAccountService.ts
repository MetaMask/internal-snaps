import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import { parseAccountRootFlags } from 'xrpl';

import type {
  KnownCaip19AssetId,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19MptAssetId,
  KnownCaip2ChainId,
} from '../../api';
import { IOU_DECIMAL_PLACES } from '../../constants';
import {
  rethrowIfInstanceElseThrow,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
  toSmallestUnit,
  groupAssetsByType,
} from '../../utils';
import { assertSameAddress } from '../account/utils';
import type { AssetMetadataService } from '../asset-metadata';
import type { AssetsService } from '../assets';
import {
  isCoreIouAsset,
  isCoreMptAsset,
  isCoreNativeAsset,
} from '../assets/api';
import type { CoreAsset } from '../assets/api';
import { AccountNotActivatedException, LedgerState } from '../network';
import type { NetworkService } from '../network';
import type {
  AccountInfoResponse,
  AccountMptoken,
  TrustLine,
} from '../network/api';
import {
  OnChainAccountSerializableFullStruct,
  OnChainAssetType,
  SerializableIouSpendableBalanceStruct,
  SerializableMptSpendableBalanceStruct,
} from './api';
import type {
  OnChainAccountSerializableFull,
  SerializableSpendableBalance,
} from './api';
import { OnChainAccountException } from './exceptions';
import { OnChainAccount } from './OnChainAccount';
import {
  calculateLedgerMetaFromMinReserve,
  getEnabledFlags,
  reserveMetaFromAccountData,
} from './utils';
import type { ReserveLedgerMeta } from './utils';

/**
 * Loads and binds {@link OnChainAccount} from either the ledger or AssetsController.
 *
 * Two paths:
 * 1. Network — `account_info` for the account root. Callers then bind every
 *    holding or a chosen asset id list.
 * 2. Controller — indexed holdings (native + trust-line metadata; MPT spendable only), then bind.
 */
export class OnChainAccountService {
  readonly #networkService: NetworkService;

  readonly #assetsService: AssetsService;

  readonly #assetMetadataService: AssetMetadataService;

  readonly #logger: Logger;

  constructor({
    networkService,
    assetsService,
    assetMetadataService,
    logger,
  }: {
    networkService: NetworkService;
    assetsService: AssetsService;
    assetMetadataService: AssetMetadataService;
    logger: Logger;
  }) {
    this.#networkService = networkService;
    this.#assetsService = assetsService;
    this.#assetMetadataService = assetMetadataService;
    this.#logger = logger.withPrefix('💼 OnChainAccountService');
  }

  /**
   * Whether the address has a funded account on the network.
   *
   * Reads `account_info` on the validated ledger.
   *
   * @param params - Address and network.
   * @param params.address - XRPL account address.
   * @param params.scope - CAIP-2 network.
   * @returns `true` when the account exists on the ledger.
   */
  async isAccountActivated(params: {
    address: string;
    scope: KnownCaip2ChainId;
  }): Promise<boolean> {
    const { address, scope } = params;
    try {
      await this.#networkService.fetchAccountInfo(address, scope);
      return true;
    } catch (error: unknown) {
      if (error instanceof AccountNotActivatedException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Fetch one account and bind trust-line / MPT balances.
   *
   * @param accountAddress - XRPL account address.
   * @param scope - CAIP-2 network.
   * @param assetIds - `'all'`, or the IOU and MPT ids to bind. An empty list
   * binds neither (account root only).
   * @returns Account with the requested holdings bound.
   * @throws {AccountNotActivatedException} When the account is not funded.
   */
  async fetchAccountWithBalances(
    accountAddress: string,
    scope: KnownCaip2ChainId,
    assetIds: KnownCaip19AssetIdOrSlip44Id[] | 'all',
  ): Promise<OnChainAccount> {
    const onChainAccount = await this.fetchAccount({
      accountAddress,
      scope,
    });
    await this.bindAssetsBalancesFromOnChain(onChainAccount, scope, assetIds);
    return onChainAccount;
  }

  /**
   * Fetch one account, and bind every trust line and MPT holding.
   *
   * @param accountAddress - XRPL account address.
   * @param scope - CAIP-2 network.
   * @returns Bound account.
   * @throws {AccountNotActivatedException} When the account is not funded.
   */
  async fetchAccountWithAllAssetsBalances(
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount> {
    return this.fetchAccountWithBalances(accountAddress, scope, 'all');
  }

  /**
   * Fetch one account, or `null` when it is not in the ledger.
   *
   * @param params - Address, holdings, and network.
   * @param params.address - XRPL account address.
   * @param params.scope - CAIP-2 chain ID.
   * @param params.assetIds - IOU and MPT ids to read. Omit or pass `[]` to
   * read neither. Use {@link fetchAccountWithAllAssetsBalances} for every holding.
   * @param params.useCache - When true, reuse a cached `account_info` read.
   * @returns The account, or `null` when `account_info` returns `actNotFound`.
   */
  async fetchActivatedAccount(params: {
    address: string;
    scope: KnownCaip2ChainId;
    assetIds?: KnownCaip19AssetId[];
    useCache?: boolean;
  }): Promise<OnChainAccount | null> {
    const { address, scope, assetIds = [], useCache = false } = params;
    try {
      const onChainAccount = await this.fetchAccount({
        accountAddress: address,
        scope,
        ledgerIndex: LedgerState.Validated,
        useCache,
      });
      await this.bindAssetsBalancesFromOnChain(onChainAccount, scope, assetIds);
      return onChainAccount;
    } catch (error: unknown) {
      if (error instanceof AccountNotActivatedException) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Loads the account root from the ledger.
   *
   * Reads `account_info` only: sequence, reserve, flags, and the XRP balance.
   * Trust lines and MPT holdings stay empty until
   * {@link bindAssetsBalancesFromOnChain}.
   *
   * @param params - Address and network.
   * @param params.accountAddress - XRPL account address.
   * @param params.scope - CAIP-2 network.
   * @param params.ledgerIndex - Ledger to read. Omit to read the validated ledger.
   * @param params.useCache - When true, reuse a cached `account_info` read.
   * @returns Account with native balance and no IOU or MPT entries.
   * @throws {AccountNotActivatedException} When the account is not funded.
   */
  async fetchAccount(params: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
    ledgerIndex?: LedgerState;
    useCache?: boolean;
  }): Promise<OnChainAccount> {
    const { accountAddress, scope, ledgerIndex, useCache = false } = params;
    try {
      const accountInfo = await this.#networkService.fetchAccountInfo(
        accountAddress,
        scope,
        ledgerIndex,
        { cache: useCache },
      );
      const onChainAccount = this.#bindFromOnChain(accountInfo, scope);
      assertSameAddress(accountAddress, onChainAccount.accountId);
      return onChainAccount;
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [AccountNotActivatedException, OnChainAccountException],
        new OnChainAccountException(
          `Failed to load account ${accountAddress} from the network`,
          { cause: error },
        ),
      );
    }
  }

  /**
   * Reads trust lines and MPT holdings onto an account that is already loaded.
   *
   * `'all'` reads every holding. An asset id list reads only those lines.
   * An empty list reads neither. MPT `AssetScale` values come from
   * {@link AssetMetadataService.fetchAndPersistMptAssetMetadata} (AssetsController /
   * snap / token API). Missing scales fail closed.
   *
   * @param onChainAccount - Account root from {@link fetchAccount}. Entries are written onto this object.
   * @param scope - CAIP-2 network.
   * @param assetIds - `'all'`, or the IOU and MPT ids to read.
   * @returns Nothing. Holdings are written onto `onChainAccount`.
   */
  async bindAssetsBalancesFromOnChain(
    onChainAccount: OnChainAccount,
    scope: KnownCaip2ChainId,
    assetIds: KnownCaip19AssetIdOrSlip44Id[] | 'all',
  ): Promise<void> {
    const accountAddress = onChainAccount.accountId;
    const { iouAssetIds, mptAssetIds } =
      assetIds === 'all'
        ? { iouAssetIds: undefined, mptAssetIds: undefined }
        : groupAssetsByType(assetIds);

    try {
      const [trustlines, mptokens] = await Promise.all([
        this.#networkService.fetchAccountTrustlines({
          accountAddress,
          scope,
          assetIds: iouAssetIds,
        }),
        this.#networkService.fetchAccountMptokens({
          accountAddress,
          scope,
          assetIds: mptAssetIds,
        }),
      ]);

      const mptDecimals = await this.#fetchMptDecimals(mptokens, scope);
      this.#setAssetBalances(onChainAccount, scope, {
        trustlines,
        mptokens,
        mptDecimals,
      });
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [OnChainAccountException],
        new OnChainAccountException(
          `Failed to bind on-chain assets balances for account ${onChainAccount.accountId}`,
          { cause: error },
        ),
      );
    }
  }

  /**
   * Loads issuance `AssetScale` for the MPT holdings just read.
   *
   * Uses {@link AssetMetadataService.fetchAndPersistMptAssetMetadata} so
   * AssetsController / snap / token API metadata is reused and newly fetched
   * catalog rows are persisted. An empty holding list does not call the
   * metadata service. A holding whose issuance is missing from those sources
   * fails with {@link OnChainAccountException}.
   *
   * @param mptokens - MPT holdings from `account_mptokens`.
   * @param scope - CAIP-2 network.
   * @returns Issuance scale by MPT asset id. Missing issuances are absent.
   */
  async #fetchMptDecimals(
    mptokens: AccountMptoken[],
    scope: KnownCaip2ChainId,
  ): Promise<Map<KnownCaip19MptAssetId, number>> {
    if (mptokens.length === 0) {
      return new Map();
    }

    const assetIdsSet = new Set(
      mptokens.map((holding) =>
        toCaip19MptAssetId(scope, holding.mpt_issuance_id),
      ),
    );

    const assets =
      await this.#assetMetadataService.fetchAndPersistMptAssetMetadata({
        scope,
        assetIds: Array.from(assetIdsSet),
      });
    const decimalsById = new Map(
      assets.map((asset) => {
        assetIdsSet.delete(asset.assetId);
        return [asset.assetId, asset.units[0].decimals];
      }),
    );

    if (assetIdsSet.size > 0) {
      throw new OnChainAccountException(`MPT issuance scale missing`);
    }
    return decimalsById;
  }

  /**
   * Writes IOU and MPT holdings onto an account that already has its root.
   *
   * @param onChainAccount - Account to update.
   * @param scope - CAIP-2 network used to build asset ids.
   * @param loaded - Trust lines, MPT holdings, and issuance scales.
   */
  #setAssetBalances(
    onChainAccount: OnChainAccount,
    scope: KnownCaip2ChainId,
    loaded: {
      trustlines: TrustLine[];
      mptokens: AccountMptoken[];
      mptDecimals: Map<KnownCaip19MptAssetId, number>;
    },
  ): void {
    for (const line of loaded.trustlines) {
      const assetId = toCaip19IouAssetId(scope, line.currency, line.account);
      const entry = SerializableIouSpendableBalanceStruct.create({
        type: OnChainAssetType.Iou,
        assetId,
        balance: line.balance,
        decimals: IOU_DECIMAL_PLACES,
        limit: line.limit,
        qualityIn: line.quality_in,
        qualityOut: line.quality_out,
        noRipple: line.no_ripple,
        peerAuthorized: line.peer_authorized,
        freeze: line.freeze,
        freezePeer: line.freeze_peer,
      });
      onChainAccount.setAsset(assetId, {
        ...entry,
        balance: new BigNumber(entry.balance),
        limit: new BigNumber(entry.limit),
      });
    }

    for (const holding of loaded.mptokens) {
      const lockedAmount = holding.locked_amount ?? '0';
      const assetId = toCaip19MptAssetId(scope, holding.mpt_issuance_id);
      const decimals = loaded.mptDecimals.get(assetId);
      if (decimals === undefined) {
        continue;
      }
      const unlocked = new BigNumber(holding.mpt_amount).minus(lockedAmount);
      const entry = SerializableMptSpendableBalanceStruct.create({
        type: OnChainAssetType.Mpt,
        assetId,
        mptAmount: holding.mpt_amount,
        lockedAmount,
        balance: holding.mpt_locked === true ? '0' : unlocked.toFixed(0),
        decimals,
        mptAuthorized: holding.mpt_authorized,
        ...(holding.mpt_locked === undefined
          ? {}
          : { mptLocked: holding.mpt_locked }),
      });
      onChainAccount.setAsset(assetId, {
        ...entry,
        mptAmount: new BigNumber(entry.mptAmount),
        lockedAmount: new BigNumber(entry.lockedAmount),
        balance: new BigNumber(entry.balance),
      });
    }
  }

  /**
   * Binds ledger responses into an {@link OnChainAccount}.
   *
   * Converts `account_info` into {@link OnChainAccountSerializableFull},
   * then hydrates the account from that snapshot. Holdings are empty.
   *
   * @param accountInfo - `account_info` response.
   * @param scope - CAIP-2 network the response was read from.
   * @returns Account root with native balance and no IOU or MPT entries.
   */
  #bindFromOnChain(
    accountInfo: AccountInfoResponse,
    scope: KnownCaip2ChainId,
  ): OnChainAccount {
    return OnChainAccount.fromSerializable(
      this.#serializableFromOnChainData(accountInfo, scope),
    );
  }

  /**
   * Maps `account_info` into the snapshot {@link OnChainAccount} binds from.
   *
   * @param accountInfo - `account_info` response.
   * @param scope - CAIP-2 network.
   * @returns Serializable account root. `balances` is empty.
   */
  #serializableFromOnChainData(
    accountInfo: AccountInfoResponse,
    scope: KnownCaip2ChainId,
  ): OnChainAccountSerializableFull {
    const { Account, Balance, Flags, Sequence } = accountInfo.account_data;
    const reserveMeta = reserveMetaFromAccountData(accountInfo.account_data);
    return OnChainAccountSerializableFullStruct.create({
      accountId: Account,
      sequenceNumber: String(Sequence),
      scope,
      meta: {
        ...reserveMeta,
        flags: getEnabledFlags(parseAccountRootFlags(Flags)),
      },
      balances: [],
      rawNativeBalance: Balance,
    });
  }

  /**
   * Path 2: AssetsController → bind.
   *
   * Reads indexed holdings and binds a best-effort account. Native and IOU keep
   * the same shapes as the ledger path (IOU is trust-line metadata). MPT rows
   * only carry spendable (`mpt_amount = spendable`, `locked_amount = 0`).
   *
   * @param keyringAccountId - MetaMask keyring account id.
   * @param accountAddress - XRPL account address for the account header.
   * @param scope - CAIP-2 network.
   * @returns Bound account, or `null` when the controller has no native XRP row.
   * @throws {OnChainAccountException} When holdings cannot be mapped.
   */
  async resolveFromController(
    keyringAccountId: string,
    accountAddress: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount | null> {
    const assets = await this.#assetsService.getAccountAssetsByScope(
      scope,
      keyringAccountId,
    );

    if (assets.length === 0) {
      return null;
    }

    this.#logger.debug('Resolved on-chain account from AssetsController', {
      accountAddress,
      scope,
      assetCount: assets.length,
    });

    try {
      const onChainAccount = this.#bindFromController({
        accountAddress,
        scope,
        assets,
      });
      assertSameAddress(accountAddress, onChainAccount.accountId);
      return onChainAccount;
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
   * Binds AssetsController holdings into an {@link OnChainAccount}.
   *
   * @param params - Account header and controller assets.
   * @param params.accountAddress - XRPL account address.
   * @param params.scope - CAIP-2 network.
   * @param params.assets - Assets held by the account.
   * @returns Bound account.
   */
  #bindFromController({
    accountAddress,
    scope,
    assets,
  }: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
    assets: CoreAsset[];
  }): OnChainAccount {
    return OnChainAccount.fromSerializable(
      this.#mapControllerAssetsToSerializable({
        accountAddress,
        scope,
        assets,
      }),
    );
  }

  /**
   * Maps AssetsController holdings into a full snapshot for {@link OnChainAccount.fromSerializable}.
   *
   * Native: ledger balance + reserve meta derived from `minimumReserveBalance`.
   * IOU: trust-line `limit`. Currency stays inside `assetId`.
   * MPT: spendable only (`mptAmount` and `balance` are the spendable amount, `lockedAmount` is 0).
   *
   * @param params - Account header and controller assets.
   * @param params.accountAddress - XRPL account address.
   * @param params.scope - CAIP-2 network.
   * @param params.assets - Holdings from AssetsController.
   * @returns Full serializable binding.
   */
  #mapControllerAssetsToSerializable({
    accountAddress,
    scope,
    assets,
  }: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
    assets: CoreAsset[];
  }): OnChainAccountSerializableFull {
    const balances: SerializableSpendableBalance[] = [];
    let reserveMeta: ReserveLedgerMeta = {
      ownerCount: 0,
      sponsoringAccountCount: 0,
      sponsoringOwnerCount: 0,
      sponsoredOwnerCount: 0,
      paysOwnBaseReserve: false,
    };
    let rawNativeBalance = '0';

    for (const asset of assets) {
      if (asset.chainId !== scope) {
        continue;
      }

      const assetId = asset.id;

      if (isCoreNativeAsset(asset)) {
        const { decimals } = asset.metadata;
        rawNativeBalance = toSmallestUnit(
          new BigNumber(asset.balance.amount),
          decimals,
        ).toFixed(0);
        reserveMeta = calculateLedgerMetaFromMinReserve(
          asset.balance.metadata.minimumReserveBalance,
        );
        continue;
      }

      if (isCoreIouAsset(asset)) {
        const { limit } = asset.balance.metadata;
        const balance = asset.balance.amount;
        balances.push(
          SerializableIouSpendableBalanceStruct.create({
            type: OnChainAssetType.Iou,
            assetId,
            balance,
            decimals: IOU_DECIMAL_PLACES,
            limit,
          }),
        );
        continue;
      }

      if (isCoreMptAsset(asset)) {
        const { decimals } = asset.metadata;
        const spendable = toSmallestUnit(
          new BigNumber(asset.balance.amount),
          decimals,
        ).toFixed(0);
        balances.push(
          SerializableMptSpendableBalanceStruct.create({
            type: OnChainAssetType.Mpt,
            assetId,
            mptAmount: spendable,
            balance: spendable,
            decimals,
          }),
        );
      }
    }

    return OnChainAccountSerializableFullStruct.create({
      accountId: accountAddress,
      sequenceNumber: '0',
      scope,
      meta: {
        ...reserveMeta,
      },
      balances,
      rawNativeBalance,
    });
  }
}
