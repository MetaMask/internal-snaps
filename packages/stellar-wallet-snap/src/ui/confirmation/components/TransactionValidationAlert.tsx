import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Banner, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { i18n } from '../../../utils';
import type { ConfirmationBaseProps } from '../api';
import { FetchStatus } from '../api';

type TransactionValidationAlertProps = {
  preferences: ConfirmationBaseProps['preferences'];
  transactionsFetchStatus: FetchStatus;
  errorMessage?: ConfirmationBaseProps['errorMessage'];
};

// Danger banner shown when the pending transaction is invalid: either
// pre-submit validation failed, or background re-validation found the
// transaction can no longer be submitted (expired, sequence, or balance).
export const TransactionValidationAlert = ({
  preferences,
  transactionsFetchStatus,
  errorMessage = 'confirmation.txnError.generic',
}: TransactionValidationAlertProps): ComponentOrElement | null => {
  if (transactionsFetchStatus !== FetchStatus.Error) {
    return null;
  }

  const translate = i18n(preferences.locale);
  const title = translate('confirmation.simulationErrorTitle');
  const subtitle = translate(errorMessage);

  return (
    <Banner title={title} severity="danger">
      <SnapText>{subtitle}</SnapText>
    </Banner>
  );
};
