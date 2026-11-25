import type { BrazeSdk } from './braze-sdk';
import { brazeSdkLoader } from './braze-sdk';
import { FLUSH_TIMEOUT_MS } from './constants';
import { abortRequests, drainRequests, setAllowedEndpoint } from './network';
import { commitStorage, hydrateStorage } from './storage';

export type BrazeConfig = {
  apiKey: string;
  endpoint: string;
  appVersion: string;
  enableLogging?: boolean;
};

let sdk: BrazeSdk | null = null;

let initializedConfig: string | null = null;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Initialize the SDK, or initialize it again if the config changed.
 *
 * @param brazeSdk - The SDK.
 * @param config - The Braze config.
 */
function initializeSdk(brazeSdk: BrazeSdk, config: BrazeConfig): void {
  const configKey = JSON.stringify([
    config.apiKey,
    config.endpoint,
    config.appVersion,
    config.enableLogging ?? false,
  ]);

  if (brazeSdk.isInitialized()) {
    if (initializedConfig === configKey) {
      return;
    }
    brazeSdk.destroy();
  }

  initializedConfig = null;
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
  initializedConfig = configKey;
}

/**
 * Wait for a promise, or until the timeout elapses.
 *
 * @param promise - The promise to wait for.
 * @param timeoutMs - The timeout, in milliseconds.
 */
async function waitAtMost(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    promise,
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timeout);
}

/**
 * Ask the SDK to send everything it has queued, and wait for the requests.
 *
 * @param brazeSdk - The SDK.
 */
async function flush(brazeSdk: BrazeSdk): Promise<void> {
  const flushed = new Promise<void>((resolve) => {
    brazeSdk.requestImmediateDataFlush(() => resolve());
  });
  await waitAtMost(
    flushed.then(async () => drainRequests()),
    FLUSH_TIMEOUT_MS,
  );
}

/**
 * Stop network access, wait for the SDK to settle, and persist its storage.
 */
async function settle(): Promise<void> {
  abortRequests();
  await drainRequests();
  setAllowedEndpoint(null);
  await commitStorage();
}

export type WithBrazeOptions = {
  flush?: boolean;
};

async function run<Result>(
  config: BrazeConfig,
  callback: (brazeSdk: BrazeSdk) => Result | Promise<Result>,
  { flush: shouldFlush = false }: WithBrazeOptions = {},
): Promise<Result> {
  await hydrateStorage();
  setAllowedEndpoint(config.endpoint);

  try {
    sdk ??= await brazeSdkLoader.load();
    initializeSdk(sdk, config);
    const result = await callback(sdk);
    if (shouldFlush) {
      await flush(sdk);
    } else {
      await waitAtMost(drainRequests(), FLUSH_TIMEOUT_MS);
    }
    return result;
  } finally {
    await settle();
  }
}

/**
 * Run a callback against the SDK for the length of one snap request.
 *
 * The SDK only has network access while the callback (and any optional flush
 * that follows) runs. Its storage is persisted once, after every request
 * settled. Calls are serialized, so requests never interleave.
 *
 * @param config - The Braze config.
 * @param callback - The callback, called with the initialized SDK.
 * @param options - Options for the request.
 * @param options.flush - Whether to call `requestImmediateDataFlush` after the
 * callback resolves before tearing down network access.
 * @returns The value returned by the callback.
 */
export async function withBraze<Result>(
  config: BrazeConfig,
  callback: (brazeSdk: BrazeSdk) => Result | Promise<Result>,
  options?: WithBrazeOptions,
): Promise<Result> {
  const result = queue.then(async () => run(config, callback, options));
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Forget the loaded SDK and its config. Only meant for tests.
 */
export function resetRuntime(): void {
  sdk = null;
  initializedConfig = null;
  queue = Promise.resolve();
}
