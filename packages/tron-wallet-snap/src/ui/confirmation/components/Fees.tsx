import { Asset } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Text as SnapText } from '@metamask/snaps-sdk/jsx';
import type { IconProps } from '@metamask/snaps-sdk/jsx';

import type { SpotPrices } from '../../../clients/price-api/types';
import { KnownCaip19Id } from '../../../constants';
import type { ComputeFeeResult } from '../../../services/send/types';
import { FetchStatus } from '../../../types/snap';
import type { Preferences } from '../../../types/snap';
import { formatFiat } from '../../../utils/formatFiat';
import { i18n } from '../../../utils/i18n';
import { isFetchStatusLoadingOrFetching } from '../../../utils/isFetchStatusLoadingOrFetching';
import { tokenToFiat } from '../../../utils/tokenToFiat';

const RESOURCE_ICONS: Partial<Record<string, IconProps['name']>> = {
  [KnownCaip19Id.BandwidthMainnet]: 'connect',
  [KnownCaip19Id.BandwidthNile]: 'connect',
  [KnownCaip19Id.BandwidthShasta]: 'connect',
  [KnownCaip19Id.EnergyMainnet]: 'flash',
  [KnownCaip19Id.EnergyNile]: 'flash',
  [KnownCaip19Id.EnergyShasta]: 'flash',
};

type FeesProps = {
  fees: ComputeFeeResult;
  preferences: Preferences;
  tokenPrices?: SpotPrices;
  tokenPricesFetchStatus?: FetchStatus;
};

export const Fees = ({
  fees,
  preferences,
  tokenPrices = {},
  tokenPricesFetchStatus = FetchStatus.Initial,
}: FeesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);
  const priceLoading = isFetchStatusLoadingOrFetching(tokenPricesFetchStatus);

  /**
   * Make sure the TRX is shown first for cases where both
   * TRX and a resource are used.
   */
  const sortedFees = [...fees].sort((feeA, feeB) => {
    const isTrxA = feeA.asset.unit === 'TRX';
    const isTrxB = feeB.asset.unit === 'TRX';

    if (isTrxA && !isTrxB) {
      return -1;
    }
    if (!isTrxA && isTrxB) {
      return 1;
    }
    return 0;
  });

  return (
    <Box>
      {sortedFees.map((feeItem, index) => {
        // Get the price for this specific fee asset
        const feePrice =
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tokenPrices as any)[feeItem.asset.type]?.price ?? null;

        return (
          <Box
            key={`${feeItem.asset.type}-${feeItem.asset.unit}-${index}`}
            alignment="space-between"
            direction="horizontal"
          >
            {/* Left side - show text only for first item (native TRX) */}
            {index === 0 ? (
              <SnapText fontWeight="medium" color="alternative">
                {translate('confirmation.transactionFee')}
              </SnapText>
            ) : (
              <Box>{null}</Box>
            )}

            {/* Right side - fee value with asset display including price */}
            <Asset
              amount={feeItem.asset.amount}
              symbol={feeItem.asset.unit}
              iconUrl={feeItem.asset.iconUrl}
              iconName={RESOURCE_ICONS[feeItem.asset.type]}
              fiat={
                feePrice
                  ? formatFiat(
                      tokenToFiat(feeItem.asset.amount, feePrice),
                      preferences.currency,
                      preferences.locale,
                    )
                  : null
              }
              isFiatLoading={priceLoading}
            />
          </Box>
        );
      })}
    </Box>
  );
};
