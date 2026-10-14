/**
 * Error thrown when fetching assets fails (HTTP error, timeout, unexpected
 * response). The resulting on-chain balance state is unknown, so no
 * zero-balance fallback is implied. Callers decide how to degrade.
 */
export class AssetFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AssetFetchError';
  }
}
