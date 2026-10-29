import { TransactionAlert } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Banner, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../core/types/snap';
import { i18n } from '../../../../core/utils/i18n';

type SecurityScanAlertProps = {
  scan: TransactionScanResult | null;
  scanFetchStatus: FetchStatus;
  preferences: Preferences;
};

/**
 * Renders scan availability and security verdicts independently of transaction
 * execution failures and local expiry.
 *
 * @param props - The scan and preference state.
 * @param props.scan - The most recent scan result.
 * @param props.scanFetchStatus - The latest request status.
 * @param props.preferences - The user's preferences.
 * @returns The security alert, or null.
 */
export const SecurityScanAlert = ({
  scan,
  scanFetchStatus,
  preferences,
}: SecurityScanAlertProps): ComponentOrElement | null => {
  const translate = i18n(preferences.locale);

  if (!preferences.useSecurityAlerts && !preferences.simulateOnChainActions) {
    return null;
  }

  const isFetching = scanFetchStatus === 'fetching';
  const unavailable =
    scanFetchStatus === 'error' ||
    scan?.error?.type === 'validation' ||
    scan?.error?.type === 'response' ||
    (preferences.useSecurityAlerts && scan?.validation.type === 'Error');

  if (!isFetching && unavailable) {
    return (
      <Banner
        title={translate('confirmation.securityScanUnavailableTitle')}
        severity="info"
      >
        <SnapText>
          {translate('confirmation.securityScanUnavailableMessage')}
        </SnapText>
      </Banner>
    );
  }

  return (
    <TransactionAlert
      labels={{
        scanInProgressTitle: translate(
          'confirmation.securityScanInProgressTitle',
        ),
        scanInProgressMessage: translate(
          'confirmation.securityScanInProgressMessage',
        ),
        scanFailedTitle: translate('confirmation.securityScanUnavailableTitle'),
        scanFailedMessage: translate(
          'confirmation.securityScanUnavailableMessage',
        ),
        maliciousTitle: translate('confirmation.validationErrorTitle'),
        maliciousMessage: translate('confirmation.validationErrorSubtitle'),
        warningTitle: translate('confirmation.validationWarningTitle'),
        warningMessage: translate('confirmation.validationWarningSubtitle'),
        learnMore: translate('confirmation.validationErrorLearnMore'),
        securityAdvisedBy: translate(
          'confirmation.validationErrorSecurityAdviced',
        ),
      }}
      isFetching={isFetching}
      isFetchError={false}
      error={null}
      validation={
        preferences.useSecurityAlerts ? (scan?.validation ?? null) : null
      }
    />
  );
};
