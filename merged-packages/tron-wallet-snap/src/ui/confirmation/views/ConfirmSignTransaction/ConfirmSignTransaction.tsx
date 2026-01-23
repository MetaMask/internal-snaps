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

import { ConfirmSignTransactionFormNames } from './events';
import type { ConfirmSignTransactionContext } from './types';
import { Networks } from '../../../../constants';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { formatOrigin } from '../../../../utils/formatOrigin';
import { i18n } from '../../../../utils/i18n';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { Fees } from '../../components/Fees';
import { TransactionAlert } from '../../components/TransactionAlert/TransactionAlert';

export const ConfirmSignTransaction = ({
  context,
}: {
  context: ConfirmSignTransactionContext;
}): ComponentOrElement => {
  const translate = i18n(context.preferences.locale);
  const {
    account,
    scope,
    origin,
    networkImage,
    preferences,
    scan,
    scanFetchStatus,
    fees,
    tokenPrices,
    tokenPricesFetchStatus,
  } = context;

  const shouldDisableConfirmButton =
    scanFetchStatus === 'fetching' || scan?.status === 'ERROR';

  const addressCaip10 = account ? `${scope}:${account.address}` : null;

  return (
    <Container>
      <Box>
        {/* Security Alert */}
        {preferences.useSecurityAlerts ? (
          <TransactionAlert
            scanFetchStatus={scanFetchStatus}
            validation={scan?.validation ?? null}
            error={scan?.error ?? null}
            preferences={preferences}
          />
        ) : null}

        {/* Header */}
        <Box alignment="center" center>
          <Box>{null}</Box>
          <Heading size="lg">
            {translate('confirmation.signTransaction.title')}
          </Heading>
          <Box>{null}</Box>
        </Box>

        {/* Estimated Changes from Security Scan */}
        {preferences.simulateOnChainActions ? (
          <EstimatedChanges
            scanFetchStatus={scanFetchStatus}
            changes={scan?.estimatedChanges ?? null}
            preferences={preferences}
          />
        ) : null}

        {/* Transaction Details */}
        <Section>
          {/* Request from */}
          {origin ? (
            <Box alignment="space-between" direction="horizontal">
              <Box direction="horizontal" alignment="start">
                <SnapText fontWeight="medium" color="alternative">
                  {translate('confirmation.origin')}
                </SnapText>
                <Tooltip content={translate('confirmation.origin.tooltip')}>
                  <Icon name="question" color="muted" />
                </Tooltip>
              </Box>
              <SnapText>{formatOrigin(origin)}</SnapText>
            </Box>
          ) : null}

          {/* Account */}
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {translate('confirmation.account')}
            </SnapText>
            {addressCaip10 ? (
              <Address
                address={
                  addressCaip10 as
                    | `0x${string}`
                    | `${string}:${string}:${string}`
                }
                truncate
                displayName
                avatar
              />
            ) : null}
          </Box>

          {/* Network */}
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

          <Box>{null}</Box>

          {/* Fees */}
          <Fees
            fees={fees}
            preferences={preferences}
            tokenPrices={tokenPrices}
            tokenPricesFetchStatus={tokenPricesFetchStatus}
          />
        </Section>
      </Box>
      <Footer>
        <Button name={ConfirmSignTransactionFormNames.Cancel}>
          {translate('confirmation.cancelButton')}
        </Button>
        <Button
          name={ConfirmSignTransactionFormNames.Confirm}
          disabled={shouldDisableConfirmButton}
        >
          {translate('confirmation.confirmButton')}
        </Button>
      </Footer>
    </Container>
  );
};
