import { isSnapRpcError } from '@metamask/snap-networks-utils';
import { ensureError, hasProperty, isObject } from '@metamask/utils';

export { isSnapRpcError };

/**
 * Reads a string property of an unknown thrown value.
 *
 * @param value - The thrown value.
 * @param key - The property to read.
 * @returns The property value, or an empty string when it is not a string.
 */
function readStringProperty(value: unknown, key: string): string {
  if (isObject(value) && hasProperty(value, key)) {
    const property = value[key];
    return typeof property === 'string' ? property : '';
  }
  return '';
}

/**
 * Sanitizes error messages that may contain sensitive cryptographic information.
 * This prevents leaking details about private keys, entropy, or derivation paths.
 *
 * @param error - The error to sanitize.
 * @returns A sanitized error with generic message if sensitive info detected.
 */
export function sanitizeSensitiveError(error: unknown): Error {
  const message = readStringProperty(error, 'message').toLowerCase();
  const stack = readStringProperty(error, 'stack').toLowerCase();

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
      const RpcErrorConstructor = error.constructor as new () => Error;
      return RpcErrorConstructor ? new RpcErrorConstructor() : sanitizedError;
    }
    return sanitizedError;
  }

  return ensureError(error);
}
