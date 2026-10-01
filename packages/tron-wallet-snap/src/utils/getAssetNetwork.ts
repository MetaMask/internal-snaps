import { parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import { assertSupportedNetwork } from '../constants';
import type { Network } from '../constants';

/**
 * Returns the supported network a CAIP-19 asset type belongs to.
 *
 * @param assetType - The CAIP-19 asset type.
 * @returns The network of the asset.
 * @throws If the asset type's chain is not a supported network.
 */
export function getAssetNetwork(assetType: CaipAssetType): Network {
  const { chainId } = parseCaipAssetType(assetType);
  return assertSupportedNetwork(chainId);
}
