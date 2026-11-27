import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { XrplSnapException } from '../../utils';

export class OnChainAccountException extends XrplSnapException {}

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
