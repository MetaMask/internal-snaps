import { isTransactionMessageWithBlockhashLifetime } from '@solana/kit';
import type {
  CompilableTransactionMessage,
  Rpc,
  SolanaRpcApi,
  Transaction,
} from '@solana/kit';

import {
  fromBytesToCompilableTransactionMessage,
  fromUnknowBase64StringToTransactionOrTransactionMessage,
} from '../../sdk-extensions/codecs';
import { trackError } from '../../utils/errors';
import logger from '../../utils/logger';

const isCompilableTransactionMessage = (
  transactionOrMessage: Transaction | CompilableTransactionMessage,
): transactionOrMessage is CompilableTransactionMessage =>
  Object.hasOwn(transactionOrMessage, 'instructions');

/**
 * Checks whether a transaction with a regular recent-blockhash lifetime has
 * expired. Durable-nonce transactions are deliberately ignored because their
 * lifetime is determined by their nonce account, not the recent-blockhash cache.
 *
 * @param transaction - The base64 encoded transaction or compiled message.
 * @param rpc - The RPC client used to validate a recent blockhash.
 * @returns Whether the transaction uses an expired regular blockhash.
 */
export const isTransactionBlockhashExpired = async (
  transaction: string,
  rpc: Rpc<SolanaRpcApi>,
): Promise<boolean> => {
  try {
    const transactionOrMessage =
      await fromUnknowBase64StringToTransactionOrTransactionMessage(
        transaction,
        rpc,
      );

    const message = isCompilableTransactionMessage(transactionOrMessage)
      ? transactionOrMessage
      : await fromBytesToCompilableTransactionMessage(
          transactionOrMessage.messageBytes,
          rpc,
        );

    const isBlockhashLifetime =
      isTransactionMessageWithBlockhashLifetime(message);

    if (!isBlockhashLifetime) {
      return false;
    }

    const { value: isBlockhashValid } = await rpc
      .isBlockhashValid(message.lifetimeConstraint.blockhash)
      .send();

    return !isBlockhashValid;
  } catch (error) {
    logger.warn({ error }, 'Could not check transaction blockhash lifetime');
    await trackError(error);
    return false;
  }
};
