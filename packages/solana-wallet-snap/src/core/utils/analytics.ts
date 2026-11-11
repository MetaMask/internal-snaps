import { AnalyticsService } from '@metamask/snap-networks-utils';

import { trackError } from './errors';
import logger from './logger';
import { getSnapProvider } from './snap';

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
