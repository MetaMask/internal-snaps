/* eslint-disable @typescript-eslint/naming-convention */
import type { Types } from 'tronweb';

import type { TransactionScanResult, TransactionScanValidation } from './types';
import { ScanStatus, SecurityAlertResponse, SimulationStatus } from './types';
import { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/structs';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import type { ILogger } from '../../utils/logger';
import { isTransactionWellFormed } from '../../validation/transaction';

const METAMASK_ORIGIN = 'metamask';
const METAMASK_ORIGIN_URL = 'https://metamask.io';

export class TransactionScanService {
  readonly #securityAlertsApiClient: SecurityAlertsApiClient;

  readonly #snapClient: SnapClient;

  readonly #logger: ILogger;

  constructor(
    securityAlertsApiClient: SecurityAlertsApiClient,
    snapClient: SnapClient,
    logger: ILogger,
  ) {
    this.#securityAlertsApiClient = securityAlertsApiClient;
    this.#snapClient = snapClient;
    this.#logger = logger;
  }

  /**
   * Scans a Tron transaction for security issues.
   *
   * @param params - The parameters for the function.
   * @param params.accountAddress - The address of the account.
   * @param params.transactionRawData - The raw data of the transaction.
   * @param params.origin - The origin of the transaction.
   * @param params.scope - The network scope.
   * @param params.options - The options for the scan (simulation, validation).
   * @param params.account - The account for analytics tracking.
   * @returns The result of the scan, or null if the scan failed.
   */
  async scanTransaction({
    accountAddress,
    transactionRawData,
    origin,
    scope,
    options = ['simulation', 'validation'],
    account,
  }: {
    accountAddress: string;
    transactionRawData: Types.Transaction['raw_data'];
    origin: string;
    scope: Network;
    options?: string[] | undefined;
    account?: TronKeyringAccount;
  }): Promise<TransactionScanResult | null> {
    if (!isTransactionWellFormed(transactionRawData)) {
      this.#logger.warn(
        'Malformed transaction: Tron transactions must contain exactly one contract',
      );

      return {
        status: 'ERROR',
        estimatedChanges: { assets: [] },
        validation: { type: null, reason: null },
        error: {
          type: 'MALFORMED_TRANSACTION',
          code: null,
          message: 'Tron transactions must contain exactly one contract entry.',
        },
        simulationStatus: SimulationStatus.Failed,
      };
    }

    if (!SecurityAlertsApiClient.isContractTypeSupported(transactionRawData)) {
      this.#logger.info(
        'Transaction contract type is not supported for simulation, skipping scan',
      );

      return {
        status: 'SUCCESS',
        estimatedChanges: { assets: [] },
        validation: { type: null, reason: null },
        error: null,
        simulationStatus: SimulationStatus.Skipped,
      };
    }

    try {
      const result = await this.#securityAlertsApiClient.scanTransaction({
        accountAddress,
        transactionRawData,
        origin: origin === METAMASK_ORIGIN ? METAMASK_ORIGIN_URL : origin,
        options,
      });

      const scan = this.#mapScan(result);

      if (!scan?.status) {
        this.#logger.warn(
          'Invalid scan result received from security alerts API',
        );

        // Track error if account is provided
        if (account) {
          await this.#snapClient.trackSecurityScanCompleted({
            origin,
            accountType: account.type,
            chainIdCaip: scope,
            scanStatus: ScanStatus.ERROR,
            hasSecurityAlerts: false,
          });
        }

        return null;
      }

      // Track security scan completion
      if (account) {
        const isValidScanStatus = Object.values(ScanStatus).includes(
          scan.status as ScanStatus,
        );
        const scanStatus = isValidScanStatus
          ? (scan.status as ScanStatus)
          : ScanStatus.ERROR;

        const hasSecurityAlert = Boolean(
          scan.validation?.type &&
          scan.validation.type !== SecurityAlertResponse.Benign,
        );

        // Track scan completed
        await this.#snapClient.trackSecurityScanCompleted({
          origin,
          accountType: account.type,
          chainIdCaip: scope,
          scanStatus,
          hasSecurityAlerts: hasSecurityAlert,
        });

        // Track security alert if detected
        if (hasSecurityAlert) {
          const isValidSecurityAlertType = Object.values(
            SecurityAlertResponse,
          ).includes(scan.validation.type as SecurityAlertResponse);
          const securityAlertType = isValidSecurityAlertType
            ? (scan.validation.type as SecurityAlertResponse)
            : SecurityAlertResponse.Warning;

          await this.#snapClient.trackSecurityAlertDetected({
            origin,
            accountType: account.type,
            chainIdCaip: scope,
            securityAlertResponse: securityAlertType,
            securityAlertReason: scan.validation.reason ?? null,
            securityAlertDescription: this.getSecurityAlertDescription(
              scan.validation,
            ),
          });
        }
      }

      return scan;
    } catch (error) {
      this.#logger.error(error);

      // Track error if account is provided
      if (account) {
        await this.#snapClient.trackSecurityScanCompleted({
          origin,
          accountType: account.type,
          chainIdCaip: scope,
          scanStatus: ScanStatus.ERROR,
          hasSecurityAlerts: false,
        });
      }

      return null;
    }
  }

  /**
   * Gets a human-readable description for a security alert.
   *
   * @param validation - The validation result from the scan.
   * @returns A description of the security alert.
   */
  getSecurityAlertDescription(validation: TransactionScanValidation): string {
    if (!validation?.reason) {
      return 'Security alert: Unknown reason';
    }

    // Tron-specific reason descriptions
    const reasonDescriptions: Record<string, string> = {
      unfair_trade:
        "Unfair trade of assets, without adequate compensation to the owner's account",
      transfer_farming:
        "Substantial transfer of the account's assets to untrusted entities",
      known_attacker:
        "A known attacker's account is involved in the transaction",
      other:
        'The transaction was marked as malicious for other reason, further details would be described in features field',
    };

    return (
      reasonDescriptions[validation.reason] ??
      `Security alert: ${validation.reason}`
    );
  }

  /**
   * Maps the raw API response to our internal scan result format.
   *
   * @param result - The raw API response.
   * @returns The mapped scan result.
   */
  #mapScan(
    result: SecurityAlertSimulationValidationResponse,
  ): TransactionScanResult | null {
    if (!result) {
      return null;
    }

    // Determine status: ERROR only if explicitly marked as Error
    // SUCCESS if either is Success or if statuses are missing
    const apiSimulationStatus = result.simulation?.status;
    const apiValidationStatus = result.validation?.status;

    const status =
      apiSimulationStatus === 'Error' || apiValidationStatus === 'Error'
        ? 'ERROR'
        : 'SUCCESS';

    return {
      status,
      estimatedChanges: {
        assets:
          result.simulation?.account_summary?.assets_diffs
            // Filter out assets without a displayable value (e.g., NONERC tokens
            // that only have raw_value but no human-readable value from the API)
            ?.filter((asset) => {
              const inChange = asset.in?.[0];
              const outChange = asset.out?.[0];
              const change = inChange ?? outChange;
              return change?.value !== undefined;
            })
            .map((asset) => {
              // Get the first in/out change value (arrays now)
              const inChange = asset.in?.[0];
              const outChange = asset.out?.[0];
              const change = inChange ?? outChange;

              return {
                type: inChange ? ('in' as const) : ('out' as const),
                symbol: asset.asset.symbol ?? asset.asset_type,
                name: asset.asset.name ?? asset.asset_type,
                logo: asset.asset.logo_url ?? null,
                value: change?.value ?? '0',
                price: change?.usd_price ?? null,
                assetType: asset.asset_type,
              };
            }) ?? [],
      },
      validation: {
        type: result.validation?.result_type ?? null,
        reason: result.validation?.reason ?? null,
      },
      error:
        result.simulation?.error || result.simulation?.error_details
          ? {
              type:
                result.simulation?.error_details &&
                'type' in result.simulation.error_details
                  ? result.simulation.error_details.type
                  : null,
              code:
                result.simulation?.error_details &&
                'code' in result.simulation.error_details
                  ? result.simulation.error_details.code
                  : null,
              message: result.simulation?.error ?? null,
            }
          : null,
      simulationStatus:
        status === 'ERROR'
          ? SimulationStatus.Failed
          : SimulationStatus.Completed,
    };
  }
}
