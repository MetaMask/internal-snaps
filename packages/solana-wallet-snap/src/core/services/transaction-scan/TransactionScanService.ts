import type {
  ExtendedKeyringAccount,
  SecurityAlertsScanOption,
} from '@metamask/snap-networks-utils';
import {
  BaseTransactionScanService,
  DEFAULT_METAMASK_ORIGIN,
} from '@metamask/snap-networks-utils';
import { assert } from '@metamask/superstruct';
import bs58 from 'bs58';

import {
  SecurityAlertResponseStruct,
  SecurityAlertRequestStruct,
} from '../../clients/security-alerts-api/structs';
import type {
  SecurityAlertsMetadata,
  SecurityAlertSimulationValidationResponse,
  SolanaScanRequestBody,
} from '../../clients/security-alerts-api/structs';
import { Network } from '../../constants/solana';
import type { TransactionScanError, TransactionScanResult } from './types';

/**
 * The Security Alerts API chain identifier for each Solana scope.
 */
const SCOPE_TO_CHAIN: Record<Network, SolanaScanRequestBody['chain']> = {
  [Network.Mainnet]: 'mainnet',
  [Network.Devnet]: 'devnet',
  [Network.Testnet]: 'testnet',
  [Network.Localnet]: 'localnet',
};

/**
 * Whether the response reports an execution failure, meaning the transaction
 * would not succeed on chain.
 *
 * @param result - The validated API response.
 * @returns True when the response reports an execution failure.
 */
function isExecutionFailure(
  result: SecurityAlertSimulationValidationResponse,
): boolean {
  const type = result.error_details?.type;
  return (
    result.status === 'ERROR' &&
    (type === 'TransactionError' ||
      type === 'InstructionError' ||
      type === 'ApiError')
  );
}

/**
 * The error for a requested result that the response did not return.
 *
 * @returns The response error.
 */
function emptyResponseError(): TransactionScanError {
  return {
    type: 'response',
    code: 'empty',
    message: 'No scan results returned',
  };
}

export class TransactionScanService extends BaseTransactionScanService {
  /**
   * Scans a transaction.
   *
   * @param params - The parameters for the function.
   * @param params.method - The method of the transaction.
   * @param params.accountAddress - The address of the account.
   * @param params.transaction - The transaction to scan.
   * @param params.scope - The scope of the transaction.
   * @param params.origin - The origin of the transaction.
   * @param params.options - The options for the scan.
   * @param params.account - The account for analytics tracking.
   * @returns The result of the scan.
   */
  async scanTransaction({
    method,
    accountAddress,
    transaction,
    scope,
    origin,
    options = ['simulation', 'validation'],
    account,
  }: {
    method: string;
    accountAddress: string;
    transaction: string;
    scope: Network;
    origin: string;
    options?: SecurityAlertsScanOption[];
    account?: ExtendedKeyringAccount;
  }): Promise<TransactionScanResult | null> {
    try {
      // eslint-disable-next-line no-restricted-globals
      const base64AccountAddress = Buffer.from(
        bs58.decode(accountAddress),
      ).toString('base64');

      const requestBody = {
        method,
        encoding: 'base64',
        account_address: base64AccountAddress,
        metadata: this.#buildMetadata(origin),
        chain: SCOPE_TO_CHAIN[scope],
        transactions: [transaction],
        options,
      } satisfies SolanaScanRequestBody;

      assert(
        requestBody,
        SecurityAlertRequestStruct,
        'Solana scan request body',
      );

      this.logger.info('Scanning transaction');

      const result =
        await this.securityAlertsApiClient.scanTransaction(requestBody);

      assert(result, SecurityAlertResponseStruct, 'Solana scan response body');

      const scan = this.#mapScan(result, options);

      // Only a requested security validation is a security scan. A
      // simulation-only request must not be reported as one.
      if (options.includes('validation')) {
        await this.trackScanCompleted(
          { origin, scope, accountType: account?.type },
          scan,
        );
      }

      // Logo URLs are passed directly to Image component - no conversion needed
      return scan;
    } catch (error) {
      await this.trackError(error);
      this.logger.error(error);

      if (options.includes('validation')) {
        await this.trackScanFailed({
          origin,
          scope,
          accountType: account?.type,
        });
      }

      return null;
    }
  }

