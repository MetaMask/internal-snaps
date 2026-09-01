import { refine, string, nonempty, sensitive } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { StrKey } from '@stellar/stellar-sdk';

/**
 * Validation struct for Stellar address: must be a string matching the Stellar address format and checksum.
 * We only support non-muxed addresses.
 */
export const StellarAddressStruct = refine(
  nonempty(sensitive(string())),
  'stellar_address',
  (value: string) => {
    try {
      if (!StrKey.isValidEd25519PublicKey(value)) {
        return 'Invalid Stellar address';
      }
      return true;
    } catch {
      return 'Invalid Stellar address';
    }
  },
);

/**
 * Validation struct for a Stellar secret seed (`S…` strkey / base32).
 */
export const StellarSecretKeyStruct = refine(
  nonempty(string()),
  'stellar_secret_key',
  (value: string) => {
    try {
      if (!StrKey.isValidEd25519SecretSeed(value)) {
        return 'Invalid Stellar secret key';
      }
      return true;
    } catch {
      return 'Invalid Stellar secret key';
    }
  },
);

/**
 * Type for a Stellar secret seed.
 */
export type StellarSecretKey = Infer<typeof StellarSecretKeyStruct>;

export const StellarAddressOrContractStruct = refine(
  nonempty(string()),
  'stellar_contract_or_address',
  (value: string) => {
    try {
      if (
        !StrKey.isValidContract(value) &&
        !StrKey.isValidEd25519PublicKey(value)
      ) {
        return 'Invalid Stellar address or contract';
      }
      return true;
    } catch {
      return 'Invalid Stellar address or contract';
    }
  },
);
/**
 * Type for a Stellar address.
 */
export type StellarAddress = Infer<typeof StellarAddressStruct>;

/**
 * Type for a Stellar address or contract.
 */
export type StellarAddressOrContract = Infer<
  typeof StellarAddressOrContractStruct
>;
