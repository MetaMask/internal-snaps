import type { Network } from '../constants';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  TokenCaipAssetType,
} from '../services/assets/types';

export type NativeAsset = {
  assetType: NativeCaipAssetType;
  keyringAccountId: string;
  network: Network;
  address: string;
  symbol: string;
  decimals: number;
  rawAmount: string; // Without decimals
  uiAmount: string; // With decimals
};

export type TokenAsset = {
  assetType: TokenCaipAssetType; // Using the mint
  keyringAccountId: string;
  network: Network;
  mint: string;
  pubkey: string;
  symbol: string;
  decimals: number;
  rawAmount: string; // Without decimals
  uiAmount: string; // With decimals
};

export type NftAsset = {
  assetType: NftCaipAssetType;
  keyringAccountId: string;
  network: Network;
  mint: string;
  pubkey: string;
  symbol: string;
  rawAmount: string; // Without decimals
  uiAmount: string; // With decimals
};

export type ResourceAsset = {
  assetType: `${Network}/slip44:energy` | `${Network}/slip44:bandwidth`;
  keyringAccountId: string;
  network: Network;
  mint: string;
  pubkey: string;
  symbol: string;
  rawAmount: string; // Without decimals
  uiAmount: string; // With decimals
};

export type AssetEntity = NativeAsset | TokenAsset | NftAsset | ResourceAsset;
