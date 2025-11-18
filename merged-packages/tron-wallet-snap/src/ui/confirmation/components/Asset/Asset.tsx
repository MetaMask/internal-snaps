import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Image,
  Skeleton,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import type { Preferences } from '../../../../types/snap';
import { formatFiat } from '../../../../utils/formatFiat';
import { tokenToFiat } from '../../../../utils/tokenToFiat';

type AssetProps = {
  symbol: string;
  amount: string;
  iconSvg: string;
  showAmount?: boolean;
  price?: number | null;
  preferences?: Preferences;
  priceLoading?: boolean;
};

/**
 * Asset component for displaying assets with optional icon, amount, and price.
 * Pure component with no business logic - just visual display.
 *
 * @param props - The props for the asset component.
 * @returns The rendered asset element.
 */
export const Asset = (props: AssetProps): ComponentOrElement => {
  const { symbol, amount, iconSvg, price, preferences, priceLoading } = props;

  const fiatValue =
    preferences && price
      ? formatFiat(
          tokenToFiat(amount, price),
          preferences.currency,
          preferences.locale,
        )
      : '';

  const showPriceInfo = preferences !== undefined;
  const showSkeleton = showPriceInfo && priceLoading;
  const showFiat = showPriceInfo && !priceLoading && fiatValue;

  return (
    <Box direction="horizontal" alignment="center">
      {showSkeleton ? <Skeleton width={80} /> : null}
      {showFiat ? <SnapText color="muted">{fiatValue}</SnapText> : null}
      <Box alignment="center" center>
        <Image borderRadius="full" src={iconSvg} />
      </Box>
      <SnapText>{`${amount} ${symbol}`}</SnapText>
    </Box>
  );
};
