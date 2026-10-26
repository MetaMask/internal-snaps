import type { FungibleAssetMetadata } from '@metamask/snaps-sdk';
import type { NonEmptyArray } from '@metamask/utils';

import type {
  AssetType,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19ClassicAssetId,
  KnownCaip19Sep41AssetId,
  KnownCaip19Slip44Id,
  KnownCaip2ChainId,
} from '../../api';

export type AssetUnit = {
  decimals: number;
  symbol: string;
  name?: string | undefined;
};

type Base = FungibleAssetMetadata & {
  assetId: KnownCaip19AssetIdOrSlip44Id;
  assetType: AssetType;
  chainId: KnownCaip2ChainId;
  units: NonEmptyArray<AssetUnit>;
  symbol: string;
  persistedAt?: number;
};

export type Sep41StellarAssetMetadata = Base & {
  assetId: KnownCaip19Sep41AssetId;
  assetType: typeof AssetType.Sep41;
};
export type ClassicStellarAssetMetadata = Base & {
  assetId: KnownCaip19ClassicAssetId;
  assetType: typeof AssetType.Token;
};
export type NativeStellarAssetMetadata = Base & {
  assetId: KnownCaip19Slip44Id;
  assetType: typeof AssetType.Native;
};

export type StellarAssetMetadata =
  | Sep41StellarAssetMetadata
  | ClassicStellarAssetMetadata
  | NativeStellarAssetMetadata;

/** Sparse map persisted under state `assets` (not every id is present). */
export type AssetMetadataByAssetId = Partial<
  Record<KnownCaip19AssetIdOrSlip44Id, StellarAssetMetadata>
>;

export type AssetMetadataState = {
  assets: AssetMetadataByAssetId;
  assetMetadataLastSyncedAt?: number;
};
