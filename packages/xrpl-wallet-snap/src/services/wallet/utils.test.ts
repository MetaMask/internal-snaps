import { XRPL_SECP_DERIVATION_PATH_PREFIX } from '../../constants';
import { getDerivationPath } from './utils';

describe('getDerivationPath', () => {
  it.each([
    {
      index: undefined,
      expected: XRPL_SECP_DERIVATION_PATH_PREFIX,
    },
    {
      index: 0,
      expected: `${XRPL_SECP_DERIVATION_PATH_PREFIX}/0`,
    },
    {
      index: 1,
      expected: `${XRPL_SECP_DERIVATION_PATH_PREFIX}/1`,
    },
    {
      index: 42,
      expected: `${XRPL_SECP_DERIVATION_PATH_PREFIX}/42`,
    },
  ])('returns $expected for index $index', ({ index, expected }) => {
    expect(getDerivationPath(index)).toStrictEqual(expected);
  });
});
