import { UnauthorizedError } from '@metamask/snaps-sdk';

import { validateOrigin } from './validateOrigin.js';

describe('validateOrigin', () => {
  const originPermissions = new Map<string, Set<string>>([
    ['http://localhost:3000', new Set(['keyring_getAccounts'])],
    ['metamask', new Set(['keyring_getAccounts', 'keyring_createAccounts'])],
  ]);

  it('allows an origin that has the requested method', () => {
    expect(() =>
      validateOrigin('metamask', 'keyring_createAccounts', originPermissions),
    ).not.toThrow();
  });

  it.each(['', undefined, null])(
    'throws UnauthorizedError when origin is missing: %j',
    (origin) => {
      expect(() =>
        validateOrigin(
          origin as string,
          'keyring_getAccounts',
          originPermissions,
        ),
      ).toThrow(UnauthorizedError);
    },
  );

  it('throws UnauthorizedError when the origin is unknown', () => {
    expect(() =>
      validateOrigin(
        'https://portfolio.metamask.io',
        'keyring_getAccounts',
        originPermissions,
      ),
    ).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when the method is not allowed for the origin', () => {
    expect(() =>
      validateOrigin(
        'http://localhost:3000',
        'keyring_createAccounts',
        originPermissions,
      ),
    ).toThrow(UnauthorizedError);
  });
});
