import { createOriginPermissions } from './createOriginPermissions';

describe('createOriginPermissions', () => {
  const dappMethods = ['keyring_getAccounts', 'computeFee'];
  const metamaskMethods = ['keyring_getAccounts', 'keyring_createAccounts'];

  it('maps localhost to dapp methods and metamask to metamask methods in dev', () => {
    const originPermissions = createOriginPermissions({
      isDev: true,
      dappMethods,
      metamaskMethods,
    });

    expect(originPermissions.get('http://localhost:3000')).toStrictEqual(
      new Set(dappMethods),
    );
    expect(originPermissions.get('metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
    expect(originPermissions.has('https://portfolio.metamask.io')).toBe(false);
  });

  it('maps production origins to an empty dapp set in prod', () => {
    const originPermissions = createOriginPermissions({
      isDev: false,
      dappMethods,
      metamaskMethods,
    });

    expect(
      originPermissions.get('https://portfolio.metamask.io'),
    ).toStrictEqual(new Set());
    expect(originPermissions.get('metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
    expect(originPermissions.has('http://localhost:3000')).toBe(false);
  });

  it('uses custom origins and metamask origin when provided', () => {
    const originPermissions = createOriginPermissions({
      isDev: true,
      dappMethods,
      metamaskMethods,
      devOrigins: ['http://localhost:8080'],
      prodOrigins: ['https://example.com'],
      metamaskOrigin: 'custom-metamask',
    });

    expect(originPermissions.get('http://localhost:8080')).toStrictEqual(
      new Set(dappMethods),
    );
    expect(originPermissions.get('custom-metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
    expect(originPermissions.has('http://localhost:3000')).toBe(false);
    expect(originPermissions.has('metamask')).toBe(false);
  });

  it('uses custom production origins in prod', () => {
    const originPermissions = createOriginPermissions({
      isDev: false,
      dappMethods,
      metamaskMethods,
      prodOrigins: ['https://example.com'],
    });

    expect(originPermissions.get('https://example.com')).toStrictEqual(
      new Set(),
    );
    expect(originPermissions.has('https://portfolio.metamask.io')).toBe(false);
  });
});
