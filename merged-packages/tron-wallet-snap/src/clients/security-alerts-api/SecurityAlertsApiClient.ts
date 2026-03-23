/* eslint-disable @typescript-eslint/naming-convention */

import { assert } from '@metamask/superstruct';
import { Types } from 'tronweb';

import {
  SecurityAlertResponseStruct,
  type SecurityAlertSimulationValidationResponse,
} from './structs';
import { extractScanParametersFromTransactionData } from './utils';
import type { ConfigProvider } from '../../services/config';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import { isTransactionWellFormed } from '../../validation/transaction';

/**
 * Client for interacting with the Security Alerts API for security scanning.
 *
 * @example
 * ```typescript
 * const client = new SecurityAlertsApiClient(configProvider, logger);
 * ```
 */
export class SecurityAlertsApiClient {
  /**
   * Contract types for which the Security Alerts API can produce reliable
   * simulation results.
   */
  static readonly SUPPORTED_CONTRACT_TYPES: Types.ContractType[] = [
    Types.ContractType.TransferContract,
    Types.ContractType.CreateSmartContract,
    Types.ContractType.TriggerSmartContract,
  ];

  /**
   * Checks whether the first contract type in the transaction is supported
   * by the Security Alerts API simulation.
   *
   * @param rawData - The raw transaction data.
   * @returns True if the contract type is supported for simulation.
   */
  static isContractTypeSupported(
    rawData: Types.Transaction['raw_data'],
  ): boolean {
    const [contractInteraction] = rawData.contract;
    if (!contractInteraction) {
      return false;
    }
    return SecurityAlertsApiClient.SUPPORTED_CONTRACT_TYPES.includes(
      contractInteraction.type,
    );
  }

  readonly #fetch: typeof globalThis.fetch;

  readonly #logger: ILogger;

  readonly #baseUrl: string;

  /**
   * Creates a new SecurityAlertsApiClient instance.
   *
   * @param configProvider - The configuration provider.
   * @param logger - Logger instance for logging.
   */
  constructor(configProvider: ConfigProvider, logger: ILogger) {
    this.#fetch = fetch;
    this.#logger = createPrefixedLogger(logger, '[🔒 SecurityAlertsApiClient]');
    this.#baseUrl = configProvider.get().securityAlertsApi.baseUrl;
  }

  /**
   * Scans a Tron transaction using the Security Alerts API.
   *
   * @param params - The parameters for the scan.
   * @param params.accountAddress - The account address in base58 format.
   * @param params.transactionRawData - The raw data of the transaction.
   * @param params.origin - The origin URL of the request.
   * @param params.options - Optional scan options (simulation, validation).
   * @returns The security alert response from Security Alerts API.
   */
  async scanTransaction({
    accountAddress,
    transactionRawData,
    origin,
    options = ['simulation', 'validation'],
  }: {
    accountAddress: string;
    transactionRawData: Types.Transaction['raw_data'];
    origin: string;
    options?: string[];
  }): Promise<SecurityAlertSimulationValidationResponse> {
    this.#logger.info('Scanning Tron transaction with Security Alerts API');

    if (
      !isTransactionWellFormed(transactionRawData) ||
      !SecurityAlertsApiClient.isContractTypeSupported(transactionRawData)
    ) {
      throw new Error('Transaction is not supported for scanning.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      accept: 'application/json',
    };

    const scanParameters =
      extractScanParametersFromTransactionData(transactionRawData);

    if (!scanParameters) {
      throw new Error('Could not extract scan parameters from transaction.');
    }

    const response = await this.#fetch(
      `${this.#baseUrl}/tron/transaction/scan`,
      {
        headers,
        method: 'POST',
        body: JSON.stringify({
          account_address: accountAddress,
          metadata: {
            domain: origin,
          },
          data: scanParameters,
          options,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      this.#logger.error(
        `Security Alerts API error: ${response.status} - ${errorBody}`,
      );
      throw new Error(
        `Security Alerts API error: ${response.status} - ${errorBody}`,
      );
    }

    const data = await response.json();
    assert(data, SecurityAlertResponseStruct);

    return data;
  }
}
