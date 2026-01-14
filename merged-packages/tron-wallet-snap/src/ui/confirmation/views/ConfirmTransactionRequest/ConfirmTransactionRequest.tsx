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
  Link,
  Section,
  Text as SnapText,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';

import { ConfirmSignAndSendTransactionFormNames } from './events';
import { type ConfirmTransactionRequestContext } from './types';
import { Networks } from '../../../../constants';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { getExplorerUrl } from '../../../../utils/getExplorerUrl';
import { i18n } from '../../../../utils/i18n';
import { Asset } from '../../components/Asset/Asset';
import { Fees } from '../../components/Fees';

export const ConfirmTransactionRequest = ({
  context: {
    origin,
    scope,
    fromAddress,
    toAddress,
    asset,
    amount,
    fees,
    preferences,
    networkImage,
    tokenPrices,
    tokenPricesFetchStatus,
  },
}: {
  context: ConfirmTransactionRequestContext;
}): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  const assetPrice = tokenPrices[asset.assetType]?.price ?? null;
  const priceLoading = tokenPricesFetchStatus === 'fetching';

  return (
    <Container>
      <Box>
        {/* Header */}
        <Box alignment="center" center>
          <Box>{null}</Box>
          <Heading size="lg">
            {translate(`confirmation.transaction.title`)}
          </Heading>
          <Box>{null}</Box>
        </Box>
        {/* Estimated Changes */}
        <Section>
          {/* Header + Tooltip */}
          <Box direction="horizontal" center>
            <SnapText fontWeight="medium">
              {translate('confirmation.estimatedChanges.title')}
            </SnapText>
            <Tooltip
              content={translate('confirmation.estimatedChanges.tooltip')}
            >
              <Icon name="info" />
            </Tooltip>
          </Box>
          <Box alignment="space-between" direction="horizontal">
            <Box alignment="space-between" direction="horizontal" center>
              <SnapText fontWeight="medium" color="alternative">
                {translate('confirmation.estimatedChanges.send')}
              </SnapText>
            </Box>
            <Asset
              caipId={asset.assetType}
              amount={amount ?? ''}
              symbol={asset.symbol}
              iconUrl={asset.iconUrl}
              price={assetPrice}
              preferences={preferences}
              priceLoading={priceLoading}
            />
          </Box>
        </Section>

        {/* Additional Details */}
        <Section>
          {/* Request from */}
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
          <Box>{null}</Box>
          {/* From */}
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {translate('confirmation.from')}
            </SnapText>
            <Link href={getExplorerUrl(scope, 'address', fromAddress ?? '')}>
              <Address
                address={`${scope}:${fromAddress}`}
                truncate
                displayName
                avatar
              />
            </Link>
          </Box>
          <Box>{null}</Box>
          {/* To */}
          {toAddress && (
            <Box alignment="space-between" direction="horizontal">
              <SnapText fontWeight="medium" color="alternative">
                {translate('confirmation.to')}
              </SnapText>
              <Link href={getExplorerUrl(scope, 'address', toAddress ?? '')}>
                <Address
                  address={`${scope}:${toAddress}`}
                  truncate
                  displayName
                  avatar
                />
              </Link>
            </Box>
          )}
          <Box>{null}</Box>
          {/* Network */}
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {translate('confirmation.network')}
            </SnapText>
            <Box direction="horizontal" alignment="center">
              <Box alignment="center" center>
                <Image
                  borderRadius="medium"
                  src={networkImage ?? TRX_IMAGE_SVG}
                  height={16}
                  width={16}
                />
              </Box>
              <SnapText>{Networks[scope].name}</SnapText>
            </Box>
          </Box>
          <Box>{null}</Box>
          {/* Fee Breakdown */}
          <Fees
            fees={fees}
            preferences={preferences}
            tokenPrices={tokenPrices}
            tokenPricesFetchStatus={tokenPricesFetchStatus}
          />
        </Section>
      </Box>
      <Footer>
        <Button name={ConfirmSignAndSendTransactionFormNames.Cancel}>
          {translate(`confirmation.cancelButton`)}
        </Button>
        <Button name={ConfirmSignAndSendTransactionFormNames.Confirm}>
          {translate(`confirmation.confirmButton`)}
        </Button>
      </Footer>
    </Container>
  );
};
