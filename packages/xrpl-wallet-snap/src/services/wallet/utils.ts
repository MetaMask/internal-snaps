import { XRPL_SECP_DERIVATION_PATH_PREFIX } from '../../constants';
import type { XrplSecpDerivationPath } from './api';

/**
 * Returns the XRPL BIP44 secp256k1 path for the given index
 * (`m/44'/144'/0'/0` or `m/44'/144'/0'/0/${index}`).
 *
 * @param index - The derivation index (account number).
 * @returns The derivation path string.
 */
export function getDerivationPath(index?: number): XrplSecpDerivationPath {
  if (index === undefined) {
    return `${XRPL_SECP_DERIVATION_PATH_PREFIX}`;
  }
  return `${XRPL_SECP_DERIVATION_PATH_PREFIX}/${index}`;
}
