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
   * Token account address. Present for Snap-fetched balances (RPC token
   * accounts). Omitted for Core-mapped assets — AssetsController does not
   * store ATAs, and Solana callers that need one (Send) derive it themselves.
   */
  pubkey?: string;
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
