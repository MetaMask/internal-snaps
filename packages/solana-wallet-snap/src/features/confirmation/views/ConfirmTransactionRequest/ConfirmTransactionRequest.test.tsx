import { SolMethod } from '@metamask/keyring-api';
import {
  ActionHeader,
  MaliciousAcknowledgementFormNames,
} from '@metamask/snap-networks-utils';

import type { SpotPrices } from '../../../../core/clients/price-api/types';
import { KnownCaip19Id, Network } from '../../../../core/constants/solana';
import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { Preferences } from '../../../../core/types/snap';
import { formatFiat } from '../../../../core/utils/formatFiat';
import { tokenToFiat } from '../../../../core/utils/tokenToFiat';
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
  acknowledgementScreen: false,
  acknowledged: false,
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
  it('renders the shared header with the method title', () => {
    expect(render({})).toContain(
      JSON.stringify(ActionHeader({ title: 'Transaction request' })),
    );
  });

  describe('security alert', () => {
    it('renders the in-progress banner while the scan is fetching', () => {
      const serialized = render({ scanFetchStatus: 'fetching' });

      expect(serialized).toContain('"severity":"info"');
      expect(serialized).toContain('Checking for security issues');
    });

    it('renders the API error banner when the scan request fails', () => {
      const serialized = render({ scanFetchStatus: 'error' });

      expect(serialized).toContain('"severity":"info"');
      expect(serialized).toContain('Security check unavailable');
      expect(serialized).toContain(
        "We couldn't complete this safety check. Continue only if you trust the site and addresses involved.",
      );
      expect(serialized).not.toContain('"disabled":true');
    });

    it('renders the simulation error banner with the translated reason', () => {
      const serialized = render({
        scan: scan({
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
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
      expect(serialized).toContain('This is a deceptive request');
      expect(serialized.match(/"type":"Banner"/gu)).toHaveLength(2);
    });

    it.each([['Malicious', 'danger']] as const)(
      'renders the security banner for a %s validation',
      (type, severity) => {
        const serialized = render({
          scan: scan({ validation: { type, reason: null } }),
        });

        expect(serialized).toContain(`"severity":"${severity}"`);
        expect(serialized).toContain('This is a deceptive request');
        expect(serialized).toContain('See details');
        expect(serialized).toContain('Powered by');
      },
    );

    it('renders the soft warning copy for a warning validation', () => {
      const serialized = render({
        scan: scan({ validation: { type: 'Warning', reason: null } }),
      });

      expect(serialized).toContain('"severity":"warning"');
      expect(serialized).toContain('This request may be risky');
      expect(serialized).toContain('See details');
      expect(serialized).toContain('Powered by');
      expect(serialized).not.toContain('This is a deceptive request');
    });

    it('renders a destructive Confirm that opens acknowledgement for a malicious validation', () => {
      const serialized = render({
        scan: scan({ validation: { type: 'Malicious', reason: null } }),
      });

      expect(serialized).toContain('Confirm');
      expect(serialized).toContain('"variant":"destructive"');
      expect(serialized).toContain(MaliciousAcknowledgementFormNames.Review);
      expect(serialized).not.toContain('Review alert');
      expect(serialized).not.toContain('"disabled":true');
      expect(serialized).not.toContain(
        'confirm-sign-and-send-transaction-confirm',
      );
    });

    it('keeps the confirm button for a warning validation', () => {
      const serialized = render({
        scan: scan({ validation: { type: 'Warning', reason: null } }),
      });

      expect(serialized).not.toContain('Review alert');
      expect(serialized).not.toContain('"variant":"destructive"');
      expect(serialized).toContain('confirm-sign-and-send-transaction-confirm');
    });

    it('keeps malicious acknowledgement available despite a remote execution failure', () => {
      const serialized = render({
        scan: scan({
          status: 'ERROR',
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
          validation: { type: 'Malicious', reason: null },
        }),
      });

      expect(serialized).toContain(MaliciousAcknowledgementFormNames.Review);
      expect(serialized).toContain('"variant":"destructive"');
      expect(serialized).not.toContain('"disabled":true');
    });

    it('shows the execution-failure warning while allowing normal confirmation', () => {
      const serialized = render({
        scan: scan({
          status: 'ERROR',
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
        }),
      });

      expect(serialized).toContain(
        'This transaction was reverted during simulation.',
      );
      expect(serialized).toContain(
        'Account does not have enough SOL to perform the operation.',
      );
      expect(serialized).toContain('"severity":"warning"');
      expect(serialized).toContain('confirm-sign-and-send-transaction-confirm');
      expect(serialized).not.toContain('"disabled":true');
    });

    it('renders no banner for a benign validation', () => {
      expect(render({ scan: scan({}) })).not.toContain('"type":"Banner"');
    });

    it.each(['validation', 'response'] as const)(
      'shows an info banner and enables confirmation for a %s error',
      (type) => {
        const serialized = render({
          scan: scan({
            status: 'ERROR',
            error: {
              type,
              code: 'empty',
              message: 'No scan results returned',
            },
          }),
        });

        expect(serialized).toContain('Security check unavailable');
        expect(serialized).toContain('"severity":"info"');
        expect(serialized).not.toContain('reverted during simulation');
        expect(serialized).not.toContain('"disabled":true');
      },
    );

    it('keeps missing simulation estimates unavailable without hiding a successful security verdict', () => {
      const serialized = render({
        preferences: { ...context.preferences, simulateOnChainActions: true },
        scan: scan({
          status: 'ERROR',
          validation: { type: 'Warning', reason: null },
        }),
      });

      expect(serialized).toContain('This request may be risky');
      expect(serialized).toContain('Not available');
      expect(serialized).not.toContain('No changes');
      expect(serialized).not.toContain('Security check unavailable');
      expect(serialized).not.toContain('"disabled":true');
    });

    it('does not let a retained execution failure block confirmation after a scan outage', () => {
      const serialized = render({
        scanFetchStatus: 'error',
        scan: scan({
          status: 'ERROR',
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
        }),
      });

      expect(serialized).toContain('Security check unavailable');
      expect(serialized).not.toContain('reverted during simulation');
      expect(serialized).not.toContain('"disabled":true');
    });

    it.each(['fetched', 'error'] as const)(
      'keeps local expiry blocking independently of a %s scan',
      (scanFetchStatus) => {
        const serialized = render({
          scanFetchStatus,
          transactionExpired: true,
          scan: scan({}),
        });

        expect(serialized).toContain(
          'This transaction was reverted during simulation.',
        );
        expect(serialized).toContain('Please go back and try again');
        expect(serialized).toContain('"disabled":true');
        expect(serialized.includes('Security check unavailable')).toBe(
          scanFetchStatus === 'error',
        );
      },
    );

    it.each([
      ['Malicious', 'This is a deceptive request'],
      ['Warning', 'This request may be risky'],
    ])('keeps the %s security banner alongside local expiry', (type, title) => {
      const serialized = render({
        transactionExpired: true,
        scan: scan({ validation: { type, reason: null } }),
      });

      expect(serialized).toContain(title);
      expect(serialized).toContain('Please go back and try again');
      expect(serialized.match(/"type":"Banner"/gu)).toHaveLength(2);
      expect(serialized).toContain('"disabled":true');
      expect(serialized).not.toContain(
        MaliciousAcknowledgementFormNames.Review,
      );
    });

    it('keeps the warning security verdict alongside a remote execution failure', () => {
      const serialized = render({
        scan: scan({
          status: 'ERROR',
          validation: { type: 'Warning', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
        }),
      });

      expect(serialized).toContain('This request may be risky');
      expect(serialized).toContain(
        'Account does not have enough SOL to perform the operation.',
      );
      expect(serialized.match(/"type":"Banner"/gu)).toHaveLength(2);
      expect(serialized).not.toContain('"disabled":true');
    });

    it('shows security unavailability and a reported execution failure independently', () => {
      const serialized = render({
        scan: scan({
          status: 'ERROR',
          validation: { type: 'Error', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
        }),
      });

      expect(serialized).toContain('Security check unavailable');
      expect(serialized).toContain(
        'Account does not have enough SOL to perform the operation.',
      );
      expect(serialized).toContain('"severity":"info"');
      expect(serialized).toContain('"severity":"warning"');
      expect(serialized.match(/"type":"Banner"/gu)).toHaveLength(2);
      expect(serialized).not.toContain('"disabled":true');
    });

    it('hides the security verdict when disabled without hiding the execution warning', () => {
      const serialized = render({
        preferences: {
          ...context.preferences,
          useSecurityAlerts: false,
          simulateOnChainActions: true,
        },
        scan: scan({
          status: 'ERROR',
          validation: { type: 'Malicious', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
        }),
      });

      expect(serialized).not.toContain('This is a deceptive request');
      expect(serialized).toContain(
        'Account does not have enough SOL to perform the operation.',
      );
      expect(serialized.match(/"type":"Banner"/gu)).toHaveLength(1);
      expect(serialized).not.toContain(
        MaliciousAcknowledgementFormNames.Review,
      );
      expect(serialized).not.toContain('"disabled":true');
    });

    it('shows local expiry even with all scan preferences disabled', () => {
      const serialized = render({
        transactionExpired: true,
        preferences: {
          ...context.preferences,
          useSecurityAlerts: false,
          simulateOnChainActions: false,
        },
      });

      expect(serialized).toContain('Please go back and try again');
      expect(serialized).toContain('"disabled":true');
    });

    it('renders no banner when security alerts are disabled and the scan succeeded', () => {
      const serialized = render({
        preferences: { ...context.preferences, useSecurityAlerts: false },
        scan: scan({ validation: { type: 'Malicious', reason: null } }),
      });

      expect(serialized).not.toContain('"type":"Banner"');
    });

    it('renders the fetch-error banner when security alerts are disabled but simulation is on', () => {
      const serialized = render({
        preferences: {
          ...context.preferences,
          useSecurityAlerts: false,
          simulateOnChainActions: true,
        },
        scanFetchStatus: 'error',
      });

      expect(serialized).toContain('"severity":"info"');
      expect(serialized).toContain('Security check unavailable');
    });

    it('renders no banner when all scan preferences are disabled', () => {
      const serialized = render({
        preferences: {
          ...context.preferences,
          useSecurityAlerts: false,
          simulateOnChainActions: false,
        },
        scanFetchStatus: 'error',
      });

      expect(serialized).not.toContain('"type":"Banner"');
    });
  });

  describe('malicious acknowledgement', () => {
    it('renders the acknowledgement title once with an untitled danger banner', () => {
      const serialized = render({ acknowledgementScreen: true });

      expect(serialized.match(/High-risk request/gu)).toHaveLength(1);
      expect(serialized).toContain(
        "Security partners found high-risk signals in this request. If you continue, your funds can't be recovered.",
      );
      expect(serialized).toContain('"type":"Banner"');
      expect(serialized).toContain('"title":""');
      expect(serialized).toContain('"severity":"danger"');
      expect(serialized).toContain(
        'I have acknowledged the risk and still want to proceed',
      );
      expect(serialized).toContain('"disabled":true');
    });

    it('enables the proceed button once the risk is acknowledged', () => {
      const serialized = render({
        acknowledgementScreen: true,
        acknowledged: true,
      });

      expect(serialized).not.toContain('"disabled":true');
    });
  });

  describe('fee', () => {
    const tokenPrices = {
      [KnownCaip19Id.SolMainnet]: { price: 150 },
    } as unknown as SpotPrices;
    const fiat = formatFiat(tokenToFiat('0.000005', 150), 'usd', 'en');

    it('renders the fiat value before the fee in SOL', () => {
      const serialized = render({ feeEstimatedInSol: '0.000005', tokenPrices });

      expect(serialized).toContain('"children":"0.000005 SOL"');
      expect(serialized.indexOf(fiat)).toBeGreaterThan(-1);
      expect(serialized.indexOf(fiat)).toBeLessThan(
        serialized.indexOf('0.000005 SOL'),
      );
    });

    it('renders a skeleton instead of the fiat value while prices load', () => {
      const serialized = render({
        feeEstimatedInSol: '0.000005',
        tokenPrices,
        tokenPricesFetchStatus: 'fetching',
      });

      expect(serialized).toContain('"type":"Skeleton"');
      expect(serialized).not.toContain(fiat);
      expect(serialized).toContain('"children":"0.000005 SOL"');
    });

    it('renders only the fee in SOL when prices failed to load', () => {
      const serialized = render({
        feeEstimatedInSol: '0.000005',
        tokenPrices,
        tokenPricesFetchStatus: 'error',
      });

      expect(serialized).not.toContain(fiat);
      expect(serialized).toContain('"children":"0.000005 SOL"');
    });

    it('renders a warning when the fee could not be estimated', () => {
      const serialized = render({ feeEstimatedInSol: null });

      expect(serialized).toContain('"name":"warning"');
      expect(serialized).not.toContain(' SOL"');
    });
  });
});
