import type {
  AnalyticsService,
  Logger,
  SecurityAlertsApiClient,
  TrackErrorFn,
} from '@metamask/snap-networks-utils';
import {
  SecurityAlertResponse,
  SecurityAlertsScanStatus,
} from '@metamask/snap-networks-utils';
import bs58 from 'bs58';

import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/structs';
import { Network } from '../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import { TransactionScanService } from './TransactionScanService';
import type { TransactionScanError, TransactionScanStatus } from './types';

describe('TransactionScan', () => {
  let transactionScanService: TransactionScanService;
  let mockSecurityAlertsApiClient: SecurityAlertsApiClient;
  let mockLogger: Logger;
  let mockAnalyticsService: AnalyticsService;
  let mockTrackError: TrackErrorFn;

  beforeEach(() => {
    mockSecurityAlertsApiClient = {
      scanTransaction: vi.fn().mockResolvedValue({}),
    } as unknown as SecurityAlertsApiClient;

    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      withPrefix: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockAnalyticsService = {
      trackSecurityScanCompleted: vi.fn().mockResolvedValue(undefined),
      trackSecurityAlertDetected: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnalyticsService;

    mockTrackError = vi.fn();

    transactionScanService = new TransactionScanService({
      securityAlertsApiClient: mockSecurityAlertsApiClient,
      analyticsService: mockAnalyticsService,
      logger: mockLogger,
      trackError: mockTrackError,
    });
  });

  describe('scanTransaction', () => {
    it.each<{
      name: string;
      response: SecurityAlertSimulationValidationResponse;
      options: ('simulation' | 'validation')[];
      status: TransactionScanStatus;
      error: TransactionScanError | null;
      validationError?: TransactionScanError | null;
      estimatedChanges?: unknown;
    }>([
      {
        name: 'an API error classified as an execution failure',
        estimatedChanges: null,
        response: {
          status: 'ERROR',
          error_details: { type: 'ApiError', message: 'Unavailable' },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'simulation',
          code: null,
          message: 'Unavailable',
        },
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'an overall error with a verdict and no error details',
        response: {
          status: 'ERROR',
          error: 'Request timed out',
          result: {
            simulation: {},
            validation: { result_type: 'Benign' },
          },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: null,
        validationError: {
          type: 'response',
          code: null,
          message: 'Request timed out',
        },
      },
      {
        name: 'an overall error without execution details',
        estimatedChanges: null,
        response: { status: 'ERROR' },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
        validationError: { type: 'response', code: null, message: null },
      },
      {
        name: 'a validation error with a successful simulation',
        response: {
          status: 'SUCCESS',
          result: { simulation: {}, validation: { result_type: 'Error' } },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: null,
        validationError: { type: 'validation', code: null, message: null },
      },
      {
        name: 'no requested results',
        estimatedChanges: null,
        response: {
          status: 'SUCCESS',
          result: { simulation: null, validation: null },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'a missing result object',
        estimatedChanges: null,
        response: { status: 'SUCCESS' },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'a present validation section without a verdict',
        response: { status: 'SUCCESS', result: { validation: {} } },
        options: ['validation'],
        status: 'ERROR',
        error: null,
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'simulation only when requested',
        response: {
          status: 'SUCCESS',
          result: { simulation: {}, validation: null },
        },
        options: ['simulation'],
        status: 'SUCCESS',
        error: null,
      },
      {
        name: 'validation only when requested',
        response: {
          status: 'SUCCESS',
          result: { simulation: null, validation: { result_type: 'Benign' } },
        },
        options: ['validation'],
        status: 'SUCCESS',
        error: null,
      },
      {
        name: 'a missing verdict next to a successful simulation',
        response: {
          status: 'SUCCESS',
          result: { simulation: {}, validation: null },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: null,
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'a security verdict without requested simulation estimates',
        response: {
          status: 'SUCCESS',
          result: { simulation: null, validation: { result_type: 'Benign' } },
        },
        options: ['simulation', 'validation'],
        status: 'SUCCESS',
        estimatedChanges: null,
        error: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'a missing simulation when only simulation was requested',
        estimatedChanges: null,
        response: {
          status: 'SUCCESS',
          result: { simulation: null, validation: null },
        },
        options: ['simulation'],
        status: 'SUCCESS',
        error: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
        validationError: null,
      },
      {
        name: 'an unrequested result with the requested result missing',
        response: {
          status: 'SUCCESS',
          result: { simulation: {}, validation: null },
        },
        options: ['validation'],
        status: 'ERROR',
        error: null,
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'a transaction error with a null code',
        estimatedChanges: null,
        response: {
          status: 'ERROR',
          error_details: {
            type: 'TransactionError',
            message: 'Insufficient funds',
            transaction_index: 0,
            code: null,
          },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'simulation',
          code: null,
          message: 'Insufficient funds',
        },
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'an execution failure',
        estimatedChanges: null,
        response: {
          status: 'ERROR',
          error_details: {
            type: 'TransactionError',
            message: 'Insufficient funds',
            transaction_index: 0,
            code: 'ResultWithNegativeLamports',
          },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'simulation',
          code: 'ResultWithNegativeLamports',
          message: 'Insufficient funds',
        },
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
      {
        name: 'an execution failure with a successful security verdict',
        response: {
          status: 'ERROR',
          error_details: {
            type: 'TransactionError',
            message: 'Insufficient funds',
            transaction_index: 0,
            code: 'ResultWithNegativeLamports',
          },
          result: {
            simulation: {},
            validation: { result_type: 'Benign' },
          },
        },
        options: ['simulation', 'validation'],
        status: 'SUCCESS',
        error: {
          type: 'simulation',
          code: 'ResultWithNegativeLamports',
          message: 'Insufficient funds',
        },
        validationError: null,
        estimatedChanges: null,
      },
      {
        name: 'an instruction failure',
        estimatedChanges: null,
        response: {
          status: 'ERROR',
          error_details: {
            type: 'InstructionError',
            message: 'Failed instruction',
            transaction_index: 0,
            instruction_index: 0,
            program_account: null,
          },
        },
        options: ['simulation', 'validation'],
        status: 'ERROR',
        error: {
          type: 'simulation',
          code: null,
          message: 'Failed instruction',
        },
        validationError: {
          type: 'response',
          code: 'empty',
          message: 'No scan results returned',
        },
      },
    ])(
      'classifies $name independently of transaction validity',
      async ({
        response,
        options,
        status,
        error,
        validationError = null,
        estimatedChanges = expect.objectContaining({
          assets: expect.any(Array),
        }),
      }) => {
        vi.mocked(
          mockSecurityAlertsApiClient.scanTransaction,
        ).mockResolvedValue(response);

        const scan = await transactionScanService.scanTransaction({
          method: 'signAndSendTransaction',
          accountAddress: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
          transaction: 'transaction',
          scope: Network.Mainnet,
          origin: 'metamask',
          options,
        });

        expect(scan).toMatchObject({
          status,
          error,
          validationError,
        });
        expect(scan).not.toHaveProperty('unavailable');
        expect(scan?.estimatedChanges).toStrictEqual(estimatedChanges);
      },
    );

    it('keeps simulated asset changes when only the security verdict fails', async () => {
      vi.mocked(mockSecurityAlertsApiClient.scanTransaction).mockResolvedValue({
        status: 'SUCCESS',
        result: {
          simulation: {
            account_summary: {
              account_assets_diff: [
                {
                  asset_type: 'NativeToken',
                  asset: { type: 'NativeToken', decimals: 9, logo: null },
                  in: { usd_price: 10, summary: null, value: 1, raw_value: 1 },
                  out: null,
                },
              ],
            },
          },
          validation: {
            result_type: 'Error',
            reason: 'Validation unavailable',
          },
        },
      });

      const scan = await transactionScanService.scanTransaction({
        method: 'signAndSendTransaction',
        accountAddress: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'metamask',
        options: ['simulation', 'validation'],
      });

      expect(scan).toMatchObject({
        status: 'ERROR',
        validationError: { type: 'validation' },
        estimatedChanges: {
          assets: [expect.objectContaining({ type: 'in', value: 1 })],
        },
      });
    });

    it('keeps the shared estimates container when only validation was requested', async () => {
      vi.mocked(mockSecurityAlertsApiClient.scanTransaction).mockResolvedValue({
        status: 'SUCCESS',
        result: { simulation: null, validation: { result_type: 'Benign' } },
      });

      const result = await transactionScanService.scanTransaction({
        method: 'signAndSendTransaction',
        accountAddress: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'metamask',
        options: ['validation'],
      });

      expect(result).not.toBeNull();
      expect(result?.estimatedChanges).toStrictEqual({ assets: [] });
      expect(Object.keys(result as object).sort()).toStrictEqual([
        'error',
        'estimatedChanges',
        'status',
        'validation',
        'validationError',
      ]);
    });

    it('scans a transaction', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
        status: 'SUCCESS',
        result: { simulation: {}, validation: { result_type: 'Benign' } },
      });

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

    it('preserves a failed security verdict alongside the classified simulation error', async () => {
      vi.mocked(mockSecurityAlertsApiClient.scanTransaction).mockResolvedValue({
        status: 'ERROR',
        result: {
          validation: {
            result_type: 'Error',
            reason: 'Validation unavailable',
            description: 'The validation service is unavailable',
          },
        },
        error_details: {
          type: 'TransactionError',
          message: 'Insufficient funds',
          transaction_index: 0,
          code: 'ResultWithNegativeLamports',
        },
      });

      const result = await transactionScanService.scanTransaction({
        method: 'signAndSendTransaction',
        accountAddress: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'metamask',
      });

      expect(result).toMatchObject({
        error: {
          type: 'simulation',
          code: 'ResultWithNegativeLamports',
          message: 'Insufficient funds',
        },
        validationError: {
          type: 'validation',
          code: 'Validation unavailable',
          message: 'The validation service is unavailable',
        },
        validation: { type: 'Error', reason: 'Validation unavailable' },
      });
    });

    it('returns null if the scan fails', async () => {
      const error = new Error('Scan failed');
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockRejectedValue(error);

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(result).toBeNull();
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('posts the scan body extracted from the transaction', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
        status: 'SUCCESS',
      });

      await transactionScanService.scanTransaction({
        method: 'signAndSendTransaction',
        accountAddress: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://example.com',
        options: ['validation'],
      });

      expect(mockSecurityAlertsApiClient.scanTransaction).toHaveBeenCalledWith({
        method: 'signAndSendTransaction',
        encoding: 'base64',
        account_address: Buffer.from(
          bs58.decode(MOCK_SOLANA_KEYRING_ACCOUNT_0.address),
        ).toString('base64'),
        metadata: { url: 'https://example.com' },
        chain: 'mainnet',
        transactions: ['transaction'],
        options: ['validation'],
      });
    });

    it('sends a non-dApp marker for the MetaMask origin', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
        status: 'SUCCESS',
      });

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'metamask',
      });

      expect(mockSecurityAlertsApiClient.scanTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { url: null, non_dapp: true },
        }),
      );
    });

    it('tracks an error scan when the API returns an invalid result and account is provided', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue(null);

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: mockAccount,
      });

      expect(result).toBeNull();
      // The response struct assert rejects `null` before mapping, so the
      // failure flows through the tracked error path.
      expect(mockTrackError).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
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

    it('reports unrecognized security alert types as-is', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

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
        securityAlertResponse: 'Unexpected',
        securityAlertReason: 'other',
        securityAlertDescription:
          'Security alert: The transaction was marked as malicious for other reason, further details would be described in features field',
      });
    });

    it('hides asset diffs when the simulation failed', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(result).toMatchObject({
        status: SecurityAlertsScanStatus.SUCCESS,
        estimatedChanges: null,
        error: {
          type: 'simulation',
          code: '0x1',
          message: 'failed',
        },
      });
    });

    it('maps asset diffs when the simulation succeeded', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
                {
                  asset_type: 'TOKEN',
                  asset: {
                    type: 'TOKEN',
                    address: 'mint-2',
                    decimals: 6,
                    logo: null,
                  },
                  in: null,
                  out: null,
                },
              ],
              account_delegations: [],
              account_ownerships_diff: [],
              total_usd_diff: { in: 0, out: 0, total: 0 },
            },
          },
        },
      });

      const result = await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(result).toMatchObject({
        status: SecurityAlertsScanStatus.SUCCESS,
        error: null,
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
            {
              type: 'out',
              symbol: 'TOKEN',
              name: 'TOKEN',
              logo: null,
              value: null,
              price: null,
            },
          ],
        },
      });
    });

    it('tracks security scan completion when account is provided', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

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

    it('does not track a security scan when only simulation was requested', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
        status: SecurityAlertsScanStatus.SUCCESS,
        encoding: 'base58',
        error: null,
        error_details: null,
        request_id: 'test-request-id',
        result: {
          simulation: {
            account_summary: {
              account_assets_diff: [],
              account_delegations: [],
              account_ownerships_diff: [],
              total_usd_diff: { in: 0, out: 0, total: 0 },
            },
          },
        },
      });

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: MOCK_SOLANA_KEYRING_ACCOUNT_0,
        options: ['simulation'],
      });

      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).not.toHaveBeenCalled();
    });

    it('does not track a failed security scan when only simulation was requested', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockRejectedValue(new Error('network error'));

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
        account: MOCK_SOLANA_KEYRING_ACCOUNT_0,
        options: ['simulation'],
      });

      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).not.toHaveBeenCalled();
    });

    it('does not track analytics without an account', async () => {
      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
        status: SecurityAlertsScanStatus.SUCCESS,
        result: {
          validation: {
            result_type: SecurityAlertResponse.Benign,
            reason: null,
            features: [],
          },
        },
      });

      await transactionScanService.scanTransaction({
        method: 'method',
        accountAddress: 'accountAddress',
        transaction: 'transaction',
        scope: Network.Mainnet,
        origin: 'https://metamask.io',
      });

      expect(
        mockAnalyticsService.trackSecurityScanCompleted,
      ).not.toHaveBeenCalled();
      expect(
        mockAnalyticsService.trackSecurityAlertDetected,
      ).not.toHaveBeenCalled();
    });

    it('tracks security alert when malicious transaction is detected', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

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
          "Security alert: Substantial transfer of the account's assets to untrusted entities",
      });
    });

    it('tracks error when scan fails and account is provided', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockRejectedValue(new Error('Scan failed'));

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

  describe('security alert description', () => {
    it('returns correct description for known reasons', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

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
          "Security alert: Substantial transfer of the account's assets to untrusted entities",
      });
    });

    it('returns fallback description for unknown reasons', async () => {
      const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

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

      vi.spyOn(
        mockSecurityAlertsApiClient,
        'scanTransaction',
      ).mockResolvedValue({
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
      });

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
        securityAlertReason: null,
        securityAlertDescription: 'Security alert: Unknown reason',
      });
    });
  });
});
