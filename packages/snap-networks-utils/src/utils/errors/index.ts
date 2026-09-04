export { createSnapErrorHandling, createTrackError } from './trackError.js';
export { createWithCatchAndThrowSnapError, normalizeError } from './errors.js';
export { isSnapRpcError } from './snapRpcError.js';
export type {
  CreateSnapErrorHandlingOptions,
  CreateTrackErrorOptions,
  PrepareErrorForTrackingFn,
  ShouldTrackErrorFn,
  SnapTrackErrorRequest,
  TrackErrorCapableProvider,
} from './trackError.js';
export type {
  CreateWithCatchAndThrowSnapErrorOptions,
  LogErrorFn,
  NormalizeErrorFn,
  TrackErrorFn,
} from './errors.js';
export type { SnapRpcError } from './snapRpcError.js';
