import { BigNumber } from 'bignumber.js';
import type { MPTokenAuthorize, Payment, TrustSet } from 'xrpl';
import { MPTokenAuthorizeFlags } from 'xrpl';

import type {
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
} from '../../../api';
import {
  BASE_RESERVE_DROPS,
  DROPS_PER_XRP,
  XRP_PER_BASE_RESERVE_ACCOUNT,
} from '../../../constants';
import { toCaip19IouAssetId, toCaip19MptAssetId } from '../../../utils';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverBaseReserveException,
  InvalidAmountForCreateAccountException,
  InvalidAssetForCreateAccountException,
  MptHoldingNotFoundException,
  RemoveMptWithNonZeroBalanceException,
  RemoveTrustlineWithNonZeroBalanceException,
  RequiresDestinationTagException,
  TransactionValidationException,
  TrustlineExceedLimitException,
  TrustlineFrozenException,
  TrustlineNotAuthorizedException,
  TrustlineNotFoundException,
  UnsupportedTransactionTypeException,
} from '../exceptions';
import { assertDestinationTagIfNeeded } from '../utils';
import type {
  AccountState,
  LineState,
  MptState,
  SimulationContext,
  TypedTransactionSimulator,
} from './api';
import {
  createdAccount,
  getAccount,
  getSpendable,
  isIssuedAmount,
  shouldSkipValidationException,
} from './utils';

const ACCOUNT_RESERVE_DROPS = new BigNumber(
  XRP_PER_BASE_RESERVE_ACCOUNT,
).multipliedBy(DROPS_PER_XRP);

const OWNER_RESERVE_DROPS = new BigNumber(BASE_RESERVE_DROPS);

/**
 * Validates and applies a `Payment`, including native and IOU amounts.
 */
