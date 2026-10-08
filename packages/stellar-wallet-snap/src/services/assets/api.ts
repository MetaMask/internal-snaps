import {
  boolean,
  create,
  defaulted,
  number,
  optional,
  string,
  type,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { ensureError } from '@metamask/utils';

import {
  KnownCaip19AssetIdOrSlip44IdStruct,
  KnownCaip19ClassicAssetStruct,
  KnownCaip19Sep41AssetStruct,
  KnownCaip19Slip44IdStruct,
  KnownCaip2ChainIdStruct,
  ValidAmountStruct,
  ValidStellarAmountStruct,
  ValidStellarInt64Struct,
} from '../../api';
import { InvalidCoreAssetException } from './exceptions';

/**
 * Controller `Asset.metadata` fields Stellar needs from Core.
 * Uses `type` so other catalog fields (`aggregators`, `type`, …) are allowed.
 * Classic issuer is not read from here; parse it from the CAIP-19 `id`.
 */
export const CoreAssetMetadataStruct = type({
  symbol: string(),
  decimals: number(),
  name: optional(string()),
  image: optional(string()),
});

/** Core `Asset.balance` fields shared by all asset types. `amount` is human units. */
export const CoreAssetBalanceStruct = type({
  amount: ValidAmountStruct,
});

/**
 * Core `Asset.balance` for slip44: human XLM `amount` plus native keyring
 * metadata (`spendableBalance` / `minimumReserveBalance` are stroops).
 */
export const CoreNativeBalanceStruct = type({
  amount: ValidStellarAmountStruct,
  metadata: type({
    spendableBalance: ValidStellarInt64Struct,
    minimumReserveBalance: ValidStellarInt64Struct,
    // **DEPRECATED:** Accounts API has deprecated the decimal field.
    // Please don't use it in new code.
    decimal: optional(number()),
  }),
});

/**
 * Core `Asset.balance` for classic assets: human `amount` plus trustline
 * metadata (`limit` is unscaled int64 stroops).
 */
export const CoreClassicBalanceStruct = type({
  amount: ValidStellarAmountStruct,
  metadata: type({
    limit: ValidStellarInt64Struct,
    authorized: defaulted(boolean(), true),
    sponsored: defaulted(boolean(), false),
  }),
});

const Slip44CoreAssetStruct = type({
  id: KnownCaip19Slip44IdStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreNativeBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

const ClassicCoreAssetStruct = type({
  id: KnownCaip19ClassicAssetStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreClassicBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

const Sep41CoreAssetStruct = type({
  id: KnownCaip19Sep41AssetStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreAssetBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

/**
 * Stellar-shaped subset of AssetsController {@link Asset}: `id`, `chainId`,
 * `balance`, and `metadata`. Uses `type` so extra controller fields are allowed.
 */
export const CoreAssetStruct = union([
  Slip44CoreAssetStruct,
  ClassicCoreAssetStruct,
  Sep41CoreAssetStruct,
]);

export type CoreAsset = Infer<typeof CoreAssetStruct>;
export type CoreNativeAsset = Infer<typeof Slip44CoreAssetStruct>;
export type CoreClassicAsset = Infer<typeof ClassicCoreAssetStruct>;
export type CoreSep41Asset = Infer<typeof Sep41CoreAssetStruct>;
export type CoreAssetMetadata = Infer<typeof CoreAssetMetadataStruct>;

export function isCoreNativeAsset(asset: CoreAsset): asset is CoreNativeAsset {
  return Slip44CoreAssetStruct.is(asset);
}

export function isCoreClassicAsset(
  asset: CoreAsset,
): asset is CoreClassicAsset {
  return ClassicCoreAssetStruct.is(asset);
}

export function isCoreSep41Asset(asset: CoreAsset): asset is CoreSep41Asset {
  return Sep41CoreAssetStruct.is(asset);
}

/**
 * A Core row whose CAIP-19 id is Stellar. Other chains are skipped; a Stellar
 * id with an invalid body is a parse error.
 *
 * @param value - Raw AssetsController asset.
 * @returns Whether `value` has a Stellar asset id.
 */
const StellarCoreAssetIdStruct = type({
  id: KnownCaip19AssetIdOrSlip44IdStruct,
});

/**
 * Validates a Stellar `Asset` into {@link CoreAsset}.
 *
 * @param value - Raw AssetsController asset.
 * @returns The Stellar-shaped asset, or `null` when the payload is not Stellar.
 * @throws {@link InvalidCoreAssetException} When the id is Stellar but the row is invalid.
 */
export function parseCoreStellarAsset(value: unknown): CoreAsset | null {
  if (!StellarCoreAssetIdStruct.is(value)) {
    return null;
  }

  try {
    return create(value, CoreAssetStruct);
  } catch (error) {
    throw new InvalidCoreAssetException(
      `${value.id} is not a valid Stellar asset`,
      {
        cause: error,
      },
    );
  }
}

/**
 * Validates a Core `Asset.metadata` into {@link CoreAssetMetadata}.
 *
 * @param value - Raw AssetsController asset metadata.
 * @returns The asset metadata, or `null` when the payload is not valid.
 */
export function parseCoreAssetMetadata(
  value: unknown,
): CoreAssetMetadata | null {
  try {
    return create(value, CoreAssetMetadataStruct);
  } catch {
    return null;
  }
}
