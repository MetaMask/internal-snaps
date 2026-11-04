import { SendFlowMethod } from '@metamask/snap-networks-utils';

export const ClientRequestMethod = {
  OnAddressInput: SendFlowMethod.OnAddressInput,
  OnAmountInput: SendFlowMethod.OnAmountInput,
  ConfirmSend: SendFlowMethod.ConfirmSend,
  ComputeFee: SendFlowMethod.ComputeFee,
  SignAndSendTransactionWithoutConfirmation:
    'signAndSendTransactionWithoutConfirmation',
  SignAndSendTransaction: 'signAndSendTransaction',
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
