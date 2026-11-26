import { FeeType } from '@metamask/keyring-api';
import { bytesToBase64, bytesToHex, stringToBytes } from '@metamask/utils';
import { Types as TronwebTypes } from 'tronweb';
import type { Mocked, Mock } from 'vitest';

import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import type { SnapExecutionContext } from '../../../../context';
import defaultSnapContext from '../../../../context';
import type { AssetEntity } from '../../../../entities/assets';
import type { TronKeyringAccount } from '../../../../entities/tronKeyringAccount';
import { TronMultichainMethod } from '../../../../handlers/keyring/keyring-types';
import type { AssetsService } from '../../../../services/assets/AssetsService';
import type { FeeCalculatorService } from '../../../../services/send/FeeCalculatorService';
import type { ComputeFeeResult } from '../../../../services/send/types';
import type {
  TransactionScanResult,
  TransactionScanService,
} from '../../../../services/transaction-scan';
import { SimulationStatus } from '../../../../services/transaction-scan';
import { FetchStatus } from '../../../../types/snap';
import type { Preferences } from '../../../../types/snap';
import type { TronWalletKeyringRequest } from '../../../../validation/structs';
import { render } from './render';

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

/**
 * Builds transaction raw data with the given contracts.
 *
 * @param contract - The transaction contracts.
 * @returns The transaction raw data.
 */
function buildRawData(
  contract: TronwebTypes.Transaction['raw_data']['contract'] = [],
): TronwebTypes.Transaction['raw_data'] {
  return {
    contract,
    ref_block_bytes: '0000',
    ref_block_hash: '0000000000000000',
    expiration: 60000,
    timestamp: 0,
  };
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
  validationError: null,
};

const mockAssets: AssetEntity[] = [
  { rawAmount: '100000000', uiAmount: '100' } as AssetEntity, // TRX
  { rawAmount: '1000000', uiAmount: '1000000' } as AssetEntity, // bandwidth
  { rawAmount: '50000', uiAmount: '50000' } as AssetEntity, // energy
];

