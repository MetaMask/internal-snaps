/**
 * Enum for Tron Multichain API methods that are handled via submitRequest
 */
export enum TronMultichainMethod {
  SignMessage = 'signMessage',
  SignTransaction = 'signTransaction',
}

/**
 * Error codes for Tron Multichain API
 */
export const TronMultichainErrors = {
  InvalidParams: {
    code: 4001,
    message: 'Invalid method parameters',
  },
  InvalidTransaction: {
    code: 4002,
    message: 'Invalid transaction format',
  },
  UserRejected: {
    code: 4100,
    message: 'User rejected the request',
  },
  UnknownError: {
    code: 5000,
    message: 'Unknown error with request',
  },
} as const;
