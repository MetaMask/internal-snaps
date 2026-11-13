import { TransactionAlert } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Banner, Box, Text } from '@metamask/snaps-sdk/jsx';
import type { GenericSnapElement } from '@metamask/snaps-sdk/jsx';

import { TRANSACTION_TAPOS_EXPIRED } from '../../../services/transaction-scan/isTransactionDeadlinePassedError';
import type { TransactionScanResult } from '../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../types/snap';
import { i18n } from '../../../utils/i18n';
import { getTransactionAlertProps } from '../utils/getTransactionAlertProps';

type TransactionBannersProps = {
  preferences: Preferences;
  scan: TransactionScanResult | null | undefined;
  scanFetchStatus: FetchStatus;
  isInsufficientBalance?: boolean;
};

/**
 * Displays the security result alongside at most one transaction error.
 *
 * @param props - Confirmation scan and preference state.
 * @param props.preferences - User preferences.
 * @param props.scan - Latest scan result.
 * @param props.scanFetchStatus - Scan request status.
 * @param props.isInsufficientBalance - Whether the local balance blocks confirmation.
 * @returns The ordered transaction banners.
 */
export const TransactionBanners = ({
  preferences,
  scan,
  scanFetchStatus,
  isInsufficientBalance = false,
}: TransactionBannersProps): ComponentOrElement => {
  const props = getTransactionAlertProps({
    preferences,
    scan,
    scanFetchStatus,
  });
  const isLocalError =
    scan?.error?.type === TRANSACTION_TAPOS_EXPIRED ||
    scan?.error?.type === 'MALFORMED_TRANSACTION';
  let transactionBanner: GenericSnapElement | null = null;
  if (isInsufficientBalance) {
    transactionBanner = (
      <Banner
        title={i18n(preferences.locale)(
          'transactionScan.errors.insufficientFunds',
        )}
        severity="danger"
      >
        <Text>{null}</Text>
      </Banner>
    ) as GenericSnapElement;
  } else if (
    props.error &&
    (isLocalError || preferences.simulateOnChainActions)
  ) {
    transactionBanner = (
      <TransactionAlert
        {...props}
        isFetching={false}
        isFetchError={false}
        validation={null}
      />
    ) as GenericSnapElement;
  }
  const securityBanner = preferences.useSecurityAlerts
    ? ((<TransactionAlert {...props} error={null} />) as GenericSnapElement)
    : null;

  return (
    <Box>
      {isInsufficientBalance || isLocalError ? transactionBanner : null}
      {securityBanner}
      {isInsufficientBalance || isLocalError ? null : transactionBanner}
    </Box>
  ) as ComponentOrElement;
};
