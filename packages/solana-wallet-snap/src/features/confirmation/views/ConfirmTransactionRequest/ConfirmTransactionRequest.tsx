import { TransactionAlert } from '@metamask/snap-networks-utils';
import {
  Box,
  Button,
  Container,
  Footer,
  Heading,
} from '@metamask/snaps-sdk/jsx';

import { Networks } from '../../../../core/constants/solana';
import { i18n } from '../../../../core/utils/i18n';
import { Advanced } from '../../components/Advanced/Advanced';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { TransactionDetails } from '../../components/TransactionDetails/TransactionDetails';
import { ConfirmSignAndSendTransactionFormNames } from './events';
import { getErrorMessage } from './getErrorMessage';
import type { ConfirmTransactionRequestContext } from './types';

export const ConfirmTransactionRequest = ({
  context,
}: {
  context: ConfirmTransactionRequestContext;
}) => {
  const translate = i18n(context.preferences.locale);

  const feeInSol = context.feeEstimatedInSol;
  const { nativeToken } = Networks[context.scope];
  const nativePrice = context.tokenPrices[nativeToken.caip19Id]?.price ?? null;

  const isScanError = context.scan?.status === 'ERROR';

  const shouldDisableConfirmButton =
    context.scanFetchStatus === 'fetching' || isScanError;

  const shouldShowAlert = context.preferences.useSecurityAlerts || isScanError;
  const scanError = context.scan?.error;

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
              warningTitle: translate('confirmation.validationErrorTitle'),
              warningMessage: translate('confirmation.validationErrorSubtitle'),
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
            validation={context.scan?.validation ?? null}
          />
        ) : null}
        <Box alignment="center" center>
          <Box>{null}</Box>
          <Heading size="lg">
            {translate(`confirmation.${context.method}.title`)}
          </Heading>
          <Box>{null}</Box>
        </Box>
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
      <Footer>
        <Button name={ConfirmSignAndSendTransactionFormNames.Cancel}>
          {translate('confirmation.cancelButton')}
        </Button>
        <Button
          name={ConfirmSignAndSendTransactionFormNames.Confirm}
          disabled={shouldDisableConfirmButton}
        >
          {translate('confirmation.confirmButton')}
        </Button>
      </Footer>
    </Container>
  );
};
