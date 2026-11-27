import { BigNumber } from 'bignumber.js';
import type { LedgerEntry } from 'xrpl';

import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip2ChainId,
} from '../../api';
import { getSlip44AssetId, isIouAssetId, isMptId } from '../../utils';
import type {
  IouAssetBalance,
  MptAssetBalance,
  OnChainAccountSerializable,
  OnChainAccountSerializableFull,
  SerializableSpendableBalance,
  SpendableBalance,
} from './api';
import {
  OnChainAccountBaseDataStruct,
  OnChainAccountSerializableFullStruct,
  OnChainAssetType,
  SerializableIouSpendableBalanceStruct,
  SerializableMptSpendableBalanceStruct,
  SerializableNativeSpendableBalanceStruct,
} from './api';
import {
  OnChainAccountBalanceNotAvailableException,
  OnChainAccountException,
  OnChainAccountMetadataNotAvailableException,
} from './exceptions';
import {
  calculateSpendableBalance,
  getEnabledFlags,
  minimumBalanceDrops,
} from './utils';
import type { ReserveLedgerMeta } from './utils';

/** AccountRoot flags. Only enabled `lsf*` keys are set. */
export type XrplAccountFlags = LedgerEntry.AccountRootFlagsInterface;

/**
 * XRPL account bound from {@link OnChainAccountSerializable}.
 *
 * A snapshot is either minimal (`accountId`, `sequenceNumber`, `scope`) or full
 * (reserve meta, flags, XRP balance, trust lines, and MPT holdings).
 * Build a full account with {@link OnChainAccount.fromSerializable}.
 */
export class OnChainAccount {
  readonly #accountId: string;

  readonly #sequenceNumber: string;

  readonly #scope: KnownCaip2ChainId;

  #reserveMeta: ReserveLedgerMeta | undefined;

  #flags: XrplAccountFlags | undefined;

  #rawNativeBalance: BigNumber | undefined;

  readonly #balances: Map<KnownCaip19AssetIdOrSlip44Id, SpendableBalance> =
    new Map();

  /**
   * @param base - XRPL account address, sequence, and CAIP-2 network.
   * @param binding - Minimal or full snapshot. Header fields must match the snapshot.
   */
  constructor(
    base: {
      accountId: string;
      sequenceNumber: string;
      scope: KnownCaip2ChainId;
    },
    binding?: OnChainAccountSerializable,
  ) {
    this.#accountId = base.accountId;
    this.#sequenceNumber = base.sequenceNumber;
    this.#scope = base.scope;

    if (binding === undefined) {
      return;
    }

    if (
      binding.scope !== base.scope ||
      binding.accountId !== base.accountId ||
      binding.sequenceNumber !== base.sequenceNumber
    ) {
      throw new OnChainAccountException(
        'Binding account id, sequence, and scope must match the account header',
      );
    }
    this.#bindFromSerializable(binding);
  }

  get accountId(): string {
    return this.#accountId;
  }

  get sequenceNumber(): string {
    return this.#sequenceNumber;
  }

  get scope(): KnownCaip2ChainId {
    return this.#scope;
  }

  get ownerCount(): number {
    return this.#requireReserveMeta().ownerCount;
  }

  /**
   * Accounts whose base reserve this account pays.
   *
   * Zero when `account_info` omits the field.
   *
   * @returns Sponsored account count.
   */
  get sponsoringAccountCount(): number {
    return this.#requireReserveMeta().sponsoringAccountCount;
  }

  /**
   * Objects this account sponsors for others.
   *
   * Zero when `account_info` omits the field.
   *
   * @returns Sponsored owner count.
   */
  get sponsoringOwnerCount(): number {
    return this.#requireReserveMeta().sponsoringOwnerCount;
  }

  /**
   * Objects this account owns that another account sponsors.
   *
   * Zero when omitted.
   *
   * @returns Sponsored owner count for this account.
   */
  get sponsoredOwnerCount(): number {
    return this.#requireReserveMeta().sponsoredOwnerCount;
  }

