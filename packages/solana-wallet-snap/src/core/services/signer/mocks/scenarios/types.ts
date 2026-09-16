import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import type {
  TransactionMessage,
  TransactionMessageWithBlockhashLifetime,
  TransactionMessageWithFeePayer,
} from '@solana/kit';

import type { Network } from '../../../../constants/solana';

export type MockExecutionScenario = {
  name: string;
  scope: Network;
  fromAccount: ExtendedKeyringAccount;
  toAccount: ExtendedKeyringAccount;
  fromAccountPrivateKeyBytes: Uint8Array;
  transactionMessage: TransactionMessage &
    TransactionMessageWithFeePayer &
    TransactionMessageWithBlockhashLifetime;
  transactionMessageBase64Encoded: string;
  signedTransaction: any;
  signedTransactionBase64Encoded: string;
  signature: string;
  /* The mock response from the getMultipleAccounts RPC call */
  getMultipleAccountsResponse?:
    | {
        result: object;
      }
    | undefined;
};
