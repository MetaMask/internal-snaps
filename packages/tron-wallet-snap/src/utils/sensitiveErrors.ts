import { isSnapRpcError } from '@metamask/snap-networks-utils';

export { isSnapRpcError };

/**
 * Sanitizes error messages that may contain sensitive cryptographic information.
 * This prevents leaking details about private keys, entropy, or derivation paths.
 *
 * @param error - The error to sanitize.
 * @returns A sanitized error with generic message if sensitive info detected.
 */
// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeSensitiveError(error: any): Error {
  const message = error?.message?.toLowerCase() ?? '';
  const stack = error?.stack?.toLowerCase() ?? '';

  const sensitiveKeywords = [
    'private',
    'key',
    'entropy',
    'mnemonic',
    'seed',
    'derivation',
    'bip32',
    'bip44',
    'secret',
  ];

  const containsSensitiveInfo = sensitiveKeywords.some(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (keyword) => message.includes(keyword) || stack.includes(keyword),
  );

  if (containsSensitiveInfo) {
    const sanitizedError = new Error(
      'Key derivation failed. Please check your connection and try again.',
    );
    if (isSnapRpcError(error)) {
      const ErrorConstructor = error.constructor as new () => Error;
      return ErrorConstructor ? new ErrorConstructor() : sanitizedError;
    }
    return sanitizedError;
  }

  return error;
}
