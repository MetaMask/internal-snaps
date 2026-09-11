import type {
  CompiledTransactionMessage,
  InstructionWithData,
  ReadonlyUint8Array,
  Transaction as KitTransaction,
} from '@solana/kit';

import type { SolanaTransaction } from '../../types/solana';

export type NormalizableInput =
  | SolanaTransaction
  | KitTransaction
  | CompiledTransactionMessage
  | string;

export type NormalizedInput = {
  ed25519Signatures: readonly any[];
  instructions: readonly InstructionWithData<ReadonlyUint8Array>[];
};
