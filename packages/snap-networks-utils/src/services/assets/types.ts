import type { AccountId } from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

/**
 * Generic Snap asset shape produced from Core AssetsController reads.
 */
export type AssetEntity = {
  /** CAIP-19 asset ID. */
  assetType: string;
  /** Keyring account ID (`InternalAccount.id`). */
  keyringAccountId: AccountId;
  /** CAIP-2 chain ID. */
  network: string;
  symbol: string;
  decimals: number;
  /** Balance in smallest units (no decimals applied). */
  rawAmount: string;
  /** Human-readable balance with decimals applied. */
  uiAmount: string;
  iconUrl: string;
};

/**
 * CAIP-2 chain ID filter for AssetsController reads.
 * Matches the Accounts-domain `scope` naming used across snaps.
 */
export type AssetScope = CaipChainId | readonly CaipChainId[];
