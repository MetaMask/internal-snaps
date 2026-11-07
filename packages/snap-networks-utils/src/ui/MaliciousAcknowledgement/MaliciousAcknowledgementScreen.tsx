import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Banner,
  Box,
  Button,
  Checkbox,
  Container,
  Footer,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import { ActionHeader } from '../ActionHeader/ActionHeader';
import { MaliciousAcknowledgementFormNames } from './MaliciousAcknowledgementFormNames';

export type MaliciousAcknowledgementLabels = {
  /** Screen title. */
  title: string;
  /** Optional banner heading. Defaults to an empty string. */
  bannerTitle?: string;
  /** Description of the risk of proceeding. */
  description: string;
  /** Risk-acknowledgement checkbox label. */
  checkbox: string;
  /** Label of the button that confirms after acknowledgement. */
  proceed: string;
  /** Label of the button that returns to the confirmation view. */
  back: string;
};

export type MaliciousAcknowledgementScreenProps = {
  /** Translated labels. */
  labels: MaliciousAcknowledgementLabels;
  /** Whether the risk checkbox is currently checked. */
  acknowledged?: boolean;
};

/**
 * Friction screen shown when the user chooses to review a malicious-scan alert.
 *
 * The user cannot be outright blocked, so this screen forces an explicit
 * acknowledgement: the proceed button stays disabled until the risk checkbox
 * is checked. The screen renders no transaction details: the user reviews the
 * alerts on the confirmation screen before entering it.
 *
 * @param props - The component props.
 * @param props.labels - The translated labels.
 * @param props.acknowledged - Whether the risk checkbox is currently checked.
 * @returns The acknowledgement screen.
 * @example
 * ```tsx
 * <MaliciousAcknowledgementScreen
 *   labels={{
 *     title: translate('confirmation.maliciousAck.title'),
 *     description: translate('confirmation.maliciousAck.description'),
 *     checkbox: translate('confirmation.maliciousAck.checkbox'),
 *     proceed: translate('confirmation.maliciousAck.proceed'),
 *     back: translate('confirmation.maliciousAck.back'),
 *   }}
 *   acknowledged={context.acknowledged}
 * />;
 * ```
 */
export const MaliciousAcknowledgementScreen = ({
  labels,
  acknowledged = false,
}: MaliciousAcknowledgementScreenProps): ComponentOrElement => {
  return (
    <Container>
      <Box>
        <ActionHeader title={labels.title} />
        <Banner title={labels.bannerTitle ?? ''} severity="danger">
          <SnapText>{labels.description}</SnapText>
        </Banner>
        <Checkbox
          name={MaliciousAcknowledgementFormNames.Acknowledge}
          label={labels.checkbox}
          checked={acknowledged}
        />
      </Box>
      <Footer>
        <Button name={MaliciousAcknowledgementFormNames.Back}>
          {labels.back}
        </Button>
        <Button
          name={MaliciousAcknowledgementFormNames.Proceed}
          disabled={!acknowledged}
        >
          {labels.proceed}
        </Button>
      </Footer>
    </Container>
  );
};
