import { assert } from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { Network } from '../constants';
import { TronCaipAssetTypeStruct } from '../validation/structs';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  ReadyForWithdrawalCaipAssetType,
  ResourceCaipAssetType,
  StakedCaipAssetType,
  StakingRewardsCaipAssetType,
  TokenCaipAssetType,
} from '../services/assets/types';

export type TronCaipAssetType =
  | NativeCaipAssetType
  | StakedCaipAssetType
  | ReadyForWithdrawalCaipAssetType
  | StakingRewardsCaipAssetType
  | ResourceCaipAssetType
  | TokenCaipAssetType
  | NftCaipAssetType;

export type ParsedTronCaipAssetType = ReturnType<typeof parseCaipAssetType> & {
  chainId: Network;
};

export function parseTronCaipAssetType(
  assetId: string,
): ParsedTronCaipAssetType {
  assert(assetId, TronCaipAssetTypeStruct);
  const parsed = parseCaipAssetType(assetId as CaipAssetType);

  return {
    ...parsed,
    chainId: parsed.chainId as Network,
  };
}