const mockComputeFeeResult: ComputeFeeResult = [
  {
    type: FeeType.Base,
    asset: {
      unit: 'TRX',
      type: 'tron:728126428/slip44:195',
      amount: '0.02',
      fungible: true,
    },
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
  entropySource: 'entropy-source-1',
  derivationPath: "m/44'/195'/0'/0/0",
  index: 0,
};

type WithSnapContextCallback<ReturnValue> = (payload: {
  snapContext: SnapExecutionContext;
  mockSnapClient: Mocked<
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
  mockTransactionScanService: Mocked<
    Pick<TransactionScanService, 'scanTransaction'>
  >;
  mockTransactionExpirationRefresherService: {
    isTransactionExpired: Mock;
  };
  mockState: { setKey: Mock };
  mockAssetsService: Mocked<Pick<AssetsService, 'getAccountAssetsByIDs'>>;
  mockFeeCalculatorService: Mocked<Pick<FeeCalculatorService, 'computeFee'>>;
  mockPriceApiClient: { getMultipleSpotPrices: Mock };
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
  const mockAssetsService: Mocked<
    Pick<AssetsService, 'getAccountAssetsByIDs'>
  > = {
    getAccountAssetsByIDs: vi.fn().mockResolvedValue(mockAssets),
  };

  const mockFeeCalculatorService: Mocked<
    Pick<FeeCalculatorService, 'computeFee'>
  > = {
    computeFee: vi.fn().mockResolvedValue(mockComputeFeeResult),
  };

  const mockSnapClient: Mocked<
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
    createInterface: vi.fn().mockResolvedValue('interface-id-123'),
    showDialog: vi.fn().mockResolvedValue(true),
    updateInterface: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue(mockPreferences),
    scheduleBackgroundEvent: vi.fn(),
    trackError: vi.fn(),
  };

  const mockTransactionScanService: Mocked<
    Pick<TransactionScanService, 'scanTransaction'>
  > = {
    scanTransaction: vi.fn().mockResolvedValue(mockScanResult),
  };

  const mockTransactionExpirationRefresherService = {
    isTransactionExpired: vi.fn(),
  };

  const mockState = {
    setKey: vi.fn(),
  };

  const mockPriceApiClient = {
    getMultipleSpotPrices: vi.fn().mockResolvedValue({}),
  };

  const freshSnapContext = {
    ...defaultSnapContext,
    snapClient: mockSnapClient,
    transactionScanService: mockTransactionScanService,
    transactionExpirationRefresherService:
      mockTransactionExpirationRefresherService,
    state: mockState,
    assetsService: mockAssetsService,
    feeCalculatorService: mockFeeCalculatorService,
    priceApiClient: mockPriceApiClient,
  } as unknown as SnapExecutionContext;

  Object.assign(defaultSnapContext, freshSnapContext);

  return await testFunction({
    snapContext: defaultSnapContext,
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
  it.each([
    [true, true, FetchStatus.Loading],
    [true, false, FetchStatus.Loading],
    [false, true, FetchStatus.Loading],
    [false, false, FetchStatus.Fetched],
  ])(
    'sets initial scan state with security alerts %s and simulation %s',
    async (useSecurityAlerts, simulateOnChainActions, scanFetchStatus) => {
      await withSnapContext(async ({ mockSnapClient }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...mockPreferences,
          useSecurityAlerts,
          simulateOnChainActions,
        });
        mockSnapClient.createInterface.mockImplementation(
          async (ui, context) => {
            expect(context).toMatchObject({ scanFetchStatus });
            expect(JSON.stringify(ui).includes('"disabled":true')).toBe(
              scanFetchStatus === FetchStatus.Loading,
            );
            return 'interface-id-123';
          },
        );

        await render(
          {
            id: '00000000-0000-4000-8000-000000000001',
            origin: 'https://example.com',
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
          },
          mockAccount,
          {
            contract: [],
            ref_block_bytes: '0000',
            ref_block_hash: '0000000000000000',
            expiration: 60000,
            timestamp: 0,
          },
        );

        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
      });
    },
  );

  it.each([
    {
      blocker: 'expiry',
      isTransactionExpired: true,
      accountAssets: mockAssets,
      expectedContext: { scan: { error: { type: 'TransactionTaposExpired' } } },
    },
    {
      blocker: 'insufficient balance',
      isTransactionExpired: false,
      accountAssets: [
        { ...mockAssets[0], rawAmount: '0' } as AssetEntity,
        ...mockAssets.slice(1),
      ],
      expectedContext: { isInsufficientBalance: true },
    },
  ])(
    'keeps local $blocker blocking on the initial screen with scans disabled',
    async ({ isTransactionExpired, accountAssets, expectedContext }) => {
      await withSnapContext(
        async ({
          mockSnapClient,
          mockTransactionExpirationRefresherService,
          mockAssetsService,
        }) => {
          mockSnapClient.getPreferences.mockResolvedValue({
            ...mockPreferences,
            useSecurityAlerts: false,
            simulateOnChainActions: false,
          });
          mockTransactionExpirationRefresherService.isTransactionExpired.mockResolvedValue(
            isTransactionExpired,
          );
          mockAssetsService.getAccountAssetsByIDs.mockResolvedValue(
            accountAssets,
          );
          mockSnapClient.createInterface.mockImplementation(
            async (ui, context) => {
              expect(context).toMatchObject({
                scanFetchStatus: FetchStatus.Fetched,
              });
              expect(JSON.stringify(ui)).toContain('"disabled":true');
              expect(JSON.stringify(ui)).not.toContain(
                'Checking for security issues',
              );
              expect(context).toMatchObject(expectedContext);
              return 'interface-id-123';
            },
          );

          await render(
            {
              id: '00000000-0000-4000-8000-000000000001',
              origin: 'https://example.com',
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
            },
            mockAccount,
            {
              contract: [],
              ref_block_bytes: '0000',
              ref_block_hash: '0000000000000000',
              expiration: 60000,
              timestamp: 0,
            },
          );

          expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
        },
      );
    },
  );

  it('renders the confirmation dialog with security scan', async () => {
    await withSnapContext(
      async ({
        mockSnapClient,
        mockTransactionScanService,
        mockTransactionExpirationRefresherService,
      }) => {
        const testOrigin = 'https://example.com';
        const testTransaction = toHex('mock-transaction-data');

        const request: TronWalletKeyringRequest = {
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
        const mockRawData = buildRawData([
          {
            type: TronwebTypes.ContractType.TriggerSmartContract,
            parameter: {
              type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
              value: {
                owner_address: '41A2155E688B2BAEBDFDACD073BA79F5B22946AACF',

                to_address: '4132F9C0C487F21716B7A8F12906B752889902655',

                call_value: 100000,
              },
            },
          },
        ]);

        await render(request, mockAccount, mockRawData);

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
        // A transaction can expire while a remote scan is in flight.
        const expirationCheckOrder = Number(
          mockTransactionExpirationRefresherService.isTransactionExpired.mock
            .invocationCallOrder[0],
        );
        const scanOrder = Number(
          mockTransactionScanService.scanTransaction.mock
            .invocationCallOrder[0],
        );

        expect(scanOrder).toBeGreaterThan(0);
        expect(expirationCheckOrder).toBeGreaterThan(scanOrder);
      },
    );
  });

  it('handles missing transaction scan service gracefully', async () => {
    await withSnapContext(
      async ({ snapContext, mockSnapClient, mockFeeCalculatorService }) => {
        mockFeeCalculatorService.computeFee.mockResolvedValue([]);

        const request: TronWalletKeyringRequest = {
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

        const mockRawData = buildRawData();

        // // Set transactionScanService to null for this test
        // // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-require-imports
        // const snapContext = require('../../../../context').default;
        snapContext.transactionScanService =
          null as unknown as TransactionScanService;

        await render(request, mockAccount, mockRawData);

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

        const request: TronWalletKeyringRequest = {
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

        const mockRawData = buildRawData();

        await render(request, mockAccount, mockRawData);

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

        const request: TronWalletKeyringRequest = {
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

        const mockRawData = buildRawData();

        await render(request, mockAccount, mockRawData);

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

      const request: TronWalletKeyringRequest = {
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

      const mockRawData = buildRawData();

      // Should not throw, even with failed preferences
      expect((await render(request, mockAccount, mockRawData)).result).toBe(
        true,
      );
    });
  });

  it('handles missing origin gracefully', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      const request: TronWalletKeyringRequest = {
        id: '00000000-0000-4000-8000-000000000006',
        // @ts-expect-error - a missing origin exercises the fallback
        origin: undefined,
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

      const mockRawData = buildRawData();

      await render(request, mockAccount, mockRawData);

      // Should still work
      expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
    });
  });

  it('returns the dialog promise result', async () => {
    await withSnapContext(async () => {
      const request: TronWalletKeyringRequest = {
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

      const mockRawData = buildRawData();

      const outcome = await render(request, mockAccount, mockRawData);

      expect(outcome.result).toBe(true);
    });
  });

  describe('security properties', () => {
    const supportedRawData = {
      contract: [
        {
          type: 'TriggerSmartContract',
          parameter: {
            value: {
              owner_address: '41A2155E688B2BAEBDFDACD073BA79F5B22946AACF',
              to_address: '4132F9C0C487F21716B7A8F12906B752889902655',
              call_value: 100000,
            },
          },
        },
      ],
    } as unknown as TronwebTypes.Transaction['raw_data'];

    const request: TronWalletKeyringRequest = {
      id: '00000000-0000-4000-8000-000000000008',
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

    it('returns the security verdict shown in the dialog', async () => {
      await withSnapContext(async () => {
        const outcome = await render(request, mockAccount, supportedRawData);

        expect(outcome).toStrictEqual({
          result: true,
          context: {
            securityProperties: { securityAlertResponse: 'Benign' },
          },
        });
      });
    });

    it('reports the verdict reason when the dialog shows a warning', async () => {
      await withSnapContext(async ({ mockTransactionScanService }) => {
        mockTransactionScanService.scanTransaction.mockResolvedValue({
          ...mockScanResult,
          validation: { type: 'Warning', reason: 'transfer_farming' },
        });

        const outcome = await render(request, mockAccount, supportedRawData);

        expect(outcome.context.securityProperties).toStrictEqual({
          securityAlertResponse: 'Warning',
          securityAlertReason: 'transfer_farming',
        });
      });
    });

    it('reports an error verdict when the scan throws', async () => {
      await withSnapContext(async ({ mockTransactionScanService }) => {
        mockTransactionScanService.scanTransaction.mockRejectedValue(
          new Error('Scan failed'),
        );

        const outcome = await render(request, mockAccount, supportedRawData);

        expect(outcome.context.securityProperties).toStrictEqual({
          securityAlertResponse: 'Error',
          securityAlertReason: 'Error',
        });
      });
    });

    it('reports no security fields when validation is not requested', async () => {
      await withSnapContext(async ({ mockSnapClient }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...mockPreferences,
          useSecurityAlerts: false,
          simulateOnChainActions: true,
        });

        const outcome = await render(request, mockAccount, supportedRawData);

        expect(outcome.context.securityProperties).toBeUndefined();
      });
    });

    it('reports no security fields for an unsupported contract type, even when the scan returns a verdict', async () => {
      await withSnapContext(async ({ mockTransactionScanService }) => {
        const trc10RawData = {
          contract: [
            {
              type: 'TransferAssetContract',
              parameter: { value: {} },
            },
          ],
        } as unknown as TronwebTypes.Transaction['raw_data'];

        const outcome = await render(request, mockAccount, trc10RawData);

        expect(
          mockTransactionScanService.scanTransaction,
        ).toHaveBeenCalledTimes(1);
        expect(outcome.context.securityProperties).toBeUndefined();
      });
    });

    it('reports no security fields when the scan service is missing', async () => {
      await withSnapContext(async ({ snapContext }) => {
        snapContext.transactionScanService =
          null as unknown as TransactionScanService;

        const outcome = await render(request, mockAccount, supportedRawData);

        expect(outcome.context.securityProperties).toBeUndefined();
      });
    });
  });

  it('surfaces an expired scan result when the TAPOS check detects expiry', async () => {
    await withSnapContext(
      async ({
        mockSnapClient,
        mockTransactionExpirationRefresherService,
        mockTransactionScanService,
      }) => {
        mockTransactionExpirationRefresherService.isTransactionExpired.mockResolvedValue(
          true,
        );
        mockTransactionScanService.scanTransaction.mockResolvedValue({
          status: 'SUCCESS',
          simulationStatus: SimulationStatus.Completed,
          estimatedChanges: { assets: [] },
          validation: { type: 'Malicious', reason: null },
          error: null,
          validationError: null,
        });

        const request: TronWalletKeyringRequest = {
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

        const mockRawData = buildRawData();

        await render(request, mockAccount, mockRawData);

        // The expiry replaces the simulation result, preserving the verdict.
        const finalUpdateCall =
          mockSnapClient.updateInterface.mock.calls.at(-1);
        const finalContext = finalUpdateCall?.[2] as {
          scan: TransactionScanResult | null;
        };

        expect(finalContext.scan?.simulationStatus).toBe(
          SimulationStatus.Failed,
        );
        expect(finalContext.scan?.error?.type).toBe('TransactionTaposExpired');
        expect(finalContext.scan?.validation.type).toBe('Malicious');
      },
    );
  });

  it('keeps the scan result intact when scheduling the refresh fails', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      mockSnapClient.scheduleBackgroundEvent.mockRejectedValue(
        new Error('schedule failed'),
      );

      const request: TronWalletKeyringRequest = {
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

      const mockRawData = buildRawData();

      // Scheduling is best-effort and isolated from the scan result, so render
      // still completes and the successful scan stays on screen.
      expect((await render(request, mockAccount, mockRawData)).result).toBe(
        true,
      );
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

  it('renders without token prices when the price fetch fails', async () => {
    await withSnapContext(async ({ mockSnapClient, mockPriceApiClient }) => {
      mockPriceApiClient.getMultipleSpotPrices.mockRejectedValue(
        new Error('price API down'),
      );

      const request: TronWalletKeyringRequest = {
        id: '00000000-0000-4000-8000-00000000000a',
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

      const mockRawData = buildRawData();

      // A failed price fetch falls back to empty prices, so render still completes.
      const outcome = await render(request, mockAccount, mockRawData);
      expect(outcome.result).toBe(true);
      expect(mockPriceApiClient.getMultipleSpotPrices).toHaveBeenCalled();

      const finalContext = mockSnapClient.updateInterface.mock.calls.at(
        -1,
      )?.[2] as {
        tokenPrices: Record<string, unknown>;
        tokenPricesFetchStatus: string;
      };

      expect(finalContext.tokenPrices).toStrictEqual({});
      expect(finalContext.tokenPricesFetchStatus).toBe(FetchStatus.Fetched);
    });
  });

  it('falls back to an error state when updating the interface fails', async () => {
    await withSnapContext(async ({ mockSnapClient }) => {
      mockSnapClient.updateInterface.mockImplementationOnce(async () => {
        throw new Error('update failed');
      });

      const request: TronWalletKeyringRequest = {
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

      const mockRawData = buildRawData();

      // The first updateInterface throws; the catch re-renders an error state.
      expect((await render(request, mockAccount, mockRawData)).result).toBe(
        true,
      );

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

        const request: TronWalletKeyringRequest = {
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

        const mockRawData = buildRawData();

        // The TAPOS check fails safe: it must not wipe the benign security scan or
        // synthesize a false expired result.
        expect((await render(request, mockAccount, mockRawData)).result).toBe(
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
      mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
        { rawAmount: '50000', uiAmount: '0.05' } as AssetEntity, // TRX
        ...mockAssets.slice(1),
      ]);

      const request: TronWalletKeyringRequest = {
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

      const mockRawData = buildRawData([
        {
          type: TronwebTypes.ContractType.TriggerSmartContract,
          parameter: {
            type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
            value: {
              owner_address: '41A2155E688B2BAEBDFDACD073BA79F5B22946AACF',

              contract_address: '4132F9C0C487F21716B7A8F12906B752889902655',

              call_value: 100000,
            },
          },
        },
      ]);

      await render(request, mockAccount, mockRawData);

      expect(mockSnapClient.createInterface).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isInsufficientBalance: true }),
      );
    });
  });
});
