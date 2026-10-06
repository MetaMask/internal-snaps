import { TransactionAlert } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';

import type { TransactionScanError } from '../../../services/transaction-scan';
import type { LocalizedMessage } from '../../../utils';
import { i18n } from '../../../utils';
import type { ConfirmationBaseProps } from '../api';
import { FetchStatus } from '../api';
import { ConfirmationBanner, resolveConfirmationBanner } from '../utils';
import { TransactionValidationAlert } from './TransactionValidationAlert';

type ConfirmationAlertsProps = {
  preferences: ConfirmationBaseProps['preferences'];
  scan: ConfirmationBaseProps['scan'];
  scanFetchStatus: FetchStatus;
  transactionsFetchStatus: FetchStatus;
  errorMessage?: ConfirmationBaseProps['errorMessage'];
};

type ErrorCopy = {
  title: LocalizedMessage;
  subtitle: LocalizedMessage;
};

// Keys are normalized API codes (lowercase, no punctuation); see TransactionScanErrorId.
const ERROR_MESSAGE_IDS: Record<string, LocalizedMessage> = {
  insufficientbalance: 'transactionScan.errors.insufficientBalance',
  insufficientfunds: 'transactionScan.errors.insufficientFunds',
  invalidtransaction: 'transactionScan.errors.invalidTransaction',
  invalidaddress: 'transactionScan.errors.invalidAddress',
  notrustline: 'transactionScan.errors.noTrustline',
  transactionexpired: 'transactionScan.errors.transactionExpired',
  unsupportedeip712message: 'transactionScan.errors.unsupportedEIP712Message',
};

const DEFAULT_ERROR_COPY: ErrorCopy = {
  title: 'confirmation.securityScanErrorTitle',
  subtitle: 'confirmation.securityScanErrorSubtitle',
};

const ERROR_TYPE_TO_COPY: Record<string, ErrorCopy> = {
  simulation: {
    title: 'confirmation.simulationErrorTitle',
    subtitle: 'confirmation.simulationErrorSubtitle',
  },
  validation: {
    title: 'confirmation.validationScanErrorTitle',
    subtitle: 'confirmation.validationScanErrorSubtitle',
  },
  response: {
    title: 'confirmation.securityScanIncompleteTitle',
    subtitle: 'confirmation.securityScanIncompleteSubtitle',
  },
};

/**
 * Renders the single top-of-screen confirmation banner.
 *
 * Centralizes the validation-error vs. Blockaid-scan priority (see
 * {@link resolveConfirmationBanner}) so the views never stack both banners and
 * the rule lives in one place.
 *
 * @param props - The confirmation alert state.
 * @param props.preferences - User preferences controlling scan behavior.
 * @param props.scan - Latest transaction scan result.
 * @param props.scanFetchStatus - Latest transaction scan fetch status.
 * @param props.transactionsFetchStatus - Latest transaction re-validation fetch status.
 * @param props.errorMessage - Optional locale key for the validation banner subtitle.
 * @returns The banner to render, or `null` when none applies.
 */
export const ConfirmationAlerts = ({
  preferences,
  scan,
  scanFetchStatus,
  transactionsFetchStatus,
  errorMessage,
}: ConfirmationAlertsProps): ComponentOrElement | null => {
  switch (resolveConfirmationBanner({ preferences, transactionsFetchStatus })) {
    case ConfirmationBanner.TransactionValidation:
      return (
        <TransactionValidationAlert
          preferences={preferences}
          transactionsFetchStatus={transactionsFetchStatus}
          errorMessage={errorMessage}
        />
      );
    case ConfirmationBanner.TransactionScan: {
      const translate = i18n(preferences.locale);
      const scanError = scan?.error;
      const errorCopy =
        scanError && shouldShowError(scanError, preferences)
          ? (ERROR_TYPE_TO_COPY[scanError.type ?? ''] ?? DEFAULT_ERROR_COPY)
          : null;

      return (
        <TransactionAlert
          labels={{
            scanInProgressTitle: translate(
              'confirmation.securityScanInProgressTitle',
            ),
            scanInProgressMessage: translate(
              'confirmation.securityScanInProgressMessage',
            ),
            scanFailedTitle: translate(
              'confirmation.securityScanAPIErrorTitle',
            ),
            scanFailedMessage: translate(
              'confirmation.securityScanAPIErrorMessage',
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
          isFetching={scanFetchStatus === FetchStatus.Fetching}
          isFetchError={scanFetchStatus === FetchStatus.Error}
          error={
            scanError && errorCopy
              ? {
                  title: translate(errorCopy.title),
                  message: translate(errorCopy.subtitle, {
                    reason: getErrorMessage(scanError, translate),
                  }),
                }
              : null
          }
          validation={
            preferences.useSecurityAlerts ? (scan?.validation ?? null) : null
          }
        />
      );
    }
    case ConfirmationBanner.None:
    default:
      return null;
  }
};

/**
 * Determines whether a scan error should be visible for the enabled alert type.
 *
 * @param error - The scan error to evaluate.
 * @param preferences - User preferences controlling scan behavior.
 * @returns True when the error should be rendered.
 */
function shouldShowError(
  error: TransactionScanError,
  preferences: ConfirmationBaseProps['preferences'],
): boolean {
  if (error.type === 'simulation') {
    return preferences.simulateOnChainActions;
  }

  if (error.type === 'validation') {
    return preferences.useSecurityAlerts;
  }

  return preferences.simulateOnChainActions || preferences.useSecurityAlerts;
}

/**
 * Gets a user-facing scan error message.
 *
 * @param error - The scan error returned by the transaction scan service.
 * @param translate - The translation function for the user's locale.
 * @returns A translated or API-provided error message.
 */
function getErrorMessage(
  error: TransactionScanError,
  translate: ReturnType<typeof i18n>,
): string {
  const normalizedCode = error.code
    ?.replace(/[^a-zA-Z0-9]/gu, '')
    .toLowerCase();
  const messageId = normalizedCode ? ERROR_MESSAGE_IDS[normalizedCode] : null;

  if (messageId) {
    return translate(messageId);
  }

  return error.message ?? translate('transactionScan.errors.unknownError');
}
