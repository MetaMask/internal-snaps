import type { BigNumber } from 'bignumber.js';

import type {
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip2ChainId,
} from '../../../api';
import type { AnyErrorConstructor } from '../../../utils';
import type { ReserveLedgerMeta } from '../../on-chain-account/utils';

/**
 * One trust line inside a simulation snapshot.
 */
export type LineState = {
  balance: BigNumber;
  limit: BigNumber;
  peerAuthorized?: boolean;
  /** This account froze the trust line. */
  freeze?: boolean;
  /** The issuer froze the trust line. */
  freezePeer?: boolean;
};

/**
 * One MPT holding inside a simulation snapshot.
 */
export type MptState = {
  /** Spendable MPT amount (mpt_amount - locked). */
  balance: BigNumber;
  mptAmount: BigNumber;
  lockedAmount: BigNumber;
  mptAuthorized?: boolean;
};

/**
 * Mutable account used while walking a transaction and its batch inners.
 */
export type AccountState = ReserveLedgerMeta & {
  nativeRawBalance: BigNumber;
  requireDestTag: boolean;
  /** AccountRoot `lsfGlobalFreeze`. Freezes every token this account issues. */
  globalFreeze: boolean;
  trustlines: Map<KnownCaip19IouAssetId, LineState>;
  mptokens: Map<KnownCaip19MptAssetId, MptState>;
};

/**
 * Accounts involved in one validation, keyed by classic address.
 */
export type SimulationState = {
  accounts: Map<string, AccountState>;
};

/**
 * Shared inputs for validating and applying a payment or trust line.
 *
 * `skipExceptions` may suppress `RequiresDestinationTagException` and
 * `TrustlineExceedLimitException` only. Other validation failures still throw.
 */
export type SimulationContext = {
  state: SimulationState;
  scope: KnownCaip2ChainId;
  skipExceptions?: readonly AnyErrorConstructor[];
};

/**
 * Validates one transaction type, then applies it to {@link SimulationState}.
 */
export type TypedTransactionSimulator<TransactionJson> = {
  /**
   * Checks the transaction against the current snapshot.
   *
   * @param ctx - Accounts and chain id.
   * @param transaction - Payment, TrustSet, or MPTokenAuthorize JSON.
   */
  validate(ctx: SimulationContext, transaction: TransactionJson): void;

  /**
   * Writes the transaction's balance changes into the snapshot.
   *
   * @param ctx - Accounts to update.
   * @param transaction - Payment, TrustSet, or MPTokenAuthorize JSON that already
   * passed {@link validate}.
   */
  apply(ctx: SimulationContext, transaction: TransactionJson): void;
};
