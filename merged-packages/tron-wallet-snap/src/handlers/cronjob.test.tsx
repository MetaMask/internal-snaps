import { BackgroundEventMethod, CronHandler } from './cronjob';
import type { PriceApiClient } from '../clients/price-api/PriceApiClient';
import type { SnapClient } from '../clients/snap/SnapClient';
import type { TronHttpClient } from '../clients/tron-http/TronHttpClient';
import type { TronWebFactory } from '../clients/tronweb/TronWebFactory';
import { Network } from '../constants';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { State, UnencryptedStateValue } from '../services/state/State';
import { TransactionExpirationRefresherService } from '../services/transaction-expiration-refresher/TransactionExpirationRefresherService';
import type { JsonTransactionRawData } from '../services/transaction-expiration-refresher/types';
import type { TransactionScanService } from '../services/transaction-scan/TransactionScanService';
import {
  SimulationStatus,
  type TransactionScanResult,
} from '../services/transaction-scan/types';
import { FetchStatus } from '../types/snap';
import {
  CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME,
  type ConfirmSignTransactionContext,
} from '../ui/confirmation/views/ConfirmSignTransaction/types';
import type { ConfirmTransactionRequestContext } from '../ui/confirmation/views/ConfirmTransactionRequest/types';
import type { ILogger } from '../utils/logger';

/**
 * Subset of SnapClient methods exercised by `refreshConfirmationSend`.
 */
type MockSnapClient = jest.Mocked<
  Pick<
    SnapClient,
    | 'getClientStatus'
    | 'createInterface'
    | 'showDialog'
    | 'updateInterface'
    | 'getInterfaceContext'
    | 'scheduleBackgroundEvent'
    | 'getPreferences'
    | 'trackError'
  >
>;

/**
 * Subset of State methods exercised by `refreshConfirmationSend`.
 */
type MockState = {
  getKey: jest.Mock;
  setKey: jest.Mock;
  setKeyWith: jest.Mock;
};

/**
 * Subset of TransactionScanService methods exercised by
 * `refreshConfirmationSend`.
 */
type MockTransactionScanService = jest.Mocked<
  Pick<
    TransactionScanService,
    'scanTransaction' | 'getSecurityAlertDescription'
  >
>;

type MockTronWebFactory = jest.Mocked<Pick<TronWebFactory, 'createClient'>>;

type InterfaceContext =
  | ConfirmTransactionRequestContext
  | ConfirmSignTransactionContext;

const MOCK_BLOCK_TIMESTAMP = 1_700_000_000_000;

const getRefBlockBytes = (number: number) =>
  number.toString(16).slice(-4).padStart(4, '0');

const createBlock = ({
  number,
  timestamp,
  hashSegment = '1122334455667788',
}: {
  number: number;
  timestamp: number;
  hashSegment?: string;
}) => ({
  blockID: `${'0'.repeat(16)}${hashSegment}${'f'.repeat(32)}`,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  block_header: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    raw_data: {
      number,
      timestamp,
    },
  },
});

/**
 * Builds a mock scan result for use in tests.
 *
 * @param overrides - Optional overrides for the scan result.
 * @returns A mock TransactionScanResult.
 */
function buildMockScanResult(
  overrides: Partial<TransactionScanResult> = {},
): TransactionScanResult {
  return {
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
    validation: { type: 'Benign', reason: null },
    error: null,
    ...overrides,
  };
}

/**
 * Builds a mock interface context for the send confirmation dialog.
 *
 * @param overrides - Optional overrides for context fields.
 * @returns A mock ConfirmTransactionRequestContext.
 */
