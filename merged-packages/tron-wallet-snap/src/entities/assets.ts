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
  iconUrl: string; // Asset icon URL
  imageSvg?: string; // Converted SVG for Snaps UI display
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
    | KnownCaip19Id.BandwidthMainnet
    | KnownCaip19Id.BandwidthNile
    | KnownCaip19Id.BandwidthShasta;
};

export type MaximumResourceAsset = BaseAsset & {
  assetType:
    | KnownCaip19Id.MaximumEnergyMainnet
    | KnownCaip19Id.MaximumEnergyNile
    | KnownCaip19Id.MaximumEnergyShasta
    | KnownCaip19Id.MaximumBandwidthMainnet
    | KnownCaip19Id.MaximumBandwidthNile
    | KnownCaip19Id.MaximumBandwidthShasta;
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
