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

// Raw SVG markup: `Image` accepts it as `src`, and the library build cannot
// bundle `.svg` imports the way `mm-snap` does.
export const QUESTION_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="16" height="16"><path fill="#999999" d="M42.75 24c0 10.59375-8.53125 19.21875-19.125 19.21875-10.6875 0-19.21875-8.625-19.21875-19.21875 0-10.59375 8.53125-19.21875 19.21875-19.21875 10.59375 0 19.125 8.625 19.125 19.21875zM23.625 14.0625c-3.09375 0-5.90625 2.25-5.90625 5.4375 0 0.84375 0.75 1.59375 1.59375 1.59375 0.84375 0 1.59375-0.75 1.59375-1.59375 0-1.125 1.03125-2.25 2.71875-2.25 1.59375 0 2.625 1.125 2.625 2.25 0 0.5625-0.375 1.03125-1.3125 1.59375l0 0c-1.125 0.75-3 1.96875-3 4.5l0 0.46875c0 0.84375 0.75 1.59375 1.6875 1.59375 0.84375 0 1.59375-0.75 1.59375-1.59375l0-0.46875c0-0.65625 0.28125-1.125 1.40625-1.78125 1.03125-0.65625 2.8125-1.875 2.8125-4.3125 0-3.1875-2.8125-5.4375-5.8125-5.4375zM23.53125 31.875c-0.84375 0-1.59375 0.65625-1.59375 1.59375 0 0.84375 0.75 1.59375 1.59375 1.59375l0.09375 0c0.84375 0 1.59375-0.75 1.59375-1.59375 0-0.9375-0.75-1.59375-1.59375-1.59375z"/></svg>';

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
    src={iconUrl?.trim() ? iconUrl : QUESTION_MARK_SVG}
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
