export enum ClientRequestMethod {
  ConfirmSend = 'confirmSend',
  ComputeFee = 'computeFee',
  OnAddressInput = 'onAddressInput',
  OnAmountInput = 'onAmountInput',
  SignAndSendTransaction = 'signAndSendTransaction',
}

export enum SendErrorCodes {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Required = 'Required',
  Invalid = 'Invalid',
  InsufficientBalanceToCoverFee = 'InsufficientBalanceToCoverFee',
  InsufficientBalance = 'InsufficientBalance',
}
