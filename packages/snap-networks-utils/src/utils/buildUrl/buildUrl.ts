import { assert } from '@metamask/superstruct';

import { sanitizeControlCharacters, sanitizeUri } from '../sanitize/sanitize';
import { UrlStruct } from '../urlStruct/urlStruct';

export type BuildUrlParams = {
  baseUrl: string;
  path: string;
  pathParams?: Record<string, string> | undefined;
  queryParams?: Record<string, string> | undefined;
  encodePathParams?: boolean;
};

/**
 * Builds a safe URL from a base URL, path, and optional parameters.
 *
 * @param params - The parameters to build the URL from.
 * @returns The validated, sanitized URL.
 */
export function buildUrl(params: BuildUrlParams): string {
  const {
    baseUrl,
    path,
    pathParams,
    queryParams,
    encodePathParams = true,
  } = params;

  // Validate and sanitize base URL
  const sanitizedBaseUrl = sanitizeUri(baseUrl);
  if (sanitizedBaseUrl === '') {
    throw new Error('Invalid URL format');
  }
  assert(sanitizedBaseUrl, UrlStruct);

  const pathWithParams = path.replace(/\{(\w+)\}/gu, (_, key: string) => {
    const value = pathParams?.[key];
    if (value === undefined) {
      throw new Error(`Path parameter ${key} is undefined`);
    }
    // Sanitize path parameter values to remove control characters
    const sanitizedValue = sanitizeControlCharacters(value);
    return encodePathParams
      ? encodeURIComponent(sanitizedValue)
      : sanitizedValue;
  });

  const cleanPath = pathWithParams
    .replace(/^\/+/u, '')
    .replace(/\/+/gu, '/')
    .replace(/\/+$/u, '');

  const normalizedBaseUrl = sanitizedBaseUrl.endsWith('/')
    ? sanitizedBaseUrl
    : `${sanitizedBaseUrl}/`;

  const url = new URL(cleanPath, normalizedBaseUrl);

  Object.entries(queryParams ?? {})
    .filter(([_, value]) => value !== undefined)
    .filter(([_, value]) => value !== null)
    .forEach(([key, value]) => {
      if (value) {
        // Sanitize query parameter values to remove control characters
        const sanitizedValue = sanitizeControlCharacters(value);
        url.searchParams.append(key, sanitizedValue);
      }
    });

  const builtUrl = url.toString();
  assert(builtUrl, UrlStruct);
  return builtUrl;
}
