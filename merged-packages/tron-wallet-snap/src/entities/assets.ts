import type { KnownCaip19Id, Network } from '../constants';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
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
};

export type NativeAsset = BaseAsset & {
  assetType: NativeCaipAssetType;
};

export type StakedAsset = BaseAsset & {
  assetType: `${Network}/slip44:195-staked-for-${'energy' | 'bandwidth'}`;
};

export type ResourceAsset = BaseAsset & {
  assetType:
    | KnownCaip19Id.EnergyMainnet
    | KnownCaip19Id.EnergyNile
    | KnownCaip19Id.EnergyShasta
    | KnownCaip19Id.EnergyLocalnet
    | KnownCaip19Id.BandwidthMainnet
    | KnownCaip19Id.BandwidthNile
    | KnownCaip19Id.BandwidthShasta
    | KnownCaip19Id.BandwidthLocalnet;
};

export type MaximumResourceAsset = BaseAsset & {
  assetType:
    | KnownCaip19Id.MaximumEnergyMainnet
    | KnownCaip19Id.MaximumEnergyNile
    | KnownCaip19Id.MaximumEnergyShasta
    | KnownCaip19Id.MaximumEnergyLocalnet
    | KnownCaip19Id.MaximumBandwidthMainnet
    | KnownCaip19Id.MaximumBandwidthNile
    | KnownCaip19Id.MaximumBandwidthShasta
    | KnownCaip19Id.MaximumBandwidthLocalnet;
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
  | TokenAsset
  | NftAsset
  | ResourceAsset
  | MaximumResourceAsset;
