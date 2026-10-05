import { EstimatedChanges as SharedEstimatedChanges } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';

import type {
  TransactionScanEstimatedChanges,
  TransactionScanStatus,
} from '../../../../services/transaction-scan/types';
import { FetchStatus } from '../../../../types/snap';
import type { Preferences } from '../../../../types/snap';
import { formatAmount } from '../../../../utils/formatAmount';
import { i18n } from '../../../../utils/i18n';
import { isFetchStatusLoadingOrFetching } from '../../../../utils/isFetchStatusLoadingOrFetching';

type EstimatedChangesProps = {
  changes: TransactionScanEstimatedChanges | null;
  scanStatus: TransactionScanStatus | null;
  preferences: Preferences;
  scanFetchStatus: FetchStatus;
};

export const EstimatedChanges = ({
  changes,
  scanStatus,
  preferences,
  scanFetchStatus,
}: EstimatedChangesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  return (
    <SharedEstimatedChanges
      assets={(changes?.assets ?? []).map((asset) => ({
        type: asset.type,
        value: formatAmount(asset.value),
        symbol: asset.symbol,
        logo: asset.logo,
      }))}
      labels={{
        title: translate('confirmation.estimatedChanges.title'),
        tooltip: translate('confirmation.estimatedChanges.tooltip'),
        send: translate('confirmation.estimatedChanges.send'),
        receive: translate('confirmation.estimatedChanges.receive'),
        notAvailable: translate('confirmation.estimatedChanges.notAvailable'),
        noChanges: translate('confirmation.estimatedChanges.noChanges'),
      }}
      isFetching={isFetchStatusLoadingOrFetching(scanFetchStatus)}
      isUnavailable={
        scanFetchStatus === FetchStatus.Error || scanStatus === 'ERROR'
      }
    />
  );
};
