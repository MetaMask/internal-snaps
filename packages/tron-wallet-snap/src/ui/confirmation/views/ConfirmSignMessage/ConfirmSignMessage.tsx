import type { SelfReportedOriginMetadata } from '@metamask/snap-networks-utils';
import { resolveOrigin } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Address,
  Box,
  Button,
  Container,
  Footer,
  Heading,
  Image,
  Section,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import { Networks } from '../../../../constants';
import type { Network } from '../../../../constants';
import type { TronKeyringAccount } from '../../../../entities/keyring-account';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import type { Locale } from '../../../../utils/i18n';
import { i18n } from '../../../../utils/i18n';
import { OriginRow } from '../../components/OriginRow';
import { ConfirmSignMessageFormNames } from './events';

export type ConfirmSignMessageProps = {
  message: string;
  account: TronKeyringAccount;
  scope: Network;
  locale: Locale;
  networkImage: string | null;
  origin: string;
  originMetadata: SelfReportedOriginMetadata | null;
};

export const ConfirmSignMessage = ({
  message,
  account,
  scope,
  locale,
  networkImage,
  origin,
  originMetadata,
}: ConfirmSignMessageProps): ComponentOrElement => {
  const translate = i18n(locale);
  const { address } = account;
  const { displayOrigin, isSelfReported } = resolveOrigin(
    origin,
    originMetadata,
  );
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
          <Box>{null}</Box>
        </Box>

        <Section>
          <SnapText fontWeight="medium">
            {translate('confirmation.signMessage.message')}
          </SnapText>
          <SnapText>{message}</SnapText>
        </Section>

        <Section>
          <OriginRow
            displayOrigin={displayOrigin}
            isSelfReported={isSelfReported}
            locale={locale}
          />
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
            <Box direction="horizontal" alignment="end">
              <Image
                borderRadius="medium"
                src={networkImage ?? TRX_IMAGE_SVG}
                height={16}
                width={16}
              />
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
