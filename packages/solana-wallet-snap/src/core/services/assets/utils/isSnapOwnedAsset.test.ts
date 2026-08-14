import { KnownCaip19Id, Network } from '../../../constants/solana';
import { isSnapOwnedAsset } from './isSnapOwnedAsset';

describe('isSnapOwnedAsset', () => {
  it('returns true for NFT asset IDs', () => {
    expect(
      isSnapOwnedAsset(`${Network.Mainnet}/nft:SomeNftMintAddress`),
    ).toBe(true);
  });

  it('returns false for native SOL', () => {
    expect(isSnapOwnedAsset(KnownCaip19Id.SolMainnet)).toBe(false);
    expect(isSnapOwnedAsset(KnownCaip19Id.SolDevnet)).toBe(false);
  });

  it('returns false for SPL tokens', () => {
    expect(isSnapOwnedAsset(KnownCaip19Id.UsdcMainnet)).toBe(false);
    expect(isSnapOwnedAsset(KnownCaip19Id.Ai16zMainnet)).toBe(false);
  });
});