function buildMockInterfaceContext(
  overrides: Partial<ConfirmTransactionRequestContext> = {},
): ConfirmTransactionRequestContext {
  return {
    origin: 'MetaMask',
    scope: Network.Mainnet,
    fromAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    toAddress: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
    amount: '1',
    fees: [],
    asset: {
      assetType: `${Network.Mainnet}/slip44:195`,
      keyringAccountId: 'account-1',
      network: Network.Mainnet,
      symbol: 'TRX',
      decimals: 6,
      rawAmount: '10000000',
      uiAmount: '10',
      iconUrl: '',
    },
    preferences: {
      locale: 'en',
      currency: 'usd',
      hideBalances: false,
      useSecurityAlerts: true,
      useExternalPricingData: true,
      simulateOnChainActions: true,
      useTokenDetection: true,
      batchCheckBalances: true,
      displayNftMedia: false,
      useNftDetection: false,
    },
    networkImage: '',
    tokenPrices: {},
    tokenPricesFetchStatus: FetchStatus.Fetched,
    scan: null,
    scanFetchStatus: FetchStatus.Initial,

    transactionRawData: {
      contract: [
        {
          type: 'TransferContract',
          parameter: {
            type_url: 'type.googleapis.com/protocol.TransferContract', // eslint-disable-line @typescript-eslint/naming-convention
            value: {
              owner_address: '41a2155e688b2baebdfdacd073ba79f5b22946aacf', // eslint-disable-line @typescript-eslint/naming-convention
              to_address: '4132f9c0c487f21716b7a8f12906b752889902655', // eslint-disable-line @typescript-eslint/naming-convention
              amount: 1000000,
            },
          },
        },
      ],
      ref_block_bytes: '', // eslint-disable-line @typescript-eslint/naming-convention
      ref_block_hash: '', // eslint-disable-line @typescript-eslint/naming-convention
      expiration: 0,
      timestamp: 0,
    } as any,
    accountType: 'tron:eoa',
    ...overrides,
  };
}

/**
 * Builds a mock interface context for the signTransaction confirmation dialog.
 *
 * @param overrides - Optional overrides for context fields.
 * @returns A mock ConfirmSignTransactionContext.
 */
function buildMockSignTransactionInterfaceContext(
  overrides: Partial<ConfirmSignTransactionContext> = {},
): ConfirmSignTransactionContext {
  return {
    scope: Network.Mainnet,
    account: {
      id: 'account-1',
      address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
      options: {},
      methods: ['signMessage', 'signTransaction'],
      type: 'tron:eoa',
      scopes: [Network.Mainnet],
      entropySource: 'entropy-source-1' as any,
      derivationPath: "m/44'/195'/0'/0/0",
      index: 0,
    },
    transaction: {
      rawDataHex: '0a02beef',
      type: 'TransferContract',
    },
    origin: 'https://example.com',
    preferences: {
      locale: 'en',
      currency: 'usd',
      hideBalances: false,
      useSecurityAlerts: true,
      useExternalPricingData: true,
      simulateOnChainActions: true,
      useTokenDetection: true,
      batchCheckBalances: true,
      displayNftMedia: false,
      useNftDetection: false,
    },
    networkImage: '',
    scan: null,
    scanFetchStatus: FetchStatus.Initial,
    tokenPrices: {},
    tokenPricesFetchStatus: FetchStatus.Fetched,
    fees: [],
    feesFetchStatus: FetchStatus.Fetched,
    isInsufficientBalance: false,
    ...overrides,
  };
}

/**
 * Builds a mock logger satisfying the ILogger interface.
 *
 * @returns A mock ILogger.
 */
