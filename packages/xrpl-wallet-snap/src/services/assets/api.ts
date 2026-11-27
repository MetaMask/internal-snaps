import {
  create,
  number,
  optional,
  string,
  type,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import {
  KnownCaip19AssetIdOrSlip44IdStruct,
  KnownCaip19IouAssetStruct,
  KnownCaip19MptAssetStruct,
  KnownCaip19Slip44IdStruct,
  KnownCaip2ChainIdStruct,
  UnSignedNumberStringStruct,
  ValidXrplAmountStruct,
  ValidXrplDropsStruct,
} from '../../api';
import { InvalidCoreAssetException } from './exceptions';

/**
 * Controller `Asset.metadata` fields Xrpl needs from Core.
 * Uses `type` so other catalog fields (`aggregators`, `type`, …) are allowed.
 * Iou issuer is not read from here; parse it from the CAIP-19 `id`.
 */
export const CoreAssetMetadataStruct = type({
  symbol: string(),
  decimals: number(),
  name: optional(string()),
  image: optional(string()),
});

/** Core `Asset.balance` fields shared by all asset types. `amount` is human units. */
export const CoreAssetBalanceStruct = type({
  amount: UnSignedNumberStringStruct,
  metadata: type({
    status: number(),
  }),
});

/**
 * Core `Asset.balance` for slip44: human XRP `amount` plus native keyring
 * metadata (`spendableBalance` / `minimumReserveBalance` are drops).
 */
export const CoreNativeBalanceStruct = type({
  amount: ValidXrplAmountStruct,
  metadata: type({
    spendableBalance: ValidXrplDropsStruct,
    minimumReserveBalance: ValidXrplDropsStruct,
  }),
});

/**
 * Core `Asset.balance` for IOU assets: human `amount` plus trustline
 * metadata. `limit` is a finite, non-negative issued-currency amount string
 * (not XRP drops).
 */
export const CoreIouBalanceStruct = type({
  amount: ValidXrplAmountStruct,
  metadata: type({
    limit: UnSignedNumberStringStruct,
  }),
});

const Slip44CoreAssetStruct = type({
  id: KnownCaip19Slip44IdStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreNativeBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

const IouCoreAssetStruct = type({
  id: KnownCaip19IouAssetStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreIouBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

const MptCoreAssetStruct = type({
  id: KnownCaip19MptAssetStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreAssetBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

/**
 * Xrpl-shaped subset of AssetsController {@link Asset}: `id`, `chainId`,
 * `balance`, and `metadata`. Uses `type` so extra controller fields are allowed.
 */
export const CoreAssetStruct = union([
  Slip44CoreAssetStruct,
  IouCoreAssetStruct,
  MptCoreAssetStruct,
]);

export type CoreAsset = Infer<typeof CoreAssetStruct>;
export type CoreNativeAsset = Infer<typeof Slip44CoreAssetStruct>;
export type CoreIouAsset = Infer<typeof IouCoreAssetStruct>;
export type CoreMptAsset = Infer<typeof MptCoreAssetStruct>;
export type CoreAssetMetadata = Infer<typeof CoreAssetMetadataStruct>;

export function isCoreNativeAsset(asset: CoreAsset): asset is CoreNativeAsset {
  return Slip44CoreAssetStruct.is(asset);
}

export function isCoreIouAsset(asset: CoreAsset): asset is CoreIouAsset {
  return IouCoreAssetStruct.is(asset);
}

export function isCoreMptAsset(asset: CoreAsset): asset is CoreMptAsset {
  return MptCoreAssetStruct.is(asset);
}

/**
 * Core AssetsController row whose `id` is an XRPL CAIP-19 / slip44 asset id.
 * Other chains fail this check and are skipped by {@link parseCoreXrplAsset}.
 */
const XrplCoreAssetIdStruct = type({
  id: KnownCaip19AssetIdOrSlip44IdStruct,
});

/**
 * Validates an XRPL `Asset` into {@link CoreAsset}.
 *
 * @param value - Raw AssetsController asset.
 * @returns The XRPL-shaped asset, or `null` when the payload is not XRPL.
 * @throws {@link InvalidCoreAssetException} When the id is XRPL but the row is invalid.
 */
export function parseCoreXrplAsset(value: unknown): CoreAsset | null {
  if (!XrplCoreAssetIdStruct.is(value)) {
    return null;
  }

  try {
    const asset = create(value, CoreAssetStruct);
    if (!asset.id.startsWith(`${asset.chainId}/`)) {
      throw new Error('Asset ID does not match chain ID');
    }
    return asset;
  } catch (error) {
    throw new InvalidCoreAssetException(
      `${value.id} is not a valid XRPL asset`,
      {
        cause: error,
        data: value,
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
