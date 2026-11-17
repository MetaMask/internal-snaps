import { isSnapRpcError } from '@metamask/snap-networks-utils';
import { isObject } from '@metamask/utils';

export { isSnapRpcError };

/**
 * Reads a string field off a caught value without trusting its shape.
 *
 * @param value - The caught value.
 * @param property - The field to read.
 * @returns The field value, or `undefined` when it is absent or not a string.
 */
function readErrorField(
  value: unknown,
  property: 'message' | 'stack',
): string | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const field = value[property];
  return typeof field === 'string' ? field : undefined;
}

/**
 * Sanitizes error messages that may contain sensitive cryptographic information.
 * This prevents leaking details about private keys, entropy, or derivation paths.
 *
 * @param error - The error to sanitize.
 * @returns A sanitized error with generic message if sensitive info detected.
 */
export function sanitizeSensitiveError(error: unknown): Error {
  const message = readErrorField(error, 'message')?.toLowerCase() ?? '';
  const stack = readErrorField(error, 'stack')?.toLowerCase() ?? '';

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
    (keyword) => message.includes(keyword) || stack.includes(keyword),
  );

  if (containsSensitiveInfo) {
    const sanitizedError = new Error(
      'Key derivation failed. Please check your connection and try again.',
    );
    if (isSnapRpcError(error)) {
      const RpcErrorConstructor = error.constructor as new () => Error;
      return RpcErrorConstructor ? new RpcErrorConstructor() : sanitizedError;
    }
    return sanitizedError;
  }

  // Values without sensitive keywords are rethrown untouched, including
  // non-`Error` throwables.
  return error as Error;
}
