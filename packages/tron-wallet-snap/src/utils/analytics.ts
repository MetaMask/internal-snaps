import { AnalyticsService } from '@metamask/snap-networks-utils';

import { getSnapProvider } from '../clients/snap/getSnapProvider';
import { trackError } from './errors';
import logger from './logger';

export const analyticsService = new AnalyticsService({
  getSnapProvider,
  logger,
  trackError,
});
