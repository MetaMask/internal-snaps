import { hasProperty } from '@metamask/utils';

import { TokenMetadata } from '../../../constants';

/**
 * Lookup view of {@link TokenMetadata}, keyed by CAIP-19 asset type.
 */
const knownAssetMetadata: Readonly<
  Record<string, { iconUrl?: string } | undefined>
> = TokenMetadata;

/**
 * Resolves iconUrl for a given asset type.
 * This should only be called with the asset types that are in TokenMetadata constants.
 *
 * @param assetType - The CAIP-19 asset type to resolve.
 * @returns The icon URL if known, otherwise undefined.
 */
export const getIconUrlForKnownAsset = (
  assetType: string,
): string | undefined => {
  if (hasProperty(knownAssetMetadata, assetType)) {
    return knownAssetMetadata[assetType]?.iconUrl;
  }
  return undefined;
};
