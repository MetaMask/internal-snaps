export const ClientRequestMethod = {
  SignAndSendTransactionWithoutConfirmation:
    'signAndSendTransactionWithoutConfirmation',
  ConfirmSend: 'confirmSend',
  SignAndSendTransaction: 'signAndSendTransaction',
  ComputeFee: 'computeFee',
  OnAddressInput: 'onAddressInput',
  OnAmountInput: 'onAmountInput',
  SignRewardsMessage: 'signRewardsMessage',
  SignCardMessage: 'signCardMessage',
  ApproveCardAmount: 'approveCardAmount',
  SignProofOfOwnership: 'signProofOfOwnership',
  /**
   * Silently signs multiple proof-of-ownership messages for MetaMask identity
   * authentication.
   */
  SignProofOfOwnershipBatch: 'signProofOfOwnershipBatch',
} as const;

export type ClientRequestMethod =
  (typeof ClientRequestMethod)[keyof typeof ClientRequestMethod];
