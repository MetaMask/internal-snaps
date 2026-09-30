import { EstimatedChanges as SharedEstimatedChanges } from '@metamask/snap-networks-utils';
import type {
  ComponentOrElement,
  GetPreferencesResult,
} from '@metamask/snaps-sdk';

import { NATIVE_ASSET_SYMBOL } from '../../../../constants';
import type { TransactionScanEstimatedChanges } from '../../../../services/transaction-scan';
import { i18n } from '../../../../utils';
import { xlmIcon } from '../../../images';
import { FetchStatus } from '../../api';
import { isFetchInProgress } from '../../utils';

type EstimatedChangesProps = {
  changes: TransactionScanEstimatedChanges | null;
  preferences: GetPreferencesResult;
  scanFetchStatus: FetchStatus;
};

/**
 * Renders the signer's estimated balance changes (send / receive breakdown)
 * with the shared component. Locally-seeded rows (send flow) stay visible
 * regardless of the remote scan status.
 *
 * @param props - The component props.
 * @param props.changes - The estimated changes, or null when unavailable.
 * @param props.preferences - Snap preferences (used for locale).
 * @param props.scanFetchStatus - Latest remote scan fetch status.
 * @returns The estimated-changes section.
 */
export const EstimatedChanges = ({
  changes,
  preferences,
  scanFetchStatus,
}: EstimatedChangesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);

  return (
    <SharedEstimatedChanges
      assets={(changes?.assets ?? []).map((asset) => ({
        type: asset.type,
        value: asset.value,
        symbol: asset.symbol,
        logo:
          asset.logo ?? (asset.symbol === NATIVE_ASSET_SYMBOL ? xlmIcon : null),
      }))}
      labels={{
        title: translate('confirmation.estimatedChanges.title'),
        tooltip: translate('confirmation.estimatedChanges.tooltip'),
        send: translate('confirmation.estimatedChanges.send'),
        receive: translate('confirmation.estimatedChanges.receive'),
        notAvailable: translate('confirmation.estimatedChanges.notAvailable'),
        noChanges: translate('confirmation.estimatedChanges.noChanges'),
      }}
      isFetching={isFetchInProgress(scanFetchStatus)}
      isUnavailable={scanFetchStatus === FetchStatus.Error}
    />
  );
};
