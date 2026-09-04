import type { ComponentOrElement } from '@metamask/snaps-sdk';

import {
  defaultPreferences as preferences,
  getProps,
  getType,
  maliciousScan,
} from '../__fixtures__/confirmation.fixtures';
import { FetchStatus } from '../api';
import { ConfirmationAlerts } from './ConfirmationAlerts';

describe('ConfirmationAlerts', () => {
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
    ).toBe('This account requires a memo. Sends to it are not supported.');
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
