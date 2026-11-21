import { InvalidParamsError } from '@metamask/snaps-sdk';
import { address } from '@solana/kit';
import type { Address } from '@solana/kit';

import { Network } from '../../constants/solana';

/** Maximum network/priority fees for either payer: 0.0001 SOL. */
export const PACK_PARTNER_MAX_FEE = 100_000n;

type PackPartnerNetworkConfig = Readonly<{
  signers: readonly Address[];
  memoPrograms: readonly Address[];
  usdcMint: Address;
}>;

/**
 * Reviewed network policies only. Never inherit another cluster's trust anchors.
 * Signers and memo programs rotate independently: retain both reviewed addresses
 * during a migration. Each transaction must use exactly one trusted signer.
 */
export const PACK_PARTNER_NETWORK_CONFIGS: Readonly<
  Partial<Record<Network, PackPartnerNetworkConfig>>
> = Object.freeze({
  [Network.Mainnet]: Object.freeze({
    signers: Object.freeze([
      address('GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3'),
    ]),
    memoPrograms: Object.freeze([
      address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    ]),
    usdcMint: address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  }),
  [Network.Devnet]: Object.freeze({
    signers: Object.freeze([
      address('A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv'),
    ]),
    memoPrograms: Object.freeze([
      address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    ]),
    usdcMint: address('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'),
  }),
});

/**
 * Trusted authorities selected inside the Snap, never supplied by Mobile.
 *
 * @param scope - Explicitly requested Solana network.
 * @returns The pinned payment authorities, memo programs, mint and settlement token.
 */
export function getPackPartnerNetworkConfig(
  scope: Network,
): PackPartnerNetworkConfig {
  const config = Object.hasOwn(PACK_PARTNER_NETWORK_CONFIGS, scope)
    ? PACK_PARTNER_NETWORK_CONFIGS[scope]
    : undefined;
  if (!config) {
    throw new InvalidParamsError(
      `No Pack Partner configuration for network: ${String(scope)}`,
    ) as Error;
  }
  return config;
}
