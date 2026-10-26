import {
  isMemoRequiredDirectoryAddress,
  MEMO_REQUIRED_DIRECTORY_ADDRESSES,
} from './memoRequiredDirectory';

describe('memoRequiredDirectory', () => {
  describe('isMemoRequiredDirectoryAddress', () => {
    it('returns true for Coinbase Deposits from the SEP-37 directory snapshot', () => {
      expect(
        isMemoRequiredDirectoryAddress(
          'GDS2WFLIJID6BDM64FGUD7MNOVZUEWHJ5VJPO2GQ32KOZCYIYIRIQTG6',
        ),
      ).toBe(true);
    });

    it('returns true for every address in the hardcoded snapshot', () => {
      expect(MEMO_REQUIRED_DIRECTORY_ADDRESSES.length).toBeGreaterThan(0);
      for (const address of MEMO_REQUIRED_DIRECTORY_ADDRESSES) {
        expect(isMemoRequiredDirectoryAddress(address)).toBe(true);
      }
    });

    it('returns false for an address not in the directory', () => {
      expect(
        isMemoRequiredDirectoryAddress(
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        ),
      ).toBe(false);
    });
  });
});
