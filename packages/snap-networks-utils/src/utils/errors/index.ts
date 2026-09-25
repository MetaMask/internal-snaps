export { createSnapErrorHandling, createTrackError } from './trackError';
export { SynchronizationError, formatAccountSyncFailures } from './syncError';
export type { AccountSyncFailure } from './syncError';
export { createWithCatchAndThrowSnapError, normalizeError } from './errors';
export { isSnapRpcError } from './snapRpcError';
export type {
  CreateSnapErrorHandlingOptions,
  CreateTrackErrorOptions,
  PrepareErrorForTrackingFn,
  ShouldTrackErrorFn,
  SnapTrackErrorRequest,
  TrackErrorCapableProvider,
} from './trackError';
export type {
  CreateWithCatchAndThrowSnapErrorOptions,
  LogErrorFn,
  NormalizeErrorFn,
  TrackErrorFn,
} from './errors';
export type { SnapRpcError } from './snapRpcError';
