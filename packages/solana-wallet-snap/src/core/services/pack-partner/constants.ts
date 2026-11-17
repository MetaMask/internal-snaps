import { InvalidParamsError } from '@metamask/snaps-sdk';
import { address } from '@solana/kit';
import type { Address } from '@solana/kit';

import { Network } from '../../constants/solana';

/** Maximum fees for either payer, including priority and cNFT protocol fees: 0.0001 SOL. */
export const PACK_PARTNER_MAX_FEE = 100_000n;

export type PackPartnerCorePolicy = Readonly<{
  collection: Address;
  recipients: readonly Address[];
}>;

type PackPartnerNetworkConfig = Readonly<{
  signers: readonly Address[];
  memoPrograms: readonly Address[];
  usdcMint: Address;
  buyback: Readonly<{
    core?: PackPartnerCorePolicy;
    pnft?: Readonly<{ collection: Address; recipient: Address }>;
    nft?: Readonly<{ collection: Address }>;
    'cnft-core'?: Readonly<{ collection: Address }>;
  }>;
}>;

/**
 * Reviewed network policies only. Never inherit another cluster's trust anchors.
 * Signers and memo programs rotate independently: retain both reviewed addresses
 * during a migration. Each transaction must use exactly one trusted signer.
 * Pack Partner's standard names are used unchanged in config, request types
 * and nft-standards/ filenames. Each profile supplies its collection/inventory.
 * An absent profile is disabled; validators never inherit another network's policy.
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
    buyback: Object.freeze({
      core: Object.freeze({
        collection: address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac'),
        recipients: Object.freeze([
          address('Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu'),
          address('onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs'),
        ]),
      }),
      pnft: Object.freeze({
        collection: address('CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf'),
        recipient: address('onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs'),
      }),
      nft: Object.freeze({
        collection: address('CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf'),
      }),
      'cnft-core': Object.freeze({
        collection: address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac'),
      }),
    }),
  }),
  [Network.Devnet]: Object.freeze({
    signers: Object.freeze([
      address('A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv'),
    ]),
    memoPrograms: Object.freeze([
      address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    ]),
    usdcMint: address('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'),
    buyback: Object.freeze({
      'cnft-core': Object.freeze({
        collection: address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac'),
      }),
    }),
  }),
});

/**
 * Trusted authorities selected inside the Snap, never supplied by Mobile.
 *
 * @param scope - Explicitly requested Solana network.
 * @returns The pinned payment authorities, memo programs, mint and buyback policy.
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
