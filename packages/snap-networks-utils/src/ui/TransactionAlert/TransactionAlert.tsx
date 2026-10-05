import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Banner, Icon, Link, Text as SnapText } from '@metamask/snaps-sdk/jsx';
import type { BannerProps } from '@metamask/snaps-sdk/jsx';

export type TransactionAlertLabels = {
  scanInProgressTitle: string;
  scanInProgressMessage: string;
  scanFailedTitle: string;
  scanFailedMessage: string;
  maliciousTitle: string;
  maliciousMessage: string;
  warningTitle: string;
  warningMessage: string;
  learnMore: string;
  securityAdvisedBy: string;
};

export type TransactionAlertError = {
  /** Translated banner title. */
  title: string;
  /** Translated, user-facing reason of the scan error. */
  message: string;
};

export type TransactionAlertValidation = {
  /** Security validation result type, e.g. `Malicious`, `Warning` or `Benign`. */
  type: string | null;
  /** Provider description of the finding, used instead of the default message. */
  description?: string | null;
};

export type TransactionAlertProps = {
  labels: TransactionAlertLabels;
  /** Whether the transaction scan is in flight. */
  isFetching: boolean;
  /** Whether the transaction scan request itself failed. */
  isFetchError: boolean;
  /** The scan error to show, or `null` when there is none (or it is disabled). */
  error: TransactionAlertError | null;
  /** The security validation to show, or `null` when there is none (or it is disabled). */
  validation: TransactionAlertValidation | null;
};

const SECURITY_ALERTS_URL =
  'https://support.metamask.io/configure/wallet/how-to-turn-on-security-alerts/';

const BLOCKAID_URL = 'https://www.blockaid.io';

/**
 * Resolves the security banner for a validation result.
 *
 * @param validation - The security validation result.
 * @param labels - The translated labels.
 * @returns The banner severity, title and message, or `null` when the
 * validation does not warrant a banner.
 */
function getValidationAlert(
  validation: TransactionAlertValidation,
  labels: TransactionAlertLabels,
): {
  severity: BannerProps['severity'];
  title: string;
  message: string;
} | null {
  const trimmedDescription = validation.description?.trim();
  const description =
    trimmedDescription === '' ? undefined : trimmedDescription;

  if (validation.type === 'Malicious') {
    return {
      severity: 'danger',
      title: labels.maliciousTitle,
      message: description ?? labels.maliciousMessage,
    };
  }

  if (validation.type === 'Warning') {
    return {
      severity: 'warning',
      title: labels.warningTitle,
      message: description ?? labels.warningMessage,
    };
  }

  return null;
}

/**
 * Renders the single top-of-screen transaction scan banner.
 *
 * Exactly one banner is rendered, picked in this order:
 *
 * 1. `isFetching` → "scan in progress" info banner.
 * 2. `isFetchError` → "scan failed" danger banner.
 * 3. `error` → warning banner with the error title and message.
 * 4. `Malicious` or `Warning` validation → security banner with a link to the
 * security alerts documentation and the Blockaid attribution.
 * 5. Otherwise nothing.
 *
 * @param props - The component props.
 * @param props.labels - The translated labels.
 * @param props.isFetching - Whether the transaction scan is in flight.
 * @param props.isFetchError - Whether the transaction scan request failed.
 * @param props.error - The scan error to show.
 * @param props.validation - The security validation to show.
 * @returns The banner, or `null` when no alert applies.
 */
export const TransactionAlert = ({
  labels,
  isFetching,
  isFetchError,
  error,
  validation,
}: TransactionAlertProps): ComponentOrElement | null => {
  if (isFetching) {
    return (
      <Banner title={labels.scanInProgressTitle} severity="info">
        <SnapText>{labels.scanInProgressMessage}</SnapText>
      </Banner>
    );
  }

  if (isFetchError) {
    return (
      <Banner title={labels.scanFailedTitle} severity="danger">
        <SnapText>{labels.scanFailedMessage}</SnapText>
      </Banner>
    );
  }

  if (error) {
    return (
      <Banner title={error.title} severity="warning">
        <SnapText>{error.message}</SnapText>
      </Banner>
    );
  }

  const alert = validation ? getValidationAlert(validation, labels) : null;

  if (!alert) {
    return null;
  }

  return (
    <Banner title={alert.title} severity={alert.severity}>
      <SnapText>{alert.message}</SnapText>
      <SnapText size="sm">
        <Link href={SECURITY_ALERTS_URL}>{labels.learnMore}</Link>
      </SnapText>
      <SnapText size="sm">
        <Icon color="primary" name="security-tick" /> {labels.securityAdvisedBy}{' '}
        <Link href={BLOCKAID_URL}>Blockaid</Link>
      </SnapText>
    </Banner>
  );
};
