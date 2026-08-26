import {
  createOriginPermissions,
  DEFAULT_DEV_ORIGINS,
  DEFAULT_PROD_ORIGINS,
} from './createOriginPermissions';

describe('createOriginPermissions', () => {
  const dappMethods = ['keyring_getAccounts', 'computeFee'];
  const metamaskMethods = ['keyring_getAccounts', 'keyring_createAccounts'];

  it('defaults origins to localhost and maps metamask to metamask methods', () => {
    const originPermissions = createOriginPermissions({
      dappMethods,
      metamaskMethods,
    });

    expect(originPermissions.get(DEFAULT_DEV_ORIGINS[0])).toStrictEqual(
      new Set(dappMethods),
    );
    expect(originPermissions.get('metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
    expect(originPermissions.has(DEFAULT_PROD_ORIGINS[0])).toBe(false);
  });

  it('maps provided origins to dapp methods', () => {
    const originPermissions = createOriginPermissions({
      dappMethods,
      metamaskMethods,
      origins: DEFAULT_PROD_ORIGINS,
    });

    expect(originPermissions.get(DEFAULT_PROD_ORIGINS[0])).toStrictEqual(
      new Set(dappMethods),
    );
    expect(originPermissions.get('metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
    expect(originPermissions.has(DEFAULT_DEV_ORIGINS[0])).toBe(false);
  });

  it('uses custom origins and metamask origin when provided', () => {
    const originPermissions = createOriginPermissions({
      dappMethods,
      metamaskMethods,
      origins: ['http://localhost:8080'],
      metamaskOrigin: 'custom-metamask',
    });

    expect(originPermissions.get('http://localhost:8080')).toStrictEqual(
      new Set(dappMethods),
    );
    expect(originPermissions.get('custom-metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
    expect(originPermissions.has(DEFAULT_DEV_ORIGINS[0])).toBe(false);
    expect(originPermissions.has('metamask')).toBe(false);
  });

  it('registers origins with an empty method set when dappMethods is empty', () => {
    const originPermissions = createOriginPermissions({
      dappMethods: [],
      metamaskMethods,
      origins: DEFAULT_PROD_ORIGINS,
    });

    expect(originPermissions.get(DEFAULT_PROD_ORIGINS[0])).toStrictEqual(
      new Set(),
    );
    expect(originPermissions.get('metamask')).toStrictEqual(
      new Set(metamaskMethods),
    );
  });
});
