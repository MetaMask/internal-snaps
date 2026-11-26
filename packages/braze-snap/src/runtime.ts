import type { BrazeSdk } from './braze-sdk';
import { brazeSdkLoader } from './braze-sdk';
import { FLUSH_TIMEOUT_MS } from './constants';
import {
  abortRequests,
  drainRequests,
  hasRequestFailure,
  resetRequestFailures,
  setAllowedEndpoint,
} from './network';
import { commitStorage, hydrateStorage, resetStorage } from './storage';

export type BrazeConfig = {
  apiKey: string;
  endpoint: string;
  appVersion: string;
  enableLogging?: boolean;
};

export type FlushBraze = () => Promise<boolean>;

let sdk: BrazeSdk | null = null;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Initialize the SDK if it is not initialized yet.
 *
 * @param brazeSdk - The SDK.
 * @param config - The Braze config.
 */
function initializeSdk(brazeSdk: BrazeSdk, config: BrazeConfig): void {
  if (brazeSdk.isInitialized()) {
    return;
  }

  const { DeviceProperties } = brazeSdk;
  const initialized = brazeSdk.initialize(config.apiKey, {
    baseUrl: config.endpoint,
    appVersion: config.appVersion,
    enableLogging: config.enableLogging ?? false,
    noCookies: true,
    doNotLoadFontAwesome: true,
    allowUserSuppliedJavascript: false,
    manageServiceWorkerExternally: true,
    disablePushTokenMaintenance: true,
    devicePropertyAllowlist: [DeviceProperties.TIME_ZONE],
  });

  if (!initialized) {
    throw new Error('Failed to initialize Braze.');
  }
}

/**
 * Wait for a promise, or until the timeout elapses.
 *
 * @param promise - The promise to wait for.
 * @param timeoutMs - The timeout, in milliseconds.
 * @returns `true` if the promise settled before the timeout, `false` otherwise.
 */
async function waitAtMost(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  if (timeoutMs <= 0) {
    return false;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const completed = await Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  clearTimeout(timeout);
  return completed;
}

/**
 * Ask the SDK to send everything it has queued, and wait for the requests.
 *
 * @param brazeSdk - The SDK.
 * @param timeoutMs - The remaining timeout budget, in milliseconds.
 * @returns Whether the flush and all allowed requests succeeded before timeout.
 */
async function flush(brazeSdk: BrazeSdk, timeoutMs: number): Promise<boolean> {
  let sdkSucceeded = false;
  const flushed = new Promise<void>((resolve) => {
    brazeSdk.requestImmediateDataFlush((success) => {
      sdkSucceeded = success;
      resolve();
    });
  });
  const completed = await waitAtMost(
    flushed.then(async () => drainRequests()),
    timeoutMs,
  );
  return completed && sdkSucceeded && !hasRequestFailure();
}

/**
 * Stop network access, wait for the SDK to settle, persist storage, and destroy
 * the in-memory SDK instance so no timer handles leak across RPCs.
 *
 * @param brazeSdk - The loaded SDK instance, if any.
 */
async function settle(brazeSdk: BrazeSdk | null): Promise<void> {
  abortRequests();
  await drainRequests();
  setAllowedEndpoint(null);
  try {
    await commitStorage();
  } finally {
    brazeSdk?.destroy();
    await drainRequests();
    resetStorage();
  }
}

async function run<Result>(
  config: BrazeConfig,
  callback: (
    brazeSdk: BrazeSdk,
    flushSdk: FlushBraze,
  ) => Result | Promise<Result>,
): Promise<Result> {
  resetRequestFailures();
  await hydrateStorage();
  setAllowedEndpoint(config.endpoint);

  try {
    sdk ??= await brazeSdkLoader.load();
    initializeSdk(sdk, config);
    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    const result = await callback(sdk, async () =>
      flush(sdk as BrazeSdk, Math.max(0, deadline - Date.now())),
    );
    await waitAtMost(drainRequests(), Math.max(0, deadline - Date.now()));
    return result;
  } finally {
    await settle(sdk);
  }
}

/**
 * Run a callback against the SDK for the length of one snap request.
 *
 * The SDK only has network access while the callback runs. Storage is persisted
 * once after pending requests settle, and the SDK instance is destroyed before
 * the snap runtime tears down timers so no stale retry/rate-limit handles can
 * wedge subsequent requests. Calls are serialized so requests never interleave.
 *
 * @param config - The Braze config.
 * @param callback - The callback, called with the initialized SDK and a flush helper.
 * @returns The value returned by the callback.
 */
export async function withBraze<Result>(
  config: BrazeConfig,
  callback: (
    brazeSdk: BrazeSdk,
    flushSdk: FlushBraze,
  ) => Result | Promise<Result>,
): Promise<Result> {
  const result = queue.then(async () => run(config, callback));
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Forget the loaded SDK. Only meant for tests.
 */
export function resetRuntime(): void {
  sdk = null;
  queue = Promise.resolve();
}
