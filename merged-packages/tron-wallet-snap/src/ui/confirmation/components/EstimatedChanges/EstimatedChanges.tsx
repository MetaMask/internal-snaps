import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Section,
  Text as SnapText,
  Icon,
  Tooltip,
  Image,
  Skeleton,
} from '@metamask/snaps-sdk/jsx';

import type {
  TransactionScanEstimatedChanges,
  TransactionScanStatus,
} from '../../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../types/snap';
import { i18n } from '../../../../utils/i18n';

type EstimatedChangesProps = {
  changes: TransactionScanEstimatedChanges | null;
  scanStatus: TransactionScanStatus | null;
  preferences: Preferences;
  scanFetchStatus: FetchStatus;
};

const EstimatedChangesSkeleton = ({
  preferences,
}: {
  preferences: Preferences;
}): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  return (
    <Section direction="vertical">
      <Box direction="horizontal" alignment="start">
        <SnapText fontWeight="medium">
          {translate('confirmation.estimatedChanges.title')}
        </SnapText>
        <Tooltip content={translate('confirmation.estimatedChanges.tooltip')}>
          <Icon name="info" />
        </Tooltip>
      </Box>
      <Box alignment="space-between" direction="horizontal">
        <Skeleton width={60} />
        <Skeleton width={100} />
      </Box>
    </Section>
  );
};

const EstimatedChangesHeader = ({
  preferences,
}: {
  preferences: Preferences;
}): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  return (
    <Box direction="horizontal" alignment="start">
      <SnapText fontWeight="medium">
        {translate('confirmation.estimatedChanges.title')}
      </SnapText>
      <Tooltip content={translate('confirmation.estimatedChanges.tooltip')}>
        <Icon name="info" />
      </Tooltip>
    </Box>
  );
};

type AssetChangeProps = {
  asset: TransactionScanEstimatedChanges['assets'][0];
  preferences: Preferences;
};

const AssetChange = ({
  asset,
  preferences,
}: AssetChangeProps): ComponentOrElement => {
  const { locale } = preferences;
  const formattedValue = asset.value?.toLocaleString(locale) ?? '0';
  const isOut = asset.type === 'out';

  return (
    <Box direction="horizontal" alignment="end">
      {asset.imageSvg ? (
        <Image src={asset.imageSvg} borderRadius="full" />
      ) : null}
      <SnapText color={isOut ? 'error' : 'success'}>
        {isOut ? '-' : '+'}
        {formattedValue} {asset.symbol}
      </SnapText>
    </Box>
  );
};

export const EstimatedChanges = ({
  changes,
  preferences,
  scanFetchStatus,
  scanStatus,
}: EstimatedChangesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  const isFetching = scanFetchStatus === 'fetching';
  const isFetched = scanFetchStatus === 'fetched';
  const isError = scanFetchStatus === 'error';

  if (isFetching) {
    return <EstimatedChangesSkeleton preferences={preferences} />;
  }

  if (isError || (isFetched && scanStatus === 'ERROR')) {
    return (
      <Section direction="vertical">
        <EstimatedChangesHeader preferences={preferences} />
        <SnapText color="alternative">
          {translate('confirmation.estimatedChanges.notAvailable')}
        </SnapText>
      </Section>
    );
  }

  const send = changes?.assets.filter((asset) => asset.type === 'out') ?? [];
  const receive = changes?.assets.filter((asset) => asset.type === 'in') ?? [];

  const hasChanges = send.length > 0 || receive.length > 0;

  if (isFetched && !hasChanges) {
    return (
      <Section direction="vertical">
        <EstimatedChangesHeader preferences={preferences} />
        <SnapText color="alternative">
          {translate('confirmation.estimatedChanges.noChanges')}
        </SnapText>
      </Section>
    );
  }

  return (
    <Section>
      <EstimatedChangesHeader preferences={preferences} />
      {send?.length > 0 ? (
        <Box alignment="space-between" direction="horizontal">
          <SnapText fontWeight="medium" color="alternative">
            {translate('confirmation.estimatedChanges.send')}
          </SnapText>
          <Box>
            {send?.map((asset) => (
              <AssetChange asset={asset} preferences={preferences} />
            ))}
          </Box>
        </Box>
      ) : null}
      {receive?.length > 0 ? (
        <Box alignment="space-between" direction="horizontal">
          <SnapText fontWeight="medium" color="alternative">
            {translate('confirmation.estimatedChanges.receive')}
          </SnapText>
          <Box>
            {receive?.map((asset) => (
              <AssetChange asset={asset} preferences={preferences} />
            ))}
          </Box>
        </Box>
      ) : null}
    </Section>
  );
};
