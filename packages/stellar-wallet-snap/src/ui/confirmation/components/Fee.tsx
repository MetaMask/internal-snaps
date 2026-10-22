import { Asset } from '@metamask/snap-networks-utils';
import type {
  ComponentOrElement,
  GetPreferencesResult,
} from '@metamask/snaps-sdk';
import { Box, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { tokenPriceToFiat } from '../../../utils';
import { i18n } from '../../../utils/i18n';
import { xlmIcon } from '../../images';
import { FetchStatus } from '../api';
import type { FeeData } from '../api';

type FeesProps = {
  fee: FeeData;
  price: string | null;
  preferences: GetPreferencesResult;
  tokenPricesFetchStatus?: FetchStatus;
};

export const FeeRow = ({
  fee,
  preferences,
  price,
  tokenPricesFetchStatus = FetchStatus.Initial,
}: FeesProps): ComponentOrElement => {
  const translate = i18n(preferences.locale);
  const priceLoading = tokenPricesFetchStatus === FetchStatus.Fetching;
  const fiat = tokenPriceToFiat(
    fee.amount,
    price,
    preferences.currency,
    preferences.locale,
  );

  return (
    <Box>
      <Box alignment="space-between" direction="horizontal">
        {/* Left side - show text only for first item (native TRX) */}
        <SnapText fontWeight="medium" color="alternative">
          {translate('confirmation.transactionFee')}
        </SnapText>

        {/* Right side - fee value with asset display including price */}
        <Asset
          amount={fee.amount}
          symbol={fee.symbol}
          iconUrl={xlmIcon}
          fiat={fiat}
          isFiatLoading={priceLoading}
        />
      </Box>
    </Box>
  );
};
