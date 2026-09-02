import { createWithCatchAndThrowSnapError } from '@metamask/snap-networks-utils';

import { SnapClient } from '../clients/snap/SnapClient';
import logger from './logger';

export { isSnapRpcError, sanitizeSensitiveError } from './sensitiveErrors';

const snapClient = new SnapClient({ logger });

export const withCatchAndThrowSnapError = createWithCatchAndThrowSnapError({
  logError: logger.error.bind(logger),
  trackError: (error) => snapClient.trackError(error as Error),
});
