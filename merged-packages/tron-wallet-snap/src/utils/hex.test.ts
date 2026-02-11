import { hexToString } from './hex';

describe('hex utilities', () => {
  describe('hexToString', () => {
    it('decodes hex string to UTF-8', () => {
      expect(hexToString('5452433230416473434f4d')).toBe('TRC20AdsCOM');
    });

    it('decodes another hex string', () => {
      expect(hexToString('42657374416473436f696e')).toBe('BestAdsCoin');
    });

    it('handles lowercase hex', () => {
      expect(hexToString('5452433230416473434f4d'.toLowerCase())).toBe(
        'TRC20AdsCOM',
      );
    });

    it('handles 0x prefix', () => {
      expect(hexToString('0x5452433230416473434f4d')).toBe('TRC20AdsCOM');
    });

    it('decodes numeric string from hex', () => {
      expect(hexToString('31303035313139')).toBe('1005119');
    });
  });
});
