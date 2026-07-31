import { toUiAmount } from './toUiAmount';

describe('toUiAmount', () => {
  it('returns the raw amount when decimals are zero', () => {
    expect(toUiAmount('123', 0)).toBe('123');
  });

  it('inserts a decimal point for positive amounts', () => {
    expect(toUiAmount('1234567', 6)).toBe('1.234567');
  });

  it('trims trailing fractional zeros', () => {
    expect(toUiAmount('2000000', 6)).toBe('2');
  });

  it('pads short amounts', () => {
    expect(toUiAmount('42', 6)).toBe('0.000042');
  });

  it('preserves a leading minus sign', () => {
    expect(toUiAmount('-1500', 2)).toBe('-15');
  });
});
