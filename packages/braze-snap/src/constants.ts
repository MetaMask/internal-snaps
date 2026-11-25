/**
 * The only origin allowed to call the snap.
 */
export const ALLOWED_ORIGIN = 'metamask';

/**
 * Braze SDK endpoints look like `sdk.iad-01.braze.com` or `sdk.fra-01.braze.eu`.
 */
export const BRAZE_ENDPOINT_REGEX = /^sdk\.[a-z0-9-]+\.braze\.(?:com|eu)$/u;

/**
 * Braze Web SDK API keys are UUIDs.
 */
export const BRAZE_API_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The paths the SDK may `POST` to on the configured endpoint.
 */
export const ALLOWED_REQUEST_PATHS = ['/api/v3/data/'] as const;

/**
 * Braze user languages are ISO 639-1 codes, such as `en` or `fr`.
 */
export const LANGUAGE_REGEX = /^[a-z]{2}$/u;

export const MAX_PROFILE_ID_LENGTH = 256;

export const MAX_APP_VERSION_LENGTH = 64;

/**
 * How long to wait for the SDK to report a flush before committing anyway.
 * Requests that are still running are aborted when the handler returns.
 */
export const FLUSH_TIMEOUT_MS = 25_000;

/**
 * The key under which the SDK storage is persisted in snap state.
 */
export const STORAGE_STATE_KEY = 'braze';

/**
 * Only keys with this prefix are persisted. Others, such as the `ab.test`
 * probe the SDK writes when it starts, only live in memory.
 */
export const PERSISTED_KEY_PREFIX = 'ab.storage.';

/**
 * The SDK stores in-app message triggers under this prefix. MetaMask does not
 * show in-app messages, so they only live in memory and never use the
 * persisted storage budget.
 */
export const IN_MEMORY_KEY_PREFIX = 'ab.storage.triggers';

/**
 * The prefix of the snap's own items, persisted with the SDK storage so that
 * they are wiped with it, but not visible to the SDK.
 */
export const SNAP_KEY_PREFIX = 'metamask.';

/**
 * The maximum size of the persisted SDK storage, in UTF-16 code units of its
 * JSON serialization. Above this, the storage is wiped instead of written.
 */
export const MAX_PERSISTED_STORAGE_SIZE = 256 * 1024;

/**
 * Limits applied to requests made by the SDK.
 */
export const NETWORK_LIMITS = {
  // The SDK sends its whole queue in one request and queues it again when the
  // request fails, so a smaller limit would block sending for good once the
  // queue outgrows it.
  maxRequestBodyBytes: MAX_PERSISTED_STORAGE_SIZE,
  maxResponseBodyBytes: 256 * 1024,
  maxConcurrentRequests: 4,
  requestTimeoutMs: 20_000,
};
