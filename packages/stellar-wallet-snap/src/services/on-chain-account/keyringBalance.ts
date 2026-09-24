import {
  assign,
  boolean,
  defaulted,
  literal,
  object,
  string,
  union,
  optional,
  number,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { NATIVE_ASSET_SYMBOL, STELLAR_DECIMAL_PLACES } from '../../constants';
import {
  getAssetReference,
  isClassicAssetId,
  isSlip44Id,
  parseClassicAssetCodeIssuer,
  toDisplayBalance,
} from '../../utils';
import type { StellarAssetMetadata } from '../asset-metadata';
import type { SpendableBalance } from './api';

/**
 * Optional metadata for building a default SEP-41 balance entry.
 * Callers should resolve this via {@link AssetMetadataService.resolve}.
 */
export type DefaultBalanceEntryOptions = {
  assetMetadata: Pick<StellarAssetMetadata, 'symbol' | 'units'>;
};

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
        decimal: number(),
      }),
    ),
  }),
);

export const ClassicBalanceEntryStruct = assign(
  StandardBalanceEntryStruct,
  object({
    metadata: optional(
      object({
        limit: string(),
        authorized: defaulted(boolean(), true),
        sponsor: defaulted(string(), ''),
      }),
    ),
  }),
);

export const KeyringBalanceEntryStruct = union([
  NativeBalanceEntryStruct,
  ClassicBalanceEntryStruct,
  StandardBalanceEntryStruct,
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
 * Keyring / sync balance payload for native XLM.
 *
 * `amount` is display units; `spendableBalance` and `minimumReserveBalance` stay in stroops.
 *
 * @param params - Native balance fields in stroops.
 * @param params.nativeBalance - Total native balance in stroops.
 * @param params.spendableBalance - Spendable native balance in stroops.
 * @param params.minimumReserveBalance - Protocol minimum reserve in stroops.
 * @returns Balance change entry for the native asset.
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
      decimal: STELLAR_DECIMAL_PLACES,
    },
  });
}

/**
 * Keyring / sync balance payload for a classic trustline.
 *
 * @param asset - Classic spendable balance entry (visible or tombstone).
 * @returns Balance change entry with classic metadata.
 */
export function toClassicBalanceEntry(
  asset: SpendableBalance,
): KeyringBalanceEntry {
  return ClassicBalanceEntryStruct.create({
    unit: asset.symbol,
    amount: toDisplayBalance(asset.balance, asset.decimals),
    metadata: {
      limit: toDisplayBalance(asset.limit ?? new BigNumber(0), asset.decimals),
      authorized: asset.authorized,
      sponsor: asset.sponsor,
    },
  });
}

/**
 * Keyring / sync balance payload for SEP-41 (and other non-classic) assets.
 *
 * @param asset - Spendable balance entry.
 * @returns Balance change entry without classic/native metadata.
 */
export function toStandardBalanceEntry(
  asset: SpendableBalance,
): KeyringBalanceEntry {
  return StandardBalanceEntryStruct.create({
    unit: asset.symbol,
    amount: toDisplayBalance(asset.balance, asset.decimals),
  });
}

/**
 * Zero balance entry when an asset is missing from the on-chain snapshot
 * (inactive account, tombstone / zero SEP-41, or unknown asset id).
 * 
 * @param assetId - Asset to shape the default for. When omitted, returns the
 *                  native (slip44) zero entry.
 * @param options - Required for SEP-41: resolved asset metadata.
 * @returns Default keyring balance entry for the asset type.
 */
export function getDefaultBalanceEntry(
  assetId?: KnownCaip19AssetIdOrSlip44Id,
  options?: DefaultBalanceEntryOptions,
): KeyringBalanceEntry {
  if (assetId === undefined || isSlip44Id(assetId)) {
    return toNativeBalanceEntry({
      nativeBalance: new BigNumber(0),
      spendableBalance: new BigNumber(0),
      minimumReserveBalance: new BigNumber(0),
    });
  }

  if (isClassicAssetId(assetId)) {
    const { assetCode } = parseClassicAssetCodeIssuer(
      getAssetReference(assetId),
    );
    return toClassicBalanceEntry({
      symbol: assetCode,
      balance: new BigNumber(0),
      decimals: STELLAR_DECIMAL_PLACES,
      limit: new BigNumber(0),
      authorized: false,
      sponsor: '',
    });
  }

  if (options?.assetMetadata === undefined) {
    throw new Error(
      `Asset metadata is required for default SEP-41 balance entry: ${assetId}`,
    );
  }

  const { decimals, symbol } = options.assetMetadata.units[0];
  return toStandardBalanceEntry({
    symbol: options.assetMetadata.symbol || symbol,
    balance: new BigNumber(0),
    decimals,
  });
}
