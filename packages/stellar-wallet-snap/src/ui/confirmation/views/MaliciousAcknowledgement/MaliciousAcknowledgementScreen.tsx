import { MaliciousAcknowledgementScreen as SharedMaliciousAcknowledgementScreen } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';

import { i18n } from '../../../../utils';
import type { ConfirmationBaseProps } from '../../api';

export type MaliciousAcknowledgementScreenProps = {
  locale: ConfirmationBaseProps['locale'];
  acknowledged?: boolean;
};

/**
 * Renders the shared acknowledgement screen with Stellar's translated labels.
 *
 * @param props - The screen props.
 * @param props.locale - The active locale.
 * @param props.acknowledged - Whether the risk checkbox is checked.
 * @returns The acknowledgement screen.
 */
export const MaliciousAcknowledgementScreen = ({
  locale,
  acknowledged = false,
}: MaliciousAcknowledgementScreenProps): ComponentOrElement => {
  const t = i18n(locale);
  return (
    <SharedMaliciousAcknowledgementScreen
      labels={{
        title: t('confirmation.maliciousAck.title'),
        description: t('confirmation.maliciousAck.description'),
        checkbox: t('confirmation.maliciousAck.checkbox'),
        proceed: t('confirmation.maliciousAck.proceed'),
        back: t('confirmation.maliciousAck.back'),
      }}
      acknowledged={acknowledged}
    />
  );
};
