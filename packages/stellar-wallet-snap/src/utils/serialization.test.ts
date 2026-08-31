import { BigNumber } from 'bignumber.js';

import { serializeToString } from './serialization';

describe('serializeToString', () => {
  it('pretty-prints values after shared serialize', () => {
    expect(
      serializeToString({
        value: { amount: new BigNumber('1.5'), missing: undefined },
        indent: 0,
      }),
    ).toBe(
      '{"amount":{"__type":"BigNumber","value":"1.5"},"missing":{"__type":"undefined"}}',
    );
  });
});
