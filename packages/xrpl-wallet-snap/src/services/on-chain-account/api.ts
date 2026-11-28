import type { Infer } from '@metamask/superstruct';
import {
  array,
  assign,
  boolean,
  defaulted,
  integer,
  literal,
  number,
  object,
  optional,
  record,
  refine,
  string,
  union,
} from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import {
  KnownCaip19IouAssetStruct,
  KnownCaip19MptAssetStruct,
  KnownCaip19Slip44IdStruct,
  KnownCaip2ChainIdStruct,
  SignedNumberStringStruct,
  UnSignedIntegerStringStruct,
  UnSignedNumberStringStruct,
  ValidXrplDropsStruct,
} from '../../api';
import { IOU_DECIMAL_PLACES } from '../../constants';

/**
 * Kind of balance stored on an on-chain account.
 *
 * This is not the CAIP asset namespace (`slip44`, `token`, `xls33`).
 */
export const OnChainAssetType = {
  Native: 'native',
  Iou: 'iou',
  Mpt: 'mpt',
} as const;

export type OnChainAssetType =
  (typeof OnChainAssetType)[keyof typeof OnChainAssetType];

/** Header-only binding: account id, sequence, and network, with no balances or ledger meta. */
export const OnChainAccountBaseDataStruct = object({
  accountId: string(),
  sequenceNumber: string(),
  scope: KnownCaip2ChainIdStruct,
});

export type OnChainAccountBaseData = Infer<typeof OnChainAccountBaseDataStruct>;

/**
 * Native holding. `balance` is the on-ledger total in drops.
 */
export const SerializableNativeBalanceStruct = object({
  type: literal(OnChainAssetType.Native),
  assetId: KnownCaip19Slip44IdStruct,
  balance: ValidXrplDropsStruct,
});

export type SerializableNativeBalance = Infer<
  typeof SerializableNativeBalanceStruct
>;

/**
 * IOU holding. Issuer and currency are inside `assetId`.
 * `balance` is the trust-line balance and the spendable amount.
 */
export const SerializableIouSpendableBalanceStruct = object({
  type: literal(OnChainAssetType.Iou),
  assetId: KnownCaip19IouAssetStruct,
  balance: SignedNumberStringStruct,
  decimals: literal(IOU_DECIMAL_PLACES),
  limit: UnSignedNumberStringStruct,
  qualityIn: defaulted(integer(), 0),
  qualityOut: defaulted(integer(), 0),
  noRipple: optional(boolean()),
  peerAuthorized: optional(boolean()),
  /** This account froze the trust line. */
  freeze: optional(boolean()),
  /** The issuer froze the trust line. */
  freezePeer: optional(boolean()),
});

export type SerializableIouSpendableBalance = Infer<
  typeof SerializableIouSpendableBalanceStruct
>;

/**
 * MPT holding. `mptAmount` and `lockedAmount` are both stored.
 * `balance` is `mptAmount - lockedAmount`, or `0` when `mptLocked` is true.
 * `decimals` is the issuance `AssetScale`.
 * `mptLocked` is the issuer freeze (`mpt_locked`). The holder still holds
 * `mptAmount`, but none of it can be sent.
 */
export const SerializableMptSpendableBalanceStruct = refine(
  object({
    type: literal(OnChainAssetType.Mpt),
    assetId: KnownCaip19MptAssetStruct,
    mptAmount: defaulted(UnSignedIntegerStringStruct, '0'),
    lockedAmount: defaulted(UnSignedIntegerStringStruct, '0'),
    balance: string(),
    decimals: integer(),
    mptAuthorized: optional(boolean()),
    mptLocked: optional(boolean()),
  }),
  'mpt_spendable_balance',
  (value) => {
    const unlocked = new BigNumber(value.mptAmount).minus(value.lockedAmount);
    if (unlocked.isNegative()) {
      return 'MPT locked_amount exceeds mpt_amount';
    }
    const spendable = value.mptLocked === true ? new BigNumber(0) : unlocked;
    if (
      !UnSignedIntegerStringStruct.is(value.balance) ||
      !spendable.eq(value.balance)
    ) {
      return 'MPT balance must be the spendable amount';
    }
    return true;
  },
);

export type SerializableMptSpendableBalance = Infer<
  typeof SerializableMptSpendableBalanceStruct
>;

/**
 * JSON-safe asset entries. Native `balance` is raw ledger drops (not spendable).
 * IOU amounts stay decimal strings. MPT amounts stay integer strings; MPT
 * `balance` is the spendable amount.
 */
export const SerializableSpendableBalanceStruct = union([
  SerializableNativeBalanceStruct,
  SerializableIouSpendableBalanceStruct,
  SerializableMptSpendableBalanceStruct,
]);

export type SerializableSpendableBalance = Infer<
  typeof SerializableSpendableBalanceStruct
>;

/**
 * Full binding: reserve meta, asset entries, and the on-ledger XRP total in drops.
 */
export const OnChainAccountSerializableFullStruct = assign(
  OnChainAccountBaseDataStruct,
  object({
    meta: object({
      ownerCount: number(),
      sponsoringAccountCount: number(),
      sponsoringOwnerCount: number(),
      sponsoredOwnerCount: number(),
      paysOwnBaseReserve: boolean(),
      flags: optional(record(string(), boolean())),
    }),
    balances: array(SerializableSpendableBalanceStruct),
    rawNativeBalance: ValidXrplDropsStruct,
  }),
);

export type OnChainAccountSerializableFull = Infer<
  typeof OnChainAccountSerializableFullStruct
>;

/** Minimal header or validated full snapshot. Partial shapes are rejected at bind time. */
export type OnChainAccountSerializable =
  | OnChainAccountBaseData
  | OnChainAccountSerializableFull;

/**
 * XRP holding kept in memory.
 * Same shape as {@link SerializableNativeBalance}, with `balance` as a {@link BigNumber}.
 * `balance` is the raw on-ledger total in drops (not spendable after reserve).
 */
export type NativeAssetBalance = Omit<SerializableNativeBalance, 'balance'> & {
  balance: BigNumber;
};

/**
 * Trust-line holding kept in memory.
 * Same shape as {@link SerializableIouSpendableBalance}.
 * `balance` and `limit` are {@link BigNumber}s.
 */
export type IouAssetBalance = Omit<
  SerializableIouSpendableBalance,
  'balance' | 'limit'
> & {
  balance: BigNumber;
  limit: BigNumber;
};

/**
 * MPT holding kept in memory.
 * Same shape as {@link SerializableMptSpendableBalance}.
 * `mptAmount`, `lockedAmount`, and `balance` are {@link BigNumber}s.
 */
export type MptAssetBalance = Omit<
  SerializableMptSpendableBalance,
  'mptAmount' | 'lockedAmount' | 'balance'
> & {
  mptAmount: BigNumber;
  lockedAmount: BigNumber;
  balance: BigNumber;
};

/** Per-asset entry stored on {@link OnChainAccount}. */
export type SpendableBalance =
  | NativeAssetBalance
  | IouAssetBalance
  | MptAssetBalance;