function buildMockLogger(): ILogger {
  return {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Builds a mock SnapClient with only the methods exercised by the
 * `refreshConfirmationSend` flow.
 *
 * @param interfaceContext - The value `getInterfaceContext` resolves to.
 * @returns A mock SnapClient.
 */
function buildMockSnapClient(
  interfaceContext: InterfaceContext | null,
): MockSnapClient {
  return {
    getClientStatus: jest
      .fn()
      .mockResolvedValue({ active: true, locked: false }),
    createInterface: jest.fn().mockResolvedValue('interface-id'),
    showDialog: jest.fn().mockResolvedValue(true),
    updateInterface: jest.fn().mockResolvedValue(undefined),
    getInterfaceContext: jest.fn().mockResolvedValue(interfaceContext),
    scheduleBackgroundEvent: jest.fn().mockResolvedValue(undefined),
    getPreferences: jest.fn().mockResolvedValue({}),
    trackError: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Builds a mock State with only the methods exercised by the
 * `refreshConfirmationSend` flow.
 *
 * @param mapInterfaceNameToId - The value `getKey` resolves to.
 * @returns A mock State.
 */
function buildMockState(
  mapInterfaceNameToId: Record<string, string>,
): MockState {
  return {
    setKey: jest.fn().mockResolvedValue(undefined),
    setKeyWith: jest.fn().mockResolvedValue(undefined),
    getKey: jest.fn().mockResolvedValue(mapInterfaceNameToId),
  };
}

/**
 * Builds a mock TransactionScanService with only the methods exercised by
 * the `refreshConfirmationSend` flow.
 *
 * @param scanResult - The value `scanTransaction` resolves to.
 * @returns A mock TransactionScanService.
 */
function buildMockTransactionScanService(
  scanResult: TransactionScanResult,
): MockTransactionScanService {
  return {
    scanTransaction: jest.fn().mockResolvedValue(scanResult),
    getSecurityAlertDescription: jest.fn().mockReturnValue('description'),
  };
}

/**
 * Builds a mock TronWebFactory for transaction metadata refresh tests.
 *
 * @param options - The mock block options.
 * @param options.currentBlock - The block returned by getCurrentBlock.
 * @param options.referencedBlock - The block returned by getBlockByNumber.
 * @param options.currentBlockError - The error thrown by getCurrentBlock.
 * @returns A mock TronWebFactory.
 */
function buildMockTronWebFactory({
  currentBlock,
  currentBlockError,
  referencedBlock,
}: {
  currentBlock: ReturnType<typeof createBlock>;
  currentBlockError?: Error;
  referencedBlock?: ReturnType<typeof createBlock>;
}): MockTronWebFactory {
  return {
    createClient: jest.fn().mockReturnValue({
      trx: {
        getCurrentBlock: currentBlockError
          ? jest.fn().mockRejectedValue(currentBlockError)
          : jest.fn().mockResolvedValue(currentBlock),
        getBlockByNumber: jest
          .fn()
          .mockResolvedValue(referencedBlock ?? currentBlock),
      },
      utils: {
        deserializeTx: {
          deserializeTransaction: jest.fn().mockReturnValue({
            contract: [
              {
                type: 'TransferContract',
                parameter: {
                  type_url: 'type.googleapis.com/protocol.TransferContract', // eslint-disable-line @typescript-eslint/naming-convention
                  value: {
                    owner_address: '41a2155e688b2baebdfdacd073ba79f5b22946aacf', // eslint-disable-line @typescript-eslint/naming-convention
                    to_address: '4132f9c0c487f21716b7a8f12906b752889902655', // eslint-disable-line @typescript-eslint/naming-convention
                    amount: 1000000,
                  },
                },
              },
            ],
            ref_block_bytes: '0001', // eslint-disable-line @typescript-eslint/naming-convention
            ref_block_hash: 'outdatedhash', // eslint-disable-line @typescript-eslint/naming-convention
            expiration: currentBlock.block_header.raw_data.timestamp - 1,
            timestamp: currentBlock.block_header.raw_data.timestamp - 60_000,
          }),
        },
        transaction: {
          txJsonToPb: jest
            .fn()
            .mockImplementation((transaction) => transaction),
          txPbToRawDataHex: jest.fn().mockReturnValue('refreshed-raw-data-hex'),
          txPbToTxID: jest.fn().mockReturnValue('0xrefreshed-tx-id'),
        },
      },
    }),
  };
}

/**
 * Assembles a CronHandler from the given partial mocks. Type assertions are
 * concentrated here so that every other part of the test file stays
 * assertion-free.
 *
 * @param deps - The mock dependencies.
 * @param deps.mockSnapClient - The mock SnapClient.
 * @param deps.mockState - The mock State.
 * @param deps.mockTransactionScanService - The mock TransactionScanService.
 * @param deps.transactionExpirationRefresherService - The transaction metadata refresher.
 * @returns A CronHandler instance wired to the mocks.
 */
function buildCronHandler({
  mockSnapClient,
  mockState,
  mockTransactionScanService,
  transactionExpirationRefresherService,
}: {
  mockSnapClient: MockSnapClient;
  mockState: MockState;
  mockTransactionScanService: MockTransactionScanService;
  transactionExpirationRefresherService: Pick<
    TransactionExpirationRefresherService,
    'ensureFreshRawData' | 'deserializeTransaction' | 'isTransactionExpired'
  >;
}): CronHandler {
  return new CronHandler({
    logger: buildMockLogger(),
    accountsService: {} as AccountsService,
    snapClient: mockSnapClient as unknown as SnapClient,
    state: mockState as unknown as State<UnencryptedStateValue>,
    priceApiClient: {} as PriceApiClient,
    tronHttpClient: {} as TronHttpClient,
    transactionScanService:
      mockTransactionScanService as unknown as TransactionScanService,
    transactionExpirationRefresherService:
      transactionExpirationRefresherService as unknown as TransactionExpirationRefresherService,
  });
}

/**
 * The callback that `withCronHandler` calls.
 */
type WithCronHandlerCallback = (payload: {
  cronHandler: CronHandler;
  mockSnapClient: MockSnapClient;
  mockState: MockState;
  mockTransactionScanService: MockTransactionScanService;
  mockTronWebFactory: MockTronWebFactory;
}) => Promise<void> | void;

/**
 * Options for the `withCronHandler` factory function.
 */
type WithCronHandlerOptions = {
  interfaceContext?: InterfaceContext | null;
  scanResult?: TransactionScanResult;
  mapInterfaceNameToId?: Record<string, string>;
  currentBlock?: ReturnType<typeof createBlock>;
  currentBlockError?: Error;
  referencedBlock?: ReturnType<typeof createBlock>;
  refreshRawData?: boolean;
  transactionExpired?: boolean;
  transactionExpiredError?: Error;
};

/**
 * Constructs a CronHandler with sensible defaults and calls the given test
 * function with the handler and all mocks. Overrides can be provided to
 * configure the mocks for specific test scenarios.
 *
 * @param args - Either a function, or an options bag + a function.
 */
async function withCronHandler(
  ...args:
    | [WithCronHandlerCallback]
    | [WithCronHandlerOptions, WithCronHandlerCallback]
): Promise<void> {
  const [options, testFunction] = args.length === 2 ? args : [{}, args[0]];

  const {
    interfaceContext = buildMockInterfaceContext(),
    scanResult = buildMockScanResult(),
    mapInterfaceNameToId = { confirmTransaction: 'interface-id-456' },
    currentBlock = createBlock({
      number: 200_000,
      timestamp: MOCK_BLOCK_TIMESTAMP,
    }),
    currentBlockError,
    referencedBlock,
    refreshRawData = false,
    transactionExpired = false,
    transactionExpiredError,
  } = options;

  const mockSnapClient = buildMockSnapClient(interfaceContext);
  const mockState = buildMockState(mapInterfaceNameToId);
  const mockTransactionScanService =
    buildMockTransactionScanService(scanResult);
  const mockTronWebFactory = buildMockTronWebFactory({
    currentBlock,
    currentBlockError,
    referencedBlock,
  });
  const transactionExpirationRefresherService =
    new TransactionExpirationRefresherService({
      tronWebFactory: mockTronWebFactory as unknown as TronWebFactory,
    });
  const passThroughTransactionExpirationRefresherService = {
    ensureFreshRawData: jest.fn(async ({ rawData }) => rawData),
    deserializeTransaction:
      transactionExpirationRefresherService.deserializeTransaction.bind(
        transactionExpirationRefresherService,
      ),
    isTransactionExpired: transactionExpiredError
      ? jest.fn(async () => {
          throw transactionExpiredError;
        })
      : jest.fn(async () => transactionExpired),
  };

  const cronHandler = buildCronHandler({
    mockSnapClient,
    mockState,
    mockTransactionScanService,
    transactionExpirationRefresherService: refreshRawData
      ? transactionExpirationRefresherService
      : passThroughTransactionExpirationRefresherService,
  });

  await testFunction({
    cronHandler,
    mockSnapClient,
    mockState,
    mockTransactionScanService,
    mockTronWebFactory,
  });
}

describe('CronHandler', () => {
  describe('refreshConfirmationSend', () => {
    it('refreshes security scan and updates interface', async () => {
      await withCronHandler(
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshConfirmationSend();

          expect(
            mockTransactionScanService.scanTransaction,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              accountAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              options: ['simulation', 'validation'],
            }),
          );

          // Verify interface was updated (fetching state + final state)
          expect(mockSnapClient.updateInterface).toHaveBeenCalledTimes(2);

          // Verify next refresh was scheduled
          expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
            method: BackgroundEventMethod.RefreshConfirmationSend,
            duration: 'PT20S',
          });
        },
      );
    });

    it('refreshes transaction metadata before refreshing security scan', async () => {
      const blockTimestamp = MOCK_BLOCK_TIMESTAMP;
      const currentBlock = createBlock({
        number: 200_000,
        timestamp: blockTimestamp,
        hashSegment: '0011223344556677',
      });
      const transactionRawData = structuredClone(
        buildMockInterfaceContext().transactionRawData,
      ) as JsonTransactionRawData;
      transactionRawData.ref_block_bytes = '0001';
      transactionRawData.ref_block_hash = 'outdatedhash';
      transactionRawData.expiration = blockTimestamp - 1;
      transactionRawData.timestamp = blockTimestamp - 60_000;
      const interfaceContext = buildMockInterfaceContext({
        transactionRawData,
      });

      await withCronHandler(
        { currentBlock, interfaceContext, refreshRawData: true },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshConfirmationSend();

          const scanPayload =
            mockTransactionScanService.scanTransaction.mock.calls[0]?.[0];
          const scannedRawData = scanPayload?.transactionRawData;
          const finalUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const finalContext =
            finalUpdateCall?.[2] as ConfirmTransactionRequestContext;

          expect(scannedRawData).not.toBe(interfaceContext.transactionRawData);
          expect(scannedRawData).toStrictEqual(
            expect.objectContaining({
              ref_block_bytes: getRefBlockBytes(200_000), // eslint-disable-line @typescript-eslint/naming-convention
              ref_block_hash: '0011223344556677', // eslint-disable-line @typescript-eslint/naming-convention
              expiration: blockTimestamp + 60_000,
              timestamp: blockTimestamp,
            }),
          );
          expect(finalContext.transactionRawData).toBe(scannedRawData);
        },
      );
    });

    it('exits early when no active interface exists', async () => {
      await withCronHandler(
        { mapInterfaceNameToId: {} },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshConfirmationSend();

          expect(
            mockTransactionScanService.scanTransaction,
          ).not.toHaveBeenCalled();
          expect(mockSnapClient.updateInterface).not.toHaveBeenCalled();
        },
      );
    });

    it('exits early when interface context no longer exists', async () => {
      await withCronHandler(
        { interfaceContext: null },
        async ({ cronHandler, mockTransactionScanService }) => {
          await cronHandler.refreshConfirmationSend();

          expect(
            mockTransactionScanService.scanTransaction,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('skips refresh when required context fields are missing', async () => {
      await withCronHandler(
        {
          interfaceContext: buildMockInterfaceContext({ fromAddress: null }),
        },
        async ({ cronHandler, mockTransactionScanService }) => {
          await cronHandler.refreshConfirmationSend();

          expect(
            mockTransactionScanService.scanTransaction,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('handles scan failure gracefully and sets error state', async () => {
      await withCronHandler(
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          mockTransactionScanService.scanTransaction.mockRejectedValue(
            new Error('Scan API error'),
          );

          await cronHandler.refreshConfirmationSend();

          // Should still update interface with error status
          expect(mockSnapClient.updateInterface).toHaveBeenCalledTimes(2);

          // The final update should have scanFetchStatus: FetchStatus.Error
          const lastUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const contextArg = lastUpdateCall?.[2] as any;
          expect(contextArg?.scanFetchStatus).toBe(FetchStatus.Error);
        },
      );
    });

    it('exits gracefully when interface closes during refresh', async () => {
      const context = buildMockInterfaceContext();
      await withCronHandler(
        { interfaceContext: context },
        async ({ cronHandler, mockSnapClient }) => {
          // First call returns context (initial check), second returns null (closed during scan)
          mockSnapClient.getInterfaceContext
            .mockResolvedValueOnce(context)
            .mockResolvedValueOnce(null);

          await cronHandler.refreshConfirmationSend();

          // Should not schedule next refresh
          expect(mockSnapClient.scheduleBackgroundEvent).not.toHaveBeenCalled();
        },
      );
    });

    it('includes only simulation when useSecurityAlerts is false', async () => {
      await withCronHandler(
        {
          interfaceContext: buildMockInterfaceContext({
            preferences: {
              locale: 'en',
              currency: 'usd',
              hideBalances: false,
              useSecurityAlerts: false,
              useExternalPricingData: true,
              simulateOnChainActions: true,
              useTokenDetection: true,
              batchCheckBalances: true,
              displayNftMedia: false,
              useNftDetection: false,
            },
          }),
        },
        async ({ cronHandler, mockTransactionScanService }) => {
          await cronHandler.refreshConfirmationSend();

          expect(
            mockTransactionScanService.scanTransaction,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              options: ['simulation'],
            }),
          );
        },
      );
    });
  });

  describe('refreshSignTransaction', () => {
    it('rescans the original payload without modifying it', async () => {
      const blockTimestamp = MOCK_BLOCK_TIMESTAMP;
      const currentBlock = createBlock({
        number: 200_000,
        timestamp: blockTimestamp,
        hashSegment: '0011223344556677',
      });
      const interfaceContext = buildMockSignTransactionInterfaceContext();
      const originalRawDataHex = interfaceContext.transaction.rawDataHex;

      await withCronHandler(
        {
          currentBlock,
          interfaceContext,
          mapInterfaceNameToId: {
            [CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME]: 'interface-id-456',
          },
        },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshSignTransaction();

          const scanPayload =
            mockTransactionScanService.scanTransaction.mock.calls[0]?.[0];
          const scannedRawData = scanPayload?.transactionRawData;
          const finalUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const finalContext =
            finalUpdateCall?.[2] as ConfirmSignTransactionContext;

          // The scanned payload is the deserialized original — never refreshed,
          // so its stale TAPOS/expiration values are preserved as-is.
          expect(scannedRawData).toStrictEqual(
            expect.objectContaining({
              ref_block_bytes: '0001', // eslint-disable-line @typescript-eslint/naming-convention
              ref_block_hash: 'outdatedhash', // eslint-disable-line @typescript-eslint/naming-convention
              expiration: blockTimestamp - 1,
              timestamp: blockTimestamp - 60_000,
            }),
          );
          // The stored serialized payload is left untouched.
          expect(finalContext.transaction.rawDataHex).toBe(originalRawDataHex);
        },
      );
    });

    it('sets error state when the scan fails', async () => {
      await withCronHandler(
        {
          interfaceContext: buildMockSignTransactionInterfaceContext(),
          mapInterfaceNameToId: {
            [CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME]: 'interface-id-456',
          },
        },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          mockTransactionScanService.scanTransaction.mockRejectedValue(
            new Error('Scan API error'),
          );

          await cronHandler.refreshSignTransaction();

          expect(mockSnapClient.updateInterface).toHaveBeenCalledTimes(2);

          const finalUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const finalContext =
            finalUpdateCall?.[2] as ConfirmSignTransactionContext;

          expect(finalContext.scan).toBeNull();
          expect(finalContext.scanFetchStatus).toBe(FetchStatus.Error);
          expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
            method: BackgroundEventMethod.RefreshSignTransaction,
            duration: 'PT20S',
          });
        },
      );
    });

    it('surfaces an expired scan result when the TAPOS check detects expiry', async () => {
      await withCronHandler(
        {
          interfaceContext: buildMockSignTransactionInterfaceContext(),
          mapInterfaceNameToId: {
            [CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME]: 'interface-id-456',
          },
          transactionExpired: true,
        },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshSignTransaction();

          const finalUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const finalContext =
            finalUpdateCall?.[2] as ConfirmSignTransactionContext;

          // A benign security scan is overridden by the local TAPOS-expiry
          // detection: an expired transaction won't broadcast regardless of the
          // contract simulation result.
          expect(mockTransactionScanService.scanTransaction).toHaveBeenCalled();
          expect(finalContext.scan?.simulationStatus).toBe(
            SimulationStatus.Failed,
          );
          expect(finalContext.scan?.error?.type).toBe(
            'TransactionTaposExpired',
          );
          expect(finalContext.scanFetchStatus).toBe(FetchStatus.Fetched);
        },
      );
    });

    it('runs the TAPOS expiry check even when security scan is disabled', async () => {
      const interfaceContext = buildMockSignTransactionInterfaceContext();
      interfaceContext.preferences = {
        ...interfaceContext.preferences,
        useSecurityAlerts: false,
        simulateOnChainActions: false,
      };

      await withCronHandler(
        {
          interfaceContext,
          mapInterfaceNameToId: {
            [CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME]: 'interface-id-456',
          },
          transactionExpired: true,
        },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshSignTransaction();

          // The security scan is skipped...
          expect(
            mockTransactionScanService.scanTransaction,
          ).not.toHaveBeenCalled();

          // ...and the refresh does not enter the Fetching state when the
          // security scan is disabled (matching main-branch behaviour), so the
          // confirm button stays enabled while the TAPOS check is in flight.
          const fetchingUpdateCall =
            mockSnapClient.updateInterface.mock.calls[0];
          const fetchingContext =
            fetchingUpdateCall?.[2] as ConfirmSignTransactionContext;
          expect(fetchingContext.scanFetchStatus).not.toBe(
            FetchStatus.Fetching,
          );

          // The local TAPOS-expiry check still surfaces the expired result,
          // which disables the confirm button once resolved (Failed simulation).
          const finalUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const finalContext =
            finalUpdateCall?.[2] as ConfirmSignTransactionContext;

          expect(finalContext.scan?.error?.type).toBe(
            'TransactionTaposExpired',
          );
          expect(finalContext.scanFetchStatus).toBe(FetchStatus.Fetched);
        },
      );
    });

    it('tracks error and skips scan when deserialization fails', async () => {
      const interfaceContext = buildMockSignTransactionInterfaceContext();
      const mockSnapClient = buildMockSnapClient(interfaceContext);
      const mockState = buildMockState({
        [CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME]: 'interface-id-456',
      });
      const mockTransactionScanService = buildMockTransactionScanService(
        buildMockScanResult(),
      );
      const cronHandler = buildCronHandler({
        mockSnapClient,
        mockState,
        mockTransactionScanService,
        transactionExpirationRefresherService: {
          ensureFreshRawData: jest.fn(async ({ rawData }) => rawData),
          deserializeTransaction: jest
            .fn()
            .mockRejectedValue(new Error('deserialize failed')),
          isTransactionExpired: jest.fn().mockResolvedValue(false),
        },
      });

      await cronHandler.refreshSignTransaction();

      expect(mockTransactionScanService.scanTransaction).not.toHaveBeenCalled();
      expect(mockSnapClient.trackError).toHaveBeenCalledTimes(1);
      expect(mockSnapClient.updateInterface).toHaveBeenCalledTimes(2);
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.RefreshSignTransaction,
        duration: 'PT20S',
      });
    });

    it('preserves the scan result when the TAPOS check throws', async () => {
      await withCronHandler(
        {
          interfaceContext: buildMockSignTransactionInterfaceContext(),
          mapInterfaceNameToId: {
            [CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME]: 'interface-id-456',
          },
          transactionExpiredError: new Error('tapos check failed'),
        },
        async ({ cronHandler, mockSnapClient, mockTransactionScanService }) => {
          await cronHandler.refreshSignTransaction();

          // The security re-scan still ran...
          expect(mockTransactionScanService.scanTransaction).toHaveBeenCalled();

          // ...and the TAPOS check fails safe: it logs the error and keeps the
          // benign scan instead of wiping it or synthesizing a false expired
          // result.
          const finalUpdateCall = mockSnapClient.updateInterface.mock.calls[1];
          const finalContext =
            finalUpdateCall?.[2] as ConfirmSignTransactionContext;

          expect(finalContext.scan?.simulationStatus).toBe(
            SimulationStatus.Completed,
          );
          expect(finalContext.scan?.error).toBeNull();
          expect(finalContext.scanFetchStatus).toBe(FetchStatus.Fetched);
        },
      );
    });
  });
});
