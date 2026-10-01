import type {
  AnalyticsService,
  Logger,
  SecurityAlertsApiClient,
} from '@metamask/snap-networks-utils';
import {
  SecurityAlertResponse,
  SecurityAlertsScanStatus,
} from '@metamask/snap-networks-utils';
import bs58 from 'bs58';

import { SecurityAlertResponseStruct } from '../../clients/security-alerts-api/structs';
import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/structs';
import { Network } from '../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import { trackError } from '../../utils/errors';
import { TransactionScanService } from './TransactionScan';

jest.mock('../../utils/errors', () => ({
  trackError: jest.fn().mockResolvedValue('tracked-error-id'),
}));

describe('TransactionScan', () => {
  let transactionScanService: TransactionScanService;
  let mockSecurityAlertsApiClient: SecurityAlertsApiClient;
  let mockLogger: Logger;
  let mockAnalyticsService: AnalyticsService;

  beforeEach(() => {
    mockSecurityAlertsApiClient = {
      scanTransaction: jest.fn().mockResolvedValue({}),
    } as unknown as SecurityAlertsApiClient;

    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      withPrefix: jest.fn().mockReturnThis(),
    } as unknown as Logger;

    mockAnalyticsService = {
      trackSecurityScanCompleted: jest.fn().mockResolvedValue(undefined),
      trackSecurityAlertDetected: jest.fn().mockResolvedValue(undefined),
    } as unknown as AnalyticsService;

    transactionScanService = new TransactionScanService(
      mockSecurityAlertsApiClient,
      mockAnalyticsService,
      mockLogger,
    );
  });

  describe('scanTransaction', () => {
    it('scans a transaction', async () => {
      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: 'SUCCESS',
        } as SecurityAlertSimulationValidationResponse);

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(result).toMatchObject({
        status: 'SUCCESS',
      });
    });

    it('returns null if the scan fails', async () => {
      const error = new Error('Scan failed');
      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockRejectedValue(error);

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(result).toBeNull();
      expect(trackError).toHaveBeenCalledWith(error);
    });

    it('posts the scan body extracted from the transaction', async () => {
      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: 'SUCCESS',
        } as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'signAndSendTransaction',
        accountAddress: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://example.com',
        options: ['validation'],
      });

      expect(mockSecurityAlertsApiClient.scanTransaction).toHaveBeenCalledWith(
        {
          method: 'signAndSendTransaction',
          encoding: 'base64',
          account_address: Buffer.from(
            bs58.decode(MOCK_SOLANA_KEYRING_ACCOUNT_0.address),
          ).toString('base64'),
          metadata: { url: 'https://example.com' },
          chain: 'mainnet',
          transactions: ['transaction'],
          options: ['validation'],
        },
        SecurityAlertResponseStruct,
      );
    });

    it('rewrites the MetaMask origin before scanning', async () => {
      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: 'SUCCESS',
        } as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'metamask',
      });

      expect(mockSecurityAlertsApiClient.scanTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { url: 'https://metamask.io' },
        }),
        SecurityAlertResponseStruct,
      );
    });

    it('tracks an error scan when the API returns an invalid result and account is provided', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue(
          null as unknown as SecurityAlertSimulationValidationResponse,
        );

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: SecurityAlertsScanStatus.ERROR,
        hasSecurityAlerts: false,
      });
    });

    it('treats unknown security alert types as warnings', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.SUCCESS,
          encoding: 'base58',
          error: null,
          error_details: null,
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: 'Unexpected',
              reason: 'other',
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(
        mockAnalyticsService.trackSecurityAlertDetected,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        securityAlertResponse: SecurityAlertResponse.Warning,
        securityAlertReason: 'other',
        securityAlertDescription:
          'The transaction was marked as malicious for other reason, further details would be described in features field',
      });
    });

    it('maps asset diffs and error details', async () => {
      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.ERROR,
          encoding: 'base58',
          error: 'failed',
          error_details: {
            type: 'TransactionError',
            message: 'failed',
            code: '0x1',
            transaction_index: 0,
          },
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: SecurityAlertResponse.Benign,
              reason: '',
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [
                  {
                    asset_type: 'NativeToken',
                    asset: {
                      type: 'NativeToken',
                      decimals: 9,
                      logo: null,
                    },
                    in: {
                      usd_price: 10,
                      summary: null,
                      value: 1,
                      raw_value: 1,
                    },
                    out: null,
                  },
                  {
                    asset_type: 'TOKEN',
                    asset: {
                      type: 'TOKEN',
                      address: 'mint',
                      symbol: 'USDC',
                      name: 'USD Coin',
                      logo: 'https://example.com/usdc.png',
                      decimals: 6,
                    },
                    in: null,
                    out: {
                      usd_price: 20,
                      summary: null,
                      value: 2,
                      raw_value: 2,
                    },
                  },
                ],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(result).toMatchObject({
        status: SecurityAlertsScanStatus.ERROR,
        estimatedChanges: {
          assets: [
            {
              type: 'in',
              symbol: 'NativeToken',
              name: 'NativeToken',
              logo: null,
              value: 1,
              price: 10,
            },
            {
              type: 'out',
              symbol: 'USDC',
              name: 'USD Coin',
              logo: 'https://example.com/usdc.png',
              value: 2,
              price: 20,
            },
          ],
        },
        error: {
          type: 'TransactionError',
          code: '0x1',
        },
      });
    });

    it('tracks security scan completion when account is provided', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.SUCCESS,
          encoding: 'base58',
          error: null,
          error_details: null,
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: SecurityAlertResponse.Benign,
              reason: '',
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      // hasSecurityAlerts = false for Benign response
      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: SecurityAlertsScanStatus.SUCCESS,
        hasSecurityAlerts: false,
      });
    });

    it('tracks security alert when malicious transaction is detected', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.SUCCESS,
          encoding: 'base58',
          error: null,
          error_details: null,
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: SecurityAlertResponse.Warning,
              reason: 'transfer_farming',
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      // hasSecurityAlerts = true for Warning response
      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: SecurityAlertsScanStatus.SUCCESS,
        hasSecurityAlerts: true,
      });

      expect(
        mockAnalyticsService.trackSecurityAlertDetected,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        securityAlertResponse: SecurityAlertResponse.Warning,
        securityAlertReason: 'transfer_farming',
        securityAlertDescription:
          "Substantial transfer of the account's assets to untrusted entities",
      });
    });

    it('tracks error when scan fails and account is provided', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockRejectedValue(new Error('Scan failed'));

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: SecurityAlertsScanStatus.ERROR,
        hasSecurityAlerts: false,
      });
    });
  });

  describe('getSecurityAlertDescription', () => {
    it('returns correct description for known reasons', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.SUCCESS,
          encoding: 'base58',
          error: null,
          error_details: null,
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: SecurityAlertResponse.Warning,
              reason: 'transfer_farming',
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(
        mockAnalyticsService.trackSecurityAlertDetected,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        securityAlertResponse: SecurityAlertResponse.Warning,
        securityAlertReason: 'transfer_farming',
        securityAlertDescription:
          "Substantial transfer of the account's assets to untrusted entities",
      });
    });

    it('returns fallback description for unknown reasons', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.SUCCESS,
          encoding: 'base58',
          error: null,
          error_details: null,
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: SecurityAlertResponse.Warning,
              reason: 'unknown_reason',
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(
        mockAnalyticsService.trackSecurityAlertDetected,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        securityAlertResponse: SecurityAlertResponse.Warning,
        securityAlertReason: 'unknown_reason',
        securityAlertDescription: 'Security alert: unknown_reason',
      });
    });

    it('returns fallback description when reason is missing', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      jest
        .spyOn(mockSecurityAlertsApiClient, 'scanTransaction')
        .mockResolvedValue({
          status: SecurityAlertsScanStatus.SUCCESS,
          encoding: 'base58',
          error: null,
          error_details: null,
          request_id: 'test-request-id',
          result: {
            validation: {
              result_type: SecurityAlertResponse.Malicious,
              reason: null,
              features: [],
            },
            simulation: {
              account_summary: {
                account_assets_diff: [],
                account_delegations: [],
                account_ownerships_diff: [],
                total_usd_diff: { in: 0, out: 0, total: 0 },
              },
            },
          },
        } as unknown as SecurityAlertSimulationValidationResponse);

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(
        mockAnalyticsService.trackSecurityAlertDetected,
      ).toHaveBeenCalledWith({
        origin: 'https://metamask.io',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        securityAlertResponse: SecurityAlertResponse.Malicious,
        securityAlertReason: 'unknown',
        securityAlertDescription: 'Security alert: Unknown reason',
      });
    });
  });
});
