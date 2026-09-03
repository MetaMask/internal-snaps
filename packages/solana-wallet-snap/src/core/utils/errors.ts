import { createSnapErrorHandling } from '@metamask/snap-networks-utils';

import logger from './logger';
import { getSnapProvider } from './snap';

export { isSnapRpcError } from '@metamask/snap-networks-utils';
export type { SnapRpcError } from '@metamask/snap-networks-utils';

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
  });
