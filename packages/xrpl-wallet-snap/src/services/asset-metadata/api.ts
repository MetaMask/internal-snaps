import type { FungibleAssetMetadata } from '@metamask/snaps-sdk';
import type { NonEmptyArray } from '@metamask/utils';

import type {
  AssetType,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
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

export type MptXrplAssetMetadata = Base & {
  assetId: KnownCaip19MptAssetId;
  assetType: typeof AssetType.Mpt;
};
export type IouXrplAssetMetadata = Base & {
  assetId: KnownCaip19IouAssetId;
  assetType: typeof AssetType.Token;
};
export type NativeXrplAssetMetadata = Base & {
  assetId: KnownCaip19Slip44Id;
  assetType: typeof AssetType.Native;
};

export type XrplAssetMetadata =
  | MptXrplAssetMetadata
  | IouXrplAssetMetadata
  | NativeXrplAssetMetadata;

/** Sparse map persisted under state `assets` (not every id is present). */
export type AssetMetadataByAssetId = Partial<
  Record<KnownCaip19AssetIdOrSlip44Id, XrplAssetMetadata>
>;

export type AssetMetadataState = {
  assets: AssetMetadataByAssetId;
  assetMetadataLastSyncedAt?: number;
};
