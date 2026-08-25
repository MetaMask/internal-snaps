/**
 * Removes control characters from a string.
 *
 * @param input - The string to sanitize.
 * @returns The sanitized string.
 */
export function sanitizeControlCharacters(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove all control characters except tab.
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000A-\u001F\u007F]/gu, '');
}

/**
 * Validates and sanitizes a URI.
 *
 * @param uri - The URI to validate and sanitize.
 * @returns The sanitized URI or an empty string if invalid.
 */
export function sanitizeUri(uri: string): string {
  if (!uri || typeof uri !== 'string') {
    return '';
  }

  const sanitized = sanitizeControlCharacters(uri);

  try {
    const url = new URL(sanitized);
    const allowedProtocols = ['http:', 'https:', 'wss:', 'ipfs:'];
    if (!allowedProtocols.includes(url.protocol) || sanitized.length > 2048) {
      return '';
    }
    return sanitized;
  } catch {
    return '';
  }
}
