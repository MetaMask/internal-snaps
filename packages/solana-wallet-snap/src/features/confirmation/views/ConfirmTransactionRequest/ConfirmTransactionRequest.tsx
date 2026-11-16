import type { SecurityAlertResponse } from '@metamask/snap-networks-utils';
import {
  ActionHeader,
  ConfirmationFooter,
  MaliciousAcknowledgementFormNames,
  MaliciousAcknowledgementScreen,
  requiresMaliciousAcknowledgement,
} from '@metamask/snap-networks-utils';
import { Box, Container } from '@metamask/snaps-sdk/jsx';

import { Networks } from '../../../../core/constants/solana';
import { i18n } from '../../../../core/utils/i18n';
import { Advanced } from '../../components/Advanced/Advanced';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { TransactionDetails } from '../../components/TransactionDetails/TransactionDetails';
import { ConfirmSignAndSendTransactionFormNames } from './events';
import { SecurityScanAlert } from './SecurityScanAlert';
import { TransactionFailureAlert } from './TransactionFailureAlert';
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

  const shouldDisableConfirmButton = shouldDisableConfirmation({
    scanFetchStatus: context.scanFetchStatus,
    transactionExpired: context.transactionExpired,
  });

  // Local expiry is the blocking alert, so it is shown alone. Otherwise the
  // security verdict and the simulation failure render side by side.
  const isBlockedByExpiry = context.transactionExpired === true;

  // A blocking state takes priority over the acknowledgement swap: the shared
  // footer falls back to the disabled "Confirm" button so the user can never
  // enter the acknowledgement flow for a transaction that is no longer valid.
  // The API can return any `result_type` string. The shared helper only checks
  // for `Malicious`, so unrecognized values are never treated as malicious.
  const requiresAcknowledgement = requiresMaliciousAcknowledgement(
    context.preferences.useSecurityAlerts,
    context.scan?.validation?.type as SecurityAlertResponse | null | undefined,
  );

  return (
    <Container>
      <Box>
        {isBlockedByExpiry ? null : (
          <SecurityScanAlert
            scan={context.scan}
            scanFetchStatus={context.scanFetchStatus}
            preferences={context.preferences}
          />
        )}
        <TransactionFailureAlert
          scan={context.scan}
          scanFetchStatus={context.scanFetchStatus}
          transactionExpired={context.transactionExpired}
          preferences={context.preferences}
        />
        <ActionHeader
          title={translate(`confirmation.${context.method}.title`)}
        />
        {context.preferences.simulateOnChainActions ? (
          <EstimatedChanges
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
          feePayment={context.feePayment ?? null}
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
        }}
        cancelButtonName={ConfirmSignAndSendTransactionFormNames.Cancel}
        confirmButtonName={ConfirmSignAndSendTransactionFormNames.Confirm}
        openAcknowledgementName={MaliciousAcknowledgementFormNames.Review}
        confirmDisabled={shouldDisableConfirmButton}
        requiresAcknowledgement={requiresAcknowledgement}
      />
    </Container>
  );
};
