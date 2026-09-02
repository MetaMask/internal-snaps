import {
  MethodNotFoundError,
  ParseError,
  ResourceNotFoundError,
  ResourceUnavailableError,
  ChainDisconnectedError,
  TransactionRejected,
  DisconnectedError,
  InternalError,
  UnauthorizedError,
  UnsupportedMethodError,
  InvalidInputError,
  InvalidParamsError,
  InvalidRequestError,
  LimitExceededError,
  SnapError,
  MethodNotSupportedError,
  UserRejectedRequestError,
} from '@metamask/snaps-sdk';

/** Union of Snap RPC error instance types (for type narrowing). */
export type SnapRpcError =
  | InstanceType<typeof SnapError>
  | InstanceType<typeof MethodNotFoundError>
  | InstanceType<typeof UserRejectedRequestError>
  | InstanceType<typeof MethodNotSupportedError>
  | InstanceType<typeof ParseError>
  | InstanceType<typeof ResourceNotFoundError>
  | InstanceType<typeof ResourceUnavailableError>
  | InstanceType<typeof TransactionRejected>
  | InstanceType<typeof ChainDisconnectedError>
  | InstanceType<typeof DisconnectedError>
  | InstanceType<typeof UnauthorizedError>
  | InstanceType<typeof UnsupportedMethodError>
  | InstanceType<typeof InternalError>
  | InstanceType<typeof InvalidInputError>
  | InstanceType<typeof InvalidParamsError>
  | InstanceType<typeof InvalidRequestError>
  | InstanceType<typeof LimitExceededError>;

const SNAP_RPC_ERROR_TYPES = [
  SnapError,
  MethodNotFoundError,
  UserRejectedRequestError,
  MethodNotSupportedError,
  ParseError,
  ResourceNotFoundError,
  ResourceUnavailableError,
  TransactionRejected,
  ChainDisconnectedError,
  DisconnectedError,
  UnauthorizedError,
  UnsupportedMethodError,
  InternalError,
  InvalidInputError,
  InvalidParamsError,
  InvalidRequestError,
  LimitExceededError,
] as const;

/**
 * Determines if the given error is a Snap RPC error.
 *
 * @param error - The error instance to be checked.
 * @returns A boolean indicating whether the error is a Snap RPC error.
 */
export function isSnapRpcError(error: Error | unknown): error is SnapRpcError {
  return SNAP_RPC_ERROR_TYPES.some((errType) => error instanceof errType);
}
