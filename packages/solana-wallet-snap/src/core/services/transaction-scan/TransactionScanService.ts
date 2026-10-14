import type {
  AnalyticsService,
  ExtendedKeyringAccount,
  Logger,
  SecurityAlertsApiClient,
  SecurityAlertsScanOption,
} from '@metamask/snap-networks-utils';
import {
  normalizeScanOrigin,
  SecurityAlertResponse,
  SecurityAlertsScanStatus,
} from '@metamask/snap-networks-utils';
import { assert } from '@metamask/superstruct';
import bs58 from 'bs58';

import {
  SecurityAlertResponseStruct,
  SecurityAlertRequestStruct,
} from '../../clients/security-alerts-api/structs';
import type {
  SecurityAlertSimulationValidationResponse,
  SolanaScanRequestBody,
} from '../../clients/security-alerts-api/structs';
import { Network } from '../../constants/solana';
import { trackError } from '../../utils/errors';
import type { TransactionScanResult, TransactionScanValidation } from './types';

/**
 * The Security Alerts API chain identifier for each Solana scope.
 */
const SCOPE_TO_CHAIN: Record<Network, SolanaScanRequestBody['chain']> = {
  [Network.Mainnet]: 'mainnet',
  [Network.Devnet]: 'devnet',
  [Network.Testnet]: 'testnet',
  [Network.Localnet]: 'localnet',
};

export class TransactionScanService {
  readonly #securityAlertsApiClient: SecurityAlertsApiClient;

  readonly #logger: Logger;

  readonly #analyticsService: AnalyticsService;

  constructor(
    securityAlertsApiClient: SecurityAlertsApiClient,
    analyticsService: AnalyticsService,
    logger: Logger,
  ) {
    this.#securityAlertsApiClient = securityAlertsApiClient;
    this.#analyticsService = analyticsService;
    this.#logger = logger;
  }

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
        metadata: {
          url: normalizeScanOrigin(origin),
        },
        chain: SCOPE_TO_CHAIN[scope],
        transactions: [transaction],
        options,
      } satisfies SolanaScanRequestBody;

      assert(
        requestBody,
        SecurityAlertRequestStruct,
        'Solana scan request body',
      );

      this.#logger.info('Scanning transaction');

      const result =
        await this.#securityAlertsApiClient.scanTransaction(requestBody);

      assert(result, SecurityAlertResponseStruct, 'Solana scan response body');

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
        securityAlertDescription: this.#getSecurityAlertDescription(
          scan.validation,
        ),
      });

      // Logo URLs are passed directly to Image component - no conversion needed
      return scan;
    } catch (error) {
      await trackError(error);
      this.#logger.error(error);

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

  #getSecurityAlertDescription(validation: TransactionScanValidation): string {
    if (!validation?.reason) {
      return 'Security alert: Unknown reason';
    }

    // Reference: https://docs.blockaid.io/reference/response-reference-solana
    const reasonDescriptions: Record<string, string> = {
      unfair_trade:
        "Unfair trade of assets, without adequate compensation to the owner's account",
      transfer_farming:
        "Substantial transfer of the account's assets to untrusted entities",
      writable_accounts_farming:
        'Transaction exposes unused writable account, can be utilized in BIT-FLIP attacks patterns',
      native_ownership_change:
        'The account transferred ownership of its native SOL to untrusted entities',
      spl_token_ownership_change:
        'The account transferred ownership of its SPL tokens to untrusted entities',
      exposure_farming:
        'The account delegates ownership, thereby exposing its assets to untrusted spenders',
      known_attacker:
        "A known attacker's account is involved in the transaction",
      invalid_signature:
        'One of the transactions provided contains non valid signatures, that can lead misleading simulation results',
      honeypot:
        'The account invests funds in a token that is part of an orchestrated honeypot scheme',
      other:
        'The transaction was marked as malicious for other reason, further details would be described in features field',
    };

    return (
      reasonDescriptions[validation.reason] ??
      `Security alert: ${validation.reason}`
    );
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
