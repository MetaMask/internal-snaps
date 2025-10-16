export enum ClientRequestMethod {
  SignAndSendTransaction = 'signAndSendTransaction',
  /**
   * Unified non-EVM Send
   */
  ConfirmSend = 'confirmSend',
  ComputeFee = 'computeFee',
  OnAddressInput = 'onAddressInput',
  OnAmountInput = 'onAmountInput',
  /**
   * Staking + Unstaking
   */
  OnStakeAmountInput = 'onStakeAmountInput',
  ConfirmStake = 'confirmStake',
  OnUnstakeAmountInput = 'onUnstakeAmountInput',
  ConfirmUnstake = 'confirmUnstake',
}

export enum SendErrorCodes {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Required = 'Required',
  Invalid = 'Invalid',
  InsufficientBalanceToCoverFee = 'InsufficientBalanceToCoverFee',
  InsufficientBalance = 'InsufficientBalance',
}
