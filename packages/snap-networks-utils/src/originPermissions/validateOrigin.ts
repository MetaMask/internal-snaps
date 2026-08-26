/* eslint-disable @typescript-eslint/only-throw-error -- UnauthorizedError is the JSON-RPC snap error surface */
import { UnauthorizedError } from '@metamask/snaps-sdk';

/**
 * Validates that the origin is allowed to call the given method.
 *
 * @param origin - The origin of the request.
 * @param method - The RPC method of the request.
 * @param originPermissions - Map of origin to allowed methods.
 * @throws {UnauthorizedError} If the origin is missing or the method is not allowed.
 */
export const validateOrigin = (
  origin: string,
  method: string,
  originPermissions: Map<string, Set<string>>,
): void => {
  if (!origin) {
    throw new UnauthorizedError('Origin not found');
  }
  if (!originPermissions.get(origin)?.has(method)) {
    throw new UnauthorizedError('Permission denied');
  }
};
