import type { Logger } from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';
import { ensureError } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip2ChainId } from '../../api';
import { METAMASK_ORIGIN } from '../../constants';
import type { StellarKeyringAccount } from '../../services/account';
import type {
  AssetMetadataService,
  StellarAssetMetadata,
} from '../../services/asset-metadata';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverFeeException,
  KeyringTransactionType,
  TransactionValidationException,
} from '../../services/transaction';
import type {
  Transaction,
  TransactionService,
} from '../../services/transaction';
import { AssetChangeDirection } from '../../services/transaction-scan';
import type { TransactionScanEstimatedChanges } from '../../services/transaction-scan';
import type { ContextWithPrices } from '../../ui/confirmation/api';
import {
  ConfirmationInterfaceKey,
  FetchStatus,
} from '../../ui/confirmation/api';
import type { ConfirmationUXController } from '../../ui/confirmation/controller';
import {
  hasDecimals,
  isSlip44Id,
  toSmallestUnit,
  trackError,
  trackTransactionAdded,
  trackTransactionApproved,
  trackTransactionRejected,
} from '../../utils';
import type {
  AccountResolver,
  ResolvedActivatedAccount,
} from '../accountResolver';
import { TrackTransactionHandler } from '../cronjob/trackTransaction';
import type {
  ConfirmSendJsonRpcRequest,
  ConfirmSendJsonRpcResponse,
} from './api';
import {
  ConfirmSendJsonRpcRequestStruct,
  ConfirmSendJsonRpcResponseStruct,
  MultiChainSendErrorCodes,
} from './api';
import { BaseClientRequestHandler } from './base';
import {
  assertRefreshedTransactionFeeNotHigher,
  getTxnErrorMessageKey,
} from './utils';

/**
 * Confirms and submits a send transaction for Unified Non-EVM Send.
 *
 * Unlike {@link OnAmountInputHandler}, this handler resolves the on-chain account from
 * live network data (default {@link AccountResolver} options) so balance, sequence, and
 * fees are current at submission time.
 */
export class ConfirmSendHandler extends BaseClientRequestHandler<
  ConfirmSendJsonRpcRequest,
  ConfirmSendJsonRpcResponse
