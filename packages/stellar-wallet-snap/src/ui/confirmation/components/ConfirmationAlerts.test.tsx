import type { ComponentOrElement } from '@metamask/snaps-sdk';

import type {
  TransactionScanError,
  TransactionScanValidation,
} from '../../../services/transaction-scan';
import { TransactionScanValidationType } from '../../../services/transaction-scan';
import {
  defaultPreferences as preferences,
  getProps,
  getType,
  maliciousScan,
} from '../__fixtures__/confirmation.fixtures';
import { FetchStatus } from '../api';
import { ConfirmationAlerts } from './ConfirmationAlerts';

/**
 * Renders the scan banner slot (no re-validation failure).
 *
 * @param params - The scan state.
 * @param params.preferences - User preferences controlling scan behavior.
 * @param params.validation - Scan validation result.
 * @param params.error - Scan error.
 * @param params.scanFetchStatus - Scan fetch status.
 * @returns The rendered banner, or `null`.
 */
function renderScanAlert({
  preferences: scanPreferences = preferences,
  validation = null,
  error = null,
  scanFetchStatus = FetchStatus.Fetched,
}: {
  preferences?: typeof preferences;
  validation?: TransactionScanValidation | null;
  error?: TransactionScanError | null;
  scanFetchStatus?: FetchStatus;
}): ComponentOrElement | null {
  return ConfirmationAlerts({
    preferences: scanPreferences,
    scan: { ...maliciousScan, validation, error },
    scanFetchStatus,
    transactionsFetchStatus: FetchStatus.Fetched,
  });
}

describe('ConfirmationAlerts', () => {
  describe('transaction scan banner', () => {
    it('renders a scan-in-progress banner while fetching', () => {
      const component = renderScanAlert({
        scanFetchStatus: FetchStatus.Fetching,
      });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'info',
        title: 'Checking for security issues',
      });
    });

    it('renders API scan failures as danger banners', () => {
      const component = renderScanAlert({ scanFetchStatus: FetchStatus.Error });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'danger',
        title: 'Security scan failed',
      });
    });

    it('renders simulation errors when only simulation alerts are enabled', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, useSecurityAlerts: false },
        error: {
          type: 'simulation',
          code: 'insufficient_balance',
          message: 'insufficient_balance',
        },
      });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'warning',
        title: 'This transaction is expected to fail.',
      });
    });

    it('does not render simulation errors when simulation is disabled', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, simulateOnChainActions: false },
        error: {
          type: 'simulation',
          code: 'insufficient_balance',
          message: 'insufficient_balance',
        },
      });

      expect(component).toBeNull();
    });

    it('renders validation scan errors with validation failure copy', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, simulateOnChainActions: false },
        error: {
          type: 'validation',
          code: 'invalid_transaction',
          message: 'invalid_transaction',
        },
      });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'warning',
        title: 'Security check unavailable',
      });
    });

    it('renders response scan errors with incomplete scan copy', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, simulateOnChainActions: false },
        error: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'warning',
        title: 'Security scan incomplete',
      });
    });

    it('renders a localized message for transaction expired simulation errors', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, useSecurityAlerts: false },
        error: {
          type: 'simulation',
          code: 'transactionexpired',
          message: 'Transaction expired',
        },
      });

      expect(JSON.stringify(component)).toContain('Transaction expired');
    });

    it('renders scan errors before validation severity findings', () => {
      const component = renderScanAlert({
        validation: maliciousScan.validation,
        error: {
          type: 'simulation',
          code: 'invalid_transaction',
          message: 'invalid_transaction',
        },
      });

      expect(getProps(component)).toMatchObject({
        severity: 'warning',
        title: 'This transaction is expected to fail.',
      });
    });

    it('does not render validation alerts when security alerts are disabled', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, useSecurityAlerts: false },
        validation: maliciousScan.validation,
      });

      expect(component).toBeNull();
    });

    it('renders malicious validation alerts as danger banners', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, simulateOnChainActions: false },
        validation: maliciousScan.validation,
      });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'danger',
        title: 'This is a deceptive request',
      });
      expect(JSON.stringify(component)).toContain(
        'If you approve this request, a third party known for scams will take all your assets.',
      );
    });

    it('renders warning validation alerts with softer warning copy', () => {
      const component = renderScanAlert({
        preferences: { ...preferences, simulateOnChainActions: false },
        validation: {
          type: TransactionScanValidationType.Warning,
          reason: 'suspicious_request',
          description: null,
        },
      });

      expect(getType(component)).toBe('Banner');
      expect(getProps(component)).toMatchObject({
        severity: 'warning',
        title: 'This request may be risky',
      });
    });

    it('renders nothing for benign validation', () => {
      const component = renderScanAlert({
        validation: {
          type: TransactionScanValidationType.Benign,
          reason: null,
          description: null,
        },
      });

      expect(component).toBeNull();
    });
  });

  it('renders the validation banner when re-validation reports an error', () => {
    const component = ConfirmationAlerts({
      preferences,
      scan: null,
      scanFetchStatus: FetchStatus.Fetched,
      transactionsFetchStatus: FetchStatus.Error,
    });

    expect(getType(component)).toBe('Banner');
    expect(getProps(component)).toMatchObject({
      severity: 'danger',
      title: 'This transaction is expected to fail.',
    });
  });

  it('renders the scan banner when scan is enabled and there is no validation error', () => {
    const component = ConfirmationAlerts({
      preferences,
      scan: maliciousScan,
      scanFetchStatus: FetchStatus.Fetched,
      transactionsFetchStatus: FetchStatus.Fetched,
    });

    expect(getType(component)).toBe('Banner');
    expect(getProps(component)).toMatchObject({
      title: 'This is a deceptive request',
    });
  });

  it('renders nothing when scan is disabled and there is no validation error', () => {
    const component = ConfirmationAlerts({
      preferences: {
        ...preferences,
        useSecurityAlerts: false,
        simulateOnChainActions: false,
      },
      scan: null,
      scanFetchStatus: FetchStatus.Fetched,
      transactionsFetchStatus: FetchStatus.Fetched,
    });

    expect(component).toBeNull();
  });

  it('renders the validation banner with pre-submit send error copy', () => {
    const component = ConfirmationAlerts({
      preferences,
      scan: null,
      scanFetchStatus: FetchStatus.Fetched,
      transactionsFetchStatus: FetchStatus.Error,
      errorMessage: 'confirmation.txnError.requiresMemo',
    });

    expect(getType(component)).toBe('Banner');
    expect(getProps(component)).toMatchObject({
      severity: 'danger',
      title: 'This transaction is expected to fail.',
    });
    expect(
      getProps(getProps(component)?.children as ComponentOrElement)?.children,
    ).toBe('This account requires a memo. Add a memo to continue.');
  });

  it('shows the validation banner (not the scan banner) when both would apply', () => {
    const component = ConfirmationAlerts({
      preferences,
      scan: maliciousScan,
      scanFetchStatus: FetchStatus.Fetched,
      transactionsFetchStatus: FetchStatus.Error,
    });

    expect(getProps(component)).toMatchObject({
      title: 'This transaction is expected to fail.',
    });
  });
});
