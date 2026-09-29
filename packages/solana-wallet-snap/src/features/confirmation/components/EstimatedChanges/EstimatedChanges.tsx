import { EstimatedChanges as SharedEstimatedChanges } from '@metamask/snap-networks-utils';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';

import type {
  TransactionScanEstimatedChanges,
  TransactionScanStatus,
} from '../../../../core/services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../core/types/snap';
import { formatCryptoBalance } from '../../../../core/utils/formatCryptoBalance';
import { formatFiat } from '../../../../core/utils/formatFiat';
import { i18n } from '../../../../core/utils/i18n';

type EstimatedChangesProps = {
  changes: TransactionScanEstimatedChanges | null;
  scanStatus: TransactionScanStatus | null;
  preferences: Preferences;
  scanFetchStatus: FetchStatus;
};

export const EstimatedChanges: SnapComponent<EstimatedChangesProps> = ({
  changes,
  preferences,
  scanFetchStatus,
  scanStatus,
}) => {
  const translate = i18n(preferences.locale);
  const { locale, currency } = preferences;

  return (
    <SharedEstimatedChanges
      assets={(changes?.assets ?? []).map((asset) => ({
        type: asset.type,
        value:
          asset.value === null
            ? null
            : formatCryptoBalance(asset.value, locale),
        symbol: asset.symbol,
        logo: asset.logo,
        fiat: asset.price
          ? formatFiat(asset.price.toString(), currency, locale)
          : null,
      }))}
      labels={{
        title: translate('confirmation.estimatedChanges'),
        tooltip: translate('confirmation.estimatedChanges.tooltip'),
        send: translate('confirmation.estimatedChanges.send'),
        receive: translate('confirmation.estimatedChanges.receive'),
        notAvailable: translate('confirmation.estimatedChanges.notAvailable'),
        noChanges: translate('confirmation.estimatedChanges.noChanges'),
      }}
      scanFetchStatus={scanFetchStatus}
      scanError={scanStatus === 'ERROR'}
    />
  );
};
