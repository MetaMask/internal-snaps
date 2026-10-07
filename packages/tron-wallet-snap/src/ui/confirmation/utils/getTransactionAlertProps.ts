import type { TransactionAlertProps } from '@metamask/snap-networks-utils';

import type { TransactionScanResult } from '../../../services/transaction-scan/types';
import { FetchStatus } from '../../../types/snap';
import type { Preferences } from '../../../types/snap';
import { i18n } from '../../../utils/i18n';
import { isFetchStatusLoadingOrFetching } from '../../../utils/isFetchStatusLoadingOrFetching';
import { getErrorMessage } from './getErrorMessage';

/**
 * Maps the confirmation scan state to the shared `TransactionAlert` props.
 *
 * @param params - The confirmation scan state.
 * @param params.preferences - The user preferences.
 * @param params.scan - The latest transaction scan result.
 * @param params.scanFetchStatus - The transaction scan fetch status.
 * @returns The props for the shared `TransactionAlert` component.
 */
export function getTransactionAlertProps({
  preferences,
  scan,
  scanFetchStatus,
}: {
  preferences: Preferences;
  scan: TransactionScanResult | null | undefined;
  scanFetchStatus: FetchStatus;
}): TransactionAlertProps {
  const translate = i18n(preferences.locale);
  const scanError = scan?.error;

  return {
    labels: {
      scanInProgressTitle: translate(
        'confirmation.securityScanInProgressTitle',
      ),
      scanInProgressMessage: translate(
        'confirmation.securityScanInProgressMessage',
      ),
      scanFailedTitle: translate('confirmation.simulationTitleAPIError'),
      scanFailedMessage: translate('confirmation.simulationMessageAPIError'),
      maliciousTitle: translate('confirmation.validationErrorTitle'),
      maliciousMessage: translate('confirmation.validationErrorSubtitle'),
      warningTitle: translate('confirmation.validationErrorTitle'),
      warningMessage: translate('confirmation.validationErrorSubtitle'),
      learnMore: translate('confirmation.validationErrorLearnMore'),
      securityAdvisedBy: translate(
        'confirmation.validationErrorSecurityAdviced',
      ),
    },
    isFetching: isFetchStatusLoadingOrFetching(scanFetchStatus),
    isFetchError: scanFetchStatus === FetchStatus.Error,
    error: scanError
      ? {
          title: translate('confirmation.simulationErrorTitle'),
          message: translate('confirmation.simulationErrorSubtitle', {
            reason: getErrorMessage(scanError, preferences),
          }),
        }
      : null,
    validation: scan?.validation ?? null,
  };
}
