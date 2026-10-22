import {
  ActionHeader,
  ConfirmationFooter,
  MaliciousAcknowledgementFormNames,
  MaliciousAcknowledgementScreen,
  TransactionAlert,
  requiresMaliciousAcknowledgement,
} from '@metamask/snap-networks-utils';
import { Box, Container } from '@metamask/snaps-sdk/jsx';

import { Networks } from '../../../../core/constants/solana';
import { i18n } from '../../../../core/utils/i18n';
import { Advanced } from '../../components/Advanced/Advanced';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { TransactionDetails } from '../../components/TransactionDetails/TransactionDetails';
import { ConfirmSignAndSendTransactionFormNames } from './events';
import { getErrorMessage } from './getErrorMessage';
import type { ConfirmTransactionRequestContext } from './types';
import { shouldDisableConfirmation } from './utils';

export const ConfirmTransactionRequest = ({
  context,
}: {
  context: ConfirmTransactionRequestContext;
}) => {
  const translate = i18n(context.preferences.locale);

  if (context.acknowledgementScreen) {
    return (
      <MaliciousAcknowledgementScreen
        labels={{
          title: translate('confirmation.maliciousAck.title'),
          description: translate('confirmation.maliciousAck.description'),
          checkbox: translate('confirmation.maliciousAck.checkbox'),
          proceed: translate('confirmation.maliciousAck.proceed'),
          back: translate('confirmation.maliciousAck.back'),
        }}
        acknowledged={context.acknowledged}
      />
    );
  }

  const feeInSol = context.feeEstimatedInSol;
  const { nativeToken } = Networks[context.scope];
  const nativePrice = context.tokenPrices[nativeToken.caip19Id]?.price ?? null;

  const { useSecurityAlerts, simulateOnChainActions } = context.preferences;
  const scanError = context.scan?.error;

  // The scan banner slot is active while any scan preference is on; verdict
  // banners are additionally gated on the security-alerts preference.
  const shouldShowAlert = useSecurityAlerts || simulateOnChainActions;

  const shouldDisableConfirmButton = shouldDisableConfirmation({
    scanFetchStatus: context.scanFetchStatus,
    scan: context.scan,
  });

  // A blocking state takes priority over the acknowledgement swap: the shared
  // footer falls back to the disabled "Confirm" button so the user can never
  // enter the acknowledgement flow for a transaction that is no longer valid.
  const requiresAcknowledgement = requiresMaliciousAcknowledgement({
    useSecurityAlerts,
    scan: context.scan,
  });

  return (
    <Container>
      <Box>
        {shouldShowAlert ? (
          <TransactionAlert
            labels={{
              scanInProgressTitle: translate(
                'confirmation.securityScanInProgressTitle',
              ),
              scanInProgressMessage: translate(
                'confirmation.securityScanInProgressMessage',
              ),
              scanFailedTitle: translate('send.simulationTitleAPIError'),
              scanFailedMessage: translate('send.simulationMessageAPIError'),
              maliciousTitle: translate('confirmation.validationErrorTitle'),
              maliciousMessage: translate(
                'confirmation.validationErrorSubtitle',
              ),
              warningTitle: translate('confirmation.validationWarningTitle'),
              warningMessage: translate(
                'confirmation.validationWarningSubtitle',
              ),
              learnMore: translate('confirmation.validationErrorLearnMore'),
              securityAdvisedBy: translate(
                'confirmation.validationErrorSecurityAdviced',
              ),
            }}
            isFetching={context.scanFetchStatus === 'fetching'}
            isFetchError={context.scanFetchStatus === 'error'}
            error={
              scanError
                ? {
                    title: translate('confirmation.simulationErrorTitle'),
                    message: translate('confirmation.simulationErrorSubtitle', {
                      reason: getErrorMessage(scanError, context.preferences),
                    }),
                  }
                : null
            }
            validation={
              useSecurityAlerts ? (context.scan?.validation ?? null) : null
            }
          />
        ) : null}
        <ActionHeader
          title={translate(`confirmation.${context.method}.title`)}
        />
        {context.preferences.simulateOnChainActions ? (
          <EstimatedChanges
            scanStatus={context.scan?.status ?? null}
            scanFetchStatus={context.scanFetchStatus}
            changes={context.scan?.estimatedChanges ?? null}
            preferences={context.preferences}
          />
        ) : null}
        <TransactionDetails
          accountAddress={context.account?.address ?? null}
          accountDomain={context.accountDomain ?? null}
          destinationAddress={context.destinationAddress ?? null}
          destinationDomain={context.destinationDomain ?? null}
          scope={context.scope}
          feeInSol={feeInSol}
          nativePrice={nativePrice}
          fetchingPricesStatus={context.tokenPricesFetchStatus}
          preferences={context.preferences}
          networkImage={context.networkImage}
          origin={context.origin}
        />
        <Advanced
          instructions={context.advanced.instructions}
          showInstructions={context.advanced.shown}
          locale={context.preferences.locale}
          scope={context.scope}
        />
      </Box>
      <ConfirmationFooter
        labels={{
          cancelButton: translate('confirmation.cancelButton'),
          confirmButton: translate('confirmation.confirmButton'),
          reviewAlertsButton: translate('confirmation.reviewAlertsButton'),
        }}
        cancelButtonName={ConfirmSignAndSendTransactionFormNames.Cancel}
        confirmButtonName={ConfirmSignAndSendTransactionFormNames.Confirm}
        reviewAlertsName={MaliciousAcknowledgementFormNames.Review}
        confirmDisabled={shouldDisableConfirmButton}
        requiresAcknowledgement={requiresAcknowledgement}
      />
    </Container>
  );
};
