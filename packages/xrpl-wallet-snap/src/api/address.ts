import { refine, string, nonempty, sensitive } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { remove0x } from '@metamask/utils';
import { isValidClassicAddress } from 'xrpl';

/**
 * Validation struct for an XRPL classic address (`r…`) with a valid checksum.
 * X-addresses are rejected; callers must pass classic `Destination` plus optional
 * `DestinationTag`.
 */
export const XrplAddressStruct = refine(
  nonempty(sensitive(string())),
  'xrpl_address',
  (value: string) => {
    try {
      if (!isValidClassicAddress(value)) {
        return 'Invalid Xrpl address';
      }
      return true;
    } catch {
      return 'Invalid Xrpl address';
    }
  },
);

/**
 * Validation struct for an XRPL secp256k1 private key (`00` + 32-byte hex).
 *
 * BIP44 / SLIP-10 derivation exports this form, not a family seed (`s…`).
 */
export const XrplSecretKeyStruct = refine(
  nonempty(string()),
  'xrpl_secret_key',
  (value: string) => {
    const privateKeyHex = remove0x(value).toUpperCase();
    if (!/^00[0-9A-F]{64}$/u.test(privateKeyHex)) {
      return 'Invalid Xrpl private key';
    }
    return true;
  },
);

/**
 * Type for an XRPL secp256k1 private key hex.
 */
export type XrplSecretKey = Infer<typeof XrplSecretKeyStruct>;

/**
 * Type for an XRPL address.
 */
export type XrplAddress = Infer<typeof XrplAddressStruct>;
