import { AnalyticsService } from '@metamask/snap-networks-utils';

import { trackError } from './errors';
import { logger } from './logger';
import { getSnapProvider } from './snap';

export const analyticsService = new AnalyticsService({
  getSnapProvider,
  logger,
  trackError,
});
