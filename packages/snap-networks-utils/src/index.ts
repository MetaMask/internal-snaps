export {
  ASSETS_PROVIDER_NAME,
  AssetsProvider,
  type AssetsProviderMessenger,
} from './providers/assets/AssetsProvider.js';
export {
  REMOTE_FEATURE_FLAGS_PROVIDER_NAME,
  RemoteFeatureFlagsProvider,
  type RemoteFeatureFlagsProviderMessenger,
} from './providers/remote-feature-flags/RemoteFeatureFlagsProvider.js';
export { safeMerge } from './utils/safeMerge/safeMerge.js';
export { buildUrl } from './utils/buildUrl/buildUrl.js';
export type { BuildUrlParams } from './utils/buildUrl/buildUrl.js';
export {
  sanitizeControlCharacters,
  sanitizeUri,
} from './utils/sanitize/sanitize.js';
export { UrlStruct } from './utils/urlStruct/urlStruct.js';
export { UuidStruct } from './utils/uuidStruct/uuidStruct.js';
export {
  batchesAll,
  batchesAllSettled,
  batchesAllSettledWithChunks,
  batchesAllWithChunks,
  chunks,
} from './utils/async/async.js';
export { Logger, LogLevel } from './utils/logger/Logger.js';
export type {
  LoggerOptions,
  LoggerMethod,
  LogMethod,
  LogMethodDecorator,
  LoggerDecorators,
} from './utils/logger/Logger.js';
export { serialize, deserialize } from './utils/serialization/serialization.js';
export type { Serializable } from './utils/serialization/types.js';
export {
  parseProofOfOwnershipMessage,
  ProofOfOwnershipBatchErrorStruct,
  ProofOfOwnershipBatchItemResponseStruct,
  ProofOfOwnershipBatchRequestItemStruct,
  ProofOfOwnershipBatchRequestParamsStruct,
  ProofOfOwnershipBatchResponseStruct,
  ProofOfOwnershipBatchSuccessStruct,
  ProofOfOwnershipMessageStruct,
  PROOF_OF_OWNERSHIP_MESSAGE_PREFIX,
} from './utils/proofOfOwnership/proofOfOwnership.js';
export type {
  ProofOfOwnershipBatchError,
  ProofOfOwnershipBatchItemResponse,
  ProofOfOwnershipBatchRequestItem,
  ProofOfOwnershipBatchRequestParams,
  ProofOfOwnershipBatchResponse,
  ProofOfOwnershipBatchSuccess,
  ProofOfOwnershipMessage,
} from './utils/proofOfOwnership/proofOfOwnership.js';
export {
  createOriginPermissions,
  DEFAULT_PROD_ORIGINS,
  DEFAULT_DEV_ORIGINS,
  DEFAULT_METAMASK_ORIGIN,
} from './utils/originPermissions/createOriginPermissions.js';
export type { CreateOriginPermissionsParams } from './utils/originPermissions/createOriginPermissions.js';
export { validateOrigin } from './utils/originPermissions/validateOrigin.js';
export {
  createSnapErrorHandling,
  createTrackError,
  createWithCatchAndThrowSnapError,
  isSnapRpcError,
  normalizeError,
  // Directory imports require the explicit `/index.js` under Node16 ESM resolution.
  // eslint-disable-next-line import-x/no-useless-path-segments
} from './utils/errors/index.js';
export { InFlightCoalescer } from './utils/dedupe/InFlightCoalescer.js';
export type {
  CreateSnapErrorHandlingOptions,
  CreateTrackErrorOptions,
  CreateWithCatchAndThrowSnapErrorOptions,
  LogErrorFn,
  NormalizeErrorFn,
  PrepareErrorForTrackingFn,
  ShouldTrackErrorFn,
  SnapRpcError,
  SnapTrackErrorRequest,
  TrackErrorCapableProvider,
  TrackErrorFn,
  // Directory imports require the explicit `/index.js` under Node16 ESM resolution.
  // eslint-disable-next-line import-x/no-useless-path-segments
} from './utils/errors/index.js';
