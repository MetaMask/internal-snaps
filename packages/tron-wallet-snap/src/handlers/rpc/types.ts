export const RpcRequestMethods = {
  OnStart: 'onStart',
  OnInstall: 'onInstall',
  OnUpdate: 'onUpdate',
} as const;

export type RpcRequestMethods =
  (typeof RpcRequestMethods)[keyof typeof RpcRequestMethods];

/**
 * Methods specific to the test dapp,
 * to allow specific flows for manual testing.
 */
export const TestDappRpcRequestMethod = {
  ComputeFee: 'computeFee',
} as const;

export type TestDappRpcRequestMethod =
  (typeof TestDappRpcRequestMethod)[keyof typeof TestDappRpcRequestMethod];
