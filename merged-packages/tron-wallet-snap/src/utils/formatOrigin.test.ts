import { formatOrigin } from './formatOrigin';

describe('formatOrigin', () => {
  it('formats "metamask" as "MetaMask"', () => {
    expect(formatOrigin('metamask')).toBe('MetaMask');
  });

  it('formats "METAMASK" as "MetaMask"', () => {
    expect(formatOrigin('METAMASK')).toBe('MetaMask');
  });

  it('formats "MetaMask" as "MetaMask"', () => {
    expect(formatOrigin('MetaMask')).toBe('MetaMask');
  });

  it('formats "MeTaMaSk" (mixed case) as "MetaMask"', () => {
    expect(formatOrigin('MeTaMaSk')).toBe('MetaMask');
  });

  it('extracts hostname from valid URLs', () => {
    expect(formatOrigin('https://dapp.example.com')).toBe('dapp.example.com');
    expect(formatOrigin('http://example.com')).toBe('example.com');
    expect(formatOrigin('https://subdomain.example.com:8080')).toBe(
      'subdomain.example.com',
    );
    expect(formatOrigin('http://localhost:3000')).toBe('localhost');
    expect(formatOrigin('https://example.com/path/to/page')).toBe(
      'example.com',
    );
  });

  it('returns original value for invalid URLs', () => {
    // Note: These should be rejected by validation, but formatOrigin is lenient
    expect(formatOrigin('example.com')).toBe('example.com');
    expect(formatOrigin('not-a-url')).toBe('not-a-url');
    expect(formatOrigin('just some text')).toBe('just some text');
  });

  it('returns "Unknown" for undefined', () => {
    expect(formatOrigin(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" for empty string', () => {
    expect(formatOrigin('')).toBe('Unknown');
  });
});
