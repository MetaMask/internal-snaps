import { AnalyticsService } from '@metamask/snap-networks-utils';

import { getSnapProvider } from '../clients/snap/getSnapProvider';
import { trackError } from './errors';
import logger from './logger';

export const analyticsService = new AnalyticsService({
  getSnapProvider,
  logger,
  trackError,
});

/**
 * Spread into every `createFetchPolicy` call so outages emit Segment events
 * and give-ups reach Sentry.
 */
export const fetchPolicyReporting = {
  analytics: analyticsService,
  trackError,
};
