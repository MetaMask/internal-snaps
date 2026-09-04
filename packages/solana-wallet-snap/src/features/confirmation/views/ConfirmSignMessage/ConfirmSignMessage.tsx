import type { SelfReportedOriginMetadata } from '@metamask/snap-networks-utils';
import { resolveOrigin } from '@metamask/snap-networks-utils';
import {
  Address,
  Box,
  Button,
  Container,
  Footer,
  Heading,
  Image,
  Section,
  Text,
} from '@metamask/snaps-sdk/jsx';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';

import { Domain } from '../../../../core/components/Domain/Domain';
import { Networks } from '../../../../core/constants/solana';
import type { Network } from '../../../../core/constants/solana';
import { SOL_IMAGE_SVG } from '../../../../core/test/mocks/solana-image-svg';
import { addressToCaip10 } from '../../../../core/utils/addressToCaip10';
import type { Locale } from '../../../../core/utils/i18n';
import { i18n } from '../../../../core/utils/i18n';
import type { SolanaKeyringAccount } from '../../../../entities';
import { OriginRow } from '../../components/OriginRow/OriginRow';
import { ConfirmSignMessageFormNames } from './events';

export type ConfirmSignMessageProps = {
  message: string;
  account: SolanaKeyringAccount;
  accountDomain: string | null;
  scope: Network;
  locale: Locale;
  networkImage: string | null;
  origin: string;
  originMetadata: SelfReportedOriginMetadata | null;
};

export const ConfirmSignMessage: SnapComponent<ConfirmSignMessageProps> = ({
  message,
  account,
  accountDomain,
  scope,
  locale,
  networkImage,
  origin,
  originMetadata,
}) => {
  const translate = i18n(locale);
  const { address } = account;
  const { displayOrigin, isSelfReported } = resolveOrigin(
    origin,
    originMetadata,
  );
  const addressCaip10 = addressToCaip10(scope, address);

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
            <Text fontWeight="medium">
              {translate('confirmation.signMessage.message')}
            </Text>
          </Box>
          <Box alignment="space-between">
            <Text>{message}</Text>
          </Box>
        </Section>

        <Section>
          <OriginRow
            displayOrigin={displayOrigin}
            isSelfReported={isSelfReported}
            locale={locale}
          />
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
