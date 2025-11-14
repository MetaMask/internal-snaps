import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { Asset } from './Asset/Asset';
import type { ComputeFeeResult } from '../../../services/send/types';
import type { Preferences } from '../../../types/snap';
import { i18n } from '../../../utils/i18n';

type FeesProps = {
  fees: ComputeFeeResult;
  preferences: Preferences;
};

export const Fees = ({ fees, preferences }: FeesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);

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
      {sortedFees.map((feeItem, index) => (
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

          {/* Right side - fee value with asset display */}
          <Asset
            amount={feeItem.asset.amount}
            symbol={feeItem.asset.unit}
            iconSvg={feeItem.asset.imageSvg ?? ''}
          />
        </Box>
      ))}
    </Box>
  );
};
