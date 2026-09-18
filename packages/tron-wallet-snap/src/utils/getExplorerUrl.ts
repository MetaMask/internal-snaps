import { buildUrl } from '@metamask/snap-networks-utils';

/**
 * Get the Tron Explorer URL for a given scope, type, and value.
 *
 * @param baseUrl - The base URL of the Tron Explorer.
 * @param type - The type of the value to explore.
 * @param value - The value to explore.
 * @returns The Tron Explorer URL.
 */
export function getExplorerUrl(
  baseUrl: string,
  type: 'address' | 'transaction',
  value: string,
): string {
  const url = buildUrl({
    baseUrl,
    path: `/#/${type}/${value}`,
  });

  return url;
}
