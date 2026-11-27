import { BigNumber } from 'bignumber.js';
import type { Payment } from 'xrpl';

import type { AnyErrorConstructor } from '../../../utils';
import { calculateSpendableBalance } from '../../on-chain-account/utils';
import { TransactionValidationException } from '../exceptions';
import type { AccountState, SimulationState } from './api';

/**
 * Whether `exceptionClass` (or a subclass thereof) is listed in `skipExceptions`.
 *
 * @param skipExceptions - Optional list of validation exception constructors to suppress.
 * @param exceptionClass - The exception class about to be thrown / checked.
 * @returns True when validation should skip throwing this exception type.
 */
export function shouldSkipValidationException(
  skipExceptions: readonly AnyErrorConstructor[] | undefined,
  exceptionClass: AnyErrorConstructor,
): boolean {
  if (skipExceptions === undefined || skipExceptions.length === 0) {
    return false;
  }
  return skipExceptions.some(
    (skipped) =>
      skipped === exceptionClass || exceptionClass.prototype instanceof skipped,
  );
}

/**
 * Spendable XRP for the current reserve fields, in drops.
 *
 * @param account - Simulation account.
 * @returns Spendable drops.
 */
export function getSpendable(account: AccountState): BigNumber {
  return calculateSpendableBalance({
    nativeBalance: account.nativeRawBalance,
    ownerCount: account.ownerCount,
    sponsoringAccountCount: account.sponsoringAccountCount,
    sponsoringOwnerCount: account.sponsoringOwnerCount,
    sponsoredOwnerCount: account.sponsoredOwnerCount,
    paysOwnBaseReserve: account.paysOwnBaseReserve,
  });
}

/**
 * Returns an account that must already be in the snapshot.
 *
 * @param state - Simulation accounts.
 * @param accountId - Classic address.
 * @returns That account's state.
 */
export function getAccount(
  state: SimulationState,
  accountId: string,
): AccountState {
  const account = state.accounts.get(accountId);
  if (account === undefined) {
    throw new TransactionValidationException(
      `Account ${accountId} was not preloaded`,
    );
  }
  return account;
}

/**
 * State for an account created by a native payment in this transaction.
 *
 * @param amount - Starting balance in drops.
 * @returns A funded account with no trust lines.
 */
export function createdAccount(amount: BigNumber): AccountState {
  return {
    nativeRawBalance: amount,
    ownerCount: 0,
    sponsoringAccountCount: 0,
    sponsoringOwnerCount: 0,
    sponsoredOwnerCount: 0,
    paysOwnBaseReserve: true,
    requireDestTag: false,
    globalFreeze: false,
    trustlines: new Map(),
    mptokens: new Map(),
  };
}

/**
 * Issued-currency amount, as opposed to a native string or an MPT amount.
 *
 * @param amount - Payment `Amount`.
 * @returns Whether the amount carries `currency` and `issuer`.
 */
export function isIssuedAmount(
  amount: Payment['Amount'],
): amount is { currency: string; issuer: string; value: string } {
  return (
    typeof amount === 'object' &&
    Object.hasOwn(amount, 'currency') &&
    Object.hasOwn(amount, 'issuer')
  );
}
