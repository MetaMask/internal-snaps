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

    it('maps ERC721 NFT asset changes with token_id', async () => {
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
                  name: 'TRX',
                  decimals: 6,
                },
                in: [],
                out: [
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '0.315',
                    summary: 'Sending 1 TRX',
                    value: '1.0',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    raw_value: '0xf4240',
                  },
                ],
              },
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asset_type: 'ERC721',
                asset: {
                  type: 'ERC721',
                  symbol: 'SUN-V3-POS',
                  name: 'Sunswap V3 Positions NFT-V1',
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  logo_url:
                    'https://cdn.blockaid.io/nft/0x72DB65b2e023E4783D46023e7135c692E527F6CB/tron/sec/example',
                },
                in: [
                  {
                    summary: 'Receiving Sunswap V3 Positions NFT-V1 #1495',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    token_id: '0x5d7',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    arbitrary_collection_token: false,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
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
          // eslint-disable-next-line @typescript-eslint/naming-convention
          account_summary: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            assets_diffs: [
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
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
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    token_id: '0x1',
                    value: '5',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    arbitrary_collection_token: false,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    usd_price: '10.00',
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
});
