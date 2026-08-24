import type { AccountResources } from '../../../clients/tron-http';

/**
 * Builds account resources from a settled getAccountResources request.
 *
 * @param tronAccountResourcesRequest - The settled promise result from getAccountResources.
 * @returns Account resources, or an empty object when the request failed.
 */
export function buildAccountResources(
  tronAccountResourcesRequest: PromiseSettledResult<AccountResources>,
): AccountResources | Record<string, never> {
  return tronAccountResourcesRequest.status === 'fulfilled'
    ? tronAccountResourcesRequest.value
    : {};
}
