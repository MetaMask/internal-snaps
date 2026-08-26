import type { Network } from '../constants';
import type {
  InLockPeriodCaipAssetType,
  NativeCaipAssetType,
  NftCaipAssetType,
  ReadyForWithdrawalCaipAssetType,
  StakingRewardsCaipAssetType,
  TokenCaipAssetType,
} from '../services/assets/types';

type BaseAsset = {
  assetType: string;
  keyringAccountId: string;
  network: Network;
  symbol: string;
  decimals: number;
  rawAmount: string; // Without decimals
  uiAmount: string; // With decimals
  iconUrl: string; // Asset icon URL
};

export type NativeAsset = BaseAsset & {
  assetType: NativeCaipAssetType;
};

export type StakedAsset = BaseAsset & {
  assetType: `${Network}/slip44:195-staked-for-${'energy' | 'bandwidth'}`;
};

export type ReadyForWithdrawalAsset = BaseAsset & {
  assetType: ReadyForWithdrawalCaipAssetType;
};

export type StakingRewardsAsset = BaseAsset & {
  assetType: StakingRewardsCaipAssetType;
};

export type InLockPeriodAsset = BaseAsset & {
  assetType: InLockPeriodCaipAssetType;
};

export type ResourceAsset = BaseAsset & {
  assetType:
    | 'tron:728126428/slip44:energy'
    | 'tron:3448148188/slip44:energy'
    | 'tron:2494104990/slip44:energy'
    | 'tron:728126428/slip44:bandwidth'
    | 'tron:3448148188/slip44:bandwidth'
    | 'tron:2494104990/slip44:bandwidth';
};

export type MaximumResourceAsset = BaseAsset & {
  assetType:
    | 'tron:728126428/slip44:maximum-energy'
    | 'tron:3448148188/slip44:maximum-energy'
    | 'tron:2494104990/slip44:maximum-energy'
    | 'tron:728126428/slip44:maximum-bandwidth'
    | 'tron:3448148188/slip44:maximum-bandwidth'
    | 'tron:2494104990/slip44:maximum-bandwidth';
};

export type TokenAsset = BaseAsset & {
  assetType: TokenCaipAssetType; // Using the mint
};

export type NftAsset = BaseAsset & {
  assetType: NftCaipAssetType;
};

export type AssetEntity =
  | NativeAsset
  | StakedAsset
  | ReadyForWithdrawalAsset
  | StakingRewardsAsset
  | InLockPeriodAsset
  | TokenAsset
  | NftAsset
  | ResourceAsset
  | MaximumResourceAsset;
