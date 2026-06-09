import { Network } from '../constants';
import { buildUrl } from './buildUrl';

/**
 * Get the Solana Explorer URL for a given scope, type, and value.
 *
 * @param scope - The scope of the Solana network.
 * @param type - The type of the value to explore.
 * @param value - The value to explore.
 * @returns The Solana Explorer URL.
 */
export function getExplorerUrl(
  scope: Network,
  type: 'address' | 'transaction',
  value: string,
): string {
  // TODO: Get these URLs from configuration instead of environment variables
  const NETWORK_TO_EXPLORER_PATH = {
    /* eslint-disable-next-line no-restricted-globals */
    [Network.Mainnet]: process.env.EXPLORER_MAINNET_BASE_URL as string,
    /* eslint-disable-next-line no-restricted-globals */
    [Network.Nile]: process.env.EXPLORER_NILE_BASE_URL as string,
    /* eslint-disable-next-line no-restricted-globals */
    [Network.Shasta]: process.env.EXPLORER_SHASTA_BASE_URL as string,
  };

  const baseUrl = NETWORK_TO_EXPLORER_PATH[scope];

  const url = buildUrl({
    baseUrl,
    path: `/#/${type}/${value}`,
  });

  return url;
}
