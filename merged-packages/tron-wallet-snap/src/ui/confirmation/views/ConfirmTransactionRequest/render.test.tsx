import { Types } from 'tronweb';

import { render } from './render';
import {
  buildTransactionRawData,
  extractScanParametersFromTransactionData,
} from '../../../../clients/security-alerts-api/utils';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import type { AssetEntity } from '../../../../entities/assets';
import { BackgroundEventMethod } from '../../../../handlers/cronjob';
import type {
  State,
  UnencryptedStateValue,
} from '../../../../services/state/State';
import type { TransactionScanService } from '../../../../services/transaction-scan/TransactionScanService';
import {
  SimulationStatus,
  type TransactionScanResult,
} from '../../../../services/transaction-scan/types';
import { FetchStatus, type Preferences } from '../../../../types/snap';

// Mock the context module
jest.mock('../../../../context', () => ({
  __esModule: true, // eslint-disable-line @typescript-eslint/naming-convention
  default: {
    transactionScanService: null,
  },
}));

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

/**
 * Subset of SnapClient methods exercised by `render`.
 */
type MockSnapClient = jest.Mocked<
  Pick<
    SnapClient,
    | 'createInterface'
    | 'showDialog'
    | 'updateInterfaceIfExists'
    | 'getPreferences'
    | 'scheduleBackgroundEvent'
  >
>;

/**
 * Subset of TransactionScanService methods exercised by `render`.
 */
type MockTransactionScanService = jest.Mocked<
  Pick<
    TransactionScanService,
    'scanTransaction' | 'getSecurityAlertDescription'
  >
>;

/**
 * Subset of State methods exercised by `render`.
 */
type MockState = jest.Mocked<
  Pick<State<UnencryptedStateValue>, 'setKey' | 'getKey'>
>;

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
};

const defaultTransactionRawData = buildTransactionRawData({
  from: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
  to: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
  amount: 1000000,
  contractType: Types.ContractType.TransferContract,
});

const defaultIncomingContext = {
  scope: Network.Mainnet,
  fromAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
  toAddress: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
  amount: '1',
  fees: [] as never[],
  asset: mockAsset,
  origin: 'MetaMask',
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
    createInterface: jest.fn().mockResolvedValue('interface-id-123'),
    showDialog: jest.fn().mockResolvedValue(true),
    updateInterfaceIfExists: jest.fn().mockResolvedValue(true),
    getPreferences: jest.fn().mockResolvedValue(defaultPreferences),
    scheduleBackgroundEvent: jest.fn().mockResolvedValue(undefined),
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
    scanTransaction: jest.fn().mockResolvedValue(defaultScanResult),
    getSecurityAlertDescription: jest.fn().mockReturnValue('description'),
  };
}

/**
 * Builds a mock State with only the methods exercised by the `render` flow.
 *
 * @returns A mock State.
 */
function buildMockState(): MockState {
  return {
    setKey: jest.fn().mockResolvedValue(undefined),
    getKey: jest.fn().mockResolvedValue({}),
  };
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

  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-restricted-globals
  const snapContext = require('../../../../context').default;
  snapContext.transactionScanService = hasTransactionScanService
    ? mockTransactionScanService
    : null;

  const callRender = async (
    contextOverrides?: Partial<Parameters<typeof render>[2]>,
  ) =>
    render(
      mockSnapClient as unknown as SnapClient,
      mockState as unknown as State<UnencryptedStateValue>,
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
            origin: 'MetaMask',
            scope: Network.Mainnet,
            options: ['simulation', 'validation'],
          }),
        );
        expect(mockSnapClient.updateInterfaceIfExists).toHaveBeenCalled();
        expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
          method: BackgroundEventMethod.RefreshConfirmationSend,
          duration: 'PT20S',
        });
      },
    );
  });

  it('always triggers scan even when security preferences are disabled', async () => {
    await withRender(
      async ({ callRender, mockSnapClient, mockTransactionScanService }) => {
        mockSnapClient.getPreferences.mockResolvedValue({
          ...defaultPreferences,
          useSecurityAlerts: false,
          simulateOnChainActions: false,
        });

        await callRender();

        expect(mockTransactionScanService.scanTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            options: ['simulation'],
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
        expect(mockSnapClient.updateInterfaceIfExists).toHaveBeenCalled();

        const updateCall = mockSnapClient.updateInterfaceIfExists.mock.calls[0];
        const contextArg = updateCall?.[2] as any;
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

        const result = await callRender();

        expect(result).toBe(true);
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

  it('includes both simulation and validation when useSecurityAlerts is true', async () => {
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
            options: ['simulation', 'validation'],
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
        contractType: Types.ContractType.TriggerSmartContract,
      });

      await callRender({ transactionRawData: trc20RawData });

      const callArgs = mockTransactionScanService.scanTransaction.mock
        .calls[0]?.[0] as any;
      const rawData = callArgs?.transactionRawData;

      expect(rawData?.contract[0]?.type).toBe('TriggerSmartContract');

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

      const result = await callRender();

      expect(result).toBe(true);
    });
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
});
