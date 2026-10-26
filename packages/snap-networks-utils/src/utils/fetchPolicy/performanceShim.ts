/**
 * A minimal `performance` global for snaps, which don't have one. The fetch
 * policy's underlying library times calls with `performance.now()`.
 *
 * Provide it in `snap.config.ts`:
 *
 * ```ts
 * new ProvidePlugin({
 *   performance: '@metamask/snap-networks-utils/performance-shim',
 * });
 * ```
 *
 * @returns The current time in milliseconds.
 */
export const now = (): number => Date.now();
