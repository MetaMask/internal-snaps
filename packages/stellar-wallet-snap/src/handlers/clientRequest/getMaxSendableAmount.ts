import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import type { AssetMetadataService } from '../../services/asset-metadata';
import type { AccountNotActivatedException } from '../../services/network/exceptions';
import type { TransactionService } from '../../services/transaction';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverFeeException,
  TrustlineExceedLimitException,
} from '../../services/transaction/exceptions';
import { isSlip44Id, toDisplayBalance } from '../../utils';
import type {
  AccountResolver,
  ResolvedActivatedAccount,
} from '../accountResolver';
import { RESOLVE_ACCOUNT_FULL_FROM_KEYRING_STATE } from '../accountResolver';
import type {
  GetMaxSendableAmountJsonRpcRequest,
  GetMaxSendableAmountJsonRpcResponse,
} from './api';
import {
  GetMaxSendableAmountJsonRpcRequestStruct,
  GetMaxSendableAmountJsonRpcResponseStruct,
} from './api';
import { BaseClientRequestHandler } from './base';

const ZERO_AMOUNT: GetMaxSendableAmountJsonRpcResponse = { amount: '0' };

export class GetMaxSendableAmountHandler extends BaseClientRequestHandler<
  GetMaxSendableAmountJsonRpcRequest,
  GetMaxSendableAmountJsonRpcResponse
> {
  readonly #assetMetadataService: AssetMetadataService;

  readonly #transactionService: TransactionService;

  constructor({
    logger,
    accountResolver,
    assetMetadataService,
    transactionService,
  }: {
    logger: Logger;
    accountResolver: AccountResolver;
    assetMetadataService: AssetMetadataService;
    transactionService: TransactionService;
  }) {
    const prefixedLogger = logger.withPrefix(
      '[💰 GetMaxSendableAmountHandler]',
    );
    super({
      accountResolver,
      logger: prefixedLogger,
      requestStruct: GetMaxSendableAmountJsonRpcRequestStruct,
      responseStruct: GetMaxSendableAmountJsonRpcResponseStruct,
      resolveAccountOptions: RESOLVE_ACCOUNT_FULL_FROM_KEYRING_STATE,
    });
    this.#assetMetadataService = assetMetadataService;
    this.#transactionService = transactionService;
  }

  /**
   * Computes the maximum amount that would pass {@link ClientRequestMethod.OnAmountInput}.
   *
   * Delegates the reserve and fee checks to {@link TransactionService.createValidatedSendTransaction},
   * mirroring `onAmountInput`: a full-balance self-transfer either validates (token balances)
   * or fails with the spendable native left after the fee (XLM).
   *
   * @param resolved - Keyring account, persisted on-chain snapshot, and wallet.
   * @param request - JSON-RPC request with `accountId` and `assetId` (optional `toAddress` is accepted; `scope` is derived from `assetId`).
   * @returns The maximum sendable amount, or `0` when no amount can pass.
   */
  protected async execute(
    resolved: ResolvedActivatedAccount,
    request: GetMaxSendableAmountJsonRpcRequest,
  ): Promise<GetMaxSendableAmountJsonRpcResponse> {
    const { onChainAccount } = resolved;
    const { assetId, scope } = request.params;

    const asset = onChainAccount.getAsset(assetId);
    const balance = asset?.balance ?? new BigNumber(0);

    if (balance.lte(0) || asset?.authorized === false) {
      return ZERO_AMOUNT;
    }

    const { units } = await this.#assetMetadataService.resolve(assetId);
    const { decimals } = units[0];

    try {
      await this.#transactionService.createValidatedSendTransaction({
        onChainAccount,
        scope,
        assetId,
        amount: balance,
        destination: onChainAccount.accountId,
        skipExceptions: [TrustlineExceedLimitException],
        useCache: true,
      });

      return this.#toDisplayAmount(balance, decimals);
    } catch (error: unknown) {
      if (error instanceof InsufficientBalanceToCoverFeeException) {
        // Not enough XLM to pay the fee, regardless of the asset being sent.
        return ZERO_AMOUNT;
      }

      if (error instanceof InsufficientBalanceException) {
        // Non-native assets pay the fee in XLM. A failed balance check means
        // the asset itself cannot cover the transfer.
        if (!isSlip44Id(assetId)) {
          return ZERO_AMOUNT;
        }

        // Fee is debited before the payment, so `error.balance` is the
        // spendable native left after the fee — the largest sendable amount.
        return this.#toDisplayAmount(new BigNumber(error.balance), decimals);
      }

      throw error;
    }
  }

  /**
   * Convert an amount in the asset's smallest unit to a display amount.
   *
   * @param amountInSmallestUnit - Amount in the asset's smallest unit.
   * @param decimals - Asset decimals.
   * @returns The response with the display amount.
   */
  #toDisplayAmount(
    amountInSmallestUnit: BigNumber,
    decimals: number,
  ): GetMaxSendableAmountJsonRpcResponse {
    return {
      amount: toDisplayBalance(amountInSmallestUnit, decimals),
    };
  }

  /**
   * Return `0` when the account is not activated instead of showing the activation prompt.
   *
   * @param _error - The account not activated error.
   * @param _request - The JSON-RPC request (unused).
   * @returns `{ amount: '0' }`.
   */
  protected override async handleAccountNotActivatedError(
    _error: AccountNotActivatedException,
    _request: GetMaxSendableAmountJsonRpcRequest,
  ): Promise<GetMaxSendableAmountJsonRpcResponse> {
    return ZERO_AMOUNT;
  }
}
