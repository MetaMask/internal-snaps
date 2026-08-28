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

export const FetchStatus = {
  Initial: 'initial',
  // Loading: Before and during first fetch.
  Loading: 'loading',
  // Fetching: During 2nd and nth fetch.
  Fetching: 'fetching',
  Fetched: 'fetched',
  Error: 'error',
} as const;

export type FetchStatus = (typeof FetchStatus)[keyof typeof FetchStatus];