export class PaymentSimulator implements TypedTransactionSimulator<Payment> {
  /**
   * Checks the destination tag and balances.
   *
   * Deposit authorization is checked before simulation starts.
   *
   * @param ctx - Accounts and chain id.
   * @param transaction - Payment JSON.
   */
  validate(ctx: SimulationContext, transaction: Payment): void {
    const sender = getAccount(ctx.state, transaction.Account);
    const destination = transaction.Destination;
    const destinationState = ctx.state.accounts.get(destination);
    const payment = this.#paymentAmount(ctx, transaction);

    if (
      transaction.Account !== destination &&
      !shouldSkipValidationException(
        ctx.skipExceptions,
        RequiresDestinationTagException,
      )
    ) {
      assertDestinationTagIfNeeded(
        transaction.DestinationTag,
        destination,
        destinationState?.requireDestTag === true,
      );
    }

    if (payment.kind === 'native') {
      this.#validateNative({
        sender,
        destinationState,
        amount: payment.amount,
      });
      return;
    }

    if (destinationState === undefined) {
      throw new InvalidAssetForCreateAccountException(payment.assetId);
    }

    this.#validateIou({
      sender,
      senderId: transaction.Account,
      destinationState,
      destination,
      assetId: payment.assetId,
      amount: payment.amount,
      issuer: payment.issuer,
      issuerState: ctx.state.accounts.get(payment.issuer),
      skipExceptions: ctx.skipExceptions,
    });
  }

  /**
   * Moves the payment amount onto the snapshot.
   *
   * @param ctx - Accounts to update.
   * @param transaction - Payment JSON that already passed {@link validate}.
   */
  apply(ctx: SimulationContext, transaction: Payment): void {
    const sender = getAccount(ctx.state, transaction.Account);
    const destination = transaction.Destination;
    const payment = this.#paymentAmount(ctx, transaction);

    if (payment.kind === 'native') {
      sender.nativeRawBalance = sender.nativeRawBalance.minus(payment.amount);
      const destinationState = ctx.state.accounts.get(destination);
      if (destinationState === undefined) {
        ctx.state.accounts.set(destination, createdAccount(payment.amount));
        return;
      }
      destinationState.nativeRawBalance =
        destinationState.nativeRawBalance.plus(payment.amount);
      return;
    }

    if (destination === payment.issuer) {
      const senderLine = sender.trustlines.get(payment.assetId);
      if (senderLine !== undefined) {
        senderLine.balance = senderLine.balance.minus(payment.amount);
      }
      return;
    }

    const destinationState = ctx.state.accounts.get(destination);
    if (destinationState === undefined) {
      return;
    }
    const receiverLine = destinationState.trustlines.get(payment.assetId);
    if (receiverLine === undefined) {
      return;
    }
    // Issuer payouts create IOU without a sender trust line.
    if (transaction.Account !== payment.issuer) {
      const senderLine = sender.trustlines.get(payment.assetId);
      if (senderLine === undefined) {
        return;
      }
      senderLine.balance = senderLine.balance.minus(payment.amount);
    }
    receiverLine.balance = receiverLine.balance.plus(payment.amount);
  }

  /**
   * Reads a native or IOU amount.
   *
   * @param ctx - Chain id used to build the IOU asset id.
   * @param transaction - Payment JSON.
   * @returns The amount to validate and apply.
   */
  #paymentAmount(
    ctx: SimulationContext,
    transaction: Payment,
  ):
    | { kind: 'native'; amount: BigNumber }
    | {
        kind: 'iou';
        amount: BigNumber;
        assetId: KnownCaip19IouAssetId;
        issuer: string;
      } {
    if (typeof transaction.Amount === 'string') {
      return { kind: 'native', amount: new BigNumber(transaction.Amount) };
    }
    if (!isIssuedAmount(transaction.Amount)) {
      throw new UnsupportedTransactionTypeException('MPT Payment');
    }
    const { currency, issuer, value } = transaction.Amount;
    return {
      kind: 'iou',
      amount: new BigNumber(value),
      assetId: toCaip19IouAssetId(ctx.scope, currency, issuer),
      issuer,
    };
  }

  /**
   * Checks a native payment against spendable XRP and the account reserve.
   *
   * @param params - Sender, destination, and amount.
   * @param params.sender - Sender simulation state.
   * @param params.destinationState - Destination state, or `undefined` when unfunded.
   * @param params.amount - Amount in drops.
   */
  #validateNative(params: {
    sender: AccountState;
    destinationState: AccountState | undefined;
    amount: BigNumber;
  }): void {
    const { sender, destinationState, amount } = params;
    const spendable = getSpendable(sender);
    if (spendable.isLessThan(amount)) {
      throw new InsufficientBalanceException(
        spendable.toFixed(0),
        amount.toFixed(0),
      );
    }
    if (
      destinationState === undefined &&
      amount.isLessThan(ACCOUNT_RESERVE_DROPS)
    ) {
      throw new InvalidAmountForCreateAccountException(amount.toFixed(0));
    }
  }

  /**
   * Checks both sides of an IOU payment.
   *
   * @param params - Sender, receiver, asset, and amount.
   * @param params.sender - Sender simulation state.
   * @param params.senderId - Sender classic address.
   * @param params.destinationState - Receiver simulation state.
   * @param params.destination - Receiver classic address.
   * @param params.assetId - CAIP-19 IOU id.
   * @param params.amount - Issued amount.
   * @param params.issuer - Issuer classic address.
   * @param params.issuerState - Issuer snapshot, when that account was loaded.
   */
  #validateIou(params: {
    sender: AccountState;
    senderId: string;
    destinationState: AccountState;
    destination: string;
    assetId: KnownCaip19IouAssetId;
    amount: BigNumber;
    issuer: string;
    issuerState: AccountState | undefined;
    skipExceptions?: SimulationContext['skipExceptions'];
  }): void {
    const {
      sender,
      senderId,
      destinationState,
      destination,
      assetId,
      amount,
      issuer,
      issuerState,
      skipExceptions,
    } = params;
    const senderLine = sender.trustlines.get(assetId);
    const receiverLine = destinationState.trustlines.get(assetId);

    this.#assertIssuerNotGloballyFrozen({
      issuerState,
      senderId,
      destination,
      assetId,
      issuer,
    });

    // Issuer → holder payout: the issuer does not hold a trust line to itself.
    if (senderId !== issuer) {
      this.#assertTrustline(senderLine, assetId, senderId);
      if (senderLine.balance.isLessThan(amount)) {
        throw new InsufficientBalanceException(
          senderLine.balance.toString(),
          amount.toString(),
          assetId,
        );
      }
    }

    // Sending the currency back to its issuer redeems it. The issuer does not
    // hold a trust line to itself, and No Ripple does not block that payment.
    if (destination === issuer) {
      return;
    }

    this.#assertTrustline(receiverLine, assetId, destination);

    // Self-payment debits and credits the same line and nets to zero in apply.
    // Comparing balance + amount to the limit would false-fail.
    if (destination === senderId) {
      return;
    }

    const delivered = receiverLine.balance.plus(amount);
    if (
      delivered.isGreaterThan(receiverLine.limit) &&
      !shouldSkipValidationException(
        skipExceptions,
        TrustlineExceedLimitException,
      )
    ) {
      throw new TrustlineExceedLimitException(assetId);
    }
  }

  #assertTrustline(
    trustline: LineState | undefined,
    assetId: KnownCaip19IouAssetId,
    accountAddress: string,
  ): asserts trustline is LineState {
    if (trustline === undefined) {
      throw new TrustlineNotFoundException(assetId, accountAddress);
    }
    this.#assertLineAuthorized(trustline, assetId, accountAddress);
    this.#assertLineNotFrozen(trustline, assetId, accountAddress);
  }

  /**
   * Rejects an IOU movement that is not directly to or from a frozen issuer.
   *
   * A global freeze stops holders from paying each other. A holder can still
   * redeem to the issuer, and the issuer can still pay a holder.
   *
   * @param params - Issuer snapshot and the two payment parties.
   * @param params.issuerState - Issuer account, when it was loaded.
   * @param params.senderId - Sender classic address.
   * @param params.destination - Receiver classic address.
   * @param params.assetId - CAIP-19 IOU id.
   * @param params.issuer - Issuer classic address.
   * @see https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes
   */
  #assertIssuerNotGloballyFrozen(params: {
    issuerState: AccountState | undefined;
    senderId: string;
    destination: string;
    assetId: KnownCaip19IouAssetId;
    issuer: string;
  }): void {
    const { issuerState, senderId, destination, assetId, issuer } = params;
    // Redeem to issuer / issuer payout is allowed under a global freeze.
    if (senderId === issuer || destination === issuer) {
      return;
    }
    // Holder-to-holder: issuer must be preloaded so we can see lsfGlobalFreeze.
    // Missing issuer would otherwise silently skip the freeze check.
    if (issuerState === undefined) {
      throw new TransactionValidationException(
        `Issuer ${issuer} could not be loaded for global-freeze checks on ${assetId}`,
      );
    }
    if (issuerState.globalFreeze) {
      throw new TrustlineFrozenException(assetId, issuer);
    }
  }

  /**
   * Rejects a line the issuer has not authorized.
   *
   * @param line - Trust line from the account snapshot.
   * @param assetId - CAIP-19 IOU id.
   * @param accountAddress - Holder address.
   */
  #assertLineAuthorized(
    line: LineState,
    assetId: KnownCaip19IouAssetId,
    accountAddress: string,
  ): void {
    if (line.peerAuthorized === false) {
      throw new TrustlineNotAuthorizedException(assetId, accountAddress);
    }
  }

  /**
   * Rejects a line frozen by the holder or the issuer.
   *
   * `freeze` is this account's freeze. `freezePeer` is the issuer's freeze.
   * Either one blocks a payment of that currency.
   *
   * @param line - Trust line from the account snapshot.
   * @param assetId - CAIP-19 IOU id.
   * @param accountAddress - Holder address.
   */
  #assertLineNotFrozen(
    line: LineState,
    assetId: KnownCaip19IouAssetId,
    accountAddress: string,
  ): void {
    if (line.freeze === true || line.freezePeer === true) {
      throw new TrustlineFrozenException(assetId, accountAddress);
    }
  }
}

