import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { StellarSnapException } from '../../utils';

export class OnChainAccountException extends StellarSnapException {}

export class OnChainAccountBalanceNotAvailableException extends OnChainAccountException {
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id) {
    super(`Balance not available for asset ${assetId}`);
  }
}
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
