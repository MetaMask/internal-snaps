import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Banner,
  Text as SnapText,
  Skeleton,
} from '@metamask/snaps-sdk/jsx';

import type {
  TransactionScanError,
  TransactionScanValidation,
} from '../../../../services/transaction-scan/types';
import { SecurityAlertResponse } from '../../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../types/snap';
import { i18n } from '../../../../utils/i18n';

export type TransactionAlertProps = {
  scanFetchStatus: FetchStatus;
  validation: TransactionScanValidation | null;
  status: 'SUCCESS' | 'ERROR' | null;
  error: TransactionScanError | null;
  preferences: Preferences;
};

export const TransactionAlert = ({
  scanFetchStatus,
  validation,
  status,
  error,
  preferences,
}: TransactionAlertProps): ComponentOrElement | null => {
  const translate = i18n(preferences.locale);

  const isFetching = scanFetchStatus === 'fetching';

  if (isFetching) {
    return (
      <Box>
        <Skeleton height="40px" />
      </Box>
    );
  }

  // Show error state if scan failed, has error status, or has error details
  if (error || scanFetchStatus === 'error' || status === 'ERROR') {
    return (
      <Banner
        title={translate('confirmation.securityAlert.error')}
        severity="warning"
      >
        <SnapText>
          {translate('confirmation.securityAlert.unavailable')}
        </SnapText>
      </Banner>
    );
  }

  // No validation result
  if (!validation?.type) {
    return null;
  }

  // Benign - no alert needed
  if (validation.type === SecurityAlertResponse.Benign) {
    return null;
  }

  // Warning
  if (validation.type === SecurityAlertResponse.Warning) {
    return (
      <Banner
        title={translate('confirmation.securityAlert.warning.title')}
        severity="warning"
      >
        <SnapText>
          {translate('confirmation.securityAlert.warning.message')}
        </SnapText>
      </Banner>
    );
  }

  // Malicious
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (validation.type === SecurityAlertResponse.Malicious) {
    return (
      <Banner
        title={translate('confirmation.securityAlert.malicious.title')}
        severity="danger"
      >
        <SnapText>
          {translate('confirmation.securityAlert.malicious.message')}
        </SnapText>
      </Banner>
    );
  }

  return null;
};
