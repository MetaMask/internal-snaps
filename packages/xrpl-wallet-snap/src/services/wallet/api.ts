import { XRPL_COIN_TYPE } from '../../constants';

/**
 * XRPL BIP44 secp256k1 path (`m/44'/144'/0'/0` or `m/44'/144'/0'/0/${index}`).
 */
export type XrplSecpDerivationPath =
  | `m/44'/${typeof XRPL_COIN_TYPE}'/0'/0/${string}`
  | `m/44'/${typeof XRPL_COIN_TYPE}'/0'/0`;
