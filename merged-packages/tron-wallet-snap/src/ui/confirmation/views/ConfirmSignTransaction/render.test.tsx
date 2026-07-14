import type { FeeType, KeyringRequest } from '@metamask/keyring-api';
import { bytesToBase64, bytesToHex, stringToBytes } from '@metamask/utils';

import { render } from './render';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import type { SnapExecutionContext } from '../../../../context';
import type { AssetEntity } from '../../../../entities/assets';
import type { TronKeyringAccount } from '../../../../entities/keyring-account';
import { TronMultichainMethod } from '../../../../handlers/keyring-types';
import type { AssetsService } from '../../../../services/assets/AssetsService';
import type { FeeCalculatorService } from '../../../../services/send/FeeCalculatorService';
import type {
  ComputeFeeResult,
  FeeAsset,
} from '../../../../services/send/types';
import type {
  TransactionScanResult,
  TransactionScanService,
} from '../../../../services/transaction-scan';
import { SimulationStatus } from '../../../../services/transaction-scan';
import { FetchStatus, type Preferences } from '../../../../types/snap';

// Mock the context module
jest.mock('../../../../context', () => ({
  __esModule: true, // eslint-disable-line @typescript-eslint/naming-convention
  default: {
    snapClient: null,
    transactionScanService: null,
    transactionExpirationRefresherService: null,
    state: null,
  },
}));

/**
 * Helper function to convert string to base64.
 *
 * @param str - The string to convert.
 * @returns Base64 encoded string.
 */
function toBase64(str: string): string {
  return bytesToBase64(stringToBytes(str));
}

/**
 * Helper function to convert a string to hexadecimal.
 *
 * @param str - The string to convert.
 * @returns Hexadecimal encoded string.
 */
function toHex(str: string): string {
  return bytesToHex(stringToBytes(str));
}

const mockPreferences: Preferences = {
  locale: 'en',
  currency: 'usd',
  hideBalances: false,
  useSecurityAlerts: true,
  useExternalPricingData: true,
  simulateOnChainActions: true,
  useTokenDetection: true,
  batchCheckBalances: true,
  displayNftMedia: true,
  useNftDetection: true,
};

const mockScanResult: TransactionScanResult = {
  status: 'SUCCESS',
  simulationStatus: SimulationStatus.Completed,
  estimatedChanges: {
    assets: [
      {
        type: 'out',
        value: '100',
        price: '0.1',
        symbol: 'TRX',
        name: 'Tron',
        logo: null,
        assetType: 'TRC20',
      },
    ],
  },
  validation: {
    type: 'Benign',
    reason: null,
  },
  error: null,
};

const mockAssets: AssetEntity[] = [
  { rawAmount: '100000000', uiAmount: '100' } as AssetEntity, // TRX
  { rawAmount: '1000000', uiAmount: '1000000' } as AssetEntity, // bandwidth
  { rawAmount: '50000', uiAmount: '50000' } as AssetEntity, // energy
];

const mockComputeFeeResult: ComputeFeeResult = [
  {
    type: 'base' as FeeType,
    asset: {
      unit: 'TRX',
      type: 'tron:728126428/slip44:195',
      amount: '0.02',
      fungible: true,
    } as FeeAsset,
  },
];

const mockAccount: TronKeyringAccount = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
  options: {},
  methods: [
    TronMultichainMethod.SignMessage,
    TronMultichainMethod.SignTransaction,
  ],
  type: 'tron:eoa',
  scopes: [Network.Mainnet, Network.Shasta],
  entropySource: 'entropy-source-1' as any,
  derivationPath: "m/44'/195'/0'/0/0",
  index: 0,
} as TronKeyringAccount;

