export enum RpcRequestMethods {
  OnStart = 'onStart',
  OnInstall = 'onInstall',
  OnUpdate = 'onUpdate',
}

/**
 * Methods specific to the test dapp,
 * to allow specific flows for manual testing.
 */
export enum TestDappRpcRequestMethod {
  ComputeFee = 'computeFee',
}
