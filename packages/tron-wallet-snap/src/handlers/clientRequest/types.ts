import {
  SendFlowErrorCodes,
  SendFlowMethod,
} from '@metamask/snap-networks-utils';

export const ClientRequestMethod = {
  ...SendFlowMethod,
  SignAndSendTransaction: 'signAndSendTransaction',
  /**
   * Staking + Unstaking
   */
  ComputeStakeFee: 'computeStakeFee',
  OnStakeAmountInput: 'onStakeAmountInput',
  ConfirmStake: 'confirmStake',
  OnUnstakeAmountInput: 'onUnstakeAmountInput',
  ConfirmUnstake: 'confirmUnstake',
  ClaimUnstakedTrx: 'claimUnstakedTrx',
  ClaimTrxStakingRewards: 'claimTrxStakingRewards',
  /**
   * Sign Rewards Message
   */
  SignRewardsMessage: 'signRewardsMessage',
  /**
   * Sign Proof of Ownership
   */
  SignProofOfOwnership: 'signProofOfOwnership',
  /**
   * Sign multiple proof-of-ownership messages for MetaMask identity
   * authentication.
   */
  SignProofOfOwnershipBatch: 'signProofOfOwnershipBatch',
} as const;

export type ClientRequestMethod =
  (typeof ClientRequestMethod)[keyof typeof ClientRequestMethod];

export const SendErrorCodes = SendFlowErrorCodes;

export type SendErrorCodes =
  (typeof SendErrorCodes)[keyof typeof SendErrorCodes];
