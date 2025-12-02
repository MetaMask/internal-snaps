import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Address,
  Box,
  Button,
  Container,
  Footer,
  Heading,
  Icon,
  Image,
  Section,
  Text as SnapText,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';

import { ConfirmSignMessageFormNames } from './events';
import { Networks, type Network } from '../../../../constants';
import type { TronKeyringAccount } from '../../../../entities';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import type { Locale } from '../../../../utils/i18n';
import { i18n } from '../../../../utils/i18n';

export type ConfirmSignMessageProps = {
  message: string;
  account: TronKeyringAccount;
  scope: Network;
  locale: Locale;
  networkImage: string | null;
  origin: string;
};

export const ConfirmSignMessage = ({
  message,
  account,
  scope,
  locale,
  networkImage,
  origin,
}: ConfirmSignMessageProps): ComponentOrElement => {
  const translate = i18n(locale);
  const { address } = account;
  const addressCaip10 = `${scope}:${address}` as
    | `0x${string}`
    | `${string}:${string}:${string}`;

  return (
    <Container>
      <Box>
        <Box alignment="center" center>
          <Box>{null}</Box>
          <Heading size="lg">
            {translate('confirmation.signMessage.title')}
          </Heading>
        </Box>

        <Section>
          <Box direction="horizontal" center>
            <SnapText fontWeight="medium">
              {translate('confirmation.signMessage.message')}
            </SnapText>
          </Box>
          <Box alignment="space-between">
            <SnapText>{message}</SnapText>
          </Box>
        </Section>

        <Section>
          {origin ? (
            <Box alignment="space-between" direction="horizontal">
              <Box alignment="space-between" direction="horizontal" center>
                <SnapText fontWeight="medium" color="alternative">
                  {translate('confirmation.origin')}
                </SnapText>
                <Tooltip content={translate('confirmation.origin.tooltip')}>
                  <Icon name="question" color="muted" />
                </Tooltip>
              </Box>
              <SnapText>{origin}</SnapText>
            </Box>
          ) : null}
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {translate('confirmation.account')}
            </SnapText>
            <Address address={addressCaip10} truncate displayName avatar />
          </Box>
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {translate('confirmation.network')}
            </SnapText>
            <Box direction="horizontal" alignment="center">
              <Box alignment="center" center>
                <Image
                  borderRadius="medium"
                  src={networkImage ?? TRX_IMAGE_SVG}
                />
              </Box>
              <SnapText>{Networks[scope].name}</SnapText>
            </Box>
          </Box>
        </Section>
      </Box>
      <Footer>
        <Button name={ConfirmSignMessageFormNames.Cancel}>
          {translate('confirmation.cancelButton')}
        </Button>
        <Button name={ConfirmSignMessageFormNames.Confirm}>
          {translate('confirmation.confirmButton')}
        </Button>
      </Footer>
    </Container>
  );
};
