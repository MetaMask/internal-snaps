import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Banner, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../core/types/snap';
import { i18n } from '../../../../core/utils/i18n';
import { getErrorMessage } from './getErrorMessage';

type TransactionFailureAlertProps = {
  scan: TransactionScanResult | null;
  scanFetchStatus: FetchStatus;
  transactionExpired?: boolean;
  preferences: Preferences;
};

/**
 * Renders a transaction-failure warning without hiding security alerts. Local
 * expiry takes priority over remote execution details and does not depend on
 * scanning preferences.
 *
 * @param props - The transaction failure and preference state.
 * @param props.scan - The most recent scan result.
 * @param props.scanFetchStatus - The latest request status.
 * @param props.transactionExpired - Whether a local check detected expiry.
 * @param props.preferences - The user's preferences.
 * @returns The transaction-failure warning, or null.
 */
export const TransactionFailureAlert = ({
  scan,
  scanFetchStatus,
  transactionExpired = false,
  preferences,
}: TransactionFailureAlertProps): ComponentOrElement | null => {
  const translate = i18n(preferences.locale);

  const error =
    scanFetchStatus === 'fetched' &&
    scan?.error?.type === 'simulation' &&
    (preferences.useSecurityAlerts || preferences.simulateOnChainActions)
      ? scan?.error
      : null;

  let message: string;

  if (transactionExpired) {
    message = translate('transactionScan.errors.transactionBlockhashExpired');
  } else if (error) {
    message = translate('confirmation.simulationErrorSubtitle', {
      reason: getErrorMessage(error, preferences),
    });
  } else {
    return null;
  }

  return (
    <Banner
      title={translate('confirmation.simulationErrorTitle')}
      severity="warning"
    >
      <SnapText>{message}</SnapText>
    </Banner>
  );
};
