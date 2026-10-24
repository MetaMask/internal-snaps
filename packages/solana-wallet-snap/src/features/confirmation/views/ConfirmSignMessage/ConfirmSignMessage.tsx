import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import {
  Address,
  Box,
  Button,
  Container,
  Footer,
  Icon,
  Image,
  Section,
  Text,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';

import { Domain } from '../../../../core/components/Domain/Domain';
import { Networks } from '../../../../core/constants/solana';
import type { Network } from '../../../../core/constants/solana';
import { SOL_IMAGE_SVG } from '../../../../core/test/mocks/solana-image-svg';
import { addressToCaip10 } from '../../../../core/utils/addressToCaip10';
import type { Locale } from '../../../../core/utils/i18n';
import { i18n } from '../../../../core/utils/i18n';
import { parseOrigin } from '../../../../core/utils/parseOrigin';
import { ConfirmSignMessageFormNames } from './events';

export type ConfirmSignMessageProps = {
  message: string;
  isBinary?: boolean;
  account: ExtendedKeyringAccount;
  accountDomain: string | null;
  scope: Network;
  locale: Locale;
  networkImage: string | null;
  origin: string;
};

export const ConfirmSignMessage: SnapComponent<ConfirmSignMessageProps> = ({
  message,
  isBinary = false,
  account,
  accountDomain,
  scope,
  locale,
  networkImage,
  origin,
}) => {
  const translate = i18n(locale);
  const { address } = account;
  const originHostname = origin ? parseOrigin(origin) : null;
  const addressCaip10 = addressToCaip10(scope, address);

  return (
    <Container>
      <Box>
        <ActionHeader title={translate('confirmation.signMessage.title')} />

        <Section>
          <Box direction="horizontal" center>
            <Text fontWeight="medium">
              {translate(
                isBinary
                  ? 'confirmation.signMessage.binaryMessage'
                  : 'confirmation.signMessage.message',
              )}
            </Text>
          </Box>
          {isBinary ? (
            <Text color="warning">
              {translate('confirmation.signMessage.binaryWarning')}
            </Text>
          ) : null}
          <Box alignment="space-between">
            <Text>{message}</Text>
          </Box>
        </Section>

        <Section>
          {originHostname ? (
            <Box alignment="space-between" direction="horizontal">
              <Box alignment="space-between" direction="horizontal" center>
                <Text fontWeight="medium" color="alternative">
                  {translate('confirmation.origin')}
                </Text>
                <Tooltip content={translate('confirmation.origin.tooltip')}>
                  <Icon name="question" color="muted" />
                </Tooltip>
              </Box>
              <Text>{originHostname}</Text>
            </Box>
          ) : null}
          <Box alignment="space-between" direction="horizontal">
            <Text fontWeight="medium" color="alternative">
              {translate('confirmation.account')}
            </Text>
            {accountDomain ? (
              <Domain domain={accountDomain} scope={scope} address={address} />
            ) : (
              <Address address={addressCaip10} truncate displayName avatar />
            )}
          </Box>
          <Box alignment="space-between" direction="horizontal">
            <Text fontWeight="medium" color="alternative">
              {translate('confirmation.network')}
            </Text>
            <Box direction="horizontal" alignment="center">
              <Box alignment="center" center>
                <Image
                  borderRadius="medium"
                  src={networkImage ?? SOL_IMAGE_SVG}
                />
              </Box>
              <Text>{Networks[scope].name}</Text>
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
