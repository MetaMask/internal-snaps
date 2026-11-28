import { buildUrl } from '@metamask/snap-networks-utils';
import type { NonEmptyArray } from '@metamask/utils';

import type {
  KnownCaip2ChainId,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip19Slip44Id,
  KnownCaip19AssetId,
} from '../../api';
import { AssetType } from '../../api';
import { AppConfig } from '../../config';
import {
  NATIVE_ASSET_NAME,
  NATIVE_ASSET_SYMBOL,
  XRPL_DECIMAL_PLACES,
} from '../../constants';
import {
  denormalizeCurrencyCode,
  getSlip44AssetId,
  getXrplAssetChainId,
  isIouAssetId,
  isMptId,
  isSlip44Id,
  parseIouAsset,
  parseMptIssuanceId,
} from '../../utils';
import type {
  AssetUnit,
  IouXrplAssetMetadata,
  NativeXrplAssetMetadata,
  MptXrplAssetMetadata,
  XrplAssetMetadata,
} from './api';

type ToXrplAssetMetadataInput<TAssetId extends KnownCaip19AssetIdOrSlip44Id> = {
  assetId: TAssetId;
  decimals: number;
  symbol?: string;
  name?: string;
  iconUrl?: string;
};

/**
 * Returns the icon URL for a given asset ID.
 *
 * @param assetId - The asset ID.
 * @returns The icon URL.
 */
export function getIconUrl(assetId: KnownCaip19AssetIdOrSlip44Id): string {
  return buildUrl({
    baseUrl: AppConfig.api.staticApi.baseUrl,
    path: '/api/v2/tokenIcons/assets/{assetId}.png',
    pathParams: {
      assetId: assetId.replace(/:/gu, '/'),
    },
    encodePathParams: false,
  });
}

/**
 * Display label when `name` / `symbol` are omitted.
 *
 * IOU: currency code, with 160-bit hex decoded to ASCII.
 * MPT: issuance id from the CAIP-19 reference.
 * Native: XRP symbol.
 *
 * @param assetId - CAIP-19 asset id.
 * @returns Fallback name and symbol string.
 */
export function fallbackDisplayLabel(
  assetId: KnownCaip19AssetIdOrSlip44Id,
): string {
  if (isIouAssetId(assetId)) {
    return denormalizeCurrencyCode(parseIouAsset(assetId).assetCode);
  }
  if (isMptId(assetId)) {
    return parseMptIssuanceId(assetId);
  }
  return NATIVE_ASSET_SYMBOL;
}

/**
 * Maps token API / controller / ledger fields into {@link XrplAssetMetadata}.
 *
 * When `symbol` or `name` is omitted, falls back via {@link fallbackDisplayLabel}.
 * When only `name` is omitted, it defaults to the resolved symbol.
 *
 * @param assetData - Raw asset row from the token API or equivalent.
 * @param assetData.assetId - CAIP-19 asset id.
 * @param assetData.decimals - Smallest-unit decimal count for the primary unit.
 * @param assetData.symbol - Optional ticker; falls back from `assetId` when omitted.
 * @param assetData.name - Optional long name; defaults to the resolved symbol when omitted.
 * @param assetData.iconUrl - Optional icon URL; defaults to the static token icon URL.
 * @returns Cached metadata including icon URL and units. The variant follows `assetId`.
 */
export function toXrplAssetMetadata(
  assetData: ToXrplAssetMetadataInput<KnownCaip19MptAssetId>,
): MptXrplAssetMetadata;
export function toXrplAssetMetadata(
  assetData: ToXrplAssetMetadataInput<KnownCaip19IouAssetId>,
): IouXrplAssetMetadata;
export function toXrplAssetMetadata(
  assetData: ToXrplAssetMetadataInput<KnownCaip19Slip44Id>,
): NativeXrplAssetMetadata;
export function toXrplAssetMetadata(
  assetData: ToXrplAssetMetadataInput<KnownCaip19AssetIdOrSlip44Id>,
): XrplAssetMetadata;
export function toXrplAssetMetadata(
  assetData: ToXrplAssetMetadataInput<KnownCaip19AssetIdOrSlip44Id>,
): XrplAssetMetadata {
  const { assetId } = assetData;
  const fallback = fallbackDisplayLabel(assetId);
  const symbol = assetData.symbol ?? fallback;
  const name = assetData.name ?? symbol;
  const chainId = getXrplAssetChainId(assetId);
  const units: NonEmptyArray<AssetUnit> = [
    {
      name,
      symbol,
      decimals: assetData.decimals,
    },
  ];

  const metadata = {
    name,
    symbol,
    chainId,
    fungible: true as const,
    iconUrl: assetData.iconUrl ?? getIconUrl(assetId),
    units,
  };

  if (isMptId(assetId)) {
    return {
      ...metadata,
      assetId,
      assetType: AssetType.Mpt,
    };
  }

  if (isIouAssetId(assetId)) {
    return {
      ...metadata,
      assetId,
      assetType: AssetType.Token,
    };
  }

  return {
    ...metadata,
    assetId,
    assetType: AssetType.Native,
  };
}

/**
 * Builds {@link NativeXrplAssetMetadata} for the native XRP slip44 id on the given network.
 *
 * @param scope - The CAIP-2 chain id.
 * @returns Native metadata with standard name, symbol, and 6 decimals (drops).
 */
export function getNativeAssetMetadata(
  scope: KnownCaip2ChainId,
): NativeXrplAssetMetadata {
  return toXrplAssetMetadata({
    assetId: getSlip44AssetId(scope),
    decimals: XRPL_DECIMAL_PLACES,
    symbol: NATIVE_ASSET_SYMBOL,
    name: NATIVE_ASSET_NAME,
  });
}

/**
 * Groups asset IDs by chain ID and separates native assets from non-native assets.
 * This function also deduplicates asset ids.
 *
 * @param assetIds - The asset IDs to group.
 * @returns An object with two maps of chain IDs to asset IDs: one for native assets and one for non-native assets.
 */
export function groupAssetsByChainId(
  assetIds: KnownCaip19AssetIdOrSlip44Id[],
): {
  nativeAssets: Map<KnownCaip2ChainId, KnownCaip19Slip44Id[]>;
  assets: Map<KnownCaip2ChainId, KnownCaip19AssetId[]>;
} {
  const assets = new Map<KnownCaip2ChainId, KnownCaip19AssetId[]>();

  const nativeAssets = new Map<KnownCaip2ChainId, KnownCaip19Slip44Id[]>();

  const uniqueAssetIds = new Set<KnownCaip19AssetIdOrSlip44Id>();

  // group assets by chain id
  for (const assetId of assetIds) {
    // deduplicate asset ids
    if (uniqueAssetIds.has(assetId)) {
      continue;
    }
    uniqueAssetIds.add(assetId);

    const chainId = getXrplAssetChainId(assetId);

    if (isSlip44Id(assetId)) {
      if (!nativeAssets.has(chainId)) {
        nativeAssets.set(chainId, []);
      }
      nativeAssets.get(chainId)?.push(assetId);
    } else {
      if (!assets.has(chainId)) {
        assets.set(chainId, []);
      }
      assets.get(chainId)?.push(assetId);
    }
  }
  return {
    nativeAssets,
    assets,
  };
}
