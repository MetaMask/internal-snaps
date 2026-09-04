import type { Network } from '@metamask/bitcoindevkit';
import { Amount, BdkErrorCode } from '@metamask/bitcoindevkit';
import { resolveOrigin } from '@metamask/snap-networks-utils';
import type { CaipAccountId } from '@metamask/snaps-sdk';

import type { CurrencyRate, CurrencyUnit, Messages } from '../../entities';
import { networkToScope } from '../../handlers';

export const displayAmount = (
  amountSats: bigint,
  currency?: CurrencyUnit,
): string => {
  const amount = Amount.from_sat(amountSats).to_btc();
  if (currency) {
    return `${amount} ${currency}`;
  }

  return amount.toString();
};

export const exchangeAmount = (
  amount: bigint,
  exchangeRate?: CurrencyRate,
): string => {
  if (!exchangeRate) {
    return '';
  }

  return ((Number(amount) * exchangeRate.conversionRate) / 1e8).toFixed(2);
};

export const displayExchangeAmount = (
  amount: bigint,
  exchangeRate?: CurrencyRate,
): string => {
  return exchangeRate
    ? `${exchangeAmount(amount, exchangeRate)} ${exchangeRate.currency}`
    : '';
};

export const translate =
  (messages: Messages) =>
  (key: string): string =>
    messages[key]?.message ?? `{${key}}`;

export const displayExplorerUrl = (url: string, address: string): string =>
  `${url}/address/${address}`;

export const isValidSnapLinkProtocol = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return (
      protocol === 'https:' ||
      protocol === 'mailto:' ||
      protocol === 'metamask:'
    );
  } catch {
    return false;
  }
};

export const errorCodeToLabel = (code: number): string => {
  const raw = BdkErrorCode[code] as string | undefined;
  if (!raw) {
    return 'unknownError';
  }

  // lowercase the first letter to respect camelCase convention
  return raw.charAt(0).toLowerCase() + raw.slice(1);
};

/**
 * Formats a request origin for display.
 *
 * Returns an empty string when the origin is not displayable: remote
 * transports (WalletConnect, SDK) pass an opaque connection id, which is
 * meaningless to the user, so the caller hides the origin row instead of
 * showing it.
 *
 * ponytail: the self-reported URL that rides along such requests in
 * `originMetadata` is not plumbed into the confirmations yet (Bitcoin has no
 * remote-transport support to exercise it). Pass it to `resolveOrigin` and
 * render its `isSelfReported` flag when that support lands.
 *
 * @param origin - The origin of the request, as received by the snap.
 * @returns The hostname, a label for known origins, or an empty string.
 */
export const displayOrigin = (origin: string): string =>
  resolveOrigin(origin).displayOrigin ?? '';

export const displayCaip10 = (
  network: Network,
  address: string,
): CaipAccountId => {
  return `${networkToScope[network]}:${address}`;
};

export const displayNetwork = (network: Network): string => {
  return network.charAt(0).toUpperCase() + network.slice(1);
};
