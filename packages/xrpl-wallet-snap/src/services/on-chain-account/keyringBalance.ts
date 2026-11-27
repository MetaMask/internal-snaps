import type { Infer } from '@metamask/superstruct';
import {
  assign,
  defaulted,
  literal,
  number,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { IOU_DECIMAL_PLACES, NATIVE_ASSET_SYMBOL } from '../../constants';
import {
  parseIouAsset,
  parseMptIssuanceId,
  removeTrailingZeros,
  toDisplayBalance,
} from '../../utils';
import type { IouAssetBalance, MptAssetBalance } from './api';

/**
 * Bit flags for MPT keyring `metadata.status`.
 *
 * - `0` (`Inactive`) — holder has not opted in; no holder object exists.
 * - `1` (`HolderOptedIn`) — holder opted in; issuer-authorization bit not set.
 *   If issuer auth is required this is awaiting authorization; otherwise no
 *   issuer approval is needed.
 * - `3` (`HolderOptedIn | IssuerAuthorized`) — opted in and issuer-authorized.
 */
export const MptHolderStatus = {
  Inactive: 0,
  HolderOptedIn: 1 << 0,
  IssuerAuthorized: 1 << 1,
} as const;

export type MptHolderStatus =
  (typeof MptHolderStatus)[keyof typeof MptHolderStatus];

export const StandardBalanceEntryStruct = object({
  unit: string(),
  amount: string(),
});

export const NativeBalanceEntryStruct = assign(
  StandardBalanceEntryStruct,
  object({
    unit: defaulted(literal(NATIVE_ASSET_SYMBOL), NATIVE_ASSET_SYMBOL),
    metadata: optional(
      object({
        spendableBalance: string(),
        minimumReserveBalance: string(),
      }),
    ),
  }),
);

export const IouBalanceEntryStruct = assign(
  StandardBalanceEntryStruct,
  object({
    metadata: optional(
      object({
        limit: string(),
      }),
    ),
  }),
);

export const MptBalanceEntryStruct = assign(
  StandardBalanceEntryStruct,
  object({
    metadata: optional(
      object({
        /**
         * Bitmask of {@link MptHolderStatus}.
         * Defaults to `0` (inactive / no holder object).
         * `1` = opted in; `3` = opted in and issuer-authorized.
         * Issuer freeze (`mpt_locked`) zeroes the spendable amount and does
         * not change this status.
         */
        status: defaulted(number(), MptHolderStatus.Inactive),
      }),
    ),
  }),
);

export const KeyringBalanceEntryStruct = union([
  NativeBalanceEntryStruct,
  IouBalanceEntryStruct,
  MptBalanceEntryStruct,
]);

/**
 * Keyring balance entry for a given asset.
 */
export type KeyringBalanceEntry = Infer<typeof KeyringBalanceEntryStruct>;

/**
 * Keyring balance by asset id.
 */
export type KeyringBalanceByAssetId = Record<
  KnownCaip19AssetIdOrSlip44Id,
  KeyringBalanceEntry
>;

/**
 * Formats an IOU amount that the ledger already stores in currency units.
 *
 * @param amount - Trust-line balance or limit.
 * @returns Decimal string with at most {@link IOU_DECIMAL_PLACES} fractional digits.
 */
function formatIouAmount(amount: BigNumber): string {
  return removeTrailingZeros(amount.toFixed(IOU_DECIMAL_PLACES));
}

/**
 * Builds the MPT keyring status bitmask from a stored holding.
 *
 * A stored MPT entry means the holder object exists, so this always sets
 * {@link MptHolderStatus.HolderOptedIn} (`1`). {@link MptHolderStatus.IssuerAuthorized}
 * is added when `mptAuthorized` is true (`3`). Status `0` (inactive) is only
 * for the absence of a holder object — not returned here.
 *
 * @param asset - MPT balance stored on the account.
 * @returns `1` or `3` for keyring `metadata.status`.
 */
export function mptHolderStatusFromBalance(asset: MptAssetBalance): number {
  let status: number = MptHolderStatus.HolderOptedIn;
  if (asset.mptAuthorized === true) {
    status |= MptHolderStatus.IssuerAuthorized;
  }
  return status;
}

/**
 * Keyring balance payload for native XRP.
 *
 * `amount` is display units. `spendableBalance` and `minimumReserveBalance` stay in drops.
 *
 * @param params - Native balance fields in drops.
 * @param params.nativeBalance - Total native balance in drops.
 * @param params.spendableBalance - Spendable native balance in drops.
 * @param params.minimumReserveBalance - Protocol minimum reserve in drops.
 * @returns Balance entry for the native asset.
 */
export function toNativeBalanceEntry(params: {
  nativeBalance: BigNumber;
  spendableBalance: BigNumber;
  minimumReserveBalance: BigNumber;
}): KeyringBalanceEntry {
  return NativeBalanceEntryStruct.create({
    amount: toDisplayBalance(params.nativeBalance),
    metadata: {
      spendableBalance: params.spendableBalance.toFixed(0),
      minimumReserveBalance: params.minimumReserveBalance.toFixed(0),
    },
  });
}

/**
 * Keyring balance payload for an IOU trust line.
 *
 * The unit is the currency code. The amount is a display string with trailing
 * zeros removed, using at most {@link IOU_DECIMAL_PLACES} fractional digits.
 *
 * @param asset - IOU balance stored on the account.
 * @returns Balance entry for that trust line.
 */
export function toIouBalanceEntry(asset: IouAssetBalance): KeyringBalanceEntry {
  const { assetCode } = parseIouAsset(asset.assetId);
  return IouBalanceEntryStruct.create({
    unit: assetCode,
    amount: formatIouAmount(asset.balance),
    metadata: {
      limit: formatIouAmount(asset.limit),
    },
  });
}

/**
 * Keyring balance payload for an MPT holding.
 *
 * The unit is the issuance id. Decimals are the issuance `AssetScale` stored on the balance.
 * `metadata.status` is a {@link MptHolderStatus} bitmask from the holding
 * (`HolderOptedIn`, plus `IssuerAuthorized` when `mptAuthorized` is true).
 * An issuer freeze is `mptLocked` on the account balance and shows up as a
 * zero spendable amount, not as a different status.
 *
 * @param asset - MPT balance stored on the account, in smallest units.
 * @returns Balance entry for that MPT.
 * @example
 * Holder opted in; issuer authorization has not been granted:
 * ```json
 * {
 *   "amount": "1.23",
 *   "metadata": { "status": 1 }
 * }
 * ```
 */
export function toMptBalanceEntry(asset: MptAssetBalance): KeyringBalanceEntry {
  return MptBalanceEntryStruct.create({
    unit: parseMptIssuanceId(asset.assetId),
    amount: toDisplayBalance(asset.balance, asset.decimals),
    metadata: {
      status: mptHolderStatusFromBalance(asset),
    },
  });
}

/**
 * Zero native balance entry for an account that is not on the ledger.
 *
 * @returns Default native balance entry.
 */
export function getDefaultBalanceEntry(): KeyringBalanceEntry {
  return toNativeBalanceEntry({
    nativeBalance: new BigNumber(0),
    spendableBalance: new BigNumber(0),
    minimumReserveBalance: new BigNumber(0),
  });
}
