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
) {
  console.log(
    'process.env.EXPLORER_MAINNET_BASE_URL',
    process.env.EXPLORER_MAINNET_BASE_URL,
  );

  const NETWORK_TO_EXPLORER_PATH = {
    [Network.Mainnet]: process.env.EXPLORER_MAINNET_BASE_URL as string,
    [Network.Nile]: process.env.EXPLORER_NILE_BASE_URL as string,
    [Network.Shasta]: process.env.EXPLORER_SHASTA_BASE_URL as string,
    [Network.Localnet]: process.env.EXPLORER_MAINNET_BASE_URL as string,
  };

  console.log('NETWORK_TO_EXPLORER_PATH', NETWORK_TO_EXPLORER_PATH);

  const baseUrl = NETWORK_TO_EXPLORER_PATH[scope];

  console.log('baseUrl', baseUrl);

  const url = buildUrl({
    baseUrl,
    path: `/#/${type}/${value}`,
  });

  return url;
}
