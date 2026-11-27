import type { Transaction as KeyringTransaction } from '@metamask/keyring-api';
import {
  array,
  assign,
  enums,
  Infer,
  literal,
  optional,
  refine,
  string,
  type,
} from '@metamask/superstruct';

import {
  KnownCaip2ChainId,
  UnSignedIntegerStruct,
  ValidDestinationTagStruct,
  ValidXrplDropsStruct,
  XrplAddressStruct,
} from '../../api';
import { XrplTransactionType } from '../network';

/**
 * Snap-state transaction with optional reconcile metadata.
 * `reconcileAttemptCount` is internal-only and must be stripped before keyring emit/read APIs.
 */
export type XrplKeyringTransaction = KeyringTransaction & {
  reconcileAttemptCount?: number;
};

/**
 * The order of onChain transactions to fetch.
 */
export const TransactionOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type TransactionOrder =
  (typeof TransactionOrder)[keyof typeof TransactionOrder];

const NonBatchTransactionTypeStruct = enums(
  Object.values(XrplTransactionType).filter(
    (transactionType) => transactionType !== XrplTransactionType.Batch,
  ),
);

/**
 * Unsigned transaction JSON used for build and autofill.
 *
 * `Fee`, `Sequence`, and `LastLedgerSequence` may be omitted until a build
 * helper or autofill fills them. Autofill never sets `NetworkID`: this snap
 * only supports mainnet, which must omit that field. There is no ledger `hash`.
 */
export const DraftTxJsonStruct = type({
  TransactionType: NonBatchTransactionTypeStruct,
  Account: XrplAddressStruct,
  Fee: optional(ValidXrplDropsStruct),
  Sequence: optional(UnSignedIntegerStruct),
  LastLedgerSequence: optional(UnSignedIntegerStruct),
  Flags: optional(UnSignedIntegerStruct),
  SigningPubKey: optional(string()),
  DestinationTag: optional(ValidDestinationTagStruct),
});

export type DraftTxJson = Infer<typeof DraftTxJsonStruct>;

/**
 * Unsigned `Batch` draft. Inner transactions are filled by autofill.
 */
export const DraftBatchTxJsonStruct = assign(
  DraftTxJsonStruct,
  type({
    TransactionType: literal(XrplTransactionType.Batch),
    RawTransactions: optional(
      array(
        type({
          RawTransaction: assign(
            DraftTxJsonStruct,
            type({
              TicketSequence: optional(UnSignedIntegerStruct),
            }),
          ),
        }),
      ),
    ),
  }),
);

export type DraftBatchTxJson = Infer<typeof DraftBatchTxJsonStruct>;

/**
 * One inner transaction of a `Batch`, checked before autofill fills defaults.
 *
 * `Fee` must be omitted or `"0"`. `SigningPubKey` must be omitted or `""`.
 * `TxnSignature` and `Signers` are rejected. Other transaction fields are allowed.
 */
export const BatchInnerTransactionStruct = refine(
  type({
    TransactionType: NonBatchTransactionTypeStruct,
    Account: XrplAddressStruct,
    Fee: optional(literal('0')),
    Flags: optional(UnSignedIntegerStruct),
    Sequence: optional(UnSignedIntegerStruct),
    TicketSequence: optional(UnSignedIntegerStruct),
    SigningPubKey: optional(literal('')),
  }),
  'batch_inner_transaction',
  (value) => {
    const inner = value as {
      TxnSignature?: unknown;
      Signers?: unknown;
    };
    if (inner.TxnSignature !== undefined && inner.TxnSignature !== null) {
      return 'Inner Batch transaction must not include TxnSignature';
    }
    if (inner.Signers !== undefined && inner.Signers !== null) {
      return 'Inner Batch transaction must not include Signers';
    }
    return true;
  },
);

export type BatchInnerTransaction = Infer<typeof BatchInnerTransactionStruct>;

export type TransactionStateValue = {
  transactions: Record<string, XrplKeyringTransaction[]>;
  lastScanTokens: Record<string, Record<KnownCaip2ChainId, string | null>>;
};
