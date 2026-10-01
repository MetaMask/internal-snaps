import { assert } from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';
import { CaipAssetTypeStruct, parseCaipAssetType } from '@metamask/utils';

import { Network, assertSupportedNetwork } from '../constants';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  ReadyForWithdrawalCaipAssetType,
  ResourceCaipAssetType,
  StakedCaipAssetType,
  StakingRewardsCaipAssetType,
  TokenCaipAssetType,
} from '../services/assets/types';
import { TronCaipAssetTypeStruct } from '../validation/structs';

export type TronCaipAssetType =
  | NativeCaipAssetType
  | StakedCaipAssetType
  | ReadyForWithdrawalCaipAssetType
  | StakingRewardsCaipAssetType
  | ResourceCaipAssetType
  | TokenCaipAssetType
  | NftCaipAssetType;

export type ParsedTronCaipAssetType = {
  assetNamespace: ReturnType<typeof parseCaipAssetType>['assetNamespace'];
  assetReference: ReturnType<typeof parseCaipAssetType>['assetReference'];
  chainId: Network;
  chain: ReturnType<typeof parseCaipAssetType>['chain'];
};

/**
 * Converts a string to a `CaipAssetType` after checking that it is one.
 *
 * Every `TronCaipAssetTypeStruct` member is a `pattern()` struct over
 * `CaipAssetTypeStruct`, so any value that passed `TronCaipAssetTypeStruct`
 * also satisfies this struct; the assertion is guaranteed not to throw and
 * exists purely so TypeScript can narrow the type without a cast.
 *
 * @param value - The string to check.
 * @returns The same string, narrowed to `CaipAssetType`.
 */
function toCaipAssetType(value: string): CaipAssetType {
  assert(value, CaipAssetTypeStruct);

  return value;
}

/**
 * Extracts the CAIP-2 chain ID prefix from a CAIP-19 asset type.
 *
 * @param assetId - The CAIP-19 asset type (e.g., "tron:728126428/slip44:195").
 * @returns The chain ID prefix (e.g., "tron:728126428").
 */
function getCaipChainIdPrefix(assetId: string): string {
  const separatorIndex = assetId.indexOf('/');

  return assetId.slice(0, separatorIndex);
}

export function parseTronCaipAssetType(
  assetId: string,
): ParsedTronCaipAssetType {
  assert(assetId, TronCaipAssetTypeStruct);
  const parsed = parseCaipAssetType(toCaipAssetType(assetId));

  return {
    ...parsed,
    chainId: assertSupportedNetwork(getCaipChainIdPrefix(assetId)),
  };
}
