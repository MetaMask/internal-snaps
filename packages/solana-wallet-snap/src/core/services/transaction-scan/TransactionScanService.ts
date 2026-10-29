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

      await this.trackScanCompleted(
        { origin, scope, accountType: account?.type },
        scan,
      );

      // Logo URLs are passed directly to Image component - no conversion needed
      return scan;
    } catch (error) {
      await this.trackError(error);
      this.logger.error(error);

      await this.trackScanFailed({ origin, scope, accountType: account?.type });

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
    const error = this.#mapError(result, options);
    const simulation = result.result?.simulation;
    // A partial response can still provide a security verdict without usable
    // simulation estimates. Keep those estimates unavailable without treating
    // the successful verdict as an unavailable security check.
    const missingSimulation = options.includes('simulation') && !simulation;

    return {
      status: error || missingSimulation ? 'ERROR' : 'SUCCESS',
      estimatedChanges: {
        assets:
          simulation?.account_summary?.account_assets_diff?.map((asset) => ({
            type: asset.in ? 'in' : 'out',
            symbol: asset.asset.symbol ?? asset.asset_type,
            name: asset.asset.name ?? asset.asset_type,
            logo: asset.asset.logo ?? null,
            value: asset.in?.value ?? asset.out?.value ?? null,
            price: asset.in?.usd_price ?? asset.out?.usd_price ?? null,
          })) ?? [],
      },
      validation: {
        type: result.result?.validation?.result_type ?? null,
        reason: result.result?.validation?.reason ?? null,
      },
      error,
    };
  }

  /**
   * Classifies errors using Stellar's simulation, validation and response
   * categories. A simultaneous validation error remains in `validation.type`
   * when the execution failure occupies the error field.
   *
   * @param result - The validated API response.
   * @param options - The requested scan sections.
   * @returns The classified scan error, or null.
   */
  #mapError(
    result: SecurityAlertSimulationValidationResponse,
    options: SecurityAlertsScanOption[],
  ): TransactionScanError | null {
    const details = result.error_details;
    if (
      result.status === 'ERROR' &&
      (details?.type === 'TransactionError' ||
        details?.type === 'InstructionError')
    ) {
      return {
        type: 'simulation',
        code: 'code' in details && details.code ? details.code : null,
        message: details.message,
      };
    }

    const validation = result.result?.validation;
    if (options.includes('validation') && validation?.result_type === 'Error') {
      return {
        type: 'validation',
        code: validation.reason ?? null,
        message: validation.reason ?? null,
      };
    }

    if (result.status === 'ERROR') {
      return {
        type: 'response',
        code: details?.type ?? null,
        message: details?.message ?? result.error ?? null,
      };
    }

    const hasRequestedResult = options.some((option) =>
      option === 'simulation'
        ? Boolean(result.result?.simulation)
        : Boolean(validation),
    );
    return hasRequestedResult
      ? null
      : {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        };
  }
}