  /**
   * Builds the scan request metadata for an origin.
   *
   * In-app transactions report the `metamask` pseudo-origin, which is not a
   * dapp URL; it is reported with a null URL and the non-dApp marker, so
   * in-app scans are not attributed to a dapp. DApp origins are reported as
   * the dApp's URL.
   *
   * @param origin - The origin of the transaction.
   * @returns The scan request metadata.
   */
  #buildMetadata(origin: string): SecurityAlertsMetadata {
    return origin === DEFAULT_METAMASK_ORIGIN
      ? { url: null, non_dapp: true }
      : { url: origin };
  }

  #mapScan(
    result: SecurityAlertSimulationValidationResponse,
    options: SecurityAlertsScanOption[],
  ): TransactionScanResult {
    const simulationError = this.#mapSimulationError(result, options);
    const validationError = this.#mapValidationError(result, options);
    const simulation = result.result?.simulation;
    const assetDiff = simulation?.account_summary?.account_assets_diff ?? [];
    // Status reports only the security scan. A missing simulation is a
    // simulation error, so the security verdict still stands. The estimate
    // depends only on the simulation: it is null when the simulation failed, so
    // the UI reports "not available" rather than "no changes".

    return {
      status: validationError ? 'ERROR' : 'SUCCESS',
      estimatedChanges:
        simulationError === null
          ? {
              assets: assetDiff.map((asset) => ({
                type: asset.in ? 'in' : 'out',
                symbol: asset.asset.symbol ?? asset.asset_type,
                name: asset.asset.name ?? asset.asset_type,
                logo: asset.asset.logo ?? null,
                value: asset.in?.value ?? asset.out?.value ?? null,
                price: asset.in?.usd_price ?? asset.out?.usd_price ?? null,
              })),
            }
          : null,
      validation: {
        type: result.result?.validation?.result_type ?? null,
        reason: result.result?.validation?.reason ?? null,
      },
      error: simulationError,
      validationError,
    };
  }

  /**
   * Classifies a simulation failure: an execution failure, or a requested
   * simulation that returned no result. An execution failure is not gated on
   * `options`, because the error describes the response itself, as in Stellar's
   * `simulationError`.
   *
   * @param result - The validated API response.
   * @param options - The requested scan sections.
   * @returns The simulation error, or null when the simulation succeeded.
   */
  #mapSimulationError(
    result: SecurityAlertSimulationValidationResponse,
    options: SecurityAlertsScanOption[],
  ): TransactionScanError | null {
    const details = result.error_details;
    if (details && isExecutionFailure(result)) {
      return {
        type: 'simulation',
        code: 'code' in details && details.code ? details.code : null,
        message: details.message,
      };
    }

    if (options.includes('simulation') && !result.result?.simulation) {
      return emptyResponseError();
    }

    return null;
  }

  /**
   * Classifies a failure of the security scan itself: a validation `Error`, an
   * overall response error, or requested results that are missing. Execution
   * failures are classified by `#mapSimulationError`, so a failed simulation
   * and a failed validation are reported separately.
   *
   * @param result - The validated API response.
   * @param options - The requested scan sections.
   * @returns The validation error, or null when the scan itself succeeded.
   */
  #mapValidationError(
    result: SecurityAlertSimulationValidationResponse,
    options: SecurityAlertsScanOption[],
  ): TransactionScanError | null {
    const details = result.error_details;
    const validation = result.result?.validation;

    if (options.includes('validation') && validation?.result_type === 'Error') {
      return {
        type: 'validation',
        code: validation.reason ?? null,
        message: validation.reason ?? null,
      };
    }

    if (result.status === 'ERROR' && !isExecutionFailure(result)) {
      // An ERROR response that `isExecutionFailure` does not classify, such as
      // one without `error_details`. Without this branch it would be reported
      // as a success when the verdict is present.
      return {
        type: 'response',
        code: details?.type ?? null,
        message: details?.message ?? result.error ?? null,
      };
    }

    // A requested validation without a verdict means the security scan failed.
    if (options.includes('validation') && !validation?.result_type) {
      return emptyResponseError();
    }

    return null;
  }
}
