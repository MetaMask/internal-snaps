import { SolMethod } from '@metamask/keyring-api';
import {
  DEFAULT_METAMASK_ORIGIN,
  serialize,
} from '@metamask/snap-networks-utils';
import type { Mock } from 'vitest';

import { Network } from '../../../../core/constants/solana';
import type { ConfirmTransactionRequestContext } from './types';

type TestHarness = {
  render: typeof import('./render').render;
  DEFAULT_CONFIRMATION_CONTEXT: ConfirmTransactionRequestContext;
  createInterface: Mock;
  getPreferences: Mock;
  showDialog: Mock;
  trackError: Mock;
  calculateFee: Mock;
  extractDestinationAddress: Mock;
  analyzeFeePayment: Mock;
  extractInstructionsFromUnknownBase64String: Mock;
  updateInterface: Mock;
  nameResolutionService: { resolveAddress: Mock };
  priceApiClient: { getMultipleSpotPrices: Mock };
  transactionScanService: { scanTransaction: Mock };
};

const setupTest = async (): Promise<TestHarness> => {
  const trackError = vi.fn().mockResolvedValue('tracked-error-id');
  const calculateFee = vi.fn().mockReturnValue({
    totalFee: 5000n,
  });
  // The interface stores contexts the way the real one does, so the merged
  // writes that `render` makes read the context it created.
  const storedContexts = new Map<string, ConfirmTransactionRequestContext>();
  const createInterface = vi.fn(
    async (_ui: unknown, context: ConfirmTransactionRequestContext) => {
      storedContexts.set('interface-id', context);
      return 'interface-id';
    },
  );
  const getInterfaceContext = vi.fn(
    async (id: string) => storedContexts.get(id) ?? null,
  );
  const withInterfaceLock = vi.fn(
    async (_id: string, callback: () => Promise<unknown>) => callback(),
  );
  const getPreferences = vi.fn().mockResolvedValue({
    locale: 'en',
    currency: 'usd',
    useExternalPricingData: true,
    useSecurityAlerts: true,
    simulateOnChainActions: true,
  });
  const showDialog = vi.fn().mockResolvedValue('dialog-result');
  const updateInterface = vi.fn(
    async (
      id: string,
      _ui: unknown,
      context: ConfirmTransactionRequestContext,
    ) => {
      storedContexts.set(id, context);
    },
  );
  const extractInstructionsFromUnknownBase64String = vi
    .fn()
    .mockResolvedValue([{}]);
  const extractDestinationAddress = vi.fn();
  const analyzeFeePayment = vi.fn();
  const nameResolutionService = {
    resolveAddress: vi.fn().mockResolvedValue(null),
  };
  const priceApiClient = {
    getMultipleSpotPrices: vi.fn().mockResolvedValue({}),
  };
  const transactionScanService = {
    scanTransaction: vi.fn().mockResolvedValue(null),
  };
  const state = {
    setKey: vi.fn().mockResolvedValue(undefined),
  };

  vi.doMock('../../../../core/utils/errors', () => ({
    trackError,
  }));
  vi.doMock('../../../../core/fees', () => ({
    FeeCalculator: {
      calculateFee,
    },
  }));
  vi.doMock('../../../../core/utils/interface', () => ({
    CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME: 'confirmation-interface',
    createInterface,
    getInterfaceContext,
    getPreferences,
    showDialog,
    updateInterface,
    withInterfaceLock,
  }));
  vi.doMock('./ConfirmTransactionRequest', () => ({
    ConfirmTransactionRequest: (): null => null,
  }));
  vi.doMock('../../../../entities', () => ({
    extractInstructionsFromUnknownBase64String,
  }));
  vi.doMock('../../utils/extractDestinationAddress', () => ({
    extractDestinationAddress,
  }));
  vi.doMock('../../utils/analyzeFeePayment', () => ({
    analyzeFeePayment,
  }));
  vi.doMock('../../../../snapContext', () => ({
    accountsService: {
      getAll: vi.fn().mockResolvedValue([]),
    },
    assetsService: {
      getAssetsMetadata: vi.fn(),
    },
    connection: {
      getRpc: vi.fn().mockReturnValue({}),
    },
    nameResolutionService,
    priceApiClient,
    state,
    transactionScanService,
  }));

  Object.assign(globalThis, {
    snap: {
      request: vi.fn().mockResolvedValue(undefined),
    },
  });

  vi.resetModules();
  // `render` is imported after the mocks so that it does not load the real
  // dependencies, and so is its default context.
  const { render, DEFAULT_CONFIRMATION_CONTEXT } =
    await vi.importActual<typeof import('./render')>('./render');

  if (!render) {
    throw new Error('Failed to load render');
  }

  return {
    render,
    DEFAULT_CONFIRMATION_CONTEXT,
    createInterface,
    getPreferences,
    showDialog,
    trackError,
    calculateFee,
    extractDestinationAddress,
    analyzeFeePayment,
    extractInstructionsFromUnknownBase64String,
    updateInterface,
    nameResolutionService,
    priceApiClient,
    transactionScanService,
  };
};

