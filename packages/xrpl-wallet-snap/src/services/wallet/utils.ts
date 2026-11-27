import {
  XRPL_ED25519_CURVE,
  XRPL_ED25519_DERIVATION_PATH_PREFIX,
  XRPL_SECP_CURVE,
  XRPL_SECP_DERIVATION_PATH_PREFIX,
} from '../../constants';
import type { XrplCurve, XrplDerivationPath } from './api';

/**
 * Returns the XRPL BIP44 / SLIP-0010 derivation path for the given index and curve.
 *
 * - secp256k1: `m/44'/144'/0'/0` or `m/44'/144'/0'/0/${index}` (unhardened index)
 * - ed25519: `m/44'/144'/0'/0'` or `m/44'/144'/0'/0'/${index}'` (hardened index)
 *
 * @param index - The derivation index (account number).
 * @param curve - Signing curve. Defaults to secp256k1.
 * @returns The derivation path string.
 */
export function getDerivationPath(
  index?: number,
  curve: XrplCurve = XRPL_SECP_CURVE,
): XrplDerivationPath {
  if (curve === XRPL_ED25519_CURVE) {
    if (index === undefined) {
      return `${XRPL_ED25519_DERIVATION_PATH_PREFIX}`;
    }
    return `${XRPL_ED25519_DERIVATION_PATH_PREFIX}/${index}'`;
  }

  if (index === undefined) {
    return `${XRPL_SECP_DERIVATION_PATH_PREFIX}`;
  }
  return `${XRPL_SECP_DERIVATION_PATH_PREFIX}/${index}`;
}
