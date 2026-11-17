import {
  DEFAULT_METAMASK_ORIGIN,
  getTransactionSecurityProperties,
} from '@metamask/snap-networks-utils';
import type { IStateManager } from '@metamask/snap-networks-utils';
import { InvalidParamsError } from '@metamask/snaps-sdk';
import { Types as TronwebTypes } from 'tronweb';
import type { Mocked, Mock } from 'vitest';

import {
  buildTransactionRawData,
  extractScanParametersFromTransactionData,
} from '../../../../clients/security-alerts-api/utils';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { KnownCaip19Id, Network, TokenMetadata } from '../../../../constants';
import snapContext from '../../../../context';
import type { AssetEntity } from '../../../../entities/assets';
import { BackgroundEventMethod } from '../../../../handlers/cronjob/cronjob';
import type { UnencryptedStateValue } from '../../../../services/state/stateTypes';
import type { TransactionScanService } from '../../../../services/transaction-scan/TransactionScanService';
import { SimulationStatus } from '../../../../services/transaction-scan/types';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import { FetchStatus } from '../../../../types/snap';
import type { Preferences } from '../../../../types/snap';
import {
  buildInitialContext,
  DEFAULT_CONFIRMATION_CONTEXT,
  getSecurityProperties,
  render,
} from './render';
import type { ConfirmTransactionRequestContext } from './types';

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

/**
 * Subset of SnapClient methods exercised by `render`.
 */
type MockSnapClient = Mocked<
  Pick<
    SnapClient,
    | 'createInterface'
    | 'showDialog'
    | 'updateInterface'
    | 'getPreferences'
    | 'scheduleBackgroundEvent'
  >
>;

/**
 * Subset of TransactionScanService methods exercised by `render`.
 */
type MockTransactionScanService = Mocked<
  Pick<TransactionScanService, 'scanTransaction'>
>;

/**
 * Subset of State methods exercised by `render`.
 */
