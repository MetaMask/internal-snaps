import { buildUrl } from './buildUrl';

describe('buildUrl', () => {
  it('builds and sanitizes URLs, including path and query parameters', () => {
    expect(
      buildUrl({
        baseUrl: 'https://api.example.com',
        path: '/tokens/{assetId}',
        pathParams: { assetId: 'solana:mainnet:token123' },
        queryParams: { search: 'hello\u0000world' },
      }),
    ).toBe(
      'https://api.example.com/tokens/solana%3Amainnet%3Atoken123?search=helloworld',
    );
  });

  it('encodes path parameters by default and can leave them unencoded', () => {
    const params = {
      baseUrl: 'https://api.example.com',
      path: '/tokens/{assetId}',
      pathParams: { assetId: 'solana:mainnet:token123' },
    };

    expect(buildUrl(params)).toBe(
      'https://api.example.com/tokens/solana%3Amainnet%3Atoken123',
    );
    expect(buildUrl({ ...params, encodePathParams: false })).toBe(
      'https://api.example.com/tokens/solana:mainnet:token123',
    );
  });

  it('rejects invalid base URLs and undefined path parameters', () => {
    expect(() => buildUrl({ baseUrl: 'invalid', path: '/path' })).toThrow(
      'Invalid URL format',
    );
    expect(() =>
      buildUrl({ baseUrl: 'https://api.example.com', path: '/{missing}' }),
    ).toThrow('Path parameter missing is undefined');
  });

  it('rejects malicious query parameter values', () => {
    expect(() =>
      buildUrl({
        baseUrl: 'https://api.example.com',
        path: '/search',
        queryParams: { q: '<script>alert("xss")</script>' },
      }),
    ).toThrow('URL contains potentially malicious patterns');
  });

  it('removes traversal and duplicate slashes from paths', () => {
    expect(
      buildUrl({
        baseUrl: 'https://api.example.com',
        path: '/../../../path//to/resource/',
      }),
    ).toBe('https://api.example.com/path/to/resource');
  });

  it('handles trailing base-URL slashes and omits empty query parameters', () => {
    expect(
      buildUrl({
        baseUrl: 'https://api.example.com/',
        path: '/users',
        queryParams: {
          empty: '',
          nullValue: null as unknown as string,
          undefinedValue: undefined as unknown as string,
        },
      }),
    ).toBe('https://api.example.com/users');
  });
});
