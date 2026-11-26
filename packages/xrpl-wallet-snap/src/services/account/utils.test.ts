import { DerivedAccountAddressMismatchException } from './exceptions';
import { assertSameAddress } from './utils';

describe('assertSameAddress', () => {
  it('returns when classic addresses match', () => {
    const address = 'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3';
    expect(() => assertSameAddress(address, address)).not.toThrow();
  });

  it('throws DerivedAccountAddressMismatchException when addresses differ', () => {
    const expected = 'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3';
    const actual = 'rP8Cn7F5SJP5SVzwwbriX4YGuzYSmms6Cg';
    expect(() => assertSameAddress(expected, actual)).toThrow(
      DerivedAccountAddressMismatchException,
    );
  });
});
