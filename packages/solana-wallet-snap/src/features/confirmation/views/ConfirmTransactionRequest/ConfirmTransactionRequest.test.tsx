import { SolMethod } from '@metamask/keyring-api';
import { ActionHeader } from '@metamask/snap-networks-utils';

import type { SpotPrices } from '../../../../core/clients/price-api/types';
import { KnownCaip19Id, Network } from '../../../../core/constants/solana';
import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../../core/test/mocks/solana-keyring-accounts';
import type { Preferences } from '../../../../core/types/snap';
import { formatFiat } from '../../../../core/utils/formatFiat';
import { tokenToFiat } from '../../../../core/utils/tokenToFiat';
import type { FeePayment } from '../../utils/analyzeFeePayment';
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
  feePayment: null,
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

  describe('fee payment', () => {
    const sponsor = 'CDg3bPoM21fSXEzrXWHWyJR33JHX6xaYboq5p7s4uo48';
    const sponsored = (overrides: Partial<FeePayment>): FeePayment => ({
      feePayer: sponsor,
      paidBy: 'sponsor',
      userCost: 'free',
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
      ...overrides,
    });
    const renderWithFeePayment = (feePayment: FeePayment): string =>
      render({
        account: MOCK_SOLANA_KEYRING_ACCOUNT_0,
        feeEstimatedInSol: '0.000005',
        feePayment,
      });

    it('renders no payer rows when the account pays the fee', () => {
      const serialized = renderWithFeePayment({
        feePayer: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        paidBy: 'account',
        userCost: null,
        userCosts: [],
        mayCostMore: false,
        uncheckedPrograms: [],
      });

      expect(serialized).toContain('"children":"0.000005 SOL"');
      expect(serialized).not.toContain('Sponsored by');
      expect(serialized).not.toContain('Fee paid by');
      expect(serialized).not.toContain('You pay');
    });

    it('renders the paying account when another wallet account pays', () => {
      const serialized = renderWithFeePayment({
        feePayer: sponsor,
        paidBy: 'ownAccount',
        userCost: null,
        userCosts: [],
        mayCostMore: false,
        uncheckedPrograms: [],
      });

      expect(serialized).toContain('Fee paid by');
      expect(serialized).toContain(
        `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${sponsor}`,
      );
      expect(serialized).not.toContain('You pay');
    });

    it('renders a free sponsored transaction', () => {
      const serialized = renderWithFeePayment(sponsored({}));

      expect(serialized).toContain('"children":"0.000005 SOL"');
      expect(serialized).toContain('Sponsored by');
      expect(serialized).toContain(
        `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${sponsor}`,
      );
      expect(serialized).toContain('You pay');
      expect(serialized).toContain('"children":"Free"');
      expect(serialized).toContain('"color":"success"');
      expect(serialized).not.toContain('Not free');
    });

    it('renders what the user pays when the sponsored transaction has costs', () => {
      const serialized = renderWithFeePayment(
        sponsored({
          userCost: 'costs',
          userCosts: [
            { type: 'rent', lamports: '2039280' },
            { type: 'solToSponsor', lamports: '5000' },
            {
              type: 'tokenToSponsor',
              mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: '150000',
              decimals: 6,
              symbol: 'USDC',
            },
          ],
        }),
      );

      expect(serialized).toContain('Not free');
      expect(serialized).not.toContain('"children":"Free"');
      expect(serialized).toContain('Account rent');
      expect(serialized).toContain('"children":"0.00204 SOL"');
      expect(serialized).toContain('Paid to sponsor');
      expect(serialized).toContain('"children":"0.000005 SOL"');
      expect(serialized).toContain('"children":"0.15 USDC"');
      expect(serialized).not.toContain('may charge you more');
    });

    it('falls back to the mint address when the token symbol is unknown', () => {
      const serialized = renderWithFeePayment(
        sponsored({
          userCost: 'costs',
          userCosts: [
            {
              type: 'tokenToSponsor',
              mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: '150000',
              decimals: 6,
              symbol: null,
            },
          ],
        }),
      );

      expect(serialized).toContain('"children":"0.15 EPjFW...TDt1v"');
    });

    it('warns that the user may pay more than the listed costs', () => {
      const serialized = renderWithFeePayment(
        sponsored({
          userCost: 'costs',
          userCosts: [{ type: 'solToSponsor', lamports: '5000' }],
          mayCostMore: true,
        }),
      );

      expect(serialized).toContain('Not free');
      expect(serialized).toContain('may charge you more');
    });

    it('does not claim the transaction is free when it cannot be verified', () => {
      const serialized = renderWithFeePayment(
        sponsored({
          userCost: 'unverified',
          mayCostMore: true,
          uncheckedPrograms: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'],
        }),
      );

      expect(serialized).toContain("Programs it can't check: JUP6L...VTaV4.");

      expect(serialized).toContain('Sponsored by');
      expect(serialized).toContain("Can't confirm");
      expect(serialized).not.toContain('"children":"Free"');
    });
  });
});
