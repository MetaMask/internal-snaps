/* eslint-disable @typescript-eslint/naming-convention */
import type { TransactionScanResult, TransactionScanValidation } from './types';
import type { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/types';
import { generateImageComponent } from '../../ui/utils/generateImageComponent';
import type { ILogger } from '../../utils/logger';

const ICON_SIZE = 16;

const METAMASK_ORIGIN = 'metamask';
const METAMASK_ORIGIN_URL = 'https://metamask.io';

export class TransactionScanService {
  readonly #securityAlertsApiClient: SecurityAlertsApiClient;

  readonly #logger: ILogger;

  constructor(
    securityAlertsApiClient: SecurityAlertsApiClient,
    logger: ILogger,
  ) {
    this.#securityAlertsApiClient = securityAlertsApiClient;
    this.#logger = logger;
  }

  /**
   * Scans a Tron transaction for security issues.
   *
   * @param params - The parameters for the function.
   * @param params.accountAddress - The address of the account.
   * @param params.from - The from address.
   * @param params.to - The to address.
   * @param params.data - The data of the transaction.
   * @param params.value - The value of the transaction.
   * @param params.origin - The origin of the transaction.
   * @param params.options - The options for the scan (simulation, validation).
   * @returns The result of the scan, or null if the scan failed.
   */
  async scanTransaction({
    accountAddress,
    from,
    to,
    data,
    value,
    origin,
    options = ['simulation', 'validation'],
  }: {
    accountAddress: string;
    from: string;
    to: string;
    data: string;
    value: number;
    origin: string;
    options?: string[] | undefined;
  }): Promise<TransactionScanResult | null> {
    try {
      const result = await this.#securityAlertsApiClient.scanTransaction({
        accountAddress,
        from,
        to,
        data,
        value,
        origin: origin === METAMASK_ORIGIN ? METAMASK_ORIGIN_URL : origin,
        options,
      });

      const scan = this.#mapScan(result);

      if (!scan?.status) {
        this.#logger.warn(
          'Invalid scan result received from security alerts API',
        );
        return null;
      }

      if (!scan?.estimatedChanges?.assets) {
        return scan;
      }

      const updatedScan = { ...scan };

      // Generate SVG images for each asset
      const transactionScanIconPromises = scan.estimatedChanges.assets.map(
        async (asset, index) => {
          const { logo } = asset;

          if (logo) {
            return generateImageComponent(logo, ICON_SIZE, ICON_SIZE)
              .then((image) => {
                if (image && updatedScan?.estimatedChanges?.assets?.[index]) {
                  updatedScan.estimatedChanges.assets[index].imageSvg = image;
                }
                return null;
              })
              .catch(() => {
                return null;
              });
          }

          return undefined;
        },
      );

      await Promise.all(transactionScanIconPromises ?? []);

      return updatedScan;
    } catch (error) {
      this.#logger.error(error);
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
              imageSvg: null,
              assetType: asset.asset_type,
            };
          }) ?? [],
      },
      validation: {
        type: result.validation?.result_type ?? null,
        reason: result.validation?.reason ?? null,
      },
      error:
        status === 'ERROR'
          ? {
              type: 'validation_error',
              code: null,
            }
          : null,
    };
  }
}
