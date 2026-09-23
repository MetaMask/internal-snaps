import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Address,
  Box,
  Container,
  Heading,
  Icon,
  Section,
  Text as SnapText,
  Tooltip,
  Divider,
  Copyable,
} from '@metamask/snaps-sdk/jsx';

import type { StellarKeyringAccount } from '../../../../services/account';
import type { ReadableTransactionJson } from '../../../../services/transaction';
import { StellarOperationType } from '../../../../services/transaction';
import type { Locale, LocalizedMessage } from '../../../../utils';
import { i18n } from '../../../../utils';
import type { ConfirmationBaseProps, FeeData } from '../../api';
import { FetchStatus } from '../../api';
import { Authorizations } from '../../components/Authorizations';
import { ConfirmationFooter } from '../../components/ConfirmationFooter';
import { EstimatedChanges } from '../../components/EstimatedChanges/EstimatedChanges';
import { FeeRow } from '../../components/Fee';
import { InvocationSummary } from '../../components/InvocationSummary';
import { NetworkRow } from '../../components/Network';
import { ReadableParamsList } from '../../components/ReadableParamsList';
import { TransactionAlert } from '../../components/TransactionAlert';
import {
  getAccountName,
  getInvocationDetailParams,
  getParam,
  hasEnabledTransactionScan,
  requiresMaliciousAcknowledgement,
  shouldDisableConfirmation,
} from '../../utils';
import { ConfirmSignTransactionFormNames } from './events';

export type ConfirmSignTransactionProps = Omit<
  ConfirmationBaseProps,
  'feeData'
> & {
  feeData: FeeData;
  readableTransaction: ReadableTransactionJson;
  account: StellarKeyringAccount;
};

export const ConfirmSignTransaction = ({
  readableTransaction,
  account,
  scope,
  locale,
  networkImage,
  origin,
  preferences,
  feeData,
  tokenPrices,
  tokenPricesFetchStatus = FetchStatus.Initial,
  scan,
  scanFetchStatus = FetchStatus.Initial,
}: ConfirmSignTransactionProps): ComponentOrElement => {
  const t = i18n(locale);
  const { address } = account;
  const addressCaip10 = getAccountName(scope, address);
  const priceLoading = tokenPricesFetchStatus === FetchStatus.Fetching;
  const feePrice = tokenPrices?.[feeData.assetId] ?? null;
  // Sign-transaction has no local simulation/re-validation step, so only the
  // remote-scan-loading guard applies here.
  const shouldDisableConfirmButton = shouldDisableConfirmation({
    scanFetchStatus,
  });

  return (
    <Container>
      <Box>
        {hasEnabledTransactionScan(preferences) ? (
          <TransactionAlert
            scanFetchStatus={scanFetchStatus}
            validation={scan?.validation ?? null}
            error={scan?.error ?? null}
            preferences={preferences}
          />
        ) : null}
        <Box alignment="center" center>
          <Box>{null}</Box>
          <Heading size="lg">{t('confirmation.signTransaction.title')}</Heading>
          <Box>{null}</Box>
        </Box>

        {preferences.simulateOnChainActions ? (
          <EstimatedChanges
            changes={scan?.estimatedChanges ?? null}
            preferences={preferences}
            scanFetchStatus={scanFetchStatus}
          />
        ) : null}

        <Section>
          {origin ? (
            <Box alignment="space-between" direction="horizontal">
              <Box direction="horizontal" alignment="start">
                <SnapText fontWeight="medium" color="alternative">
                  {t('confirmation.origin')}
                </SnapText>
                <Tooltip content={t('confirmation.origin.tooltip')}>
                  <Icon name="question" color="muted" />
                </Tooltip>
              </Box>
              <SnapText>{origin}</SnapText>
            </Box>
          ) : null}
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {t('confirmation.account')}
            </SnapText>
            <Address address={addressCaip10} truncate displayName avatar />
          </Box>
          {/* Network */}
          <NetworkRow
            networkImage={networkImage}
            scope={scope}
            locale={locale as Locale}
          />
          <Box>{null}</Box>
          {/* Fee */}
          <FeeRow
            fee={feeData}
            preferences={preferences}
            price={feePrice}
            tokenPricesFetchStatus={tokenPricesFetchStatus}
          />
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {t('confirmation.memo')}
            </SnapText>
            <SnapText>
              {readableTransaction.memo ?? t('confirmation.memo.none')}
            </SnapText>
          </Box>
        </Section>

        {/* Authorizations */}
        {readableTransaction.authorizations.length > 0 ? (
          <Authorizations
            locale={locale}
            scope={scope}
            authorizations={readableTransaction.authorizations}
          />
        ) : null}

        {/* Operations */}
        <Section>
          {readableTransaction.operations.map((operationJson, index) => {
            const isInvokeHostFunction =
              operationJson.type === StellarOperationType.InvokeHostFunction;
            const contractAddress = getParam<string | null>(
              operationJson.params,
              'contractId',
            );
            const functionName = getParam<string | null>(
              operationJson.params,
              'functionName',
            );
            // Header: contract + function. Remaining rows (args, salt, …) below.
            const detailParams = isInvokeHostFunction
              ? getInvocationDetailParams(operationJson.params)
              : operationJson.params;

            return (
              <Box
                key={`op-${index}`}
                alignment="space-between"
                direction="vertical"
              >
                <Heading>
                  {t(
                    `confirmation.transaction.${operationJson.type.toLowerCase()}` as LocalizedMessage,
                  )}
                </Heading>
                {/* Source - only show if it's not the same as the signer account address */}
                {operationJson.source === address ? null : (
                  <Box direction="vertical">
                    <SnapText fontWeight="medium" color="alternative">
                      {t('confirmation.transaction.param.source')}
                    </SnapText>
                    <Copyable value={operationJson.source} />
                  </Box>
                )}
                {isInvokeHostFunction &&
                (contractAddress !== null || functionName !== null) ? (
                  <InvocationSummary
                    locale={locale}
                    contractAddress={contractAddress}
                    functionName={functionName}
                  />
                ) : null}
                {detailParams.length === 0 ? null : (
                  <ReadableParamsList
                    params={detailParams}
                    locale={locale}
                    scope={scope}
                    preferences={preferences}
                    tokenPrices={tokenPrices}
                    priceLoading={priceLoading}
                  />
                )}

                {index < readableTransaction.operations.length - 1 && (
                  <Divider />
                )}
              </Box>
            );
          })}
        </Section>
      </Box>
      <ConfirmationFooter
        locale={locale}
        cancelButtonName={ConfirmSignTransactionFormNames.Cancel}
        confirmButtonName={ConfirmSignTransactionFormNames.Confirm}
        confirmDisabled={shouldDisableConfirmButton}
        requiresAcknowledgement={requiresMaliciousAcknowledgement({
          preferences,
          scan,
        })}
      />
    </Container>
  );
};
