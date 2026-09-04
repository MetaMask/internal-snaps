import type {
  CompiledTransactionMessage,
  Instruction,
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
  instructions: readonly Instruction[];
};
