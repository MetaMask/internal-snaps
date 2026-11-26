import {
  XRPL_ED25519_CURVE,
  XRPL_ED25519_DERIVATION_PATH_PREFIX,
  XRPL_SECP_CURVE,
  XRPL_SECP_DERIVATION_PATH_PREFIX,
} from '../../constants';
import { getDerivationPath } from './utils';

describe('getDerivationPath', () => {
  it.each([
    {
      index: undefined,
      curve: undefined,
      expected: XRPL_SECP_DERIVATION_PATH_PREFIX,
    },
    {
      index: 0,
      curve: undefined,
      expected: `${XRPL_SECP_DERIVATION_PATH_PREFIX}/0`,
    },
    {
      index: 1,
      curve: XRPL_SECP_CURVE,
      expected: `${XRPL_SECP_DERIVATION_PATH_PREFIX}/1`,
    },
    {
      index: 42,
      curve: XRPL_SECP_CURVE,
      expected: `${XRPL_SECP_DERIVATION_PATH_PREFIX}/42`,
    },
    {
      index: undefined,
      curve: XRPL_ED25519_CURVE,
      expected: XRPL_ED25519_DERIVATION_PATH_PREFIX,
    },
    {
      index: 0,
      curve: XRPL_ED25519_CURVE,
      expected: `${XRPL_ED25519_DERIVATION_PATH_PREFIX}/0'`,
    },
    {
      index: 1,
      curve: XRPL_ED25519_CURVE,
      expected: `${XRPL_ED25519_DERIVATION_PATH_PREFIX}/1'`,
    },
    {
      index: 42,
      curve: XRPL_ED25519_CURVE,
      expected: `${XRPL_ED25519_DERIVATION_PATH_PREFIX}/42'`,
    },
  ])(
    'returns $expected for index $index and curve $curve',
    ({ index, curve, expected }) => {
      expect(getDerivationPath(index, curve)).toStrictEqual(expected);
    },
  );
});
