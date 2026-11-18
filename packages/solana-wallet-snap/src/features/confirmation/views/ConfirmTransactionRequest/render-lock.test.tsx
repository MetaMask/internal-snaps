import { SolMethod } from '@metamask/keyring-api';
import type { Mock } from 'vitest';

import { Network } from '../../../../core/constants/solana';
import type { ConfirmTransactionRequestContext } from './types';

const INTERFACE_ID = 'interface-id';

/**
 * Loads `render` with its dependencies replaced. The interface stores contexts
 * the way the real interface does, so a re-read sees the last write, and the
 * lock runs its callback directly.
 *
 * @returns The render function and the spies and stored contexts the tests use.
 */
const setupRender = async (): Promise<{
  render: (
    incomingContext: ConfirmTransactionRequestContext,
  ) => Promise<unknown>;
  getMultipleSpotPrices: Mock;
  scanTransaction: Mock;
  updateInterface: Mock;
  storedContexts: Map<string, ConfirmTransactionRequestContext>;
}> => {
  const storedContexts = new Map<string, ConfirmTransactionRequestContext>();
  const createInterface = vi.fn(
    async (_ui: unknown, context: ConfirmTransactionRequestContext) => {
      storedContexts.set(INTERFACE_ID, context);
      return INTERFACE_ID;
    },
  );
  const updateInterface = vi.fn(
    async (
      id: string,
      _ui: unknown,
      context: ConfirmTransactionRequestContext,
    ) => {
      storedContexts.set(id, context);
    },
  );
  const getInterfaceContext = vi.fn(
    async (id: string) => storedContexts.get(id) ?? null,
  );
  const withInterfaceLock = vi.fn(
    async (_id: string, callback: () => Promise<unknown>) => callback(),
  );
  const getMultipleSpotPrices = vi.fn();
  const scanTransaction = vi.fn();

  vi.doMock('../../../../core/utils/errors', () => ({
    trackError: vi.fn().mockResolvedValue('tracked-error-id'),
  }));
  vi.doMock('../../../../core/fees', () => ({
    FeeCalculator: {
      calculateFee: vi.fn().mockReturnValue({ totalFee: 5000n }),
    },
  }));
  vi.doMock('../../../../core/utils/interface', () => ({
    CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME: 'confirmation-interface',
    createInterface,
    getInterfaceContext,
    getPreferences: vi.fn().mockResolvedValue({
      locale: 'en',
      currency: 'usd',
      useExternalPricingData: true,
      useSecurityAlerts: true,
      simulateOnChainActions: true,
    }),
    showDialog: vi.fn().mockResolvedValue('dialog-result'),
    updateInterface,
    withInterfaceLock,
  }));
  vi.doMock('./ConfirmTransactionRequest', () => ({
    ConfirmTransactionRequest: (): null => null,
  }));
  vi.doMock('../../../../entities', () => ({
    extractInstructionsFromUnknownBase64String: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock('../../utils/extractDestinationAddress', () => ({
    extractDestinationAddress: vi.fn(),
  }));
  vi.doMock('../../utils/analyzeFeePayment', () => ({
    analyzeFeePayment: vi.fn(),
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
    nameResolutionService: {
      resolveAddress: vi.fn().mockResolvedValue(null),
    },
    priceApiClient: {
      getMultipleSpotPrices,
    },
    state: {
      setKey: vi.fn().mockResolvedValue(undefined),
    },
    transactionScanService: {
      scanTransaction,
    },
  }));

  Object.assign(globalThis, {
    snap: {
      request: vi.fn().mockResolvedValue(undefined),
    },
  });

  vi.resetModules();
  const { render } =
    await vi.importActual<typeof import('./render')>('./render');

  return {
    render,
    getMultipleSpotPrices,
    scanTransaction,
    updateInterface,
    storedContexts,
  };
};

describe('render', () => {
  it('keeps an Advanced change the user made while the render was fetching', async () => {
    const {
      render,
      getMultipleSpotPrices,
      scanTransaction,
      updateInterface,
      storedContexts,
    } = await setupRender();

    scanTransaction.mockResolvedValue(null);
    getMultipleSpotPrices.mockImplementation(async () => {
      // The user expands Advanced while the prices are still loading.
      const stored = storedContexts.get(INTERFACE_ID);
      storedContexts.set(INTERFACE_ID, {
        ...stored,
        advanced: { shown: true, instructions: [] },
      } as ConfirmTransactionRequestContext);
      return {};
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

    expect(updateInterface).toHaveBeenCalledTimes(2);
    expect(updateInterface).toHaveBeenLastCalledWith(
      INTERFACE_ID,
      null,
      expect.objectContaining({
        advanced: expect.objectContaining({ shown: true }),
      }),
    );
  });
});
