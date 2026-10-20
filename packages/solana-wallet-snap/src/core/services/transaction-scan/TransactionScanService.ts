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
import type { TransactionScanResult } from './types';

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

      const scan = this.#mapScan(result);

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
  ): TransactionScanResult {
    return {
      status:
        result.status === 'SUCCESS' || result.status === 'ERROR'
          ? result.status
          : 'ERROR',
      estimatedChanges: {
        assets:
          result.result?.simulation?.account_summary?.account_assets_diff?.map(
            (asset) => ({
              type: asset.in ? 'in' : 'out',
              symbol: asset.asset.symbol ?? asset.asset_type,
              name: asset.asset.name ?? asset.asset_type,
              logo: asset.asset.logo ?? null,
              value: asset.in?.value ?? asset.out?.value ?? null,
              price: asset.in?.usd_price ?? asset.out?.usd_price ?? null,
            }),
          ) ?? [],
      },
      validation: {
        type: result.result?.validation?.result_type ?? null,
        reason: result.result?.validation?.reason ?? null,
      },
      error: result?.error_details
        ? {
            type:
              'type' in result.error_details ? result.error_details.type : null,
            code:
              ('code' in result.error_details
                ? result.error_details.code
                : null) ?? null,
          }
        : null,
    };
  }
}