type WithSnapContextCallback<ReturnValue> = (payload: {
  snapContext: SnapExecutionContext;
  mockSnapClient: jest.Mocked<
    Pick<
      SnapClient,
      | 'createInterface'
      | 'showDialog'
      | 'updateInterface'
      | 'getPreferences'
      | 'scheduleBackgroundEvent'
      | 'trackError'
    >
  >;
  mockTransactionScanService: jest.Mocked<
    Pick<TransactionScanService, 'scanTransaction'>
  >;
  mockTransactionExpirationRefresherService: {
    isTransactionExpired: jest.Mock;
  };
  mockState: { setKey: jest.Mock };
  mockAssetsService: jest.Mocked<Pick<AssetsService, 'getAssetsByAccountId'>>;
  mockFeeCalculatorService: jest.Mocked<
    Pick<FeeCalculatorService, 'computeFee'>
  >;
  mockPriceApiClient: { getMultipleSpotPrices: jest.Mock };
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps a test with a fresh Snap context and fresh mocks.
 *
 * The context module exports a singleton consumed by `render`, so the fresh
 * context is copied onto that singleton before invoking the test callback.
 *
 * @param testFunction - The test body receiving the context and relevant mocks.
 * @returns The return value of the callback.
 */
async function withSnapContext<ReturnValue>(
  testFunction: WithSnapContextCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockAssetsService: jest.Mocked<
    Pick<AssetsService, 'getAssetsByAccountId'>
  > = {
    getAssetsByAccountId: jest.fn().mockResolvedValue(mockAssets),
  };

  const mockFeeCalculatorService: jest.Mocked<
    Pick<FeeCalculatorService, 'computeFee'>
  > = {
    computeFee: jest.fn().mockResolvedValue(mockComputeFeeResult),
  };

  const mockSnapClient: jest.Mocked<
    Pick<
      SnapClient,
      | 'createInterface'
      | 'showDialog'
      | 'updateInterface'
      | 'getPreferences'
      | 'scheduleBackgroundEvent'
      | 'trackError'
    >
  > = {
    createInterface: jest.fn().mockResolvedValue('interface-id-123'),
    showDialog: jest.fn().mockResolvedValue(true),
    updateInterface: jest.fn(),
    getPreferences: jest.fn().mockResolvedValue(mockPreferences),
    scheduleBackgroundEvent: jest.fn(),
    trackError: jest.fn(),
  };

  const mockTransactionScanService: jest.Mocked<
    Pick<TransactionScanService, 'scanTransaction'>
  > = {
    scanTransaction: jest.fn().mockResolvedValue(mockScanResult),
  };

  const mockTransactionExpirationRefresherService = {
    isTransactionExpired: jest.fn(),
  };

  const mockState = {
    setKey: jest.fn(),
  };

  const mockPriceApiClient = {
    getMultipleSpotPrices: jest.fn().mockResolvedValue({}),
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-restricted-globals
  const snapContext = require('../../../../context')
    .default as SnapExecutionContext;
  const freshSnapContext = {
    ...snapContext,
    snapClient: mockSnapClient,
    transactionScanService: mockTransactionScanService,
    transactionExpirationRefresherService:
      mockTransactionExpirationRefresherService,
    state: mockState,
    assetsService: mockAssetsService,
    feeCalculatorService: mockFeeCalculatorService,
    priceApiClient: mockPriceApiClient,
  } as unknown as SnapExecutionContext;

  Object.assign(snapContext, freshSnapContext);

  return await testFunction({
    snapContext,
    mockSnapClient,
    mockTransactionScanService,
    mockTransactionExpirationRefresherService,
    mockState,
    mockAssetsService,
    mockFeeCalculatorService,
    mockPriceApiClient,
  });
}

describe('ConfirmSignTransaction render', () => {
  it('renders the confirmation dialog with security scan', async () => {
    await withSnapContext(
      async ({ mockSnapClient, mockTransactionScanService }) => {
        const testOrigin = 'https://example.com';
        const testTransaction = toHex('mock-transaction-data');

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000001',
          origin: testOrigin,
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: mockAccount.address,
              transaction: {
                rawDataHex: testTransaction,
                type: 'TransferContract',
              },
            },
          },
        };

        // Mock raw data with contract information
        const mockRawData = {
          contract: [
            {
              type: 'TriggerSmartContract',
              parameter: {
                value: {
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  owner_address: '41A2155E688B2BAEBDFDACD073BA79F5B22946AACF',
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  to_address: '4132F9C0C487F21716B7A8F12906B752889902655',
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  call_value: 100000,
                },
              },
            },
          ],
        };

        await render(request, mockAccount, mockRawData as any);

        // Verify createInterface was called
        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);

        // Verify showDialog was called with the interface ID
        expect(mockSnapClient.showDialog).toHaveBeenCalledWith(
          'interface-id-123',
        );

        // Verify security scan was triggered with from/to addresses and value
        expect(mockTransactionScanService.scanTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            accountAddress: mockAccount.address,
            transactionRawData: mockRawData,
            origin: testOrigin,
            scope: Network.Mainnet,
            options: ['simulation', 'validation'],
          }),
        );

        // Verify interface was updated with scan results
        expect(mockSnapClient.updateInterface).toHaveBeenCalled();
      },
    );
  });

  it('handles missing transaction scan service gracefully', async () => {
    await withSnapContext(
      async ({ snapContext, mockSnapClient, mockFeeCalculatorService }) => {
        mockFeeCalculatorService.computeFee.mockResolvedValue([]);

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000002',
          origin: 'https://test.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: mockAccount.address,
              transaction: {
                rawDataHex: toHex('transaction'),
                type: 'TransferContract',
              },
            },
          },
        };

        const mockRawData = {
          contract: [],
        };

        // // Set transactionScanService to null for this test
        // // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-require-imports
        // const snapContext = require('../../../../context').default;
        snapContext.transactionScanService =
          null as unknown as TransactionScanService;

        await render(request, mockAccount, mockRawData as any);

        // Should still create interface
        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);

        // Should update interface without scan
        expect(mockSnapClient.updateInterface).toHaveBeenCalled();
      },
    );
  });

  it('handles security scan failure gracefully', async () => {
    await withSnapContext(
      async ({ mockSnapClient, mockTransactionScanService }) => {
        mockTransactionScanService.scanTransaction.mockRejectedValue(
          new Error('Scan failed'),
        );

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000003',
          origin: 'https://test.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: mockAccount.address,
              transaction: {
                rawDataHex: toBase64('transaction'),
                type: 'TransferContract',
              },
            },
          },
        };

        const mockRawData = {
          contract: [],
        };

        await render(request, mockAccount, mockRawData as any);

        // Should still render with error state
        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
        expect(mockSnapClient.updateInterface).toHaveBeenCalled();
      },
    );
  });

  it('skips security scan when preferences disable it', async () => {
    await withSnapContext(
      async ({ mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...mockPreferences,
          useSecurityAlerts: false,
          simulateOnChainActions: false,
        });

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000004',
          origin: 'https://test.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: mockAccount.address,
              transaction: {
                rawDataHex: toBase64('transaction'),
                type: 'TransferContract',
              },
            },
          },
        };

        const mockRawData = {
          contract: [],
        };

        await render(request, mockAccount, mockRawData as any);

        // Security scan should not be called
        expect(
          mockTransactionScanService.scanTransaction,
        ).not.toHaveBeenCalled();
      },
    );
  });

  it('uses fallback locale when preferences fail to load', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      mockSnapClient.getPreferences.mockRejectedValue(
        new Error('Failed to load'),
      );

      const request: KeyringRequest = {
        id: '00000000-0000-4000-8000-000000000005',
        origin: 'https://test.com',
        account: mockAccount.id,
        scope: Network.Mainnet,
        request: {
          method: TronMultichainMethod.SignTransaction,
          params: {
            address: mockAccount.address,
            transaction: {
              rawDataHex: toBase64('transaction'),
              type: 'TransferContract',
            },
          },
        },
      };

      const mockRawData = {
        contract: [],
      };

      // Should not throw, even with failed preferences
      expect(await render(request, mockAccount, mockRawData as any)).toBe(true);
    });
  });

  it('handles missing origin gracefully', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      const request: KeyringRequest = {
        id: '00000000-0000-4000-8000-000000000006',
        origin: undefined as any,
        account: mockAccount.id,
        scope: Network.Mainnet,
        request: {
          method: TronMultichainMethod.SignTransaction,
          params: {
            address: mockAccount.address,
            transaction: {
              rawDataHex: toBase64('transaction'),
              type: 'TransferContract',
            },
          },
        },
      };

      const mockRawData = {
        contract: [],
      };

      await render(request, mockAccount, mockRawData as any);

      // Should still work
      expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
    });
  });

  it('returns the dialog promise result', async () => {
    await withSnapContext(async () => {
      const request: KeyringRequest = {
        id: '00000000-0000-4000-8000-000000000007',
        origin: 'https://test.com',
        account: mockAccount.id,
        scope: Network.Mainnet,
        request: {
          method: TronMultichainMethod.SignTransaction,
          params: {
            address: mockAccount.address,
            transaction: {
              rawDataHex: toBase64('transaction'),
              type: 'TransferContract',
            },
          },
        },
      };

      const mockRawData = {
        contract: [],
      };

      const result = await render(request, mockAccount, mockRawData as any);

      expect(result).toBe(true);
    });
  });

  it('surfaces an expired scan result when the TAPOS check detects expiry', async () => {
    await withSnapContext(
      async ({ mockSnapClient, mockTransactionExpirationRefresherService }) => {
        mockTransactionExpirationRefresherService.isTransactionExpired.mockResolvedValue(
          true,
        );

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000008',
          origin: 'https://test.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: mockAccount.address,
              transaction: {
                rawDataHex: toBase64('transaction'),
                type: 'TransferContract',
              },
            },
          },
        };

        const mockRawData = {
          contract: [],
        };

        await render(request, mockAccount, mockRawData as any);

        // The benign security scan is overridden by the locally-detected expiry.
        const finalUpdateCall =
          mockSnapClient.updateInterface.mock.calls.at(-1);
        const finalContext = finalUpdateCall?.[2] as {
          scan: TransactionScanResult | null;
        };

        expect(finalContext.scan?.simulationStatus).toBe(
          SimulationStatus.Failed,
        );
        expect(finalContext.scan?.error?.type).toBe('TransactionTaposExpired');
      },
    );
  });

  it('keeps the scan result intact when scheduling the refresh fails', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      mockSnapClient.scheduleBackgroundEvent.mockRejectedValue(
        new Error('schedule failed'),
      );

      const request: KeyringRequest = {
        id: '00000000-0000-4000-8000-000000000009',
        origin: 'https://test.com',
        account: mockAccount.id,
        scope: Network.Mainnet,
        request: {
          method: TronMultichainMethod.SignTransaction,
          params: {
            address: mockAccount.address,
            transaction: {
              rawDataHex: toBase64('transaction'),
              type: 'TransferContract',
            },
          },
        },
      };

      const mockRawData = {
        contract: [],
      };

      // Scheduling is best-effort and isolated from the scan result, so render
      // still completes and the successful scan stays on screen.
      expect(await render(request, mockAccount, mockRawData as any)).toBe(true);
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalled();

      const finalUpdateCall = mockSnapClient.updateInterface.mock.calls.at(-1);
      const finalContext = finalUpdateCall?.[2] as {
        scan: TransactionScanResult | null;
        scanFetchStatus: string;
      };

      expect(finalContext.scan).not.toBeNull();
      expect(finalContext.scan?.simulationStatus).toBe(
        SimulationStatus.Completed,
      );
      expect(finalContext.scanFetchStatus).toBe(FetchStatus.Fetched);
    });
  });

  it('falls back to an error state when updating the interface fails', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      mockSnapClient.updateInterface.mockImplementationOnce(async () => {
        throw new Error('update failed');
      });

      const request: KeyringRequest = {
        id: '00000000-0000-4000-8000-000000000010',
        origin: 'https://test.com',
        account: mockAccount.id,
        scope: Network.Mainnet,
        request: {
          method: TronMultichainMethod.SignTransaction,
          params: {
            address: mockAccount.address,
            transaction: {
              rawDataHex: toBase64('transaction'),
              type: 'TransferContract',
            },
          },
        },
      };

      const mockRawData = {
        contract: [],
      };

      // The first updateInterface throws; the catch re-renders an error state.
      expect(await render(request, mockAccount, mockRawData as any)).toBe(true);

      const finalUpdateCall = mockSnapClient.updateInterface.mock.calls.at(-1);
      const finalContext = finalUpdateCall?.[2] as {
        scan: TransactionScanResult | null;
        scanFetchStatus: string;
      };

      expect(finalContext.scan).toBeNull();
      expect(finalContext.scanFetchStatus).toBe(FetchStatus.Error);
    });
  });

  it('preserves the scan result when the TAPOS check throws', async () => {
    await withSnapContext(
      async ({ mockSnapClient, mockTransactionExpirationRefresherService }) => {
        mockTransactionExpirationRefresherService.isTransactionExpired.mockRejectedValue(
          new Error('tapos check failed'),
        );

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000011',
          origin: 'https://test.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: mockAccount.address,
              transaction: {
                rawDataHex: toBase64('transaction'),
                type: 'TransferContract',
              },
            },
          },
        };

        const mockRawData = {
          contract: [],
        };

        // The TAPOS check fails safe: it must not wipe the benign security scan or
        // synthesize a false expired result.
        expect(await render(request, mockAccount, mockRawData as any)).toBe(
          true,
        );

        const finalUpdateCall =
          mockSnapClient.updateInterface.mock.calls.at(-1);
        const finalContext = finalUpdateCall?.[2] as {
          scan: TransactionScanResult | null;
          scanFetchStatus: string;
        };

        expect(mockSnapClient.trackError).toHaveBeenCalledWith(
          new Error('tapos check failed'),
        );
        expect(finalContext.scan).not.toBeNull();
        expect(finalContext.scan?.simulationStatus).toBe(
          SimulationStatus.Completed,
        );
        expect(finalContext.scanFetchStatus).toBe(FetchStatus.Fetched);
      },
    );
  });

  it('sets isInsufficientBalance when the TRX balance cannot cover the transaction and fee', async () => {
    await withSnapContext(async ({ mockSnapClient, mockAssetsService }) => {
      mockAssetsService.getAssetsByAccountId.mockResolvedValue([
        { rawAmount: '50000', uiAmount: '0.05' } as AssetEntity, // TRX
        ...mockAssets.slice(1),
      ]);

      const request: KeyringRequest = {
        id: '00000000-0000-4000-8000-000000000012',
        origin: 'https://example.com',
        account: mockAccount.id,
        scope: Network.Mainnet,
        request: {
          method: TronMultichainMethod.SignTransaction,
          params: {
            address: mockAccount.address,
            transaction: {
              rawDataHex: toHex('transaction'),
              type: 'TriggerSmartContract',
            },
          },
        },
      };

      const mockRawData = {
        contract: [
          {
            type: 'TriggerSmartContract',
            parameter: {
              value: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                owner_address: '41A2155E688B2BAEBDFDACD073BA79F5B22946AACF',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                contract_address: '4132F9C0C487F21716B7A8F12906B752889902655',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                call_value: 100000,
              },
            },
          },
        ],
      };

      await render(request, mockAccount, mockRawData as any);

      expect(mockSnapClient.createInterface).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isInsufficientBalance: true }),
      );
    });
  });
});
