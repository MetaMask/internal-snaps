import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';

/**
 * Parses the origin from a string.
 *
 * @param origin - The origin to parse.
 * @returns The parsed origin.
 */
export function parseOrigin(origin: string) {
  if (origin === DEFAULT_METAMASK_ORIGIN) {
    return 'MetaMask';
  }

  try {
    return new URL(origin).hostname;
  } catch (error) {
    throw new Error('Invalid URL');
  }
}
