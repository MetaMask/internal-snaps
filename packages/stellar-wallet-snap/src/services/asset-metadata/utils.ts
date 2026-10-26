import { buildUrl } from '@metamask/snap-networks-utils';
import type { NonEmptyArray } from '@metamask/utils';

import type {
  KnownCaip2ChainId,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19ClassicAssetId,
  KnownCaip19Sep41AssetId,
  KnownCaip19Slip44Id,
  KnownCaip19AssetId,
} from '../../api';
import { AssetType } from '../../api';
import { AppConfig } from '../../config';
import {
  NATIVE_ASSET_NAME,
  NATIVE_ASSET_SYMBOL,
  STELLAR_DECIMAL_PLACES,
} from '../../constants';
import {
  getSlip44AssetId,
  getStellarAssetChainId,
  isClassicAssetId,
  isSep41Id,
  isSlip44Id,
} from '../../utils';
import type {
  AssetUnit,
  ClassicStellarAssetMetadata,
  NativeStellarAssetMetadata,
  Sep41StellarAssetMetadata,
  StellarAssetMetadata,
} from './api';

type ToStellarAssetMetadataInput<
  TAssetId extends KnownCaip19AssetIdOrSlip44Id,
> = {
  assetId: TAssetId;
  decimals: number;
  symbol: string;
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
 * Maps token API fields into {@link StellarAssetMetadata} for confirmations and UI.
 *
 * @param assetData - Raw asset row from the token API or equivalent.
 * @param assetData.assetId - CAIP-19 asset id (classic, slip44, or sep41).
 * @param assetData.decimals - Smallest-unit decimal count for the primary unit.
 * @param assetData.symbol - Ticker or short symbol for display.
 * @param assetData.name - Optional long name; defaults to `symbol` when omitted.
 * @param assetData.iconUrl - Optional icon URL; defaults to the icon URL from the token API.
 * @returns Cached metadata including icon URL and units. The variant follows `assetId`.
 */
export function toStellarAssetMetadata(
  assetData: ToStellarAssetMetadataInput<KnownCaip19Sep41AssetId>,
): Sep41StellarAssetMetadata;
export function toStellarAssetMetadata(
  assetData: ToStellarAssetMetadataInput<KnownCaip19ClassicAssetId>,
): ClassicStellarAssetMetadata;
export function toStellarAssetMetadata(
  assetData: ToStellarAssetMetadataInput<KnownCaip19Slip44Id>,
): NativeStellarAssetMetadata;
export function toStellarAssetMetadata(
  assetData: ToStellarAssetMetadataInput<KnownCaip19AssetIdOrSlip44Id>,
): StellarAssetMetadata;
export function toStellarAssetMetadata(
  assetData: ToStellarAssetMetadataInput<KnownCaip19AssetIdOrSlip44Id>,
): StellarAssetMetadata {
  const name = assetData.name ?? assetData.symbol;
  const chainId = getStellarAssetChainId(assetData.assetId);
  const { assetId } = assetData;
  const units: NonEmptyArray<AssetUnit> = [
    {
      name,
      symbol: assetData.symbol,
      decimals: assetData.decimals,
    },
  ];

  const metadata = {
    name,
    symbol: assetData.symbol,
    chainId,
    fungible: true as const,
    iconUrl: assetData.iconUrl ?? getIconUrl(assetId),
    units,
  };

  if (isSep41Id(assetId)) {
    return {
      ...metadata,
      assetId,
      assetType: AssetType.Sep41,
    };
  }

  if (isClassicAssetId(assetId)) {
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
 * Builds {@link NativeStellarAssetMetadata} for the native XLM slip44 id on the given network.
 *
 * @param scope - The CAIP-2 chain id.
 * @returns Native metadata with standard name, symbol, and 7 decimals.
 */
export function getNativeAssetMetadata(
  scope: KnownCaip2ChainId,
): NativeStellarAssetMetadata {
  return toStellarAssetMetadata({
    assetId: getSlip44AssetId(scope),
    decimals: STELLAR_DECIMAL_PLACES,
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

    const chainId = getStellarAssetChainId(assetId);

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
