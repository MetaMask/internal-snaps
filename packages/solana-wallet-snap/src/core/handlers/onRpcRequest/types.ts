/**
 * Methods specific to the test dapp,
 * to allow specific flows for manual testing.
 */
export const TestDappRpcRequestMethod = {
  ListWebSockets: 'listWebSockets',
  ListSubscriptions: 'listSubscriptions',
  TestOnStart: 'testOnStart',
  TestOnInstall: 'testOnInstall',
  TestOnUpdate: 'testOnUpdate',
  SynchronizeAccounts: 'synchronizeAccounts',
  SetAccountSelected: 'setAccountSelected',
  ConfirmSend: 'confirmSend',
  SignRewardsMessage: 'signRewardsMessage',
} as const;

export type TestDappRpcRequestMethod =
  (typeof TestDappRpcRequestMethod)[keyof typeof TestDappRpcRequestMethod];
