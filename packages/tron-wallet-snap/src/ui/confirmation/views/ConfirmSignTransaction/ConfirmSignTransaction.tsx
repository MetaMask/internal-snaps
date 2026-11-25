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
  Section,
  Text as SnapText,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';

import { Networks } from '../../../../constants';
import { SimulationStatus } from '../../../../services/transaction-scan/types';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { formatOrigin } from '../../../../utils/formatOrigin';
import { i18n } from '../../../../utils/i18n';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { Fees } from '../../components/Fees';
import { TransactionBanners } from '../../components/TransactionBanners';
import { isTransactionConfirmationBlocked } from '../../utils/isTransactionConfirmationBlocked';
import { ConfirmSignTransactionFormNames } from './events';
import type { ConfirmSignTransactionContext } from './types';

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
    isInsufficientBalance,
  } = context;

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

  const addressCaip10 = account ? `${scope}:${account.address}` : null;

  let estimatedChangesSection: ComponentOrElement | null = null;
  if (preferences.simulateOnChainActions) {
    if (scan?.simulationStatus === SimulationStatus.Skipped) {
      const skippedChangesMessage =
        context.transaction.type === 'WitnessCreateContract'
          ? translate('confirmation.estimatedChanges.witnessCreate')
          : translate('confirmation.estimatedChanges.unsupportedContract');

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
          <SnapText color="alternative">{skippedChangesMessage}</SnapText>
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
          isInsufficientBalance={isInsufficientBalance}
        />

        {/* Header */}
        <ActionHeader title={translate('confirmation.signTransaction.title')} />

        {/* Estimated Changes from Security Scan */}
        {estimatedChangesSection}

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
      <ConfirmationFooter
        labels={{
          cancelButton: translate('confirmation.cancelButton'),
          confirmButton: translate('confirmation.confirmButton'),
        }}
        cancelButtonName={ConfirmSignTransactionFormNames.Cancel}
        confirmButtonName={ConfirmSignTransactionFormNames.Confirm}
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
