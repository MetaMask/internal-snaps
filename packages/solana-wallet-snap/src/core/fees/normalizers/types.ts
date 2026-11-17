import type {
  CompiledTransactionMessage,
  InstructionWithData,
  ReadonlyUint8Array,
  SignatureBytes,
  Transaction as KitTransaction,
} from '@solana/kit';

import type { SolanaTransaction } from '../../types/solana';

export type NormalizableInput =
  | SolanaTransaction
  | KitTransaction
  | CompiledTransactionMessage
  | string;

export type NormalizedInput = {
  /** `SignatureBytes` for kit transactions, a base58 string for RPC transactions. */
  ed25519Signatures: readonly (SignatureBytes | string | null)[];
  instructions: readonly InstructionWithData<ReadonlyUint8Array>[];
};
