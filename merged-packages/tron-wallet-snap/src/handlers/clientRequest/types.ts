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
  ComputeStakeFee = 'computeStakeFee',
  OnStakeAmountInput = 'onStakeAmountInput',
  ConfirmStake = 'confirmStake',
  OnUnstakeAmountInput = 'onUnstakeAmountInput',
  ConfirmUnstake = 'confirmUnstake',
  /**
   * Sign Rewards Message
   */
  SignRewardsMessage = 'signRewardsMessage',
}

export enum SendErrorCodes {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Required = 'Required',
  Invalid = 'Invalid',
  InsufficientBalanceToCoverFee = 'InsufficientBalanceToCoverFee',
  InsufficientBalance = 'InsufficientBalance',
}