type MockState = {
  getKey: Mock;
  setKey: Mock;
  setKeyWith: Mock;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const defaultPreferences: Preferences = {
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

const mockAsset: AssetEntity = {
  assetType: `${Network.Mainnet}/slip44:195`,
  keyringAccountId: 'account-1',
  network: Network.Mainnet,
  symbol: 'TRX',
  decimals: 6,
  rawAmount: '10000000',
  uiAmount: '10',
  iconUrl: '',
};

const defaultScanResult: TransactionScanResult = {
  status: 'SUCCESS',
  simulationStatus: SimulationStatus.Completed,
  estimatedChanges: {
    assets: [
      {
        type: 'out',
        value: '1000000',
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

const defaultTransactionRawData = buildTransactionRawData({
  from: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
  to: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
  amount: 1000000,
  contractType: TronwebTypes.ContractType.TransferContract,
});

const defaultIncomingContext = {
  scope: Network.Mainnet,
  fromAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
  toAddress: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
  amount: '1',
  fees: [] as never[],
  asset: mockAsset,
  origin: DEFAULT_METAMASK_ORIGIN,
  accountType: 'tron:eoa',
  transactionRawData: defaultTransactionRawData,
};

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/**
 * Builds a mock SnapClient with only the methods exercised by the `render`
 * flow.
 *
 * @returns A mock SnapClient.
 */
function buildMockSnapClient(): MockSnapClient {
  return {
    createInterface: vi.fn().mockResolvedValue('interface-id-123'),
    showDialog: vi.fn().mockResolvedValue(true),
    updateInterface: vi.fn().mockResolvedValue(undefined),
    getPreferences: vi.fn().mockResolvedValue(defaultPreferences),
    scheduleBackgroundEvent: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Builds a mock TransactionScanService with only the methods exercised by
 * the `render` flow.
 *
 * @returns A mock TransactionScanService.
 */
function buildMockTransactionScanService(): MockTransactionScanService {
  return {
    scanTransaction: vi.fn().mockResolvedValue(defaultScanResult),
  };
}

/**
 * Builds a mock State with only the methods exercised by the `render` flow.
 *
 * @returns A mock State.
 */
function buildMockState(): MockState {
  return {
    setKey: vi.fn().mockResolvedValue(undefined),
    setKeyWith: vi.fn().mockResolvedValue(undefined),
    getKey: vi.fn().mockResolvedValue({}),
  };
}

/**
 * Narrows a possibly-missing value, throwing when it is absent.
 *
 * @param value - The value to check.
 * @param message - The message to throw when the value is missing.
 * @returns The value, narrowed to exclude `undefined`.
 */
function required<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * The callback that `withRender` calls.
 */
type WithRenderCallback = (payload: {
  mockSnapClient: MockSnapClient;
  mockState: MockState;
  mockTransactionScanService: MockTransactionScanService;
  callRender: (
    contextOverrides?: Partial<Parameters<typeof render>[2]>,
  ) => ReturnType<typeof render>;
}) => Promise<void> | void;

/**
 * Options for the `withRender` factory function.
 */
type WithRenderOptions = {
  hasTransactionScanService?: boolean;
};

/**
 * Constructs render mocks with sensible defaults and calls the given test
 * function with helpers and all mocks. The `callRender` helper concentrates
 * the type assertions so that every test body stays assertion-free.
 *
 * @param args - Either a callback, or an options bag + callback.
 */
async function withRender(
  ...args: [WithRenderCallback] | [WithRenderOptions, WithRenderCallback]
): Promise<void> {
  const [options, testFunction] = args.length === 2 ? args : [{}, args[0]];
  const { hasTransactionScanService = true } = options;

  const mockSnapClient = buildMockSnapClient();
  const mockState = buildMockState();
  const mockTransactionScanService = buildMockTransactionScanService();

  snapContext.transactionScanService = (hasTransactionScanService
    ? mockTransactionScanService
    : null) as unknown as TransactionScanService;

  const callRender = async (
    contextOverrides?: Partial<Parameters<typeof render>[2]>,
  ): ReturnType<typeof render> =>
    render(
      mockSnapClient as unknown as SnapClient,
      mockState as unknown as IStateManager<UnencryptedStateValue>,
      { ...defaultIncomingContext, ...contextOverrides },
    );

  await testFunction({
    mockSnapClient,
    mockState,
    mockTransactionScanService,
    callRender,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfirmTransactionRequest render', () => {
  it('rejects a malformed transaction before reading preferences or opening confirmation', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        await expect(
          callRender({
            transactionRawData: {
              ...defaultTransactionRawData,
              contract: [
                ...defaultTransactionRawData.contract,
                ...defaultTransactionRawData.contract,
              ],
            },
          }),
        ).rejects.toThrow(InvalidParamsError);

        expect(mockSnapClient.getPreferences).not.toHaveBeenCalled();
        expect(mockSnapClient.createInterface).not.toHaveBeenCalled();
        expect(
          mockTransactionScanService.scanTransaction,
        ).not.toHaveBeenCalled();
      },
    );
  });

  it.each([
    [true, true, FetchStatus.Loading],
    [true, false, FetchStatus.Loading],
    [false, true, FetchStatus.Loading],
    [false, false, FetchStatus.Fetched],
  ])(
    'sets initial scan state with security alerts %s and simulation %s',
    async (useSecurityAlerts, simulateOnChainActions, scanFetchStatus) => {
      await withRender(async ({ callRender, mockSnapClient }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts,
          simulateOnChainActions,
        });
        // Inspect the initial context before render mutates it with scan results.
        mockSnapClient.createInterface.mockImplementation(
          async (ui, context) => {
            expect(context).toMatchObject({ scanFetchStatus });
            expect(JSON.stringify(ui).includes('"disabled":true')).toBe(
              scanFetchStatus === FetchStatus.Loading,
            );
            expect(
              JSON.stringify(ui).includes('Checking for security issues'),
            ).toBe(useSecurityAlerts);
            return 'interface-id-123';
          },
        );

        await callRender();

        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('triggers security scan when preferences enable it', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        await callRender();

        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
        expect(mockSnapClient.showDialog).toHaveBeenCalledWith(
          'interface-id-123',
        );
        expect(mockTransactionScanService.scanTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            accountAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
            transactionRawData: expect.any(Object),
            origin: DEFAULT_METAMASK_ORIGIN,
            scope: Network.Mainnet,
            options: ['simulation', 'validation'],
          }),
        );
        expect(mockSnapClient.updateInterface).toHaveBeenCalled();
        expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
          method: BackgroundEventMethod.RefreshConfirmationSend,
          duration: 'PT20S',
        });
      },
    );
  });

  it('skips the scan when security alerts and simulation are disabled', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts: false,
          simulateOnChainActions: false,
        });

        await callRender();

        expect(
          mockTransactionScanService.scanTransaction,
        ).not.toHaveBeenCalled();
        expect(mockSnapClient.updateInterface).toHaveBeenCalledWith(
          'interface-id-123',
          expect.anything(),
          expect.objectContaining({
            scan: null,
            scanFetchStatus: FetchStatus.Fetched,
          }),
        );
        expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
          method: BackgroundEventMethod.RefreshConfirmationSend,
          duration: 'PT20S',
        });
      },
    );
  });

  it('handles security scan failure gracefully', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockTransactionScanService.scanTransaction.mockRejectedValue(
          new Error('Scan failed'),
        );

        await callRender();

        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
        expect(mockSnapClient.updateInterface).toHaveBeenCalled();

        const updateCall = mockSnapClient.updateInterface.mock.calls[0];
        const contextArg = updateCall?.[2];
        expect(contextArg?.scanFetchStatus).toBe(FetchStatus.Error);
        expect(contextArg?.scan).toBeNull();
      },
    );
  });

  it('handles missing transaction scan service gracefully', async () => {
    await withRender(
      { hasTransactionScanService: false },
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        await callRender();

        expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
        expect(
          mockTransactionScanService.scanTransaction,
        ).not.toHaveBeenCalled();
      },
    );
  });

  it('uses fallback preferences when preferences fail to load', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockRejectedValue(
          new Error('Failed to load'),
        );

        const outcome = await callRender();

        expect(outcome.result).toBe(true);
        expect(mockTransactionScanService.scanTransaction).toHaveBeenCalled();
      },
    );
  });

  it('requests only simulation when useSecurityAlerts is false', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts: false,
          simulateOnChainActions: true,
        });

        await callRender();

        expect(mockTransactionScanService.scanTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            options: ['simulation'],
          }),
        );
      },
    );
  });

  it('requests only validation when security alerts are enabled and simulation is disabled', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts: true,
          simulateOnChainActions: false,
        });

        await callRender();

        expect(mockTransactionScanService.scanTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            options: ['validation'],
          }),
        );
      },
    );
  });

  it('forwards TRC20 transaction raw data to the scan service', async () => {
    await withRender(async ({ callRender, mockTransactionScanService }) => {
      const trc20RawData = buildTransactionRawData({
        from: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        to: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        amount: 0,
        data: 'a9059cbb0000000000000000000000004f32e5a36a5e1fc1c5c327a522cdfbc78e400f5500000000000000000000000000000000000000000000000000000000000f4240',
        contractType: TronwebTypes.ContractType.TriggerSmartContract,
      });

      await callRender({ transactionRawData: trc20RawData });

      const callArgs =
        mockTransactionScanService.scanTransaction.mock.calls[0]?.[0];
      const rawData = required(
        callArgs?.transactionRawData,
        'The scan service did not receive the raw transaction data.',
      );

      expect(rawData.contract[0]?.type).toBe('TriggerSmartContract');

      const scanParams = extractScanParametersFromTransactionData(rawData);
      expect(scanParams?.data).toBeDefined();
      expect(scanParams?.data).toMatch(/^0xa9059cbb/u);
    });
  });

  it('schedules price refresh when pricing data is enabled', async () => {
    await withRender(async ({ callRender, mockSnapClient }) => {
      await callRender();

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.RefreshConfirmationPrices,
        duration: 'PT1S',
      });
    });
  });

  it('returns the dialog promise result', async () => {
    await withRender(async ({ callRender, mockSnapClient }) => {
      mockSnapClient.showDialog.mockResolvedValue(true);

      const outcome = await callRender();

      expect(outcome.result).toBe(true);
    });
  });

  it('returns the security verdict shown in the dialog', async () => {
    await withRender(async ({ callRender }) => {
      const outcome = await callRender();

      expect(outcome).toStrictEqual({
        result: true,
        context: {
          securityProperties: { securityAlertResponse: 'Benign' },
        },
      });
    });
  });

  it('marks token prices as fetched when external pricing is disabled', async () => {
    await withRender(async ({ callRender, mockSnapClient }) => {
      mockSnapClient.getPreferences.mockResolvedValue({
        ...defaultPreferences,
        useExternalPricingData: false,
      });

      await callRender();

      expect(mockSnapClient.updateInterface).toHaveBeenCalledWith(
        'interface-id-123',
        expect.anything(),
        expect.objectContaining({
          tokenPricesFetchStatus: FetchStatus.Fetched,
        }),
      );
    });
  });

  it('reports no security fields when only simulation is enabled', async () => {
    await withRender(async ({ callRender, mockSnapClient }) => {
      mockSnapClient.getPreferences.mockResolvedValue({
        ...defaultPreferences,
        useSecurityAlerts: false,
        simulateOnChainActions: true,
      });

      const outcome = await callRender();

      expect(outcome.context.securityProperties).toBeUndefined();
    });
  });

  it('reports an error verdict without a description when the scan throws', async () => {
    await withRender(async ({ callRender, mockTransactionScanService }) => {
      mockTransactionScanService.scanTransaction.mockRejectedValue(
        new Error('Scan failed'),
      );

      const outcome = await callRender();

      expect(outcome).toStrictEqual({
        result: true,
        context: {
          securityProperties: {
            securityAlertResponse: 'Error',
            securityAlertReason: 'Error',
          },
        },
      });
    });
  });

  it('reports an error verdict without a description when the scan returns no result', async () => {
    await withRender(async ({ callRender, mockTransactionScanService }) => {
      mockTransactionScanService.scanTransaction.mockResolvedValue(null);

      const outcome = await callRender();

      expect(outcome.context.securityProperties).toStrictEqual({
        securityAlertResponse: 'Error',
        securityAlertReason: 'Error',
      });
    });
  });

  it('resolves the icon URL for each fee asset', async () => {
    await withRender(async ({ callRender, mockSnapClient }) => {
      await callRender({
        fees: [
          {
            type: 'base',
            asset: {
              unit: 'TRX',
              type: KnownCaip19Id.TrxMainnet,
              amount: '0.02',
              fungible: true,
            },
          },
        ] as never,
      });

      const [, context] = mockSnapClient.createInterface.mock
        .calls[0] as unknown as [
        unknown,
        { fees: { asset: { iconUrl?: string } }[] },
      ];
      expect(context.fees[0]?.asset.iconUrl).toBe(
        TokenMetadata[KnownCaip19Id.TrxMainnet].iconUrl,
      );
    });
  });

  it('reports no security fields for an unsupported contract type, even when the scan returns a verdict', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts: true,
        });
        const trc10RawData = {
          ...defaultTransactionRawData,
          contract: [
            {
              ...defaultTransactionRawData.contract[0],
              type: TronwebTypes.ContractType.TransferAssetContract,
            },
          ],
        } as TronwebTypes.Transaction['raw_data'];

        const outcome = await callRender({ transactionRawData: trc10RawData });

        expect(
          mockTransactionScanService.scanTransaction,
        ).toHaveBeenCalledTimes(1);
        expect(outcome.context.securityProperties).toBeUndefined();
      },
    );
  });

  it('reports no security fields when the scan service is missing', async () => {
    await withRender(
      { hasTransactionScanService: false },
      async ({ callRender, mockSnapClient }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts: true,
        });

        const outcome = await callRender();

        expect(outcome.context.securityProperties).toBeUndefined();
      },
    );
  });

  it('stores interface ID in state for background refresh', async () => {
    await withRender(async ({ callRender, mockState }) => {
      await callRender();

      expect(mockState.setKey).toHaveBeenCalledWith(
        'mapInterfaceNameToId.confirmTransaction',
        'interface-id-123',
      );
    });
  });

  describe('buildInitialContext', () => {
    /**
     * Builds the initial context with the test preferences loaded.
     *
     * @param incoming - The transaction details to build the context from.
     * @returns The initial confirmation context.
     */
    async function buildContextFor(
      incoming: Parameters<
        typeof buildInitialContext
      >[1] = defaultIncomingContext,
    ): Promise<ConfirmTransactionRequestContext> {
      const mockSnapClient = buildMockSnapClient();
      mockSnapClient.getPreferences.mockResolvedValue(defaultPreferences);

      return buildInitialContext(
        mockSnapClient as unknown as SnapClient,
        incoming,
      );
    }

    it('combines the incoming context with the defaults and the user preferences', async () => {
      const context = await buildContextFor();

      expect(context).toMatchObject({
        scope: defaultIncomingContext.scope,
        fromAddress: defaultIncomingContext.fromAddress,
        toAddress: defaultIncomingContext.toAddress,
        amount: defaultIncomingContext.amount,
        origin: defaultIncomingContext.origin,
        accountType: defaultIncomingContext.accountType,
        preferences: defaultPreferences,
      });
    });

    it('falls back to the default preferences when they cannot be loaded', async () => {
      const mockSnapClient = buildMockSnapClient();
      mockSnapClient.getPreferences.mockRejectedValue(new Error('unavailable'));

      const context = await buildInitialContext(
        mockSnapClient as unknown as SnapClient,
        defaultIncomingContext,
      );

      expect(context.preferences).toStrictEqual(
        DEFAULT_CONFIRMATION_CONTEXT.preferences,
      );
    });

    it('starts token prices and scan as Loading', async () => {
      const context = await buildContextFor();

      expect(context.tokenPricesFetchStatus).toBe(FetchStatus.Loading);
      expect(context.scanFetchStatus).toBe(FetchStatus.Loading);
    });

    it('stores the raw transaction data unchanged', async () => {
      const context = await buildContextFor();

      expect(context.transactionRawData).toBe(defaultTransactionRawData);
    });

    it('resolves fee icons on a copy and leaves the incoming fees unchanged', async () => {
      const fees = [
        {
          type: 'base',
          asset: {
            unit: 'TRX',
            type: KnownCaip19Id.TrxMainnet,
            amount: '0.02',
            fungible: true,
          },
        },
      ] as never;

      const context = await buildContextFor({
        ...defaultIncomingContext,
        fees,
      });

      expect(context.fees[0]?.asset.iconUrl).toBe(
        TokenMetadata[KnownCaip19Id.TrxMainnet].iconUrl,
      );
      expect(context.fees).not.toBe(fees);
      expect(
        (fees as unknown as { asset: { iconUrl?: string } }[])[0]?.asset
          .iconUrl,
      ).toBeUndefined();
    });
  });

  describe('getSecurityProperties', () => {
    it('returns undefined when validation is not enabled', () => {
      expect(
        getSecurityProperties(
          false,
          defaultTransactionRawData,
          defaultScanResult,
        ),
      ).toBeUndefined();
    });

    it('returns undefined for a contract type that the scan service skips', () => {
      const unsupportedRawData = {
        contract: [{ type: 'UnsupportedContract' }],
      } as never;

      expect(
        getSecurityProperties(true, unsupportedRawData, defaultScanResult),
      ).toBeUndefined();
    });

    it('does not report a simulation error as the security error', () => {
      const scan = {
        ...defaultScanResult,
        validation: { type: null, reason: null },
        error: {
          type: 'simulation',
          code: null,
          message: 'Insufficient funds',
        },
        validationError: null,
      };

      expect(
        getSecurityProperties(true, defaultTransactionRawData, scan),
      ).toStrictEqual({
        securityAlertResponse: 'Error',
        securityAlertReason: 'Error',
      });
    });

    it('returns the security properties of the shown scan when validation applies', () => {
      expect(
        getSecurityProperties(
          true,
          defaultTransactionRawData,
          defaultScanResult,
        ),
      ).toStrictEqual(getTransactionSecurityProperties(defaultScanResult));
    });
  });

  it('schedules the validity refresh when the scan service is available', async () => {
    await withRender(async ({ callRender, mockSnapClient }) => {
      await callRender();

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.RefreshConfirmationSend,
        duration: 'PT20S',
      });
    });
  });
});
