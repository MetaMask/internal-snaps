import type {
  AnalyticsService,
  ExtendedKeyringAccount,
  Logger,
  SecurityAlertsApiClient,
  SecurityAlertsScanOption,
} from '@metamask/snap-networks-utils';
import {
  DEFAULT_METAMASK_ORIGIN,
  normalizeScanOrigin,
  SecurityAlertResponse,
  SecurityAlertsScanStatus,
} from '@metamask/snap-networks-utils';
import { assert } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';
import type { Types as TronwebTypes } from 'tronweb';

import type {
  AssetChange,
  AssetDiff,
  SecurityAlertSimulationValidationResponse,
  TronScanRequestBody,
} from '../../clients/security-alerts-api/structs';
import {
  SecurityAlertResponseStruct,
  SecurityAlertRequestStruct,
} from '../../clients/security-alerts-api/structs';
import {
  extractScanParametersFromTransactionData,
  isContractTypeSupported,
} from '../../clients/security-alerts-api/utils';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { Network } from '../../constants';
import { isTransactionWellFormed } from '../../validation/transaction';
import type {
  TransactionScanAssetChange,
  TransactionScanError,
  TransactionScanResult,
  TransactionScanValidation,
} from './types';
import { SimulationStatus } from './types';

export class TransactionScanService {
  readonly #securityAlertsHttpClient: SecurityAlertsApiClient;

  readonly #snapClient: SnapClient;

  readonly #logger: Logger;

  readonly #analyticsService: AnalyticsService;

  constructor(
    securityAlertsHttpClient: SecurityAlertsApiClient,
    snapClient: SnapClient,
    logger: Logger,
    analyticsService: AnalyticsService,
  ) {
    this.#securityAlertsHttpClient = securityAlertsHttpClient;
    this.#snapClient = snapClient;
    this.#logger = logger;
    this.#analyticsService = analyticsService;
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
    transactionRawData: TronwebTypes.Transaction['raw_data'];
    origin: string;
    scope: Network;
    options?: SecurityAlertsScanOption[] | undefined;
    account?: ExtendedKeyringAccount;
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

    if (!isContractTypeSupported(transactionRawData)) {
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
      this.#logger.info('Scanning Tron transaction with Security Alerts API');

      const scanParameters =
        extractScanParametersFromTransactionData(transactionRawData);

      const requestBody = {
        account_address: accountAddress,
        metadata:
          origin === DEFAULT_METAMASK_ORIGIN
            ? { non_dapp: true }
            : { domain: normalizeScanOrigin(origin) },
        data: scanParameters,
        options,
      } satisfies TronScanRequestBody;

      assert(requestBody, SecurityAlertRequestStruct, 'Tron scan request body');

      const result =
        await this.#securityAlertsHttpClient.scanTransaction(requestBody);

      assert(result, SecurityAlertResponseStruct, 'Tron scan response body');

      const scan = this.#mapScan(result);

      const securityAlert =
        scan.validation?.type &&
        scan.validation.type !== SecurityAlertResponse.Benign &&
        scan.validation.type !== SecurityAlertResponse.Error
          ? scan.validation.type
          : null;

      if (!account) {
        return scan;
      }

      await this.#analyticsService.trackSecurityScanCompleted({
        origin,
        accountType: account.type,
        chainIdCaip: scope,
        scanStatus: scan.status,
        hasSecurityAlerts: Boolean(securityAlert),
      });

      if (!securityAlert) {
        return scan;
      }