/**
 * Validates and applies a `TrustSet` that adds, updates, or removes a trust line.
 */
export class TrustSetSimulator implements TypedTransactionSimulator<TrustSet> {
  /**
   * Checks a trust-line add or remove.
   *
   * A new line must leave enough XRP for one owner reserve. A zero limit
   * removes the line only when it exists and its balance is zero.
   *
   * @param ctx - Accounts for the holder.
   * @param transaction - TrustSet JSON.
   */
  validate(ctx: SimulationContext, transaction: TrustSet): void {
    const holder = getAccount(ctx.state, transaction.Account);
    const { assetId, limit, line } = this.#line(ctx, transaction, holder);

    if (limit.isZero()) {
      if (line === undefined) {
        throw new TrustlineNotFoundException(assetId, transaction.Account);
      }
      if (!line.balance.isZero()) {
        throw new RemoveTrustlineWithNonZeroBalanceException(
          `Trust line ${assetId} still holds ${line.balance.toString()}`,
        );
      }
      return;
    }

    if (line === undefined) {
      const spendable = getSpendable(holder);
      if (spendable.isLessThan(OWNER_RESERVE_DROPS)) {
        throw new InsufficientBalanceToCoverBaseReserveException(
          spendable.toFixed(0),
          OWNER_RESERVE_DROPS.toFixed(0),
        );
      }
    }
  }

