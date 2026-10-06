import {
  MIN_FEE_RATE_SAT_PER_VB,
  resolveFeeRate,
  toFeeRateSatsPerVb,
} from './fee-rate';

describe('resolveFeeRate', () => {
  const fallbackFeeRate = 5;

  describe.each([
    ['undefined', undefined],
    ['null', null],
    ['zero', 0],
    ['a negative rate', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('when the estimate is %s', (_label, estimate) => {
    it('returns the fallback fee rate', () => {
      expect(
        resolveFeeRate(estimate as number | undefined, fallbackFeeRate),
      ).toBe(fallbackFeeRate);
    });
  });

  it('keeps a positive estimate above 1 sat/vB', () => {
    expect(resolveFeeRate(2.5, fallbackFeeRate)).toBe(2.5);
  });

  it('clamps a positive fractional estimate below 1 sat/vB to the minimum', () => {
    expect(resolveFeeRate(0.285, fallbackFeeRate)).toBe(
      MIN_FEE_RATE_SAT_PER_VB,
    );
  });

  it('keeps an estimate of exactly 1 sat/vB', () => {
    expect(resolveFeeRate(1, fallbackFeeRate)).toBe(1);
  });
});

describe('toFeeRateSatsPerVb', () => {
  it('floors a positive rate above 1 sat/vB', () => {
    expect(toFeeRateSatsPerVb(2.9)).toBe(BigInt(2));
  });

  it('keeps a whole rate unchanged', () => {
    expect(toFeeRateSatsPerVb(3)).toBe(BigInt(3));
  });

  it('never truncates a positive sub-1 sat/vB rate to zero', () => {
    expect(toFeeRateSatsPerVb(0.285)).toBe(BigInt(MIN_FEE_RATE_SAT_PER_VB));
  });

  it('maps an unusable rate to zero so callers must filter it out first', () => {
    expect(toFeeRateSatsPerVb(0)).toBe(BigInt(0));
    expect(toFeeRateSatsPerVb(-1)).toBe(BigInt(0));
    expect(toFeeRateSatsPerVb(Number.NaN)).toBe(BigInt(0));
  });
});
