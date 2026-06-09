import type { Transaction } from '@metamask/keyring-api';
import { TransactionType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { KnownCaip19Id } from '../../../constants';
import type { TronKeyringAccount } from '../../../entities/keyring-account';

// A function that returns true if it believes that the passed transaction is a spam, or false if it believes it's legitimate.
type SpamDetector = (
  transaction: Transaction,
  account: TronKeyringAccount,
) => boolean;

/**
 * Spam Detector #1: It categorizes transactions as spam if they receive less than 0.001 TRX.
 *
 * @param transaction - The transaction to evaluate.
 * @param account - The account associated with the transaction.
 * @returns Whether the transaction passes the minimum TRX amount check (true = passes/legitimate).
 */
const isTrxAmountLowerThanThreshold: SpamDetector = (
  transaction: Transaction,
  account: TronKeyringAccount,
): boolean => {
  const { to, type } = transaction;
  const { address } = account;

  // This checker only applies to receive transactions.
  const isApplicable = type === TransactionType.Receive;

  if (!isApplicable) {
    return false;
  }

  const { hasReceivedTRX, receivedTRXAmount } = to.reduce(
    (acc, toItem) => {
      if (
        toItem.address === address &&
        toItem.asset?.fungible &&
        (toItem.asset.type === String(KnownCaip19Id.TrxMainnet) ||
          toItem.asset.type === String(KnownCaip19Id.TrxNile) ||
          toItem.asset.type === String(KnownCaip19Id.TrxShasta))
      ) {
        return {
          hasReceivedTRX: true,
          receivedTRXAmount: acc.receivedTRXAmount.plus(toItem.asset.amount),
        };
      }

      return acc;
    },
    { hasReceivedTRX: false, receivedTRXAmount: new BigNumber(0) },
  );

  return hasReceivedTRX && receivedTRXAmount.isLessThan(0.001);
};

/**
 * Evaluates the legitimacy of a transaction based on various detectors.
 *
 * @param transaction - The transaction to evaluate.
 * @param account - The account associated with the transaction.
 * @returns True if the transaction is spam, false if it's legitimate.
 */
export function isSpam(
  transaction: Transaction,
  account: TronKeyringAccount,
): boolean {
  const detectors: SpamDetector[] = [
    isTrxAmountLowerThanThreshold,
    // Register more detectors here.
  ];

  return detectors.some((detect) => detect(transaction, account));
}
