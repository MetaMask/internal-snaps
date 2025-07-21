import type { TrxScope } from '@metamask/keyring-api';
import { pattern, string } from '@metamask/superstruct';

export type NativeCaipAssetType = `${TrxScope}/slip44:195`;
export type TokenCaipAssetType = `${TrxScope}/${'trc10' | 'trc20'}:${string}`;
export type NftCaipAssetType = `${TrxScope}/trc721:${string}`;

/**
 * Validates a TRON native CAIP-19 ID (e.g., "tron:mainnet/slip44:195")
 */
export const NativeCaipAssetTypeStruct = pattern(
  string(),
  /^tron:(mainnet|nile|shasta)\/slip44:195$/u,
);

/**
 * Validates a TRON token CAIP-19 ID (e.g., "tron:mainnet/trc10:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")
 */
export const TokenCaipAssetTypeStruct = pattern(
  string(),
  /^tron:(mainnet|nile|shasta)\/(trc10|trc20):[a-zA-Z0-9]+$/u,
);

/**
 * Validates a TRON NFT CAIP-19 ID (e.g., "tron:mainnet/trc721:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
 */
export const NftCaipAssetTypeStruct = pattern(
  string(),
  /^tron:(mainnet|nile|shasta)\/trc721:[a-zA-Z0-9]+$/u,
);
