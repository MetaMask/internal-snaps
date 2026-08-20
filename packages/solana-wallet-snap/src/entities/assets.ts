import type {
  NativeCaipAssetType,
  Network,
  NftCaipAssetType,
  TokenCaipAssetType,
} from '../core/constants/solana';

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
  /**
   * Token account address. Snap-fetched balances use the RPC token account.
   * Core-mapped balances use the associated token account derived from the
   * mint and owner (with the mint's token program, including Token-2022).
   */
  pubkey: string;
  symbol: string;
  decimals: number;
  rawAmount: string; // Without decimals nor multiplier
  uiAmount: string; // With decimals and multiplier
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

export type AssetEntity = NativeAsset | TokenAsset | NftAsset;
