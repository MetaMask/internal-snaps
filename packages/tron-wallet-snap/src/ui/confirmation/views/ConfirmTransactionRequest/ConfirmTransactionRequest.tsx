import {
  ActionHeader,
  ConfirmationFooter,
  MaliciousAcknowledgementFormNames,
  MaliciousAcknowledgementScreen,
  requiresMaliciousAcknowledgement,
} from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Address,
  Box,
  Container,
  Icon,
  Image,
  Link,
  Section,
  Text as SnapText,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';

import { Networks } from '../../../../constants';
import { SimulationStatus } from '../../../../services/transaction-scan/types';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { formatOrigin } from '../../../../utils/formatOrigin';
import { getExplorerUrl } from '../../../../utils/getExplorerUrl';
import { i18n } from '../../../../utils/i18n';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { Fees } from '../../components/Fees';
import { TransactionBanners } from '../../components/TransactionBanners';
import { isTransactionConfirmationBlocked } from '../../utils/isTransactionConfirmationBlocked';
import { ConfirmSignAndSendTransactionFormNames } from './events';
import type { ConfirmTransactionRequestContext } from './types';

export const ConfirmTransactionRequest = ({
  context,
}: {
  context: ConfirmTransactionRequestContext;
}): ComponentOrElement => {
  const {
    origin,
    scope,
    fromAddress,
    toAddress,
    fees,
    preferences,
    networkImage,
    tokenPrices,
    tokenPricesFetchStatus,
    scan,
    scanFetchStatus,
  } = context;
  const translate = i18n(preferences.locale);

  const shouldDisableConfirmButton = isTransactionConfirmationBlocked(context);

  if (context.acknowledgementScreen && !shouldDisableConfirmButton) {
    return (
      <MaliciousAcknowledgementScreen
        labels={{
          title: translate('confirmation.maliciousAck.title'),
          description: translate('confirmation.maliciousAck.description'),
          checkbox: translate('confirmation.maliciousAck.checkbox'),
          proceed: translate('confirmation.confirmButton'),
          back: translate('confirmation.maliciousAck.back'),
        }}
        acknowledged={context.acknowledged}
      />
    );
  }

  let estimatedChangesSection: ComponentOrElement | null = null;
  if (preferences.simulateOnChainActions) {
    if (scan?.simulationStatus === SimulationStatus.Skipped) {
      estimatedChangesSection = (
        <Section direction="vertical">
          <Box direction="horizontal" alignment="start">
            <SnapText fontWeight="medium">
              {translate('confirmation.estimatedChanges.title')}
            </SnapText>
            <Tooltip
              content={translate('confirmation.estimatedChanges.tooltip')}
            >
              <Icon name="info" />
            </Tooltip>
          </Box>
          <SnapText color="alternative">
            {translate('confirmation.estimatedChanges.unsupportedContract')}
          </SnapText>
        </Section>
      );
    } else {
      estimatedChangesSection = (
        <EstimatedChanges
          scanFetchStatus={scanFetchStatus}
          changes={scan?.estimatedChanges ?? null}
          scanStatus={scan?.status ?? null}
          preferences={preferences}
        />
      );
    }
  }

  return (
    <Container>
      <Box>
        <TransactionBanners
          preferences={preferences}
          scan={scan}
          scanFetchStatus={scanFetchStatus}
        />

        {/* Header */}
        <ActionHeader title={translate('confirmation.transaction.title')} />

        {/* Estimated Changes (from security scan simulation) */}
        {estimatedChangesSection}

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
            <SnapText>{formatOrigin(origin)}</SnapText>
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
      <ConfirmationFooter
        labels={{
          cancelButton: translate('confirmation.cancelButton'),
          confirmButton: translate('confirmation.confirmButton'),
        }}
        cancelButtonName={ConfirmSignAndSendTransactionFormNames.Cancel}
        confirmButtonName={ConfirmSignAndSendTransactionFormNames.Confirm}
        openAcknowledgementName={MaliciousAcknowledgementFormNames.Review}
        confirmDisabled={shouldDisableConfirmButton}
        requiresAcknowledgement={requiresMaliciousAcknowledgement(
          preferences.useSecurityAlerts,
          scan?.validation?.type,
        )}
      />
    </Container>
  );
};
