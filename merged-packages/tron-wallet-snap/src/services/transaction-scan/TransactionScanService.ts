/* eslint-disable @typescript-eslint/naming-convention */
import type { TransactionScanResult, TransactionScanValidation } from './types';
import { ScanStatus, SecurityAlertResponse } from './types';
import type { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { ILogger } from '../../utils/logger';

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
   * @param params.parameters - The parameters for the transaction.
   * @param params.parameters.from - The from address.
   * @param params.parameters.to - The to address.
   * @param params.parameters.data - The data of the transaction.
   * @param params.parameters.value - The value of the transaction.
   * @param params.origin - The origin of the transaction.
   * @param params.scope - The network scope.
   * @param params.options - The options for the scan (simulation, validation).
   * @param params.account - The account for analytics tracking.
   * @returns The result of the scan, or null if the scan failed.
   */
  async scanTransaction({
    accountAddress,
    parameters,
    origin,
    scope,
    options = ['simulation', 'validation'],
    account,
  }: {
    accountAddress: string;
    parameters: {
      from: string | undefined;
      to: string | undefined;
      data: string | undefined;
      value: number | undefined | null;
    };
    origin: string;
    scope: Network;
    options?: string[] | undefined;
    account?: TronKeyringAccount;
  }): Promise<TransactionScanResult | null> {
    try {
      const result = await this.#securityAlertsApiClient.scanTransaction({
        accountAddress,
        parameters,
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
    const simulationStatus = result.simulation?.status;
    const validationStatus = result.validation?.status;

    const status =
      simulationStatus === 'Error' || validationStatus === 'Error'
        ? 'ERROR'
        : 'SUCCESS';

    return {
      status,
      estimatedChanges: {
        assets:
          result.simulation?.account_summary?.assets_diffs?.map((asset) => {
            // Get the first in/out change value (arrays now)
            const inChange = asset.in?.[0];
            const outChange = asset.out?.[0];
            const change = inChange ?? outChange;

            return {
              type: inChange ? 'in' : 'out',
              symbol:
                'symbol' in asset.asset ? asset.asset.symbol : asset.asset_type,
              name: 'name' in asset.asset ? asset.asset.name : asset.asset_type,
              logo:
                'logo_url' in asset.asset
                  ? (asset.asset.logo_url ?? null)
                  : null,
              value: change ? parseFloat(change.value) : null,
              price: change?.usd_price ? parseFloat(change.usd_price) : null,
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
              type: result.simulation?.error_details?.type ?? null,
              code: result.simulation?.error_details?.code ?? null,
              message: result.simulation?.error ?? null,
            }
          : null,
    };
  }
}
