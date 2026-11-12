import { Network } from '../../constants/solana';
import {
  PACK_PARTNER_NETWORK_CONFIGS,
  getPackPartnerNetworkConfig,
} from './constants';

describe('Pack Partner network configuration', () => {
  it('pins independent authorities and settlement tokens for each supported network', () => {
    expect(Object.keys(PACK_PARTNER_NETWORK_CONFIGS)).toStrictEqual([
      Network.Mainnet,
      Network.Devnet,
    ]);
    expect(getPackPartnerNetworkConfig(Network.Mainnet)).toMatchObject({
      signers: ['GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3'],
      memoPrograms: ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'],
      usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      buyback: {
        core: {
          collection: 'CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac',
          recipients: [
            'Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu',
            'onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs',
          ],
        },
        pnft: {
          collection: 'CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf',
          recipient: 'onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs',
        },
        nft: {
          collection: 'CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf',
        },
        'cnft-core': {
          collection: 'CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac',
        },
      },
    });
    expect(getPackPartnerNetworkConfig(Network.Devnet)).toStrictEqual({
      signers: ['A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv'],
      memoPrograms: ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'],
      usdcMint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      buyback: {
        'cnft-core': {
          collection: 'CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac',
        },
      },
    });
  });

  it.each([
    Network.Testnet,
    Network.Localnet,
    'solana:unknown' as Network,
    'toString' as Network,
    undefined as unknown as Network,
  ])('fails closed for an unconfigured network %s', (scope) => {
    expect(() => getPackPartnerNetworkConfig(scope)).toThrow(
      'No Pack Partner configuration for network',
    );
  });
});
