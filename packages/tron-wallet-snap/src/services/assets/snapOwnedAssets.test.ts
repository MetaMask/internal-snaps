import { KnownCaip19Id, SNAP_OWNED_ASSETS } from '../../constants';
import { isSnapOwnedAsset } from './snapOwnedAssets';

describe('isSnapOwnedAsset', () => {
  it.each(SNAP_OWNED_ASSETS)(
    'returns true for snap-owned asset %s',
    (assetId) => {
      expect(isSnapOwnedAsset(assetId)).toBe(true);
    },
  );

  it('returns false for native TRX', () => {
    expect(isSnapOwnedAsset(KnownCaip19Id.TrxMainnet)).toBe(false);
    expect(isSnapOwnedAsset(KnownCaip19Id.TrxNile)).toBe(false);
    expect(isSnapOwnedAsset(KnownCaip19Id.TrxShasta)).toBe(false);
  });

  it('returns false for TRC20 tokens', () => {
    expect(isSnapOwnedAsset(KnownCaip19Id.UsdtMainnet)).toBe(false);
    expect(
      isSnapOwnedAsset(
        `${KnownCaip19Id.TrxMainnet.split('/')[0]}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,
      ),
    ).toBe(false);
  });

  it('returns false for TRC10 tokens', () => {
    expect(
      isSnapOwnedAsset(
        `${KnownCaip19Id.TrxMainnet.split('/')[0]}/trc10:1002000`,
      ),
    ).toBe(false);
  });
});
