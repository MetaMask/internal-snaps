import type { XrplAddress } from '../../api';
import { DerivedAccountAddressMismatchException } from './exceptions';

/**
 * Asserts two XRPL classic addresses refer to the same account.
 *
 * Classic addresses are base58-encoded with a checksum, so comparison is
 * case-sensitive.
 *
 * @param expectedAddress - Address treated as canonical for {@link DerivedAccountAddressMismatchException}.
 * @param actualAddress - Address to compare (e.g. derived or loaded from the network).
 * @throws {DerivedAccountAddressMismatchException} When the addresses differ.
 */
export function assertSameAddress(
  expectedAddress: XrplAddress,
  actualAddress: XrplAddress,
): void {
  if (expectedAddress !== actualAddress) {
    throw new DerivedAccountAddressMismatchException(expectedAddress);
  }
}
