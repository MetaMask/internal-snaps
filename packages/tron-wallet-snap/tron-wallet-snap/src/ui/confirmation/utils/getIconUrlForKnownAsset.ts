import { TokenMetadata } from '../../../constants';

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
  if (assetType in TokenMetadata) {
    return TokenMetadata[assetType as keyof typeof TokenMetadata].iconUrl;
  }
  return undefined;
};
