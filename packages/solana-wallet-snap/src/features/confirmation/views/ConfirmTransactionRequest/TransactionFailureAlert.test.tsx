import { assertJSXElement } from '@metamask/snaps-sdk/jsx';

import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { Preferences } from '../../../../core/types/snap';
import { TransactionFailureAlert } from './TransactionFailureAlert';

describe('TransactionFailureAlert', () => {
  it.each([
    { scan: null, transactionExpired: true },
    {
      scan: {
        status: 'ERROR',
        estimatedChanges: { assets: [] },
        validation: { type: 'Malicious', reason: null },
        error: {
          type: 'simulation',
          code: 'ResultWithNegativeLamports',
          message: null,
        },
      } as TransactionScanResult,
    },
  ])('passes runtime UI validation for %j', (props) => {
    expect(() =>
      assertJSXElement(
        TransactionFailureAlert({
          scanFetchStatus: 'fetched',
          preferences: { locale: 'en', useSecurityAlerts: true } as Preferences,
          ...props,
        }),
      ),
    ).not.toThrow();
  });
});
