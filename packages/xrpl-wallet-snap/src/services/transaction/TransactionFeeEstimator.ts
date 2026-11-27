import { BigNumber } from 'bignumber.js';
import { xrpToDrops } from 'xrpl';

import type { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { BASE_RESERVE_DROPS, MAX_CAPPED_FEE_XRP } from '../../constants';
import type { NetworkService } from '../network';
import { XrplTransactionType } from '../network';
import { Transaction } from './Transaction';

/** `AccountDelete` and `AMMCreate` cost one owner reserve. */
const OWNER_RESERVE_FEE_DROPS = new BigNumber(BASE_RESERVE_DROPS);

const OWNER_RESERVE_TRANSACTION_TYPES = new Set<string>([
  XrplTransactionType.AccountDelete,
  XrplTransactionType.AMMCreate,
]);

export class TransactionFeeEstimator {
  readonly #networkService: NetworkService;

  constructor({ networkService }: { networkService: NetworkService }) {
    this.#networkService = networkService;
  }

  /**
   * Reference fee in drops for one signature.
   *
   * {@link NetworkService.getBaseFee} is already drops. This multiplies by the
   * configured margin and caps the result at 2 XRP.
   *
   * @param scope - The CAIP-2 chain ID.
   * @param options - Cache options forwarded to {@link NetworkService.getBaseFee}.
   * @param options.useCache - When `true`, reuse a cached base fee.
   * @returns The reference fee in drops.
   */
  async getBaseFee(
    scope: KnownCaip2ChainId,
    options?: { useCache?: boolean },
  ): Promise<BigNumber> {
    const feeInDrops = await this.#networkService.getBaseFee(scope, {
      cache: options?.useCache === true,
    });
    return this.#multiplyFee(feeInDrops);
  }

  /**
   * Estimates the `Fee` for a transaction, in drops.
   *
   * A multisigned transaction is charged `(1 + signerCount)` times the reference
   * fee. `AccountDelete` and `AMMCreate` cost one owner reserve (0.2 XRP) and
   * are not capped at 2 XRP. A `Batch` costs two reference fees plus each inner
   * transaction's fee, then the total is capped at 2 XRP.
   *
   * @param params - Transaction and network.
   * @param params.transaction - Transaction whose type, signatures, and batch inners are priced.
   * @param params.scope - CAIP-2 chain ID passed to {@link TransactionFeeEstimator.getBaseFee}.
   * @param params.useCache - When `true`, reuse a cached base fee.
   * @returns The fee in drops.
   */
  async estimateFee(params: {
    transaction: Transaction;
    scope: KnownCaip2ChainId;
    useCache?: boolean;
  }): Promise<BigNumber> {
    const { transaction, scope, useCache } = params;
    const baseFee = await this.getBaseFee(scope, { useCache });
    return this.#calculateFeeByTransactionType(transaction, baseFee);
  }

  /**
   * Applies the transaction-type rules to a standard fee that is already capped.
   *
   * @param transaction - Transaction to price. Batch inners are priced from the same standard fee.
   * @param baseFee - Reference fee in drops for one signature.
   * @returns The fee in drops.
   */
  #calculateFeeByTransactionType(
    transaction: Transaction,
    baseFee: BigNumber,
  ): BigNumber {
    const signatures = Math.max(transaction.getRaw().Signers?.length ?? 0, 0);
    const paysOwnerReserve = OWNER_RESERVE_TRANSACTION_TYPES.has(
      transaction.transactionType,
    );

    let fee = baseFee;
    if (paysOwnerReserve) {
      fee = OWNER_RESERVE_FEE_DROPS;
    } else if (transaction.transactionType === XrplTransactionType.Batch) {
      const innerFee = transaction.innerTransactions.reduce(
        (sum, inner) =>
          sum.plus(this.#calculateFeeByTransactionType(inner, baseFee)),
        new BigNumber(0),
      );
      fee = baseFee.multipliedBy(2).plus(innerFee);
    }

    if (signatures > 0) {
      fee = fee.plus(baseFee.multipliedBy(signatures));
    }

    if (paysOwnerReserve) {
      return fee;
    }

    return this.#cappedFee(fee);
  }

  /**
   * Caps `fee` at 2 XRP, in drops.
   *
   * @param fee - Fee in drops.
   * @returns The capped fee in drops.
   */
  #cappedFee(fee: BigNumber): BigNumber {
    return BigNumber.min(fee, xrpToDrops(MAX_CAPPED_FEE_XRP));
  }

  /**
   * Multiplies `fee` by the configured margin, rounds up to a whole drop, and caps it.
   *
   * @param fee - Fee in drops.
   * @returns The scaled fee in drops.
   */
  #multiplyFee(fee: BigNumber): BigNumber {
    const feeMultiplied = fee
      .multipliedBy(AppConfig.transaction.baseFeeMultiplier)
      .integerValue(BigNumber.ROUND_CEIL);

    return this.#cappedFee(feeMultiplied);
  }
}