  /**
   * Writes the trust-line change onto the snapshot.
   *
   * @param ctx - Accounts to update.
   * @param transaction - TrustSet JSON that already passed {@link validate}.
   */
  apply(ctx: SimulationContext, transaction: TrustSet): void {
    const holder = getAccount(ctx.state, transaction.Account);
    const { assetId, limit, line } = this.#line(ctx, transaction, holder);

    if (limit.isZero()) {
      holder.trustlines.delete(assetId);
      holder.ownerCount = Math.max(0, holder.ownerCount - 1);
      return;
    }

    if (line === undefined) {
      holder.trustlines.set(assetId, {
        balance: new BigNumber(0),
        limit,
        // Most issuers (gateways and stablecoin providers) do not require
        // authorization. A new line is treated as authorized. Issuers that
        // set lsfRequireAuth still have to authorize the holder on ledger;
        // this snapshot does not model that wait.
        peerAuthorized: true,
        freeze: false,
        freezePeer: false,
      });
      holder.ownerCount += 1;
      return;
    }

    line.limit = limit;
  }

  /**
   * Reads the trust line this TrustSet targets.
   *
   * @param ctx - Scope used to build the asset id.
   * @param transaction - TrustSet JSON.
   * @param holder - Holder simulation state.
   * @returns The asset id, requested limit, and current line when one exists.
   */
  #line(
    ctx: SimulationContext,
    transaction: TrustSet,
    holder: AccountState,
  ): {
    assetId: KnownCaip19IouAssetId;
    limit: BigNumber;
    line: LineState | undefined;
  } {
    const { currency, issuer, value } = transaction.LimitAmount;
    const assetId = toCaip19IouAssetId(ctx.scope, currency, issuer);
    return {
      assetId,
      limit: new BigNumber(value),
      line: holder.trustlines.get(assetId),
    };
  }
}

/**
 * Validates and applies holder `MPTokenAuthorize` (opt-in / opt-out).
 *
 * Issuer allow-list (`Holder` set) is not modeled here.
 */
