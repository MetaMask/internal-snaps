import {
  buildMockClassicTransaction,
  buildMockInvokeHostFunctionTransaction,
} from './__mocks__/transaction.fixtures';
import { RequiresMemoException } from './exceptions';
import { assertMemoWhenDestinationRequires } from './utils';

describe('assertMemoWhenDestinationRequires', () => {
  const destination = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  it('enforces SEP-29 for classic payments and skips it for invokeHostFunction', () => {
    const classic = buildMockClassicTransaction([
      {
        type: 'payment',
        params: {
          destination,
          asset: 'native',
          amount: '1',
        },
      },
    ]);
    expect(() =>
      assertMemoWhenDestinationRequires(classic, destination, true),
    ).toThrow(RequiresMemoException);

    const invoke = buildMockInvokeHostFunctionTransaction('transfer', []);
    expect(() =>
      assertMemoWhenDestinationRequires(invoke, destination, true),
    ).not.toThrow();
  });
});
