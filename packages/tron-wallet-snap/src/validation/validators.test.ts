import { GetAccountAssetsResponseStruct } from './structs';
import { validateResponse } from './validators';

describe('Validators', () => {
  describe('validateResponse', () => {
    it('throws invalid response', () => {
      expect(() =>
        validateResponse({}, GetAccountAssetsResponseStruct),
      ).toThrow(`Invalid Response: Expected an array value`);
    });
  });
});
