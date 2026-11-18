import { createSnapErrorHandling } from '@metamask/snap-networks-utils';

import { getSnapProvider } from '../clients/snap/getSnapProvider';
import logger from './logger';
import { sanitizeSensitiveError } from './sensitiveErrors';

export { isSnapRpcError, sanitizeSensitiveError } from './sensitiveErrors';

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
    prepareError: sanitizeSensitiveError,
  });
