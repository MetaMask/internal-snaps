/* eslint-disable n/no-process-env */
/**
 * Mock the default environment for the Snap.
 *
 * This is used to mock the default environment for the Snap.
 */
export function mockSnapDefaultEnv(): void {
  // Fill the default API URLs for the Snap.
  const localApiBaseUrl =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    process.env.LOCAL_API_BASE_URL || 'http://localhost:8899';
  for (const key of [
    'PRICE_API_BASE_URL',
    'TOKEN_API_BASE_URL',
    'STATIC_API_BASE_URL',
    'SECURITY_ALERTS_API_BASE_URL',
    'NFT_API_BASE_URL',
  ]) {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    process.env[key] ||= localApiBaseUrl;
  }

  // Set default environment for tests if not already set
  process.env.ENVIRONMENT ??= 'test';
  process.env.LOG_LEVEL ??= 'error';
}
/* eslint-enable n/no-process-env */