> {
  readonly #transactionService: TransactionService;

  readonly #assetMetadataService: AssetMetadataService;

  readonly #confirmationUIController: ConfirmationUXController;

  readonly #logger: Logger;

  constructor({
    logger,
    accountResolver,
    transactionService,
    assetMetadataService,
    confirmationUIController,
  }: {
    logger: Logger;
    accountResolver: AccountResolver;
    transactionService: TransactionService;
    assetMetadataService: AssetMetadataService;
    confirmationUIController: ConfirmationUXController;
  }) {
    const prefixedLogger = logger.withPrefix('[👍 ConfirmSendHandler]');
    super({
      accountResolver,
      logger: prefixedLogger,
      requestStruct: ConfirmSendJsonRpcRequestStruct,
      responseStruct: ConfirmSendJsonRpcResponseStruct,
    });
    this.#transactionService = transactionService;
    this.#assetMetadataService = assetMetadataService;
    this.#confirmationUIController = confirmationUIController;
    this.#logger = prefixedLogger;
  }

  /**
   * Builds a validated send transaction, shows confirmation, then signs and submits.
   *
   * Pre-submit validation failures (balance, memo, trustline, create-account,
   * expired transaction, non-native send to an unfunded destination) are shown
   * in the send confirmation dialog first, then returned as structured error
   * codes. Failures after the user confirms return those same codes without a
   * second dialog.
   *
   * @param resolved - Keyring account, live on-chain snapshot, and wallet.
   * @param request - JSON-RPC request with send params (`scope` is derived from `assetId`).
   * @returns `{ valid: true, errors: [], transactionId }` on success, or `{ valid: false, errors }` for validation failures.
   * @throws {UserRejectedRequestError} If the user rejects the confirmation prompt.
   */
  protected async execute(
    resolved: ResolvedActivatedAccount,
    request: ConfirmSendJsonRpcRequest,
  ): Promise<ConfirmSendJsonRpcResponse> {
    try {
      const { onChainAccount, account: stellarKeyringAccount } = resolved;
      const { amount, toAddress, assetId, scope } = request.params;
      const assetMetadata = await this.#assetMetadataService.resolve(assetId);
      const { decimals, symbol } = assetMetadata.units[0];

      const amountInSmallestUnit = toSmallestUnit(
        new BigNumber(amount),
        decimals,
      );

      if (hasDecimals(amountInSmallestUnit)) {
        return {
          valid: false,
          errors: [{ code: MultiChainSendErrorCodes.Invalid }],
        };
      }

      let transaction: Transaction;
      try {
        transaction =
          await this.#transactionService.createValidatedSendTransaction({
            onChainAccount,
            scope,
            assetId,
            amount: amountInSmallestUnit,
            destination: toAddress,
          });
      } catch (error: unknown) {
        if (error instanceof TransactionValidationException) {
          await this.#displayDialogWithErrorMessage({
            request,
            account: stellarKeyringAccount,
            assetMetadata,
            scope,
            error,
          });
        }
        throw error;
      }

      await trackTransactionAdded({
        origin: METAMASK_ORIGIN,
        accountType: stellarKeyringAccount.type,
        chainIdCaip: scope,
      });

      if (
        !(await this.#confirmSend({
          request,
          account: stellarKeyringAccount,
          assetMetadata,
          scope,
          fee: transaction.totalFee,
          transaction,
        }))
      ) {
        await trackTransactionRejected({
          origin: METAMASK_ORIGIN,
          accountType: stellarKeyringAccount.type,
          chainIdCaip: scope,
        });
        throw ensureError(new UserRejectedRequestError());
      }

      await trackTransactionApproved({
        origin: METAMASK_ORIGIN,
        accountType: stellarKeyringAccount.type,
        chainIdCaip: scope,
      });

      const {
        wallet: refreshedWallet,
        onChainAccount: refreshedOnChainAccount,
        transaction: refreshedTransaction,
      } = await this.#refreshTransactionAfterConfirmation({
        request,
        confirmedTransaction: transaction,
        amount: amountInSmallestUnit,
      });

      refreshedWallet.signTransaction(refreshedTransaction);

      const transactionId = await this.#transactionService.sendTransaction({
        wallet: refreshedWallet,
        onChainAccount: refreshedOnChainAccount,
        scope,
        transaction: refreshedTransaction,
        pollTransaction: false,
      });

      await this.#transactionService.savePendingKeyringTransactionSafe({
        type: KeyringTransactionType.Send,
        request: {
          txId: transactionId,
          account: stellarKeyringAccount,
          scope,
          toAddress,
          asset: {
            type: assetId,
            unit: symbol,
            amount,
            fungible: true as const,
          },
        },
      });

      await TrackTransactionHandler.scheduleBackgroundEvent({
        txId: transactionId,
        accountIdsOrAddresses: [stellarKeyringAccount.id, toAddress],
        scope,
      });

      return {
        valid: true,
        errors: [],
        transactionId,
      };
    } catch (error: unknown) {
      // Expected validation failures are user-facing outcomes; return them without tracking.
      if (error instanceof InsufficientBalanceException) {
        return {
          valid: false,
          errors: [{ code: MultiChainSendErrorCodes.InsufficientBalance }],
        };
      }
      if (error instanceof InsufficientBalanceToCoverFeeException) {
        return {
          valid: false,
          errors: [
            { code: MultiChainSendErrorCodes.InsufficientBalanceToCoverFee },
          ],
        };
      }
      if (error instanceof TransactionValidationException) {
        return {
          valid: false,
          errors: [{ code: MultiChainSendErrorCodes.Invalid }],
        };
      }

      // User rejection must propagate so MetaMask can dismiss the send flow.
      if (error instanceof UserRejectedRequestError) {
        throw error;
      }

      // Unexpected errors are swallowed into `{ valid: false }`, so track them for debugging.
      await trackError(error);

      this.#logger.warn(
        'Failed to confirm send transaction due to unexpected issue',
        { error },
      );

      return {
        valid: false,
        errors: [{ code: MultiChainSendErrorCodes.Invalid }],
      };
    }
  }

  async #refreshTransactionAfterConfirmation(params: {
    request: ConfirmSendJsonRpcRequest;
    confirmedTransaction: Transaction;
    amount: BigNumber;
  }): Promise<{
    wallet: ResolvedActivatedAccount['wallet'];
    onChainAccount: ResolvedActivatedAccount['onChainAccount'];
    transaction: Transaction;
  }> {
    const { request, confirmedTransaction, amount } = params;
    const { assetId, toAddress, scope } = request.params;
    // Resolve again after the user confirms so sequence, balances, and fees are fresh before signing.
    // sendTransaction still handles txBadSeq races that happen after this refresh.
    const { wallet, onChainAccount } = await this.resolveAccount(request);

    const refreshedTransaction =
      await this.#transactionService.createValidatedSendTransaction({
        onChainAccount,
        scope,
        assetId,
        amount,
        destination: toAddress,
      });

    // Reject if the refreshed fee is higher than what the user approved, so we
    // never sign a transaction that differs from what was shown on the confirmation screen.
    assertRefreshedTransactionFeeNotHigher({
      confirmedTransaction,
      refreshedTransaction,
    });

    return {
      wallet,
      onChainAccount,
      transaction: refreshedTransaction,
    };
  }

  async #confirmSend(params: {
    request: ConfirmSendJsonRpcRequest;
    account: StellarKeyringAccount;
    assetMetadata: StellarAssetMetadata;
    scope: KnownCaip2ChainId;
    fee: BigNumber;
    transaction: Transaction;
  }): Promise<boolean> {
    const { request, account, assetMetadata, fee, scope, transaction } = params;
    const { toAddress, amount, assetId } = request.params;
    const xdr = transaction.getRaw().toXDR();
    // The send asset and amount are known from the request, so the estimated
    // changes are just a single outgoing row — no local simulation needed.
    const estimatedChanges = this.#buildEstimatedChanges({
      amount,
      assetMetadata,
    });

    return (
      (await this.#confirmationUIController.renderConfirmationDialog({
        scope,
        origin: METAMASK_ORIGIN,
        renderContext: {
          account,
          toAddress,
        },
        fee: fee.toString(),
        interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
        renderOptions: {
          loadPrice: true,
          securityScanning: true,
          localSimulation: true,
        },
        securityScanRequest: {
          accountAddress: account.address,
          transaction: xdr,
        },
        initialScan: {
          status: 'SUCCESS',
          estimatedChanges,
          validation: null,
          error: null,
        },
        transactionValidationRequest: {
          accountId: account.id,
          transaction: xdr,
          request,
        },
        tokenPrices: {
          [assetId]: null,
        } as ContextWithPrices['tokenPrices'],
      })) === true
    );
  }

  /**
   * Shows the send confirmation with the validation error and no fee/price
   * estimates, so the user can see why the send cannot proceed.
   *
   * @param params - The send request context and validation error.
   * @param params.request - The original confirmSend JSON-RPC request.
   * @param params.account - The sender keyring account.
   * @param params.assetMetadata - Metadata for the asset being sent.
   * @param params.scope - CAIP-2 chain of the send.
   * @param params.error - The pre-submit validation error to display.
   */
  async #displayDialogWithErrorMessage(params: {
    request: ConfirmSendJsonRpcRequest;
    account: StellarKeyringAccount;
    assetMetadata: StellarAssetMetadata;
    scope: KnownCaip2ChainId;
    error: TransactionValidationException;
  }): Promise<void> {
    const { request, account, assetMetadata, scope, error } = params;
    const { toAddress, amount, assetId } = request.params;
    const estimatedChanges = this.#buildEstimatedChanges({
      amount,
      assetMetadata,
    });

    await this.#confirmationUIController.renderConfirmationDialog({
      scope,
      origin: METAMASK_ORIGIN,
      renderContext: {
        account,
        toAddress,
        transactionsFetchStatus: FetchStatus.Error,
        errorMessage: getTxnErrorMessageKey(error, account.address),
      },
      fee: '',
      interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
      renderOptions: {
        loadPrice: false,
        securityScanning: false,
        localSimulation: false,
      },
      initialScan: {
        status: 'ERROR',
        estimatedChanges,
        validation: null,
        error: null,
      },
      tokenPrices: {
        [assetId]: null,
      } as ContextWithPrices['tokenPrices'],
    });
  }

  /**
   * Builds the estimated balance changes for the send confirmation: a single
   * outgoing row for the known send asset and amount. The network fee is
   * surfaced separately, so it is excluded here.
   *
   * @param params - The parameters.
   * @param params.amount - The send amount in human-readable units.
   * @param params.assetMetadata - The asset metadata for the row.
   * @returns The estimated changes to seed the confirmation.
   */
  #buildEstimatedChanges({
    amount,
    assetMetadata,
  }: {
    amount: string;
    assetMetadata: StellarAssetMetadata;
  }): TransactionScanEstimatedChanges {
    const { assetId, symbol, iconUrl, name } = assetMetadata;
    const logo = isSlip44Id(assetId) ? null : (iconUrl ?? null);

    return {
      assets: [
        {
          type: AssetChangeDirection.Out,
          value: amount,
          price: null,
          symbol,
          name: name ?? symbol,
          logo,
        },
      ],
    };
  }
}
