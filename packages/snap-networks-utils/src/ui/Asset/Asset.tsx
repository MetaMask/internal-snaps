import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Icon,
  Image,
  Link,
  Skeleton,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';
import type { IconProps } from '@metamask/snaps-sdk/jsx';

import questionMarkIcon from './question-mark.svg';

const IconSize = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const;

export type AssetIconProps = {
  /** Icon URL; a question-mark icon is shown when missing or blank. */
  iconUrl?: string | null;
  size?: keyof typeof IconSize;
};

export type AssetProps = {
  symbol: string;
  /** Display-ready amount shown before the symbol; omit to show the symbol only. */
  amount?: string;
  /** Icon URL; a question-mark icon is shown when missing or blank. */
  iconUrl?: string | null;
  /** Snaps icon shown instead of the image, e.g. for network resources. */
  iconName?: IconProps['name'];
  /** Whether to render the asset without any icon. */
  hideIcon?: boolean;
  /** Explorer link; when set, the asset text is rendered as a link. */
  link?: string;
  /**
   * Display-ready fiat value shown before the asset. The caller decides whether
   * fiat applies (e.g. `useExternalPricingData`) and formats it with the user's
   * currency and locale; pass `null` to show no fiat.
   */
  fiat?: string | null;
  /** Whether the fiat value is loading; shows a skeleton in its place. */
  isFiatLoading?: boolean;
};

/**
 * Renders a round asset icon, falling back to a question mark.
 *
 * @param props - The component props.
 * @param props.iconUrl - The icon URL.
 * @param props.size - The icon size, `sm` (16px) by default.
 * @returns The icon image.
 */
export const AssetIcon = ({
  iconUrl,
  size = 'sm',
}: AssetIconProps): ComponentOrElement => (
  <Image
    borderRadius="full"
    src={iconUrl?.trim() ? iconUrl : questionMarkIcon}
    height={IconSize[size]}
    width={IconSize[size]}
  />
);

/**
 * Renders an inline asset: optional fiat value (or a loading skeleton), the
 * asset icon, then the amount and symbol, optionally as an explorer link.
 *
 * @param props - The component props.
 * @param props.symbol - The asset symbol.
 * @param props.amount - The display-ready amount.
 * @param props.iconUrl - The icon URL.
 * @param props.iconName - A Snaps icon shown instead of the image.
 * @param props.hideIcon - Whether to render no icon.
 * @param props.link - The explorer link.
 * @param props.fiat - The display-ready fiat value.
 * @param props.isFiatLoading - Whether the fiat value is loading.
 * @returns The asset element.
 * @example
 * ```tsx
 * const price = preferences.useExternalPricingData
 *   ? tokenPrices[assetId]
 *   : null;
 *
 * <Asset
 *   symbol="XLM"
 *   amount="1.5"
 *   iconUrl={iconUrl}
 *   fiat={
 *     price
 *       ? formatFiat(
 *           tokenToFiat('1.5', price),
 *           preferences.currency,
 *           preferences.locale,
 *         )
 *       : null
 *   }
 *   isFiatLoading={tokenPricesFetchStatus === 'fetching'}
 * />;
 * ```
 */
export const Asset = ({
  symbol,
  amount,
  iconUrl,
  iconName,
  hideIcon = false,
  link,
  fiat,
  isFiatLoading = false,
}: AssetProps): ComponentOrElement => {
  const text = amount === undefined ? symbol : `${amount} ${symbol}`;

  return (
    <Box direction="horizontal" alignment="end">
      {isFiatLoading ? <Skeleton width={80} /> : null}
      {!isFiatLoading && fiat ? (
        <SnapText color="muted">{fiat}</SnapText>
      ) : null}
      {hideIcon ? null : (
        <Box alignment="center" center>
          {iconName ? (
            <Icon name={iconName} size="md" />
          ) : (
            <AssetIcon iconUrl={iconUrl} />
          )}
        </Box>
      )}
      {link ? <Link href={link}>{text}</Link> : <SnapText>{text}</SnapText>}
    </Box>
  );
};
