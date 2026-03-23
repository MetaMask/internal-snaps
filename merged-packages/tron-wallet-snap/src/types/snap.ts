import type { Locale } from '../utils/i18n';

export type Preferences = {
  locale: Locale;
  currency: string;
  hideBalances: boolean;
  useSecurityAlerts: boolean;
  useExternalPricingData: boolean;
  simulateOnChainActions: boolean;
  useTokenDetection: boolean;
  batchCheckBalances: boolean;
  displayNftMedia: boolean;
  useNftDetection: boolean;
};

export enum FetchStatus {
  Initial = 'initial',
  Fetching = 'fetching',
  Fetched = 'fetched',
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Error = 'error',
}
