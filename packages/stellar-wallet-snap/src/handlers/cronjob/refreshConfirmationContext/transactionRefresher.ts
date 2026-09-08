import type { Logger } from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { AssetMetadataService } from '../../../services/asset-metadata';
import type {
  Transaction,
  TransactionService,
} from '../../../services/transaction';
import type {
  ContextWithSecurityScan,
  ContextWithTransactionValidation,
} from '../../../ui/confirmation/api';
import {
  ContextWithTransactionValidationStruct,
  FetchStatus,
} from '../../../ui/confirmation/api';
import { toSmallestUnit } from '../../../utils/currency';
import type { AccountResolver } from '../../accountResolver';
import { ResolveAccountSource } from '../../accountResolver';
import {
  ChangeTrustOptAction,
  ClientRequestMethod,
} from '../../clientRequest/api';
import { getTxnErrorMessageKey } from '../../clientRequest/utils';
import { ConfirmationContextRefresherKey } from './api';
import type {
  ConfirmationContextRefreshResult,
  ConfirmationDataContext,
  IConfirmationContextRefresher,
} from './api';

type TransactionValidationContext = ConfirmationDataContext &
  ContextWithTransactionValidation &
  Partial<ContextWithSecurityScan> & {
    // origin is always present on the rendered confirmation context
    // (ConfirmationBaseProps.origin), but isn't part of the validation struct.
    origin?: string;
  };

/**
 * Re-validates the pending transaction while the sign confirmation dialog is open.
 * Transaction slice of the confirmation context refresh pipeline; on every cycle
 * it rebuilds against the latest on-chain account state and propagates the fresh
 * envelope to the security-scan request for the scan refresher.
 */
export class ConfirmationTransactionRefresher implements IConfirmationContextRefresher {
  readonly key = ConfirmationContextRefresherKey.Transaction;

  readonly #transactionService: TransactionService;

  readonly #assetMetadataService: AssetMetadataService;

  readonly #accountResolver: AccountResolver;

  readonly #logger: Logger;

  constructor({
    logger,
    transactionService,
    assetMetadataService,
    accountResolver,
  }: {
    logger: Logger;
    transactionService: TransactionService;
    assetMetadataService: AssetMetadataService;
    accountResolver: AccountResolver;
  }) {
    this.#transactionService = transactionService;
    this.#assetMetadataService = assetMetadataService;
    this.#accountResolver = accountResolver;
    this.#logger = logger.withPrefix('[🔄 ConfirmationTransactionRefresher]');
  }

  shouldFetch(ctx: ConfirmationDataContext): boolean {
    if (!this.isValidContext(ctx)) {
      return false;
    }
    const validationCtx = ctx as TransactionValidationContext;
    // A prior cycle already marked the transaction invalid; nothing to re-fetch.
    return validationCtx.transactionsFetchStatus !== FetchStatus.Error;
  }

  recoveryResult(
    ctx: ConfirmationDataContext,
  ): ConfirmationContextRefreshResult {
    const validationCtx = ctx as TransactionValidationContext;
    if (validationCtx.transactionsFetchStatus !== FetchStatus.Fetching) {
      return null;
    }

    return {
      result: { transactionsFetchStatus: FetchStatus.Fetched },
      reschedule: false,
    };
  }

  async refresh(
    ctx: ConfirmationDataContext,
  ): Promise<ConfirmationContextRefreshResult> {
    const validationCtx = ctx as TransactionValidationContext;
    const { request, accountId, scope, securityScanRequest, origin } =
      validationCtx;
    // Use the scan request address as Default if it is present.
    let accountAddress = securityScanRequest?.accountAddress ?? '';

    try {
      // Load the sender from the network so validation uses current sequence and balances.
      const { onChainAccount } = await this.#accountResolver.resolveAccount({
        accountId,
        scope,
        options: {
          onChainAccount: {
            load: true,
            source: ResolveAccountSource.OnChain,
          },
          wallet: false,
        },
      });
      accountAddress = onChainAccount.accountId;

      // Always rebuild the transaction, to make sure the transaction is up to date with the latest account state.
      let rebuiltTransaction: Transaction;
      switch (request.method) {
        case ClientRequestMethod.ConfirmSend: {
          const assetMetadata = await this.#assetMetadataService.resolve(
            request.params.assetId,
          );
          const { decimals } = assetMetadata.units[0];
          const amount = toSmallestUnit(
            new BigNumber(request.params.amount),
            decimals,
          );
          // Throws on insufficient balance, inactive destination, or fee estimate failure.
          rebuiltTransaction =
            await this.#transactionService.createValidatedSendTransaction({
              onChainAccount,
              scope,
              assetId: request.params.assetId,
              destination: request.params.toAddress,
              amount,
            });
          break;
        }
        case ClientRequestMethod.ChangeTrustOpt:
          // Throws when change-trust limits or account state are no longer valid.
          rebuiltTransaction =
            await this.#transactionService.createValidatedChangeTrustTransaction(
              {
                onChainAccount,
                scope,
                assetId: request.params.assetId,
                limit:
                  request.params.action === ChangeTrustOptAction.Delete
                    ? '0'
                    : request.params.limit,
              },
            );
          break;
        default:
          throw new Error('Unsupported request method for transaction refresh');
      }

      const rebuiltTransactionXdr = rebuiltTransaction.getRaw().toXDR();

      return {
        result: {
          securityScanRequest: {
            accountAddress:
              securityScanRequest?.accountAddress ?? accountAddress,
            origin: securityScanRequest?.origin ?? origin ?? '',
            scope,
            transaction: rebuiltTransactionXdr,
          },
        },
        reschedule: true,
      };
    } catch (error: unknown) {
      this.#logger.error(
        'Error re-validating confirmation transaction:',
        error,
      );
      return {
        result: {
          transactionsFetchStatus: FetchStatus.Error,
          errorMessage: getTxnErrorMessageKey(error, accountAddress),
          // Clear the scan loading state in the confirmation UI + skip the security scan request.
          scanFetchStatus: FetchStatus.Error,
        },
        reschedule: false,
        halt: true,
      };
    }
  }

  isValidContext(ctx: Record<string, Json>): boolean {
    return ContextWithTransactionValidationStruct.is(ctx);
  }
}