      await this.#analyticsService.trackSecurityAlertDetected({
        origin,
        accountType: account.type,
        chainIdCaip: scope,
        securityAlertResponse: securityAlert,
        securityAlertReason: scan.validation.reason ?? null,
        securityAlertDescription: this.getSecurityAlertDescription(
          scan.validation,
        ),
      });

      return scan;
    } catch (error) {
      await this.#snapClient.trackError(error as Error);
      this.#logger.error(error);

      // Track error if account is provided
      if (account) {
        await this.#analyticsService.trackSecurityScanCompleted({
          origin,
          accountType: account.type,
          chainIdCaip: scope,
          scanStatus: SecurityAlertsScanStatus.ERROR,
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
  ): TransactionScanResult {
    const status = this.#resolveStatus(result);

    return {
      status,
      estimatedChanges: {
        assets: this.#mapAssetDiffs(
          result.simulation?.account_summary?.assets_diffs,
        ),
      },
      validation: {
        type: result.validation?.result_type ?? null,
        reason: result.validation?.reason ?? null,
      },
      error: this.#mapSimulationError(result.simulation),
      simulationStatus:
        status === 'ERROR'
          ? SimulationStatus.Failed
          : SimulationStatus.Completed,
    };
  }

  /**
   * Resolves the scan status from the API simulation status. Validation
   * failures are not reflected here: per the Blockaid schema the validation
   * `status` is always 'Success' (even in the validation-error variant),
   * and a failed validation is surfaced through `result_type` instead.
   *
   * @param result - The raw API response.
   * @returns The resolved scan status.
   */
  #resolveStatus(
    result: SecurityAlertSimulationValidationResponse,
  ): TransactionScanResult['status'] {
    return result.simulation?.status === 'Error' ||
      result.validation?.result_type === 'Error'
      ? 'ERROR'
      : 'SUCCESS';
  }

  /**
   * Maps raw asset diffs from the API into internal asset change representations.
   *
   * @param assetDiffs - The raw asset diffs from the simulation.
   * @returns The mapped asset changes.
   */
  #mapAssetDiffs(
    assetDiffs: AssetDiff[] | undefined,
  ): TransactionScanAssetChange[] {
    if (!assetDiffs) {
      return [];
    }

    return assetDiffs.flatMap((asset) => {
      const change = asset.in?.[0] ?? asset.out?.[0];

      return change && this.#isDisplayableChange(change)
        ? [this.#mapAssetDiff(asset, change)]
        : [];
    });
  }

  /**
   * Checks whether an asset change is displayable (value or token_id).
   *
   * @param change - The asset change to check.
   * @returns True if the asset change is displayable.
   */
  #isDisplayableChange(change: AssetChange): boolean {
    // NFT types (ERC721/ERC1155) use token_id instead of value
    return 'token_id' in change || change.value !== undefined;
  }

  /**
   * Maps a single asset diff to our internal asset change format.
   *
   * @param asset - The asset diff to map.
   * @param change - The first change of the diff, as picked by
   * {@link #mapAssetDiffs}.
   * @returns The mapped asset change.
   */
  #mapAssetDiff(
    asset: AssetDiff,
    change: AssetChange,
  ): TransactionScanAssetChange {
    return {
      type: asset.in?.[0] ? ('in' as const) : ('out' as const),
      symbol: asset.asset.symbol ?? asset.asset_type,
      name: asset.asset.name ?? asset.asset_type,
      logo: asset.asset.logo_url ?? null,
      value: this.#computeDisplayValue(change, asset.asset.decimals),
      price: change.usd_price ?? null,
      assetType: asset.asset_type,
    };
  }

  /**
   * Computes the human-readable display value for an asset change.
   * Handles NFT types (ERC721/ERC1155) and fungible tokens differently.
   *
   * @param change - The asset change from the API.
   * @param decimals - The token decimals (for fungible tokens).
   * @returns The display value string.
   */
  #computeDisplayValue(
    change: AssetChange,
    decimals: number | undefined,
  ): string {
    if ('token_id' in change) {
      // NFT assets (ERC721): each token is a single unit
      // ERC1155: use the value field if present
      return 'value' in change && typeof change.value === 'string'
        ? change.value
        : '1';
    }

    if (change.raw_value && decimals !== undefined) {
      return new BigNumber(change.raw_value)
        .dividedBy(new BigNumber(10).pow(decimals))
        .toFixed();
    }

    return '0';
  }

  /**
   * Maps simulation error information from the API response.
   *
   * @param simulation - The simulation result from the API.
   * @returns The mapped error, or null if no error.
   */
  #mapSimulationError(
    simulation: SecurityAlertSimulationValidationResponse['simulation'],
  ): TransactionScanError | null {
    if (!simulation) {
      return null;
    }

    if (!simulation.error && !simulation.error_details) {
      return null;
    }

    return {
      type: null,
      code: simulation.error_details?.code ?? null,
      message: simulation.error ?? null,
    };
  }
}
