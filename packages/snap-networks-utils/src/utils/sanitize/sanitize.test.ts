import { sanitizeControlCharacters, sanitizeUri } from './sanitize';

describe('sanitize', () => {
  describe('sanitizeControlCharacters', () => {
    it('removes control characters from strings', () => {
      expect(sanitizeControlCharacters('hello\nworld')).toBe('helloworld');
      expect(sanitizeControlCharacters('hello\r\nworld')).toBe('helloworld');
      // The tab character is preserved.
      expect(sanitizeControlCharacters('hello\tworld')).toBe('hello\tworld');
      expect(sanitizeControlCharacters('hello\x00world')).toBe('helloworld');
      expect(sanitizeControlCharacters('hello\x1Fworld')).toBe('helloworld');
    });

    it('handles edge cases', () => {
      expect(sanitizeControlCharacters('')).toBe('');
      expect(sanitizeControlCharacters(null as unknown as string)).toBe('');
      expect(sanitizeControlCharacters(undefined as unknown as string)).toBe(
        '',
      );
      expect(sanitizeControlCharacters('normal text')).toBe('normal text');
    });
  });

  describe('sanitizeUri', () => {
    it('validates and sanitizes valid URIs', () => {
      expect(sanitizeUri('https://example.com')).toBe('https://example.com');
      expect(sanitizeUri('http://example.com/path')).toBe(
        'http://example.com/path',
      );
      expect(sanitizeUri('wss://example.com')).toBe('wss://example.com');
      expect(sanitizeUri('ipfs://example.com')).toBe('ipfs://example.com');
    });

    it('rejects invalid URIs', () => {
      expect(sanitizeUri('')).toBe('');
      expect(sanitizeUri('not-a-url')).toBe('');
      expect(sanitizeUri('ftp://example.com')).toBe('');
      // eslint-disable-next-line no-script-url
      expect(sanitizeUri('javascript:alert(1)')).toBe('');
    });

    it('sanitizes URIs with control characters', () => {
      expect(sanitizeUri('https://example.com\n')).toBe('https://example.com');
      expect(sanitizeUri('http://example.com/path\r')).toBe(
        'http://example.com/path',
      );
    });

    it('handles edge cases', () => {
      expect(sanitizeUri(null as unknown as string)).toBe('');
      expect(sanitizeUri(undefined as unknown as string)).toBe('');
    });
  });
});
