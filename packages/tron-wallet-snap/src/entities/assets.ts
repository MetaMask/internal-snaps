import { KnownCaip19Id } from '../constants';
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
    | typeof KnownCaip19Id.EnergyMainnet
    | typeof KnownCaip19Id.EnergyNile
    | typeof KnownCaip19Id.EnergyShasta
    | typeof KnownCaip19Id.BandwidthMainnet
    | typeof KnownCaip19Id.BandwidthNile
    | typeof KnownCaip19Id.BandwidthShasta;
};

export type MaximumResourceAsset = BaseAsset & {
  assetType:
    | typeof KnownCaip19Id.MaximumEnergyMainnet
    | typeof KnownCaip19Id.MaximumEnergyNile
    | typeof KnownCaip19Id.MaximumEnergyShasta
    | typeof KnownCaip19Id.MaximumBandwidthMainnet
    | typeof KnownCaip19Id.MaximumBandwidthNile
    | typeof KnownCaip19Id.MaximumBandwidthShasta;
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