// These tests replace the render dependencies with mocks and do not install the
// snap, so unlike `render.test.tsx` they run under Vitest.
describe('render tracking', () => {
  it.each([
    [false, false, false, 'fetched', 0],
    [false, false, true, 'fetched', 0],
    [true, false, false, 'fetching', 1],
    [false, true, false, 'fetching', 1],
    [true, true, false, 'fetching', 1],
  ] as const)(
    'initializes security=%s simulation=%s expiry=%s with scan state %s',
    async (
      useSecurityAlerts,
      simulateOnChainActions,
      transactionExpired,
      scanFetchStatus,
      expectedScanCalls,
    ) => {
      const {
        render,
        DEFAULT_CONFIRMATION_CONTEXT,
        createInterface,
        getPreferences,
        transactionScanService,
      } = await setupTest();
      getPreferences.mockResolvedValue({
        locale: 'en',
        currency: 'usd',
        useExternalPricingData: false,
        useSecurityAlerts,
        simulateOnChainActions,
      });
      transactionScanService.scanTransaction.mockResolvedValue({
        status: 'SUCCESS',
        estimatedChanges: { assets: [] },
        validation: { type: 'Benign', reason: null },
        error: null,
      });

      await render({
        ...DEFAULT_CONFIRMATION_CONTEXT,
        networkImage: null,
        transactionExpired,
      });

      expect(createInterface).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ scanFetchStatus, transactionExpired }),
      );
      expect(transactionScanService.scanTransaction).toHaveBeenCalledTimes(
        expectedScanCalls,
      );
    },
  );

  it('tracks confirmation fallbacks', async () => {
    const {
      render,
      trackError,
      calculateFee,
      extractDestinationAddress,
      analyzeFeePayment,
      nameResolutionService,
      priceApiClient,
      transactionScanService,
    } = await setupTest();

    const destinationExtractError = new Error('Destination failed');
    const destinationDomainError = new Error('Domain failed');
    const pricesError = new Error('Prices failed');
    const feeError = new Error('Fee failed');
    const feePaymentError = new Error('Fee payment failed');

    extractDestinationAddress.mockImplementation(() => {
      throw destinationExtractError;
    });
    nameResolutionService.resolveAddress
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(destinationDomainError);
    priceApiClient.getMultipleSpotPrices.mockRejectedValue(pricesError);
    calculateFee.mockImplementation(() => {
      throw feeError;
    });
    // The scan service tracks its own failures and resolves with `null`.
    transactionScanService.scanTransaction.mockResolvedValue(null);
    analyzeFeePayment.mockRejectedValue(feePaymentError);

    expect(
      await render({
        method: SolMethod.SignAndSendTransaction,
        scope: Network.Mainnet,
        transaction: 'transaction',
        account: {
          address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
        },
        origin: 'https://metamask.io',
      } as unknown as ConfirmTransactionRequestContext),
    ).toStrictEqual({
      result: false,
      context: { securityProperties: undefined },
    });

    expect(trackError).toHaveBeenCalledWith(destinationExtractError);
    expect(trackError).toHaveBeenCalledWith(pricesError);
    expect(trackError).toHaveBeenCalledWith(feeError);
    expect(trackError).toHaveBeenCalledWith(feePaymentError);
    expect(trackError).toHaveBeenCalledTimes(4);
  });

  it('computes the verdict from the context the dialog resolved with', async () => {
    const { render, showDialog } = await setupTest();
    const securityProperties = {
      securityAlertResponse: 'Malicious',
      securityAlertReason: 'known_attacker',
      securityAlertDescription: 'Known attacker involved in the transaction',
    };
    const decidedContext = {
      method: SolMethod.SignAndSendTransaction,
      origin: DEFAULT_METAMASK_ORIGIN,
      preferences: { useSecurityAlerts: true },
      scan: {
        status: 'SUCCESS',
        estimatedChanges: { assets: [] },
        validation: {
          type: 'Malicious',
          reason: 'known_attacker',
          description: 'Known attacker involved in the transaction',
        },
        error: null,
        validationError: null,
      },
    };
    showDialog.mockResolvedValue({
      result: true,
      context: serialize(decidedContext),
    });

    expect(
      await render({
        method: SolMethod.SignAndSendTransaction,
        scope: Network.Mainnet,
        transaction: 'transaction',
        account: {
          address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
        },
        origin: 'https://metamask.io',
      } as unknown as ConfirmTransactionRequestContext),
    ).toStrictEqual({ result: true, context: { securityProperties } });
  });

  it('reports no security properties when the dialog resolved without a context', async () => {
    const { render, showDialog } = await setupTest();
    showDialog.mockResolvedValue({ result: true, context: null });

    expect(
      await render({
        method: SolMethod.SignAndSendTransaction,
        scope: Network.Mainnet,
        transaction: 'transaction',
        account: {
          address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
        },
        origin: 'https://metamask.io',
      } as unknown as ConfirmTransactionRequestContext),
    ).toStrictEqual({
      result: true,
      context: { securityProperties: undefined },
    });
  });

  it('tells the fee analysis when the instructions cannot be parsed', async () => {
    const {
      render,
      analyzeFeePayment,
      extractInstructionsFromUnknownBase64String,
      updateInterface,
      priceApiClient,
      transactionScanService,
    } = await setupTest();

    extractInstructionsFromUnknownBase64String.mockRejectedValue(
      new Error('Cannot parse'),
    );
    priceApiClient.getMultipleSpotPrices.mockResolvedValue({});
    transactionScanService.scanTransaction.mockResolvedValue(null);
    analyzeFeePayment.mockResolvedValue({
      feePayer: 'CDg3bPoM21fSXEzrXWHWyJR33JHX6xaYboq5p7s4uo48',
      paidBy: 'sponsor',
      userCost: 'free',
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    });

    await render({
      method: SolMethod.SignAndSendTransaction,
      scope: Network.Mainnet,
      transaction: 'transaction',
      account: {
        address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
      },
      origin: 'https://metamask.io',
    } as unknown as ConfirmTransactionRequestContext);

    expect(analyzeFeePayment).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: null }),
    );

    // The analysis owns the verdict, so its result is used as it comes.
    const contextAfterFee = updateInterface.mock.calls[0]?.[2] as
      | ConfirmTransactionRequestContext
      | undefined;
    expect(contextAfterFee?.feePayment).toStrictEqual({
      feePayer: 'CDg3bPoM21fSXEzrXWHWyJR33JHX6xaYboq5p7s4uo48',
      paidBy: 'sponsor',
      userCost: 'free',
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    });
  });
});
