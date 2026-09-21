import { buildUrl } from '@metamask/snap-networks-utils';

import { Network } from '../constants';
import { configProvider } from '../services/config/ConfigProvider';

/**
 * Get the Tron Explorer URL for a given scope, type, and value.
 *
 * @param scope - The scope of the Tron Explorer.
 * @param type - The type of the value to explore.
 * @param value - The value to explore.
 * @returns The Tron Explorer URL.
 */
export function getExplorerUrl(
  scope: Network,
  type: 'address' | 'transaction',
  value: string,
): string {
  const baseUrl = configProvider.config.explorerApi.baseUrls[scope];

  const url = buildUrl({
    baseUrl,
    path: `/#/${type}/${value}`,
  });

  return url;
}
