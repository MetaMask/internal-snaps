import {
  XRPL_COIN_TYPE,
  XRPL_ED25519_CURVE,
  XRPL_SECP_CURVE,
} from '../../constants';

/**
 * Curves supported by XRPL wallet derivation.
 */
export type XrplCurve = typeof XRPL_SECP_CURVE | typeof XRPL_ED25519_CURVE;

/**
 * XRPL BIP44 secp256k1 path (`m/44'/144'/0'/0` or `m/44'/144'/0'/0/${index}`).
 */
export type XrplSecpDerivationPath =
  | `m/44'/${typeof XRPL_COIN_TYPE}'/0'/0/${string}`
  | `m/44'/${typeof XRPL_COIN_TYPE}'/0'/0`;

/**
 * XRPL SLIP-0010 ed25519 path (`m/44'/144'/0'/0'` or `m/44'/144'/0'/0'/${index}'`).
 */
export type XrplEd25519DerivationPath =
  | `m/44'/${typeof XRPL_COIN_TYPE}'/0'/0'/${string}'`
  | `m/44'/${typeof XRPL_COIN_TYPE}'/0'/0'`;

/**
 * XRPL BIP44 derivation path for either supported curve.
 */
export type XrplDerivationPath =
  | XrplSecpDerivationPath
  | XrplEd25519DerivationPath;
