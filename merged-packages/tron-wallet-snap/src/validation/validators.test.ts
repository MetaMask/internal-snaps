import { ListAccountAssetsResponseStruct } from './structs';
import { validateResponse } from './validators';

describe('Validators', () => {
  describe('validateResponse', () => {
    it('throws invalid response', () => {
      expect(() =>
        validateResponse({}, ListAccountAssetsResponseStruct),
      ).toThrow(`Invalid Response: Expected an array value`);
    });
  });
});
