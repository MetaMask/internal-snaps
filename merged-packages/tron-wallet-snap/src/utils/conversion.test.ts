import { BigNumber } from 'bignumber.js';

import { toRawAmount, toUiAmount, trxToSun, sunToTrx } from './conversion';

describe('Tron conversion utils', () => {
  describe('trxToSun', () => {
    it('converts whole TRX to Sun', () => {
      expect(trxToSun(1)).toBe('1000000');
      expect(trxToSun(100)).toBe('100000000');
      expect(trxToSun(0)).toBe('0');
    });

    it('converts fractional TRX to Sun', () => {
      expect(trxToSun(0.5)).toBe('500000');
      expect(trxToSun(1.5)).toBe('1500000');
      expect(trxToSun(0.000001)).toBe('1');
    });

    it('truncates excess decimals (more than 6)', () => {
      // 1.0000001 TRX should become 1000000 Sun (not 1000000.1)
      expect(trxToSun(1.0000001)).toBe('1000000');
      expect(trxToSun(1.9999999)).toBe('1999999');
    });

    it('handles string inputs', () => {
      expect(trxToSun('1')).toBe('1000000');
      expect(trxToSun('0.5')).toBe('500000');
    });

    it('handles BigNumber inputs', () => {
      expect(trxToSun(new BigNumber('1'))).toBe('1000000');
      expect(trxToSun(new BigNumber('0.5'))).toBe('500000');
    });

    it('handles large amounts', () => {
      expect(trxToSun(1000000)).toBe('1000000000000');
      expect(trxToSun('1000000000000')).toBe('1000000000000000000');
    });

    it('returns a string', () => {
      expect(typeof trxToSun(1)).toBe('string');
    });
  });

  describe('sunToTrx', () => {
    it('converts Sun to TRX', () => {
      expect(sunToTrx(1000000).toString()).toBe('1');
      expect(sunToTrx(500000).toString()).toBe('0.5');
      expect(sunToTrx(1).toString()).toBe('0.000001');
      expect(sunToTrx(0).toString()).toBe('0');
    });

    it('handles string inputs', () => {
      expect(sunToTrx('1000000').toString()).toBe('1');
    });

    it('handles BigNumber inputs', () => {
      expect(sunToTrx(new BigNumber('1000000')).toString()).toBe('1');
    });

    it('handles large amounts', () => {
      expect(sunToTrx('1000000000000000000').toString()).toBe('1000000000000');
    });
  });

  describe('toRawAmount', () => {
    it('converts UI amount to raw amount with 6 decimals (like TRX)', () => {
      expect(toRawAmount(1, 6)).toBe('1000000');
      expect(toRawAmount(0.5, 6)).toBe('500000');
      expect(toRawAmount(0.000001, 6)).toBe('1');
    });

    it('converts UI amount to raw amount with 18 decimals (like some TRC20)', () => {
      expect(toRawAmount(1, 18)).toBe('1000000000000000000');
      expect(toRawAmount(0.5, 18)).toBe('500000000000000000');
    });

    it('converts UI amount to raw amount with 0 decimals', () => {
      expect(toRawAmount(100, 0)).toBe('100');
      expect(toRawAmount(1.5, 0)).toBe('1'); // Truncates
    });

    it('converts UI amount to raw amount with 3 decimals', () => {
      expect(toRawAmount(1, 3)).toBe('1000');
      expect(toRawAmount(1.234, 3)).toBe('1234');
      expect(toRawAmount(1.2345, 3)).toBe('1234'); // Truncates
    });

    it('truncates excess decimals', () => {
      // With 6 decimals, 1.0000001 should become 1000000 (not 1000000.1)
      expect(toRawAmount(1.0000001, 6)).toBe('1000000');
    });

    it('handles string inputs', () => {
      expect(toRawAmount('1.5', 6)).toBe('1500000');
    });

    it('handles BigNumber inputs', () => {
      expect(toRawAmount(new BigNumber('1.5'), 6)).toBe('1500000');
    });

    it('returns a string', () => {
      expect(typeof toRawAmount(1, 6)).toBe('string');
    });
  });

  describe('toUiAmount', () => {
    it('converts raw amount to UI amount with 6 decimals', () => {
      expect(toUiAmount(1000000, 6).toString()).toBe('1');
      expect(toUiAmount(500000, 6).toString()).toBe('0.5');
      expect(toUiAmount(1, 6).toString()).toBe('0.000001');
    });

    it('converts raw amount to UI amount with 18 decimals', () => {
      expect(toUiAmount('1000000000000000000', 18).toString()).toBe('1');
      expect(toUiAmount('500000000000000000', 18).toString()).toBe('0.5');
    });

    it('converts raw amount to UI amount with 0 decimals', () => {
      expect(toUiAmount(100, 0).toString()).toBe('100');
    });

    it('handles string inputs', () => {
      expect(toUiAmount('1500000', 6).toString()).toBe('1.5');
    });

    it('handles BigNumber inputs', () => {
      expect(toUiAmount(new BigNumber('1500000'), 6).toString()).toBe('1.5');
    });
  });

  describe('round-trip conversions', () => {
    it('trxToSun and sunToTrx are inverses for whole numbers', () => {
      const original = 100;
      const sun = trxToSun(original);
      const backToTrx = sunToTrx(sun);
      expect(backToTrx.toNumber()).toBe(original);
    });

    it('toRawAmount and toUiAmount are inverses for whole numbers', () => {
      const original = 100;
      const raw = toRawAmount(original, 6);
      const backToUi = toUiAmount(raw, 6);
      expect(backToUi.toNumber()).toBe(original);
    });

    it('handles fractional amounts that fit within decimals', () => {
      const original = 1.5;
      const raw = toRawAmount(original, 6);
      const backToUi = toUiAmount(raw, 6);
      expect(backToUi.toNumber()).toBe(original);
    });
  });
});
