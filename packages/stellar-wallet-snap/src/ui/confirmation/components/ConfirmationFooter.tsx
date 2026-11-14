import { ConfirmationFooter as SharedConfirmationFooter } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';

import { i18n } from '../../../utils';
import { MaliciousAcknowledgementFormNames } from '../views/MaliciousAcknowledgement/constants';

type ConfirmationFooterProps = {
  locale: string;
  cancelButtonName: string;
  confirmButtonName: string;
  confirmDisabled?: boolean;
  requiresAcknowledgement?: boolean;
};

/**
 * Renders the shared footer with Stellar's translated labels and form names.
 *
 * @param props - The footer props.
 * @param props.locale - The active locale.
 * @param props.cancelButtonName - Event name for the cancel button.
 * @param props.confirmButtonName - Event name for the confirm button.
 * @param props.confirmDisabled - Whether confirmation is blocked.
 * @param props.requiresAcknowledgement - Whether Confirm opens risk acknowledgement.
 * @returns The confirmation footer.
 */
export const ConfirmationFooter = ({
  locale,
  cancelButtonName,
  confirmButtonName,
  confirmDisabled = false,
  requiresAcknowledgement = false,
}: ConfirmationFooterProps): ComponentOrElement => {
  const t = i18n(locale);
  return (
    <SharedConfirmationFooter
      labels={{
        cancelButton: t('confirmation.cancelButton'),
        confirmButton: t('confirmation.confirmButton'),
      }}
      cancelButtonName={cancelButtonName}
      confirmButtonName={confirmButtonName}
      openAcknowledgementName={MaliciousAcknowledgementFormNames.Review}
      confirmDisabled={confirmDisabled}
      requiresAcknowledgement={requiresAcknowledgement}
    />
  );
};
