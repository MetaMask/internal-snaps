import { Types } from 'tronweb';

import { TransactionScanService } from './TransactionScanService';
import type { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/structs';
import type { SnapClient } from '../../clients/snap/SnapClient';
import { Network } from '../../constants';
import { mockLogger } from '../../utils/mockLogger';

describe('TransactionScanService', () => {
  const createMockSecurityAlertsApiClient = (
    mockApiResponse: SecurityAlertSimulationValidationResponse,
  ): jest.Mocked<Pick<SecurityAlertsApiClient, 'scanTransaction'>> => ({
    scanTransaction: jest.fn().mockResolvedValue(mockApiResponse),
  });

  const createMockSnapClient = (): jest.Mocked<
    Pick<SnapClient, 'trackSecurityScanCompleted'>
  > => ({
    trackSecurityScanCompleted: jest.fn(),
  });

  const createWellFormedTransactionRawData =
    (): Types.Transaction['raw_data'] => ({
      contract: [
        {
          type: Types.ContractType.TransferContract,
          parameter: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            type_url: 'type.googleapis.com/protocol.TransferContract',
            value: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              owner_address: `41${'a'.repeat(40)}`,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              to_address: `41${'b'.repeat(40)}`,
              amount: 990000,
            },
          },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ref_block_bytes: '0000',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ref_block_hash: '0'.repeat(16),
      expiration: Date.now() + 60000,
      timestamp: Date.now(),
    });

  describe('estimated changes decimal precision', () => {
    it('computes display value from raw_value and decimals', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          account_summary: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            assets_diffs: [
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asset_type: 'NATIVE',
                asset: {
                  type: 'NATIVE',
                  symbol: 'TRX',
                  name: 'Tronix',
                  decimals: 6,
                },
                in: [],
                out: [
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '0.31',
                    summary: '',
                    // Simulates the API returning an imprecise float-to-string value
                    value: '0.98999999999999991',
                    // The raw integer value in smallest unit (sun) is exact
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    raw_value: '990000',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          result_type: 'Benign',
        },
      };

      const mockSecurityAlertsApiClient =
        createMockSecurityAlertsApiClient(mockApiResponse);
      const mockSnapClient = createMockSnapClient();

      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://tronscan.on.btfs.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      expect(result?.estimatedChanges.assets[0]?.value).toBe('0.99');
    });

    it('falls back to "0" value when decimals is missing', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          account_summary: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            assets_diffs: [
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asset_type: 'NATIVE',
                asset: {
                  type: 'NATIVE',
                  symbol: 'TRX',
                  name: 'Tronix',
                  // decimals is missing
                },
                in: [],
                out: [
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '0.31',
                    summary: '',
                    value: '0.99',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    raw_value: '990000',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          result_type: 'Benign',
        },
      };

      const mockSecurityAlertsApiClient =
        createMockSecurityAlertsApiClient(mockApiResponse);
      const mockSnapClient = createMockSnapClient();

      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://tronscan.on.btfs.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      // Falls back to "0" value when decimals is missing
      expect(result?.estimatedChanges.assets[0]?.value).toBe('0');
    });

    it('falls back to "0" value when raw_value is missing', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          account_summary: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            assets_diffs: [
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asset_type: 'NATIVE',
                asset: {
                  type: 'NATIVE',
                  symbol: 'TRX',
                  name: 'Tronix',
                  decimals: 6,
                },
                in: [],
                out: [
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '0.31',
                    summary: '',
                    value: '0.99',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    raw_value: '',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          result_type: 'Benign',
        },
      };

      const mockSecurityAlertsApiClient =
        createMockSecurityAlertsApiClient(mockApiResponse);
      const mockSnapClient = createMockSnapClient();

      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://tronscan.on.btfs.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      expect(result?.estimatedChanges.assets[0]?.value).toBe('0');
    });

    it('handles decimals of 0 correctly (no decimal shift)', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          account_summary: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            assets_diffs: [
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asset_type: 'TRC10',
                asset: {
                  type: 'TRC10',
                  symbol: 'BTT',
                  name: 'BitTorrent',
                  decimals: 0,
                },
                in: [],
                out: [
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '0.001',
                    summary: '',
                    value: '1000',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    raw_value: '1000',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          result_type: 'Benign',
        },
      };

      const mockSecurityAlertsApiClient =
        createMockSecurityAlertsApiClient(mockApiResponse);
      const mockSnapClient = createMockSnapClient();

      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://tronscan.on.btfs.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      // 10^0 = 1, so raw_value / 1 = raw_value unchanged
      expect(result?.estimatedChanges.assets[0]?.value).toBe('1000');
    });

    it('computes precise value for TRC20 tokens with 18 decimals', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          account_summary: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            assets_diffs: [
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asset_type: 'ERC20',
                asset: {
                  type: 'ERC20',
                  symbol: 'WTRX',
                  name: 'Wrapped TRX',
                  decimals: 18,
                },
                in: [
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '0.31',
                    summary: '',
                    value: '1.49999999999999999',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    raw_value: '1500000000000000000',
                  },
                ],
                out: [],
              },
            ],
          },
        },
        validation: {
          status: 'Success',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          result_type: 'Benign',
        },
      };

      const mockSecurityAlertsApiClient =
        createMockSecurityAlertsApiClient(mockApiResponse);
      const mockSnapClient = createMockSnapClient();

      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://tronscan.on.btfs.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      // 18-decimal token: 1500000000000000000 / 10^18 = 1.5 (exact)
      expect(result?.estimatedChanges.assets[0]?.value).toBe('1.5');
      expect(result?.estimatedChanges.assets[0]?.type).toBe('in');
    });
  });
});