  /**
   * Whether this account pays its own 1 XRP base reserve.
   *
   * True when `account_data.Sponsor` is omitted.
   *
   * @returns `true` when this account pays its base reserve.
   */
  get paysOwnBaseReserve(): boolean {
    return this.#requireReserveMeta().paysOwnBaseReserve;
  }

  #requireReserveMeta(): ReserveLedgerMeta {
    if (this.#reserveMeta !== undefined) {
      return this.#reserveMeta;
    }
    throw new OnChainAccountMetadataNotAvailableException();
  }

  /**
   * AccountRoot flags. Empty until the account is fully bound.
   *
   * @returns Enabled `lsf*` flags stored on the snapshot.
   */
  get flags(): XrplAccountFlags {
    return this.#flags ?? {};
  }

  /**
   * Xrpl minimum native balance (drops).
   *
   * @returns Minimum balance in drops.
   * @throws {OnChainAccountMetadataNotAvailableException} When ledger meta is unbound.
   */
  get minimumReserveBalance(): BigNumber {
    return minimumBalanceDrops(this.#requireReserveMeta());
  }

  /**
   * Whether inbound payments must set a destination tag.
   *
   * This is AccountRoot `lsfRequireDestTag`.
   *
   * @returns `true` when the account requires a destination tag.
   */
  get requireDestTag(): boolean {
    return this.flags.lsfRequireDestTag === true;
  }

  /**
   * Every asset id in the inventory map, including cleared IOU entries
   * (`limit` and `balance` both zero).
   *
   * @returns Native, IOU, and MPT ids stored on this account.
   */
  get rawAssetIds(): KnownCaip19AssetIdOrSlip44Id[] {
    return Array.from(this.#balances.keys());
  }

  /**
   * Asset ids that pass the same visibility rules as {@link getAsset}.
   *
   * @returns Visible asset ids for keyring asset listing.
   */
  get assetIds(): KnownCaip19AssetIdOrSlip44Id[] {
    return Array.from(this.#balances.keys()).filter((assetId) => {
      return this.#getVisibleAsset(assetId) !== undefined;
    });
  }

  /**
   * XRP available to spend after the account reserve, in drops.
   *
   * Computed from {@link nativeRawBalance} and {@link minimumReserveBalance}.
   *
   * @returns Spendable balance in drops.
   * @throws {OnChainAccountBalanceNotAvailableException} When the native balance is not bound.
   * @throws {OnChainAccountMetadataNotAvailableException} When ledger meta is unbound.
   */
  get nativeSpendableBalance(): BigNumber {
    return calculateSpendableBalance({
      nativeBalance: this.nativeRawBalance,
      ...this.#requireReserveMeta(),
    });
  }

  /**
   * Total native (XRP) balance on the ledger in drops (`account_data.Balance`).
   *
   * @returns Total native balance in drops.
   * @throws {OnChainAccountBalanceNotAvailableException} When native raw total is not bound.
   */
  get nativeRawBalance(): BigNumber {
    const nativeId = getSlip44AssetId(this.#scope);
    if (this.#rawNativeBalance === undefined) {
      throw new OnChainAccountBalanceNotAvailableException(nativeId);
    }
    return this.#rawNativeBalance;
  }

  /**
   * Whether the asset is visible for keyring and client flows.
   *
   * A native entry is visible when stored. An IOU entry is hidden only when
   * both `limit` and `balance` are zero. An MPT entry is visible when stored.
   *
   * @param assetId - The asset id to check.
   * @returns `true` when {@link getAsset} would return an entry.
   */
  hasAsset(assetId: KnownCaip19AssetIdOrSlip44Id): boolean {
    return this.getAsset(assetId) !== undefined;
  }

  /**
   * Visible asset entry for keyring, sends, and trust-line UX.
   *
   * A native entry is returned when stored. An IOU entry is returned unless
   * both `limit` and `balance` are zero (cleared / fully removed line). An MPT
   * entry is returned when stored. Empty lines with `limit > 0` stay visible
   * so opt-out and redundant opt-in checks can see them.
   *
   * @param assetId - The asset id to look up.
   * @returns A shallow copy of the entry, or `undefined` when the asset is not visible.
   */
  getAsset(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): SpendableBalance | undefined {
    return this.#getVisibleAsset(assetId);
  }

  /**
   * Stored asset entry, with no visibility filter.
   *
   * Pairs with {@link rawAssetIds}. Includes cleared IOU entries (`limit` and
   * `balance` both zero) that {@link getAsset} omits.
   *
   * @param assetId - The asset id to look up.
   * @returns A shallow copy of the entry, or `undefined` when nothing is stored for the id.
   */
  getRawAsset(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): SpendableBalance | undefined {
    const entry = this.#balances.get(assetId);
    if (entry === undefined) {
      return undefined;
    }
    return { ...entry };
  }

  #getVisibleAsset(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): SpendableBalance | undefined {
    const entry = this.#balances.get(assetId);
    if (entry === undefined) {
      return undefined;
    }

    if (
      entry.type === OnChainAssetType.Native ||
      entry.type === OnChainAssetType.Mpt
    ) {
      return { ...entry };
    }

    if (
      entry.type === OnChainAssetType.Iou &&
      !(entry.limit.isZero() && entry.balance.isZero())
    ) {
      return { ...entry };
    }

    return undefined;
  }

  /**
   * Sets or replaces an IOU or MPT entry.
   *
   * An IOU entry may have `limit` 0.
   *
   * @param assetId - IOU or MPT CAIP-19 id.
   * @param assetEntry - Entry stored in the inventory map. `type` must match `assetId`.
   */
  setAsset(
    assetId: KnownCaip19MptAssetId | KnownCaip19IouAssetId,
    assetEntry: IouAssetBalance | MptAssetBalance,
  ): void {
    const matchesIou =
      isIouAssetId(assetId) && assetEntry.type === OnChainAssetType.Iou;
    const matchesMpt =
      isMptId(assetId) && assetEntry.type === OnChainAssetType.Mpt;
    if (!matchesIou && !matchesMpt) {
      throw new OnChainAccountException(
        `Asset entry does not match asset id ${assetId}`,
      );
    }
    this.#balances.set(assetId, assetEntry);
  }

  /**
   * Full snapshot of a fully bound account.
   *
   * @returns Serializable account, reserve meta, and asset entries.
   * @throws {OnChainAccountException} When reserve meta or the native balance is unbound.
   */
  toSerializable(): OnChainAccountSerializable {
    const reserveMeta = this.#reserveMeta;
    if (reserveMeta === undefined || this.#rawNativeBalance === undefined) {
      throw new OnChainAccountException('Account is not fully hydrated');
    }

    const balances: SerializableSpendableBalance[] = [];
    for (const [assetId, entry] of this.#balances) {
      if (entry.type === OnChainAssetType.Native) {
        balances.push(
          SerializableNativeSpendableBalanceStruct.create({
            type: OnChainAssetType.Native,
            assetId: entry.assetId,
            balance: entry.balance.toFixed(0),
          }),
        );
        continue;
      }
      if (entry.type === OnChainAssetType.Iou && isIouAssetId(assetId)) {
        balances.push(
          SerializableIouSpendableBalanceStruct.create({
            type: OnChainAssetType.Iou,
            assetId,
            balance: entry.balance.toString(),
            decimals: entry.decimals,
            limit: entry.limit.toString(),
            qualityIn: entry.qualityIn,
            qualityOut: entry.qualityOut,
            noRipple: entry.noRipple,
            peerAuthorized: entry.peerAuthorized,
            freeze: entry.freeze,
            freezePeer: entry.freezePeer,
          }),
        );
        continue;
      }
      if (entry.type !== OnChainAssetType.Mpt || !isMptId(assetId)) {
        throw new OnChainAccountException(`Asset id not supported: ${assetId}`);
      }
      balances.push(
        SerializableMptSpendableBalanceStruct.create({
          type: OnChainAssetType.Mpt,
          assetId,
          mptAmount: entry.mptAmount.toFixed(0),
          lockedAmount: entry.lockedAmount.toFixed(0),
          balance: entry.balance.toFixed(0),
          decimals: entry.decimals,
          mptAuthorized: entry.mptAuthorized,
          ...(entry.mptLocked === undefined
            ? {}
            : { mptLocked: entry.mptLocked }),
        }),
      );
    }

    return {
      accountId: this.accountId,
      sequenceNumber: this.sequenceNumber,
      scope: this.#scope,
      meta: {
        ...reserveMeta,
        flags: getEnabledFlags(this.#flags),
      },
      balances,
      rawNativeBalance: this.#rawNativeBalance.toFixed(0),
    };
  }

  /**
   * Full snapshot, rejected when the account is only a header.
   *
   * @returns Serializable account, reserve meta, and asset entries.
   * @throws {OnChainAccountException} When the account is not fully hydrated.
   */
  toSerializableFull(): OnChainAccountSerializableFull {
    const serialized = this.toSerializable();
    if (!OnChainAccountSerializableFullStruct.is(serialized)) {
      throw new OnChainAccountException('Account is not fully hydrated');
    }
    return serialized;
  }

  /**
   * Rehydrates from {@link OnChainAccountSerializable} (minimal or full).
   *
   * @param data - Minimal header or full snapshot.
   * @returns Bound {@link OnChainAccount}.
   * @throws {@link OnChainAccountException} When the payload is neither minimal nor full.
   */
  static fromSerializable(data: OnChainAccountSerializable): OnChainAccount {
    return new OnChainAccount(
      {
        accountId: data.accountId,
        sequenceNumber: data.sequenceNumber,
        scope: data.scope,
      },
      data,
    );
  }

  #bindFromSerializable(data: OnChainAccountSerializable): void {
    if (OnChainAccountSerializableFullStruct.is(data)) {
      const { meta, balances: assetEntries } = data;

      this.#reserveMeta = {
        ownerCount: meta.ownerCount,
        sponsoringAccountCount: meta.sponsoringAccountCount,
        sponsoringOwnerCount: meta.sponsoringOwnerCount,
        sponsoredOwnerCount: meta.sponsoredOwnerCount,
        paysOwnBaseReserve: meta.paysOwnBaseReserve,
      };

      this.#flags = meta.flags ?? {};

      this.#rawNativeBalance = new BigNumber(data.rawNativeBalance);
      this.#balances.set(getSlip44AssetId(this.#scope), {
        type: OnChainAssetType.Native,
        assetId: getSlip44AssetId(this.#scope),
        balance: this.#rawNativeBalance,
      });

      assetEntries.forEach((assetEntry) => {
        if (SerializableNativeSpendableBalanceStruct.is(assetEntry)) {
          return;
        }

        if (this.#balances.has(assetEntry.assetId)) {
          throw new OnChainAccountException(
            'Asset id already exists in the balances map',
          );
        }

        if (SerializableIouSpendableBalanceStruct.is(assetEntry)) {
          this.#balances.set(assetEntry.assetId, {
            ...assetEntry,
            balance: new BigNumber(assetEntry.balance),
            limit: new BigNumber(assetEntry.limit),
          });
          return;
        }

        if (SerializableMptSpendableBalanceStruct.is(assetEntry)) {
          this.#balances.set(assetEntry.assetId, {
            ...assetEntry,
            mptAmount: new BigNumber(assetEntry.mptAmount),
            lockedAmount: new BigNumber(assetEntry.lockedAmount),
            balance: new BigNumber(assetEntry.balance),
          });
          return;
        }

        throw new OnChainAccountException('Unsupported asset entry');
      });
      return;
    }

    if (!OnChainAccountBaseDataStruct.is(data)) {
      throw new OnChainAccountException(
        'Binding must be minimal (accountId, sequenceNumber, scope only) or full (meta, balances, rawNativeBalance)',
      );
    }
  }
}
