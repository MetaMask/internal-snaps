import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { Asset } from './Asset/Asset';
import type { SpotPrices } from '../../../clients/price-api/types';
import type { ComputeFeeResult } from '../../../services/send/types';
import type { FetchStatus, Preferences } from '../../../types/snap';
import { i18n } from '../../../utils/i18n';

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
  tokenPricesFetchStatus = 'initial',
}: FeesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);
  const priceLoading = tokenPricesFetchStatus === 'fetching';

  /**
   * Make sure the TRX is shown first for cases where both
   * TRX and a resource are used.
   */
  const sortedFees = [...fees].sort((feeA, feeB) => {
    const isTrxA = feeA.asset.unit === 'TRX';
    const isTrxB = feeB.asset.unit === 'TRX';

    if (isTrxA && !isTrxB) return -1;
    if (!isTrxA && isTrxB) return 1;
    return 0;
  });

  return (
    <Box>
      {sortedFees.map((feeItem, index) => {
        // Get the price for this specific fee asset
        const feePrice =
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
              caipId={feeItem.asset.type}
              amount={feeItem.asset.amount}
              symbol={feeItem.asset.unit}
              iconSvg={feeItem.asset.imageSvg ?? ''}
              price={feePrice}
              preferences={preferences}
              priceLoading={priceLoading}
            />
          </Box>
        );
      })}
    </Box>
  );
};
