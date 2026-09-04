import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Address,
  Box,
  Container,
  Heading,
  Section,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';
import { parseCaipAssetType } from '@metamask/utils';

import type { StellarKeyringAccount } from '../../../../services/account';
import type { StellarAssetMetadata } from '../../../../services/asset-metadata';
import type { Locale } from '../../../../utils';
import { i18n } from '../../../../utils';
import type {
  ContextWithPrices,
  ConfirmationBaseProps,
  FeeData,
} from '../../api';
import { FetchStatus } from '../../api';
import {
  Asset,
  AssetIcon,
  ConfirmationAlerts,
  ConfirmationFooter,
  FeeRow,
} from '../../components';
import { NetworkRow } from '../../components/Network';
import { OriginRow } from '../../components/OriginRow';
import {
  getAccountName,
  getClassicAssetExplorerUrl,
  requiresMaliciousAcknowledgement,
  shouldDisableConfirmation,
} from '../../utils';
import { ConfirmSignChangeTrustOptInFormNames } from './events';

export type ConfirmSignChangeTrustOptInProps = ConfirmationBaseProps &
  ContextWithPrices & {
    account: StellarKeyringAccount;
    assetMetadata: StellarAssetMetadata;
    feeData: FeeData;
  };

export const ConfirmSignChangeTrustOptIn = ({
  account,
  scope,
  assetMetadata,
  locale,
  networkImage,
  feeData,
  tokenPrices,
  origin,
  isSelfReportedOrigin,
  preferences,
  tokenPricesFetchStatus = FetchStatus.Initial,
  scan,
  scanFetchStatus = FetchStatus.Initial,
  transactionsFetchStatus = FetchStatus.Initial,
  errorMessage,
}: ConfirmSignChangeTrustOptInProps): ComponentOrElement => {
  const t = i18n(locale);
  const { address } = account;
  const shouldDisableConfirmButton = shouldDisableConfirmation({
    scanFetchStatus,
    transactionsFetchStatus,
  });

  return (
    <Container>
      <Box>
        <ConfirmationAlerts
          preferences={preferences}
          scan={scan}
          scanFetchStatus={scanFetchStatus}
          transactionsFetchStatus={transactionsFetchStatus}
          errorMessage={errorMessage}
        />
        <Box alignment="center" center>
          <Box>{null}</Box>
          <Heading size="lg">
            {t('confirmation.signChangeTrustOptIn.title', {
              asset: assetMetadata.symbol,
            })}
          </Heading>
          <Box>
            <AssetIcon iconUrl={assetMetadata.iconUrl} size="xl" />
          </Box>
          <Box>{null}</Box>
          <Box>{null}</Box>
        </Box>

        <Section>
          <OriginRow
            origin={origin}
            isSelfReported={isSelfReportedOrigin}
            locale={locale}
          />
          {/* From */}
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {t('confirmation.account')}
            </SnapText>
            <Address
              address={getAccountName(scope, address)}
              truncate
              displayName
              avatar
            />
          </Box>
          <Box alignment="space-between" direction="horizontal">
            <SnapText fontWeight="medium" color="alternative">
              {t('confirmation.asset')}
            </SnapText>

            <Asset
              symbol={assetMetadata.symbol}
              iconUrl={assetMetadata.iconUrl}
              link={getClassicAssetExplorerUrl(
                parseCaipAssetType(assetMetadata.assetId).assetReference,
              )}
            />
          </Box>

          {/* Network */}
          <NetworkRow
            networkImage={networkImage}
            scope={scope}
            locale={locale as Locale}
          />
          <Box>{null}</Box>
          {/* Fee Breakdown */}
          {Object.keys(feeData).length === 0 ? null : (
            <FeeRow
              fee={feeData}
              price={tokenPrices?.[feeData.assetId] ?? null}
              preferences={preferences}
              tokenPricesFetchStatus={tokenPricesFetchStatus}
            />
          )}
        </Section>
      </Box>
      <ConfirmationFooter
        locale={locale}
        cancelButtonName={ConfirmSignChangeTrustOptInFormNames.Cancel}
        confirmButtonName={ConfirmSignChangeTrustOptInFormNames.Confirm}
        confirmDisabled={shouldDisableConfirmButton}
        requiresAcknowledgement={requiresMaliciousAcknowledgement({
          preferences,
          scan,
        })}
      />
    </Container>
  );
};
