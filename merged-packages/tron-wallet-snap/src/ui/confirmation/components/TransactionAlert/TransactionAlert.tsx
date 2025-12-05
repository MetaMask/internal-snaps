import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Banner,
  Box,
  Icon,
  Link,
  Skeleton,
  Text as SnapText,
  type BannerProps,
} from '@metamask/snaps-sdk/jsx';

import { getErrorMessage } from './getErrorMessage';
import type {
  TransactionScanError,
  TransactionScanValidation,
} from '../../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../types/snap';
import { i18n } from '../../../../utils/i18n';

export type TransactionAlertProps = {
  preferences: Preferences;
  validation: TransactionScanValidation | null;
  error: TransactionScanError | null;
  scanFetchStatus: FetchStatus;
};

const VALIDATION_TYPE_TO_SEVERITY: Partial<
  Record<
    NonNullable<TransactionScanValidation['type']>,
    BannerProps['severity']
  >
> = {
  Malicious: 'danger',
  Warning: 'warning',
};

export const TransactionAlert = ({
  preferences,
  validation,
  error,
  scanFetchStatus,
}: TransactionAlertProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  /**
   * Display a loading skeleton while fetching.
   */
  if (scanFetchStatus === 'fetching') {
    return (
      <Box>
        <Skeleton height="40px" />
      </Box>
    );
  }

  /**
   * Displays a warning banner if the transaction scan fails.
   */
  if (scanFetchStatus === 'error') {
    return (
      <Banner
        title={translate('confirmation.simulationTitleAPIError')}
        severity="danger"
      >
        <SnapText>
          {translate('confirmation.simulationMessageAPIError')}
        </SnapText>
      </Banner>
    );
  }

  /**
   * Displays nothing if there is no error or validation.
   */
  if (!error && !validation) {
    return <Box>{null}</Box>;
  }

  /**
   * Displays a warning banner if the transaction scan has an error.
   */
  if (error) {
    return (
      <Banner
        title={translate('confirmation.simulationErrorTitle')}
        severity="warning"
      >
        <SnapText>
          {translate('confirmation.simulationErrorSubtitle', {
            reason: getErrorMessage(error, preferences),
          })}
        </SnapText>
      </Banner>
    );
  }

  /**
   * Displays nothing if there is no validation.
   */
  if (!validation) {
    return <Box>{null}</Box>;
  }

  const severity = validation?.type
    ? VALIDATION_TYPE_TO_SEVERITY[validation.type]
    : undefined;

  /**
   * Displays a banner if the validation there is a validation.
   */
  if (severity) {
    return (
      <Banner
        title={translate('confirmation.validationErrorTitle')}
        severity={severity}
      >
        <SnapText>{translate('confirmation.validationErrorSubtitle')}</SnapText>
        <SnapText size="sm">
          <Link href="https://support.metamask.io/configure/wallet/how-to-turn-on-security-alerts/">
            {translate('confirmation.validationErrorLearnMore')}
          </Link>
        </SnapText>
        <SnapText size="sm">
          <Icon color="primary" name="security-tick" />{' '}
          {translate('confirmation.validationErrorSecurityAdviced')}{' '}
          <Link href="https://www.blockaid.io">Blockaid</Link>
        </SnapText>
      </Banner>
    );
  }

  /**
   * Displays nothing by default.
   */
  return <Box>{null}</Box>;
};
