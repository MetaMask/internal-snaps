import { KnownCaip19Id, TokenMetadata } from '../../../constants';
import type { ComputeFeeResult } from '../../../services/send/types';
import { withFeeIcons } from './withFeeIcons';

describe('withFeeIcons', () => {
  const knownFee = {
    type: 'base',
    asset: {
      unit: 'TRX',
      type: KnownCaip19Id.TrxMainnet,
      amount: '0.02',
      fungible: true,
    },
  } as const;

  const unknownFee = {
    type: 'base',
    asset: {
      unit: 'UNKNOWN',
      type: 'tron:728126428/slip44:999',
      amount: '1',
      fungible: true,
    },
  } as never;

  it('sets iconUrl for a known asset type', () => {
    const result = withFeeIcons([knownFee] as unknown as ComputeFeeResult);

    expect(result[0]?.asset.iconUrl).toBe(
      TokenMetadata[KnownCaip19Id.TrxMainnet].iconUrl,
    );
  });

  it('leaves iconUrl undefined for an unknown asset type', () => {
    const result = withFeeIcons([unknownFee] as ComputeFeeResult);

    expect(result[0]?.asset.iconUrl).toBeUndefined();
  });

  it('keeps the other fee fields unchanged', () => {
    const result = withFeeIcons([knownFee] as unknown as ComputeFeeResult);

    expect(result[0]).toStrictEqual({
      type: 'base',
      asset: {
        unit: 'TRX',
        type: KnownCaip19Id.TrxMainnet,
        amount: '0.02',
        fungible: true,
        iconUrl: TokenMetadata[KnownCaip19Id.TrxMainnet].iconUrl,
      },
    });
  });

  it('returns a new array and does not mutate the input fees', () => {
    const input = [
      {
        ...knownFee,
        asset: { ...knownFee.asset },
      },
    ] as unknown as ComputeFeeResult;

    const result = withFeeIcons(input);

    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(input[0]);
    expect(result[0]?.asset).not.toBe(input[0]?.asset);
    expect(input[0]?.asset.iconUrl).toBeUndefined();
  });

  it('returns an empty array when given no fees', () => {
    expect(withFeeIcons([])).toStrictEqual([]);
  });
});
