import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { Types as TronwebTypes } from 'tronweb';

import { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/structs';
import type { SnapClient } from '../../clients/snap/SnapClient';
import { Network } from '../../constants';
import { analyticsService } from '../../utils/analytics';
import { mockLogger } from '../../utils/mockLogger';
import { TransactionScanService } from './TransactionScanService';
import type { TransactionScanResult } from './types';
import { ScanStatus, SecurityAlertResponse, SimulationStatus } from './types';

describe('TransactionScanService', () => {
  const mockAccount: ExtendedKeyringAccount = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
    type: 'tron:eoa',
    options: {},
    methods: [],
    scopes: [Network.Mainnet],
    entropySource: 'test-entropy',
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  const createMockSecurityAlertsApiClient = (
    mockApiResponse: SecurityAlertSimulationValidationResponse,
  ): jest.Mocked<Pick<SecurityAlertsApiClient, 'scanTransaction'>> => ({
    scanTransaction: jest.fn().mockResolvedValue(mockApiResponse),
  });

  const createMockSnapClient = (): jest.Mocked<
    Pick<SnapClient, 'trackError'>
  > => ({
    trackError: jest.fn(),
  });

  const createWellFormedTransactionRawData =
    (): TronwebTypes.Transaction['raw_data'] => ({
      contract: [
        {
          type: TronwebTypes.ContractType.TransferContract,
          parameter: {
            type_url: 'type.googleapis.com/protocol.TransferContract',
            value: {
              owner_address: `41${'a'.repeat(40)}`,

              to_address: `41${'b'.repeat(40)}`,
              amount: 990000,
            },
          },
        },
      ],

      ref_block_bytes: '0000',

      ref_block_hash: '0'.repeat(16),
      expiration: Date.now() + 60000,
      timestamp: Date.now(),
    });

  describe('estimated changes decimal precision', () => {
    it('computes display value from raw_value and decimals', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',

          account_summary: {
            assets_diffs: [
              {
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
                    usd_price: '0.31',
                    summary: '',
                    // Simulates the API returning an imprecise float-to-string value
                    value: '0.98999999999999991',
                    // The raw integer value in smallest unit (sun) is exact

                    raw_value: '990000',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',

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

          account_summary: {
            assets_diffs: [
              {
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
                    usd_price: '0.31',
                    summary: '',
                    value: '0.99',

                    raw_value: '990000',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',

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

          account_summary: {
            assets_diffs: [
              {
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
                    usd_price: '0.31',
                    summary: '',
                    value: '0.99',

                    raw_value: '',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',

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

          account_summary: {
            assets_diffs: [
              {
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
                    usd_price: '0.001',
                    summary: '',
                    value: '1000',

                    raw_value: '1000',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',

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

          account_summary: {
            assets_diffs: [
              {
                asset_type: 'ERC20',
                asset: {
                  type: 'ERC20',
                  symbol: 'WTRX',
                  name: 'Wrapped TRX',
                  decimals: 18,
                },
                in: [
                  {
                    usd_price: '0.31',
                    summary: '',
                    value: '1.49999999999999999',

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

    it('maps ERC721 NFT asset changes with token_id', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',

          account_summary: {
            assets_diffs: [
              {
                asset_type: 'NATIVE',
                asset: {
                  type: 'NATIVE',
                  symbol: 'TRX',
                  name: 'TRX',
                  decimals: 6,
                },
                in: [],
                out: [
                  {
                    usd_price: '0.315',
                    summary: 'Sending 1 TRX',
                    value: '1.0',

                    raw_value: '0xf4240',
                  },
                ],
              },
              {
                asset_type: 'ERC721',
                asset: {
                  type: 'ERC721',
                  symbol: 'SUN-V3-POS',
                  name: 'Sunswap V3 Positions NFT-V1',

                  logo_url:
                    'https://cdn.blockaid.io/nft/0x72DB65b2e023E4783D46023e7135c692E527F6CB/tron/sec/example',
                },
                in: [
                  {
                    summary: 'Receiving Sunswap V3 Positions NFT-V1 #1495',

                    token_id: '0x5d7',

                    arbitrary_collection_token: false,

                    logo_url:
                      'https://cdn.blockaid.io/nft/0x72DB65b2e023E4783D46023e7135c692E527F6CB/1495/tron/sec/example',
                  },
                ],
                out: [],
              },
            ],
          },
        },
        validation: {
          status: 'Success',

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
        origin: 'https://tm2.sun.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      expect(result?.status).toBe('SUCCESS');
      expect(result?.estimatedChanges.assets).toHaveLength(2);

      // Native TRX out
      expect(result?.estimatedChanges.assets[0]).toStrictEqual({
        type: 'out',
        symbol: 'TRX',
        name: 'TRX',
        logo: null,
        value: '1',
        price: '0.315',
        assetType: 'NATIVE',
      });

      // ERC721 NFT in — value should be "1" for a single NFT
      expect(result?.estimatedChanges.assets[1]).toStrictEqual({
        type: 'in',
        symbol: 'SUN-V3-POS',
        name: 'Sunswap V3 Positions NFT-V1',
        logo: 'https://cdn.blockaid.io/nft/0x72DB65b2e023E4783D46023e7135c692E527F6CB/tron/sec/example',
        value: '1',
        price: null,
        assetType: 'ERC721',
      });
    });

    it('maps ERC1155 asset changes with token_id and value', async () => {
      const mockApiResponse: SecurityAlertSimulationValidationResponse = {
        simulation: {
          status: 'Success',

          account_summary: {
            assets_diffs: [
              {
                asset_type: 'ERC1155',
                asset: {
                  type: 'ERC1155',
                  symbol: 'ITEM',
                  name: 'Game Item',
                },
                in: [],
                out: [
                  {
                    summary: 'Sending 5 Game Item',

                    token_id: '0x1',
                    value: '5',

                    arbitrary_collection_token: false,

                    usd_price: '10.00',
                  },
                ],
              },
            ],
          },
        },
        validation: {
          status: 'Success',

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
        origin: 'https://example.com',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      expect(result?.estimatedChanges.assets[0]).toStrictEqual({
        type: 'out',
        symbol: 'ITEM',
        name: 'Game Item',
        logo: null,
        value: '5',
        price: '10.00',
        assetType: 'ERC1155',
      });
    });
  });

  describe('failed transaction scan', () => {
    it('tracks the error', async () => {
      const error = new Error('Scan failed');

      const mockSecurityAlertsApiClient = createMockSecurityAlertsApiClient({
        simulation: { status: 'Success' },

        validation: { status: 'Success', result_type: 'Benign' },
      });
      mockSecurityAlertsApiClient.scanTransaction.mockRejectedValueOnce(error);

      const mockSnapClient = createMockSnapClient();

      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      await service.scanTransaction({
        accountAddress: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://tronscan.on.btfs.io',
        scope: Network.Mainnet,
        options: ['simulation'],
      });

      expect(mockSnapClient.trackError).toHaveBeenCalledWith(error);
    });
  });

  describe('scan validation', () => {
    it('returns an error for malformed transactions', async () => {
      const service = new TransactionScanService(
        createMockSecurityAlertsApiClient({
          simulation: { status: 'Success' },
          validation: { status: 'Success', result_type: 'Benign' },
        }) as unknown as SecurityAlertsApiClient,
        createMockSnapClient() as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: mockAccount.address,
        transactionRawData: {
          ...createWellFormedTransactionRawData(),
          contract: [],
        },
        origin: 'https://example.com',
        scope: Network.Mainnet,
      });

      expect(result).toMatchObject({
        status: ScanStatus.ERROR,
        simulationStatus: SimulationStatus.Failed,
        error: { type: 'MALFORMED_TRANSACTION' },
      });
    });

    it('skips unsupported contract types', async () => {
      const isContractTypeSupported = jest
        .spyOn(SecurityAlertsApiClient, 'isContractTypeSupported')
        .mockReturnValue(false);
      const mockSecurityAlertsApiClient = createMockSecurityAlertsApiClient({
        simulation: { status: 'Success' },
        validation: { status: 'Success', result_type: 'Benign' },
      });
      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        createMockSnapClient() as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: mockAccount.address,
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://example.com',
        scope: Network.Mainnet,
      });

      expect(result).toMatchObject({
        status: ScanStatus.SUCCESS,
        simulationStatus: SimulationStatus.Skipped,
      });
      expect(
        mockSecurityAlertsApiClient.scanTransaction,
      ).not.toHaveBeenCalled();
      isContractTypeSupported.mockRestore();
    });

    it('ignores asset diffs without changes', async () => {
      const service = new TransactionScanService(
        createMockSecurityAlertsApiClient({
          simulation: {
            status: 'Success',
            account_summary: {
              assets_diffs: [
                {
                  asset_type: 'NATIVE',
                  asset: { type: 'NATIVE', decimals: 6 },
                  in: [],
                  out: [],
                },
              ],
            },
          },
          validation: { status: 'Success', result_type: 'Benign' },
        }) as unknown as SecurityAlertsApiClient,
        createMockSnapClient() as unknown as SnapClient,
        mockLogger,
      );

      const result = await service.scanTransaction({
        accountAddress: mockAccount.address,
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://example.com',
        scope: Network.Mainnet,
      });

      expect(result?.estimatedChanges.assets).toStrictEqual([]);
    });
  });

  describe('getSecurityAlertDescription', () => {
    const service = new TransactionScanService(
      {} as SecurityAlertsApiClient,
      {} as SnapClient,
      mockLogger,
    );

    it('describes missing reasons', () => {
      expect(
        service.getSecurityAlertDescription({ type: 'Warning', reason: null }),
      ).toBe('Security alert: Unknown reason');
    });

    it('describes unknown reasons', () => {
      expect(
        service.getSecurityAlertDescription({
          type: 'Warning',
          reason: 'unknown_reason',
        }),
      ).toBe('Security alert: unknown_reason');
    });
  });

  describe('analytics', () => {
    const createService = (
      response: SecurityAlertSimulationValidationResponse,
    ): {
      service: TransactionScanService;
      mockSecurityAlertsApiClient: jest.Mocked<
        Pick<SecurityAlertsApiClient, 'scanTransaction'>
      >;
      mockSnapClient: jest.Mocked<Pick<SnapClient, 'trackError'>>;
    } => {
      const mockSecurityAlertsApiClient =
        createMockSecurityAlertsApiClient(response);
      const mockSnapClient = createMockSnapClient();
      const service = new TransactionScanService(
        mockSecurityAlertsApiClient as unknown as SecurityAlertsApiClient,
        mockSnapClient as unknown as SnapClient,
        mockLogger,
      );

      return { service, mockSecurityAlertsApiClient, mockSnapClient };
    };

    const scan = async (
      service: TransactionScanService,
    ): Promise<TransactionScanResult | null> =>
      service.scanTransaction({
        accountAddress: mockAccount.address,
        transactionRawData: createWellFormedTransactionRawData(),
        origin: 'https://example.com',
        scope: Network.Mainnet,
        account: mockAccount,
      });

    it('tracks a successful scan without alerts', async () => {
      const { service } = createService({
        simulation: { status: 'Success' },
        validation: { status: 'Success', result_type: 'Benign' },
      });
      jest
        .spyOn(analyticsService, 'trackSecurityScanCompleted')
        .mockResolvedValue();

      await scan(service);

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith({
        origin: 'https://example.com',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: ScanStatus.SUCCESS,
        hasSecurityAlerts: false,
      });
    });

    it('tracks detected security alerts', async () => {
      const { service } = createService({
        simulation: { status: 'Success' },
        validation: {
          status: 'Success',
          result_type: SecurityAlertResponse.Warning,
          reason: 'transfer_farming',
        },
      });
      jest
        .spyOn(analyticsService, 'trackSecurityScanCompleted')
        .mockResolvedValue();
      jest
        .spyOn(analyticsService, 'trackSecurityAlertDetected')
        .mockResolvedValue();

      await scan(service);

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith({
        origin: 'https://example.com',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: ScanStatus.SUCCESS,
        hasSecurityAlerts: true,
      });
      expect(analyticsService.trackSecurityAlertDetected).toHaveBeenCalledWith({
        origin: 'https://example.com',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        securityAlertResponse: SecurityAlertResponse.Warning,
        securityAlertReason: 'transfer_farming',
        securityAlertDescription:
          "Substantial transfer of the account's assets to untrusted entities",
      });
    });

    it('tracks an error when the API returns an invalid result', async () => {
      const { service } = createService(
        null as unknown as SecurityAlertSimulationValidationResponse,
      );
      jest
        .spyOn(analyticsService, 'trackSecurityScanCompleted')
        .mockResolvedValue();

      expect(await scan(service)).toBeNull();
      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith({
        origin: 'https://example.com',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: ScanStatus.ERROR,
        hasSecurityAlerts: false,
      });
    });

    it('tracks an error when scanning throws', async () => {
      const error = new Error('Scan failed');
      const { service, mockSecurityAlertsApiClient, mockSnapClient } =
        createService({
          simulation: { status: 'Success' },
          validation: { status: 'Success', result_type: 'Benign' },
        });
      mockSecurityAlertsApiClient.scanTransaction.mockRejectedValueOnce(error);
      jest
        .spyOn(analyticsService, 'trackSecurityScanCompleted')
        .mockResolvedValue();

      expect(await scan(service)).toBeNull();
      expect(mockSnapClient.trackError).toHaveBeenCalledWith(error);
      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith({
        origin: 'https://example.com',
        accountType: mockAccount.type,
        chainIdCaip: Network.Mainnet,
        scanStatus: ScanStatus.ERROR,
        hasSecurityAlerts: false,
      });
    });
  });
});
