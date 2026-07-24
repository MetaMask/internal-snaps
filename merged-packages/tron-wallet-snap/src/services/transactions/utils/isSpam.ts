import type { Transaction } from '@metamask/keyring-api';
import { TransactionType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import type { SpotPrices } from '../../../clients/price-api/types';
import { KnownCaip19Id } from '../../../constants';
import type { TronKeyringAccount } from '../../../entities/keyring-account';

export type SpamContext = {
  /**
   * Pre-fetched spot prices keyed by CAIP asset type.
   * When provided, enables price-based spam detection for received tokens.
   */
  spotPrices?: SpotPrices;
};

// A function that returns true if it believes that the passed transaction is a spam, or false if it believes it's legitimate.
type SpamDetector = (
  transaction: Transaction,
  account: TronKeyringAccount,
  context: SpamContext,
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
 * Spam Detector #2: Filters received TRC10/TRC20 token transactions whose token
 * has no price data. Unsolicited token airdrops (spam) are typically unknown tokens
 * with no market price. Only applies when `context.spotPrices` is provided.
 *
 * @param transaction - The transaction to evaluate.
 * @param account - The account associated with the transaction.
 * @param context - Spam detection context, including pre-fetched spot prices.
 * @returns True when a received token has no price data (spam), false otherwise.
 */
const isUnpricedReceivedToken: SpamDetector = (
  transaction: Transaction,
  account: TronKeyringAccount,
  context: SpamContext,
): boolean => {
  if (!context.spotPrices || transaction.type !== TransactionType.Receive) {
    return false;
  }

  const tokenMovements = transaction.to.filter(
    (movement) =>
      movement.address === account.address &&
      movement.asset?.fungible &&
      isTokenAsset(movement.asset.type),
  );

  if (tokenMovements.length === 0) {
    return false;
  }

  const { spotPrices } = context;
  const hasPricedToken = tokenMovements.some(
    (movement) =>
      movement.asset?.fungible === true &&
      typeof spotPrices[movement.asset.type]?.price === 'number',
  );

  return !hasPricedToken;
};

/**
 * Returns true when the CAIP asset type identifies a TRC10 or TRC20 token
 * (not native TRX or a staking/resource asset).
 *
 * @param assetType - The CAIP-19 asset type string to test.
 * @returns True for TRC10/TRC20 token assets, false for all other asset types.
 */
function isTokenAsset(assetType: string): boolean {
  return assetType.includes('/trc10:') || assetType.includes('/trc20:');
}

/**
 * Evaluates the legitimacy of a transaction based on various detectors.
 *
 * @param transaction - The transaction to evaluate.
 * @param account - The account associated with the transaction.
 * @param context - Optional context for detectors that require pre-fetched data.
 * @returns True if the transaction is spam, false if it's legitimate.
 */
export function isSpam(
  transaction: Transaction,
  account: TronKeyringAccount,
  context: SpamContext = {},
): boolean {
  const detectors: SpamDetector[] = [
    isTrxAmountLowerThanThreshold,
    isUnpricedReceivedToken,
    // Register more detectors here.
  ];

  return detectors.some((detect) => detect(transaction, account, context));
}
