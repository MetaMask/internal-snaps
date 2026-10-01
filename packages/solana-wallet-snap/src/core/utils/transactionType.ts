import { TransactionType } from '@metamask/keyring-api';

import { METAMASK_ORIGIN } from '../constants/solana';

/**
 * Resolves the transaction classification to report for a lifecycle event.
 *
 * A classification is only trustworthy once a transaction has been mapped from
 * on-chain data, where the balance changes identify the direction. Before
 * broadcast the Snap only has the raw, unsigned transaction, and an arbitrary
 * dApp transaction cannot be classified from its instructions without guessing,
 * so those events report `unknown`.
 *
 * The one pre-broadcast case that is known is the unified send flow: it is the
 * only MetaMask-originated transaction the Snap itself builds, and it is always
 * a send. That holds for `signTransaction` as well as
 * `signAndSendTransaction`, so the origin alone decides it.
 *
 * @param options - The classification inputs.
 * @param options.origin - The origin that triggered the lifecycle step.
 * @param options.transactionType - A classification already known by the caller, if any.
 * @returns The classification to report.
 */
export function resolveTransactionType({
  origin,
  transactionType,
}: {
  origin: string;
  transactionType?: TransactionType;
}): TransactionType {
  if (transactionType !== undefined) {
    return transactionType;
  }

  return origin === METAMASK_ORIGIN
    ? TransactionType.Send
    : TransactionType.Unknown;
}
