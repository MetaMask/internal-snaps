import {
  createSnapErrorHandling,
  isReportedFetchPolicyError,
} from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import logger from './logger';
import { getSnapProvider } from './snap';

export { isSnapRpcError } from '@metamask/snap-networks-utils';
export type { SnapRpcError } from '@metamask/snap-networks-utils';

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
    shouldTrack: (error) =>
      !(error instanceof UserRejectedRequestError) &&
      !isReportedFetchPolicyError(error),
  });
