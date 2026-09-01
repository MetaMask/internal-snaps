import { pattern, string } from '@metamask/superstruct';

/**
 * Superstruct for a UUID v4 string.
 *
 * Accepts lowercase and uppercase hex. Rejects other UUID versions and
 * non-UUID strings.
 */
export const UuidStruct = pattern(
  string(),
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
);
