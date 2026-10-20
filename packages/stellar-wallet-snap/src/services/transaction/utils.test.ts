import {
  buildMockClassicTransaction,
  buildMockInvokeHostFunctionTransaction,
} from './__mocks__/transaction.fixtures';
import { RequiresMemoException } from './exceptions';
import { assertMemoWhenDestinationRequires } from './utils';

describe('assertMemoWhenDestinationRequires', () => {
  const destination =
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  // Coinbase Deposits — SEP-37 directory (no SEP-29 on-chain).
  const directoryDestination =
    'GDS2WFLIJID6BDM64FGUD7MNOVZUEWHJ5VJPO2GQ32KOZCYIYIRIQTG6';

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

  it('enforces memo for SEP-37 directory destinations even when destRequiresMemo is false', () => {
    const classic = buildMockClassicTransaction([
      {
        type: 'payment',
        params: {
          destination: directoryDestination,
          asset: 'native',
          amount: '1',
        },
      },
    ]);
    expect(() =>
      assertMemoWhenDestinationRequires(classic, directoryDestination, false),
    ).toThrow(RequiresMemoException);
  });
});
