import type {
  CompiledTransactionMessage,
  LegacyCompiledTransactionMessage,
  V0CompiledTransactionMessage,
} from '@solana/kit';

import type { NormalizedInput } from './types';

type SupportedCompiledTransactionMessage =
  | LegacyCompiledTransactionMessage
  | V0CompiledTransactionMessage;

const isSupportedCompiledTransactionMessage = (
  compiledTransactionMessage: CompiledTransactionMessage,
): compiledTransactionMessage is SupportedCompiledTransactionMessage =>
  compiledTransactionMessage.version === 'legacy' ||
  compiledTransactionMessage.version === 0;

export const normalizeCompiledTransactionMessage = (
  compiledTransactionMessage: CompiledTransactionMessage,
): NormalizedInput => {
  if (!isSupportedCompiledTransactionMessage(compiledTransactionMessage)) {
    throw new Error('Version 1 transaction messages are not supported');
  }

  return {
    ed25519Signatures: ['signature'], // The compiled transaction message doesn't have ed25519 signatures yet. Best guess is that there will be exactly one, so we fake it.
    instructions: compiledTransactionMessage.instructions.map((item) => ({
      accounts: [], // We don't need them
      data: item.data ?? new Uint8Array(),
      programAddress:
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        compiledTransactionMessage.staticAccounts[item.programAddressIndex]!,
    })),
  };
};
