import { resolveOrigin } from './resolveOrigin';

describe('resolveOrigin', () => {
  it('trusts an HTTP(S) origin', () => {
    expect(resolveOrigin('https://opensea.io/collection')).toStrictEqual({
      displayOrigin: 'opensea.io',
      isSelfReported: false,
      verifiedOrigin: 'https://opensea.io/collection',
    });
  });

  it('labels the MetaMask origin', () => {
    expect(resolveOrigin('metamask')).toStrictEqual({
      displayOrigin: 'MetaMask',
      isSelfReported: false,
      verifiedOrigin: null,
    });
  });

  it('ignores a self-reported origin when the origin is verifiable', () => {
    expect(
      resolveOrigin('https://localhost:3000', {
        transport: 'walletconnect',
        selfReportedOrigin: 'https://phishing.example',
      }),
    ).toStrictEqual({
      displayOrigin: 'localhost',
      isSelfReported: false,
      verifiedOrigin: 'https://localhost:3000',
    });
  });

  it('displays a self-reported origin without trusting it', () => {
    expect(
      resolveOrigin('4f3a1b2c-0000-4000-8000-000000000000', {
        transport: 'walletconnect',
        selfReportedOrigin: 'https://opensea.io',
      }),
    ).toStrictEqual({
      displayOrigin: 'opensea.io',
      isSelfReported: true,
      verifiedOrigin: null,
    });
  });

  it.each([
    ['a channel id without metadata', '4f3a1b2c-0000-4000-8000-000000000000'],
    ['a non-HTTP origin', 'npm:@metamask/foo-snap'],
    ['an empty origin', ''],
    ['a missing origin', undefined],
  ])('has nothing to display for %s', (_, origin) => {
    expect(resolveOrigin(origin)).toStrictEqual({
      displayOrigin: null,
      isSelfReported: false,
      verifiedOrigin: null,
    });
  });

  it('has nothing to display when the self-reported origin is not a URL', () => {
    expect(
      resolveOrigin('4f3a1b2c-0000-4000-8000-000000000000', {
        transport: 'walletconnect',
        selfReportedOrigin: 'not-a-url',
      }),
    ).toStrictEqual({
      displayOrigin: null,
      isSelfReported: false,
      verifiedOrigin: null,
    });
  });
});
