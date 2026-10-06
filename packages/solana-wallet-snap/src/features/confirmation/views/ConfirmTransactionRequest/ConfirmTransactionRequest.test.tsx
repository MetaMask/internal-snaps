import { SolMethod } from '@metamask/keyring-api';

import { Network } from '../../../../core/constants/solana';
import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { Preferences } from '../../../../core/types/snap';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';

const context: ConfirmTransactionRequestContext = {
  method: SolMethod.SignAndSendTransaction,
  scope: Network.Mainnet,
  networkImage: null,
  account: null,
  accountDomain: null,
  destinationAddress: null,
  destinationDomain: null,
  transaction: '',
  scan: null,
  scanFetchStatus: 'fetched',
  feeEstimatedInSol: '0',
  tokenPrices: {},
  tokenPricesFetchStatus: 'fetched',
  origin: '',
  preferences: {
    locale: 'en',
    currency: 'usd',
    useSecurityAlerts: true,
    simulateOnChainActions: false,
  } as Preferences,
  advanced: { shown: false, instructions: [] },
};

const scan = (
  overrides: Partial<TransactionScanResult>,
): TransactionScanResult => ({
  status: 'SUCCESS',
  estimatedChanges: { assets: [] },
  validation: { type: 'Benign', reason: null },
  error: null,
  ...overrides,
});

const render = (overrides: Partial<ConfirmTransactionRequestContext>): string =>
  JSON.stringify(
    ConfirmTransactionRequest({ context: { ...context, ...overrides } }),
  );

describe('ConfirmTransactionRequest', () => {
  describe('security alert', () => {
    it('renders the in-progress banner while the scan is fetching', () => {
      const serialized = render({ scanFetchStatus: 'fetching' });

      expect(serialized).toContain('"severity":"info"');
      expect(serialized).toContain('Checking for security issues');
    });

    it('renders the API error banner when the scan request fails', () => {
      const serialized = render({ scanFetchStatus: 'error' });

      expect(serialized).toContain('"severity":"danger"');
      expect(serialized).toContain(
        "Because of an error, we couldn't check for security alerts.",
      );
    });

    it('renders the simulation error banner with the translated reason', () => {
      const serialized = render({
        scan: scan({
          error: { type: 'simulation', code: 'ResultWithNegativeLamports' },
          validation: { type: 'Malicious', reason: null },
        }),
      });

      expect(serialized).toContain('"severity":"warning"');
      expect(serialized).toContain(
        'This transaction was reverted during simulation.',
      );
      expect(serialized).toContain(
        'Account does not have enough SOL to perform the operation.',
      );
      expect(serialized).not.toContain('This is a deceptive request');
    });

    it.each([
      ['Malicious', 'danger'],
      ['Warning', 'warning'],
    ] as const)(
      'renders the security banner for a %s validation',
      (type, severity) => {
        const serialized = render({
          scan: scan({ validation: { type, reason: null } }),
        });

        expect(serialized).toContain(`"severity":"${severity}"`);
        expect(serialized).toContain('This is a deceptive request');
        expect(serialized).toContain('Security advice by');
      },
    );

    it('renders no banner for a benign validation', () => {
      expect(render({ scan: scan({}) })).not.toContain('"type":"Banner"');
    });

    it('renders no banner when security alerts are disabled and the scan succeeded', () => {
      const serialized = render({
        preferences: { ...context.preferences, useSecurityAlerts: false },
        scan: scan({ validation: { type: 'Malicious', reason: null } }),
      });

      expect(serialized).not.toContain('"type":"Banner"');
    });
  });
});
