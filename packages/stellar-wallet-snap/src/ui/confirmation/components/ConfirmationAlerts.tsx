import { TransactionAlert } from '@metamask/snap-networks-utils';
import type { TransactionAlertLabels } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Banner, Box, Text } from '@metamask/snaps-sdk/jsx';
import type { GenericSnapElement } from '@metamask/snaps-sdk/jsx';

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
};

/**
 * Renders the confirmation banners.
 *
 * A failed local validation blocks confirmation, so it is the only banner.
 * Otherwise a simulation result and a security result render together when
 * both apply.
 *
 * @param props - The confirmation alert state.
 * @param props.preferences - User preferences controlling scan behavior.
 * @param props.scan - Latest transaction scan result.
 * @param props.scanFetchStatus - Latest transaction scan fetch status.
 * @param props.transactionsFetchStatus - Latest transaction re-validation fetch status.
 * @param props.errorMessage - Optional locale key for the validation banner subtitle.
 * @returns The banners to render, or `null` when none apply.
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
      const labels = getScanLabels(translate);

      if (scanFetchStatus === FetchStatus.Fetching) {
        return (
          <TransactionAlert
            labels={labels}
            isFetching
            isFetchError={false}
            error={null}
            validation={null}
          />
        );
      }

      const securityAlert = getSecurityAlert(
        scan,
        scanFetchStatus,
        preferences,
        translate,
        labels,
      );

      const simulationAlert = getSimulationAlert(
        scan?.error,
        preferences,
        translate,
        labels,
      );

      if (securityAlert && simulationAlert) {
        return (
          <Box>
            {toSnapElement(securityAlert)}
            {toSnapElement(simulationAlert)}
          </Box>
        );
      }

      return securityAlert ?? simulationAlert;
    }
    case ConfirmationBanner.None:
    default:
      return null;
  }
};

/**
 * Builds the simulation-failure banner from `scan.error`.
 *
 * @param error - Simulation error from the scan, when present.
 * @param preferences - User preferences controlling scan behavior.
 * @param translate - Translation function for the user's locale.
 * @param labels - Shared scan banner labels.
 * @returns The simulation banner, or `null` when it does not apply.
 */
function getSimulationAlert(
  error: TransactionScanError | null | undefined,
  preferences: ConfirmationBaseProps['preferences'],
  translate: ReturnType<typeof i18n>,
  labels: TransactionAlertLabels,
): ComponentOrElement | null {
  if (
    !error ||
    error.type === 'validation' ||
    error.type === 'response' ||
    !shouldShowError(error, preferences)
  ) {
    return null;
  }

  const errorCopy = ERROR_TYPE_TO_COPY[error.type ?? ''] ?? DEFAULT_ERROR_COPY;

  return (
    <TransactionAlert
      labels={labels}
      isFetching={false}
      isFetchError={false}
      error={{
        title: translate(errorCopy.title),
        message: translate(errorCopy.subtitle, {
          reason: getErrorMessage(error, translate),
        }),
      }}
      validation={null}
    />
  );
}

/**
 * Builds the security banner from `scan.validation`, or the unavailable notice
 * when the security scan itself failed.
 *
 * @param scan - Latest transaction scan result.
 * @param scanFetchStatus - Latest transaction scan fetch status.
 * @param preferences - User preferences controlling scan behavior.
 * @param translate - Translation function for the user's locale.
 * @param labels - Shared scan banner labels.
 * @returns The security banner, or `null` when security alerts are disabled.
 */
function getSecurityAlert(
  scan: ConfirmationAlertsProps['scan'],
  scanFetchStatus: FetchStatus,
  preferences: ConfirmationBaseProps['preferences'],
  translate: ReturnType<typeof i18n>,
  labels: TransactionAlertLabels,
): ComponentOrElement | null {
  if (!preferences.useSecurityAlerts) {
    return null;
  }

  if (scanFetchStatus === FetchStatus.Error || scan?.validationError) {
    return (
      <Banner
        title={translate('confirmation.securityScanAPIErrorTitle')}
        severity="info"
      >
        <Text>{translate('confirmation.securityScanAPIErrorMessage')}</Text>
      </Banner>
    );
  }

  return (
    <TransactionAlert
      labels={labels}
      isFetching={false}
      isFetchError={false}
      error={null}
      validation={scan?.validation ?? null}
    />
  );
}

/**
 * Builds the labels shared by the scan banners.
 *
 * @param translate - Translation function for the user's locale.
 * @returns Translated scan banner labels.
 */
function getScanLabels(
  translate: ReturnType<typeof i18n>,
): TransactionAlertLabels {
  return {
    scanInProgressTitle: translate('confirmation.securityScanInProgressTitle'),
    scanInProgressMessage: translate(
      'confirmation.securityScanInProgressMessage',
    ),
    scanFailedTitle: translate('confirmation.securityScanAPIErrorTitle'),
    scanFailedMessage: translate('confirmation.securityScanAPIErrorMessage'),
    maliciousTitle: translate('confirmation.validationErrorTitle'),
    maliciousMessage: translate('confirmation.validationErrorSubtitle'),
    warningTitle: translate('confirmation.validationWarningTitle'),
    warningMessage: translate('confirmation.validationWarningSubtitle'),
    learnMore: translate('confirmation.validationErrorLearnMore'),
    securityAdvisedBy: translate('confirmation.validationErrorSecurityAdviced'),
  };
}

/**
 * Copies a rendered banner into the Snap element shape `Box` accepts.
 *
 * @param alert - The rendered banner.
 * @returns The banner as a Snap element with no list key.
 */
function toSnapElement(alert: ComponentOrElement): GenericSnapElement {
  return { ...(alert as GenericSnapElement), key: null };
}

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
  // Blockaid codes are passed through as-is (e.g. `insufficient_funds`), while
  // `ERROR_MESSAGE_IDS` keys use the compact form (`insufficientfunds`).
  const normalizedCode = error.code
    ?.replace(/[^a-zA-Z0-9]/gu, '')
    .toLowerCase();
  const messageId = normalizedCode ? ERROR_MESSAGE_IDS[normalizedCode] : null;

  if (messageId) {
    return translate(messageId);
  }

  return error.message ?? translate('transactionScan.errors.unknownError');
}
