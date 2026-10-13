import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Container,
  Copyable,
  Image,
  Section,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import type { Locale } from '../../../../utils';
import { i18n } from '../../../../utils';
import { generateAddressQrCode } from '../../qrcode';

export type AccountActivationPromptProps = {
  accountAddress: string;
  locale: Locale;
};

export const AccountActivationPrompt = ({
  accountAddress,
  locale,
}: AccountActivationPromptProps): ComponentOrElement => {
  const translate = i18n(locale);

  const qrCode = generateAddressQrCode(accountAddress);

  return (
    <Container>
      <Box>
        <ActionHeader
          title={translate('confirmation.accountActivation.title')}
        />
        <Section>
          <Box direction="vertical" center>
            {qrCode ? <Image src={qrCode} width={230} /> : null}
            <SnapText fontWeight="bold" color="alternative" alignment="center">
              {translate('confirmation.accountActivation.address')}
            </SnapText>
            <Box>{null}</Box>
            <Copyable value={accountAddress} />
            <Box>{null}</Box>
            <Box>{null}</Box>
            <SnapText color="alternative" alignment="center">
              {translate('confirmation.accountActivation.description')}
            </SnapText>
            <Box>{null}</Box>
            <Box>{null}</Box>
            <SnapText color="alternative" alignment="center">
              {translate('confirmation.accountActivation.callToAction')}
            </SnapText>
          </Box>
        </Section>
      </Box>
    </Container>
  );
};
