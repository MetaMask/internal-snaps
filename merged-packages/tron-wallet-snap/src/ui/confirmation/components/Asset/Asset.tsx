/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import type { CaipAssetType, ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Icon,
  Image,
  Skeleton,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import questionMarkSvg from '../../../../../images/question-mark.svg';
import { KnownCaip19Id } from '../../../../constants';
import type { Preferences } from '../../../../types/snap';
import { formatFiat } from '../../../../utils/formatFiat';
import { tokenToFiat } from '../../../../utils/tokenToFiat';

type AssetProps = {
  caipId: CaipAssetType;
  symbol: string;
  amount: string;
  iconUrl?: string;
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
  const { caipId, symbol, amount, iconUrl, price, preferences, priceLoading } =
    props;

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

  const isBandwidth =
    caipId === KnownCaip19Id.BandwidthMainnet ||
    caipId === KnownCaip19Id.BandwidthNile ||
    caipId === KnownCaip19Id.BandwidthShasta;

  const isEnergy =
    caipId === KnownCaip19Id.EnergyMainnet ||
    caipId === KnownCaip19Id.EnergyNile ||
    caipId === KnownCaip19Id.EnergyShasta;

  const isNormalAsset = !isBandwidth && !isEnergy;
  const iconSrc = iconUrl ?? questionMarkSvg;

  return (
    <Box direction="horizontal" alignment="center">
      {showSkeleton ? <Skeleton width={80} /> : null}
      {showFiat ? <SnapText color="muted">{fiatValue}</SnapText> : null}
      <Box alignment="center" center>
        {isBandwidth ? <Icon name="connect" size="md" /> : null}
        {isEnergy ? <Icon name="flash" size="md" /> : null}
        {isNormalAsset ? (
          <Image borderRadius="full" src={iconSrc} height={16} width={16} />
        ) : null}
      </Box>
      <SnapText>{`${amount} ${symbol}`}</SnapText>
    </Box>
  );
};
