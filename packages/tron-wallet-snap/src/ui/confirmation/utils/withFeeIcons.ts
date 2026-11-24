import type { ComputeFeeResult } from '../../../services/send/types';
import { getIconUrlForKnownAsset } from './getIconUrlForKnownAsset';

/**
 * Returns a copy of the fees with `iconUrl` resolved for each fee asset from
 * known asset metadata. The input fees are not mutated.
 *
 * @param fees - The fee breakdown to add icons to.
 * @returns A new fee breakdown with `iconUrl` set on each asset.
 */
export function withFeeIcons(fees: ComputeFeeResult): ComputeFeeResult {
  return fees.map((fee) => ({
    ...fee,
    asset: {
      ...fee.asset,
      iconUrl: getIconUrlForKnownAsset(fee.asset.type),
    },
  }));
}