export class MPTokenAuthorizeSimulator implements TypedTransactionSimulator<MPTokenAuthorize> {
  /**
   * Checks MPT authorize / unauthorize for the signing holder.
   *
   * @param ctx - Accounts for the holder.
   * @param transaction - MPTokenAuthorize JSON.
   */
  validate(ctx: SimulationContext, transaction: MPTokenAuthorize): void {
    if (transaction.Holder !== undefined) {
      throw new UnsupportedTransactionTypeException(
        'MPTokenAuthorize with Holder (issuer allow-list) is not supported',
      );
    }

    const holder = getAccount(ctx.state, transaction.Account);
    const { assetId, holding, unauthorize } = this.#holding(
      ctx,
      transaction,
      holder,
    );

    if (unauthorize) {
      if (holding === undefined) {
        throw new MptHoldingNotFoundException(assetId, transaction.Account);
      }
      // Spendable `balance` can be 0 while tokens remain locked / frozen.
      // Opt-out requires the holder object to be empty (mptAmount and locked).
      if (!holding.mptAmount.isZero() || !holding.lockedAmount.isZero()) {
        throw new RemoveMptWithNonZeroBalanceException(
          `MPT ${assetId} still holds ${holding.mptAmount.toString()} (locked ${holding.lockedAmount.toString()})`,
        );
      }
      return;
    }

    if (holding === undefined) {
      const spendable = getSpendable(holder);
      if (spendable.isLessThan(OWNER_RESERVE_DROPS)) {
        throw new InsufficientBalanceToCoverBaseReserveException(
          spendable.toFixed(0),
          OWNER_RESERVE_DROPS.toFixed(0),
        );
      }
    }
  }

  /**
   * Writes the MPT holding change onto the snapshot.
   *
   * @param ctx - Accounts to update.
   * @param transaction - MPTokenAuthorize JSON that already passed {@link validate}.
   */
  apply(ctx: SimulationContext, transaction: MPTokenAuthorize): void {
    const holder = getAccount(ctx.state, transaction.Account);
    const { assetId, holding, unauthorize } = this.#holding(
      ctx,
      transaction,
      holder,
    );

    if (unauthorize) {
      holder.mptokens.delete(assetId);
      holder.ownerCount = Math.max(0, holder.ownerCount - 1);
      return;
    }

    if (holding === undefined) {
      holder.mptokens.set(assetId, {
        balance: new BigNumber(0),
        mptAmount: new BigNumber(0),
        lockedAmount: new BigNumber(0),
        mptAuthorized: true,
      });
      holder.ownerCount += 1;
    }
  }

  /**
   * Reads the MPT holding this authorize targets.
   *
   * @param ctx - Scope used to build the asset id.
   * @param transaction - MPTokenAuthorize JSON.
   * @param holder - Holder simulation state.
   * @returns The asset id, unauthorize flag, and current holding when one exists.
   */
  #holding(
    ctx: SimulationContext,
    transaction: MPTokenAuthorize,
    holder: AccountState,
  ): {
    assetId: KnownCaip19MptAssetId;
    unauthorize: boolean;
    holding: MptState | undefined;
  } {
    const assetId = toCaip19MptAssetId(
      ctx.scope,
      transaction.MPTokenIssuanceID,
    );
    return {
      assetId,
      unauthorize: isMptUnauthorize(transaction),
      holding: holder.mptokens.get(assetId),
    };
  }
}

/* eslint-disable no-bitwise -- XRPL Flags are uint32 bitmasks */
/**
 * Whether an MPTokenAuthorize clears the holder MPT object.
 *
 * @param transaction - MPTokenAuthorize JSON.
 * @returns `true` when `tfMPTUnauthorize` is set.
 */
function isMptUnauthorize(transaction: MPTokenAuthorize): boolean {
  const { Flags } = transaction;
  if (typeof Flags === 'number') {
    return (Flags & MPTokenAuthorizeFlags.tfMPTUnauthorize) !== 0;
  }
  if (Flags !== undefined && typeof Flags === 'object') {
    return Flags.tfMPTUnauthorize === true;
  }
  return false;
}
/* eslint-enable no-bitwise */
