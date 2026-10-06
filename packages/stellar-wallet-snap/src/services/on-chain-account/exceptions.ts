import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { StellarSnapException } from '../../utils';

export class OnChainAccountException extends StellarSnapException {}

/**
 * Thrown when the balance is not available for the given asset.
 */
export class OnChainAccountBalanceNotAvailableException extends OnChainAccountException {
  constructor(assetId?: KnownCaip19AssetIdOrSlip44Id) {
    super(`Balance not available${assetId ? ` for asset ${assetId}` : ''}`);
  }
}

/**
 * Thrown when the account metadata is not available.
 */
export class OnChainAccountMetadataNotAvailableException extends OnChainAccountException {
  constructor() {
    super(`Account metadata not available`);
  }
}

/**
 * Thrown when mainnet returns no SEP-41 balance map for an account.
 */
export class OnChainAccountSep41BalanceNotFoundException extends OnChainAccountException {
  constructor(accountAddress: string) {
    super(`Balance not available for account ${accountAddress}`);
  }
}
