import { AnalyticsService } from '@metamask/snap-networks-utils';

import { getSnapProvider } from '../infra/getSnapProvider';
import { trackError } from './errors';
import logger from './logger';

export const analyticsService = new AnalyticsService({
  getSnapProvider,
  logger,
  trackError,
});

/**
 * Spread into a `createFetchPolicy` call so outages emit Segment events and
 * give-ups reach Sentry.
 */
export const fetchPolicyReporting = {
  analytics: analyticsService,
  trackError,
};
