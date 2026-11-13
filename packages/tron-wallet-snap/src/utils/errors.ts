import {
  createSnapErrorHandling,
  isReportedFetchPolicyError,
} from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import { getSnapProvider } from '../clients/snap/getSnapProvider';
import logger from './logger';
import { sanitizeSensitiveError } from './sensitiveErrors';

export { isSnapRpcError, sanitizeSensitiveError } from './sensitiveErrors';

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
    prepareError: sanitizeSensitiveError,
    shouldTrack: (error) =>
      !(error instanceof UserRejectedRequestError) &&
      !isReportedFetchPolicyError(error),
  });
