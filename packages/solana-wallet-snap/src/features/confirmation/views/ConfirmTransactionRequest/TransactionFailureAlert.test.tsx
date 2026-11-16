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
        validationError: null,
      } as TransactionScanResult,
    },
  ])('passes runtime UI validation for %j', (props) => {
    expect(() =>
      assertJSXElement(
        TransactionFailureAlert({
          scanFetchStatus: 'fetched',
          preferences: {
            locale: 'en',
            useSecurityAlerts: true,
            simulateOnChainActions: true,
          } as Preferences,
          ...props,
        }),
      ),
    ).not.toThrow();
  });

  it('renders a danger banner for a local expiry', () => {
    const serialized = JSON.stringify(
      TransactionFailureAlert({
        scan: null,
        scanFetchStatus: 'fetched',
        transactionExpired: true,
        preferences: { locale: 'en', useSecurityAlerts: true } as Preferences,
      }),
    );

    expect(serialized).toContain('"severity":"danger"');
  });

  it('hides a simulation failure when only security alerts are enabled', () => {
    expect(
      TransactionFailureAlert({
        scan: {
          status: 'ERROR',
          estimatedChanges: null,
          validation: { type: 'Benign', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
          validationError: null,
        },
        scanFetchStatus: 'fetched',
        preferences: { locale: 'en', useSecurityAlerts: true } as Preferences,
      }),
    ).toBeNull();
  });

  it('renders a warning banner for a simulation failure', () => {
    const serialized = JSON.stringify(
      TransactionFailureAlert({
        scan: {
          status: 'ERROR',
          estimatedChanges: { assets: [] },
          validation: { type: 'Benign', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
          validationError: null,
        },
        scanFetchStatus: 'fetched',
        preferences: {
          locale: 'en',
          useSecurityAlerts: true,
          simulateOnChainActions: true,
        } as Preferences,
      }),
    );

    expect(serialized).toContain('"severity":"warning"');
  });
});
