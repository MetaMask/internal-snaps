import { formatAmount } from './formatAmount';

describe('formatAmount', () => {
  describe('invalid values', () => {
    it('returns "0" for NaN', () => {
      expect(formatAmount('NaN')).toBe('0');
    });

    it('returns "0" for Infinity', () => {
      expect(formatAmount('Infinity')).toBe('0');
      expect(formatAmount('-Infinity')).toBe('0');
    });

    it('returns "0" for non-numeric strings', () => {
      expect(formatAmount('abc')).toBe('0');
      expect(formatAmount('')).toBe('0');
      expect(formatAmount('not a number')).toBe('0');
    });
  });

  describe('small numbers', () => {
    it('formats zero', () => {
      expect(formatAmount('0')).toBe('0');
    });

    it('formats single digit numbers', () => {
      expect(formatAmount('5')).toBe('5');
      expect(formatAmount('9')).toBe('9');
    });

    it('formats two digit numbers', () => {
      expect(formatAmount('42')).toBe('42');
      expect(formatAmount('99')).toBe('99');
    });

    it('formats three digit numbers without separators', () => {
      expect(formatAmount('100')).toBe('100');
      expect(formatAmount('999')).toBe('999');
    });
  });

  describe('large numbers with thousand separators', () => {
    it('formats thousands', () => {
      expect(formatAmount('1000')).toBe('1,000');
      expect(formatAmount('9999')).toBe('9,999');
    });

    it('formats millions', () => {
      expect(formatAmount('1000000')).toBe('1,000,000');
      expect(formatAmount('1234567')).toBe('1,234,567');
    });

    it('formats billions', () => {
      expect(formatAmount('1000000000')).toBe('1,000,000,000');
      expect(formatAmount('9876543210')).toBe('9,876,543,210');
    });
  });

  describe('decimal numbers', () => {
    it('formats decimals with period separator', () => {
      expect(formatAmount('1.5')).toBe('1.5');
      expect(formatAmount('123.456')).toBe('123.456');
    });

    it('formats large decimals with thousand separators', () => {
      expect(formatAmount('1234.5678')).toBe('1,234.5678');
      expect(formatAmount('1000000.123456')).toBe('1,000,000.123456');
    });

    it('preserves decimal precision', () => {
      expect(formatAmount('0.123456789012345678')).toBe('0.123456789012345678');
      expect(formatAmount('1.000000000000000001')).toBe('1.000000000000000001');
    });
  });

  describe('values out of `Number` 64-bit size', () => {
    it('handles extremely large token amounts without scientific notation', () => {
      // Values that caused parseFloat to return scientific notation
      const largeValue = '999999999999999999999999999999';
      const result = formatAmount(largeValue);
      expect(result).not.toContain('e');
      expect(result).not.toContain('E');
      expect(result).toBe('999,999,999,999,999,999,999,999,999,999');
    });

    it('handles extremely small decimals without scientific notation', () => {
      const smallValue = '0.000000000000000001';
      const result = formatAmount(smallValue);
      expect(result).not.toContain('e');
      expect(result).not.toContain('E');
      expect(result).toBe('0.000000000000000001');
    });

    it('handles values that would cause NaN in parseFloat', () => {
      // Very large numbers that parseFloat cannot handle
      const extremeValue =
        '123456789012345678901234567890123456789012345678901234567890';
      const result = formatAmount(extremeValue);
      expect(result).not.toBe('0');
      expect(result).not.toContain('e');
    });
  });

  describe('negative numbers', () => {
    it('formats negative integers', () => {
      expect(formatAmount('-100')).toBe('-100');
      expect(formatAmount('-1000')).toBe('-1,000');
    });

    it('formats negative decimals', () => {
      expect(formatAmount('-1.5')).toBe('-1.5');
      expect(formatAmount('-1234.567')).toBe('-1,234.567');
    });
  });

  describe('consistent decimal separator', () => {
    it('always uses period as decimal separator', () => {
      // Regardless of any locale considerations, we always use '.'
      const result = formatAmount('1234.5678');
      expect(result).toContain('.');
      expect(result).not.toMatch(/,\d{4}/u); // Should not have comma before 4 digits (would indicate German-style)
    });
  });
});
