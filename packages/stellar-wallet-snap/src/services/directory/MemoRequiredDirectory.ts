import { MEMO_REQUIRED_DIRECTORY_ADDRESSES } from './memoRequiredAddresses.generated';

/**
 * StellarExpert / SEP-37 curated addresses tagged `memo-required`.
 *
 * Used as an off-chain complement to SEP-29 (`config.memo_required`): many
 * exchange deposit accounts require a memo for credit attribution but never set
 * the on-chain flag.
 *
 * Refresh the generated address list from the Directory API and update via PR
 * (see {@link MEMO_REQUIRED_DIRECTORY_ADDRESSES}).
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0037.md
 * @see https://api.stellar.expert/explorer/directory?tag[]=memo-required
 */
const MEMO_REQUIRED_DIRECTORY_ADDRESS_SET: ReadonlySet<string> = new Set(
  MEMO_REQUIRED_DIRECTORY_ADDRESSES,
);

/**
 * Whether `address` is in the hardcoded SEP-37 `memo-required` directory.
 *
 * @param address - Stellar account public key (`G…`).
 * @returns `true` when the address is listed as memo-required.
 */
export function isMemoRequiredDirectoryAddress(address: string): boolean {
  return MEMO_REQUIRED_DIRECTORY_ADDRESS_SET.has(address);
}
