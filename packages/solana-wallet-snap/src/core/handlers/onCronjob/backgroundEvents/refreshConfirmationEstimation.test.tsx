import { SolMethod } from '@metamask/keyring-api';
import {
  DEFAULT_METAMASK_ORIGIN,
  serialize,
} from '@metamask/snap-networks-utils';
import * as SnapNetworks from '@metamask/snap-networks-utils';
import type { JsonRpcRequest } from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';

import * as ConfirmTransactionRequestView from '../../../../features/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import {
  ConfirmSignAndSendTransactionFormNames,
  eventHandlers,
} from '../../../../features/confirmation/views/ConfirmTransactionRequest/events';
import type { ConfirmTransactionRequestContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/types';
import {
  connection,
  transactionScanService,
  state,
} from '../../../../snapContext';
import { Network } from '../../../constants/solana';
import { isTransactionBlockhashExpired } from '../../../services/confirmation/isTransactionBlockhashExpired';
import * as BlockhashExpired from '../../../services/confirmation/isTransactionBlockhashExpired';
import * as Errors from '../../../utils/errors';
import { trackError } from '../../../utils/errors';
import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  getInterfaceContext,
  updateInterface,
  withInterfaceLock,
} from '../../../utils/interface';
import * as SnapInterface from '../../../utils/interface';
import { refreshConfirmationEstimation } from './refreshConfirmationEstimation';

const setupTest = () => {
  vi.clearAllMocks();
  vi.spyOn(BlockhashExpired, 'isTransactionBlockhashExpired').mockResolvedValue(
    false,
  );
  vi.spyOn(SnapNetworks, 'serialize').mockImplementation(
    (value) => value as ReturnType<typeof SnapNetworks.serialize>,
  );
  vi.spyOn(SnapInterface, 'getInterfaceContext');
  vi.spyOn(SnapInterface, 'updateInterface');
  vi.spyOn(state, 'getKey');
  vi.spyOn(transactionScanService, 'scanTransaction');
  vi.spyOn(connection, 'getRpc').mockReturnValue({} as never);
  vi.spyOn(
    ConfirmTransactionRequestView,
    'ConfirmTransactionRequest',
  ).mockReturnValue(null as never);

  const interfaceContext = {
    account: {
      address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
    },
    transaction: 'mock-transaction',
    scope: Network.Mainnet,
    method: SolMethod.SignAndSendTransaction,
    origin: 'https://metamask.io',
    preferences: {
      simulateOnChainActions: true,
    },
    scanFetchStatus: 'fetched',
  };

  (state.getKey as Mock).mockResolvedValue({
    [CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME]: 'interface-id',
  });
  (getInterfaceContext as Mock).mockResolvedValue(interfaceContext);
  (updateInterface as Mock).mockResolvedValue(undefined);
  (serialize as Mock).mockImplementation((value) => value);
  vi.mocked(isTransactionBlockhashExpired).mockResolvedValue(false);

  return interfaceContext;
};

describe('refreshConfirmationEstimation', () => {
  beforeEach(() => {
    vi.spyOn(Errors, 'trackError').mockResolvedValue('tracked-error-id');
  });

  it('stores local expiry separately without replacing the API scan', async () => {
    setupTest();

    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'SUCCESS',
    });
    vi.mocked(isTransactionBlockhashExpired).mockResolvedValue(true);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest,
    });

    expect(updateInterface).toHaveBeenCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        transactionExpired: true,
        scan: { status: 'SUCCESS' },
        scanFetchStatus: 'fetched',
      }),
    );
  });

  it('tracks unexpected refresh failures and restores the fetched state', async () => {
    setupTest();

    const error = new Error('Scan failed');

    (transactionScanService.scanTransaction as Mock).mockRejectedValue(error);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest,
    });

    expect(trackError).toHaveBeenCalledWith(error);
    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        scanFetchStatus: 'fetched',
      }),
    );
  });

  it('checks blockhash expiry when simulation is disabled', async () => {
    const interfaceContext = setupTest();

    interfaceContext.preferences = {
      simulateOnChainActions: false,
    };
    (getInterfaceContext as Mock).mockResolvedValue(interfaceContext);
    vi.mocked(isTransactionBlockhashExpired).mockResolvedValue(true);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest,
    });

    expect(transactionScanService.scanTransaction).not.toHaveBeenCalled();
    expect(isTransactionBlockhashExpired).toHaveBeenCalled();
    expect(updateInterface).toHaveBeenCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        transactionExpired: true,
        scanFetchStatus: 'fetched',
      }),
    );
  });

  it('does not check blockhash expiry for MetaMask-origin transactions', async () => {
    const interfaceContext = {
      ...setupTest(),
      origin: DEFAULT_METAMASK_ORIGIN,
    };
    (getInterfaceContext as Mock).mockResolvedValue(interfaceContext);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest,
    });

    expect(isTransactionBlockhashExpired).not.toHaveBeenCalled();
  });

  it('keeps a known local expiry when the next scan and expiry RPC are unavailable', async () => {
    const interfaceContext = { ...setupTest(), transactionExpired: true };
    (getInterfaceContext as Mock).mockResolvedValue(interfaceContext);
    (transactionScanService.scanTransaction as Mock).mockResolvedValue(null);
    vi.mocked(isTransactionBlockhashExpired).mockResolvedValue(false);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        transactionExpired: true,
        scanFetchStatus: 'error',
      }),
    );
  });

  it('preserves a newly detected expiry when the scan is unavailable', async () => {
    setupTest();
    (transactionScanService.scanTransaction as Mock).mockResolvedValue(null);
    vi.mocked(isTransactionBlockhashExpired).mockResolvedValue(true);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        transactionExpired: true,
        scanFetchStatus: 'error',
      }),
    );
  });

  it('re-scans validation-only and preserves the scan result without a fetching state when simulation is disabled', async () => {
    const existingScan = { status: 'SUCCESS' };
    const interfaceContext = {
      ...setupTest(),
      preferences: { simulateOnChainActions: false, useSecurityAlerts: true },
      scan: existingScan,
    };

    (getInterfaceContext as Mock).mockResolvedValue(interfaceContext);
    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'SUCCESS',
    });

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest,
    });

    expect(transactionScanService.scanTransaction).toHaveBeenCalledTimes(1);
    expect(transactionScanService.scanTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['validation'] }),
    );
    expect(updateInterface).not.toHaveBeenCalledWith(
      'interface-id',
      null,
      expect.objectContaining({ scanFetchStatus: 'fetching' }),
    );
    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        scan: { status: 'SUCCESS' },
        scanFetchStatus: 'fetched',
      }),
    );
  });

  it('re-scans with preference-respecting options when simulation is enabled', async () => {
    setupTest();

    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'SUCCESS',
    });

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(transactionScanService.scanTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['simulation'] }),
    );
  });

  it('never sets the fetching state while re-scanning so confirm stays enabled', async () => {
    setupTest();

    (transactionScanService.scanTransaction as Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          // The scan is in flight while the pre-scan interface update happens.
          setTimeout(() => resolve({ status: 'SUCCESS' }), 50);
        }),
    );

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).not.toHaveBeenCalledWith(
      'interface-id',
      null,
      expect.objectContaining({ scanFetchStatus: 'fetching' }),
    );
    expect(updateInterface).toHaveBeenCalledTimes(1);
  });

  it('marks the scan as errored without blocking confirm when the re-scan fails', async () => {
    setupTest();

    (transactionScanService.scanTransaction as Mock).mockResolvedValue(null);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        scan: null,
        scanFetchStatus: 'error',
      }),
    );
  });

  it('keeps the known verdict when a background refresh fails', async () => {
    const interfaceContext = setupTest();
    const maliciousScan = {
      status: 'SUCCESS',
      estimatedChanges: { assets: [] },
      validation: { type: 'Malicious', reason: null },
      error: null,
      validationError: null,
    };
    (getInterfaceContext as Mock).mockResolvedValue({
      ...interfaceContext,
      scan: maliciousScan,
    });
    (transactionScanService.scanTransaction as Mock).mockResolvedValue(null);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        scan: maliciousScan,
        scanFetchStatus: 'error',
      }),
    );
  });

  it('keeps the known verdict when a refresh has none, and updates the simulation', async () => {
    const interfaceContext = setupTest();
    const maliciousScan = {
      status: 'SUCCESS',
      estimatedChanges: { assets: [] },
      validation: { type: 'Malicious', reason: null },
      error: null,
      validationError: null,
    };
    const refreshedAssets = [
      {
        type: 'out',
        symbol: 'SOL',
        name: 'Solana',
        logo: null,
        value: '1',
        price: null,
      },
    ];
    (getInterfaceContext as Mock).mockResolvedValue({
      ...interfaceContext,
      scan: maliciousScan,
    });
    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'ERROR',
      estimatedChanges: { assets: refreshedAssets },
      validation: { type: null, reason: null },
      error: null,
      validationError: { type: 'validation', code: null, message: null },
    });

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        scan: {
          status: 'ERROR',
          estimatedChanges: { assets: refreshedAssets },
          validation: maliciousScan.validation,
          error: null,
          validationError: null,
        },
      }),
    );
  });

  it('keeps acknowledgement state written while the scan is pending', async () => {
    const interfaceContext = setupTest();
    const latestContext = {
      ...interfaceContext,
      acknowledgementScreen: true,
      acknowledged: true,
    };
    (getInterfaceContext as Mock)
      .mockResolvedValueOnce(interfaceContext) // Read when the refresh starts.
      .mockResolvedValueOnce(latestContext); // Read before the merge.
    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'SUCCESS',
    });

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        acknowledgementScreen: true,
        acknowledged: true,
        scanFetchStatus: 'fetched',
      }),
    );
  });

  it('does not confirm an expired transaction after a refresh persists the expiry', async () => {
    setupTest();
    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'SUCCESS',
    });
    vi.mocked(isTransactionBlockhashExpired).mockResolvedValue(true);
    const resolveSpy = vi
      .spyOn(SnapInterface, 'resolveInterface')
      .mockResolvedValue(undefined as never);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    // The confirm handler reads the context that the refresh just stored.
    const persistedContext = (updateInterface as Mock).mock.lastCall?.[2] as
      | ConfirmTransactionRequestContext
      | undefined;
    expect(persistedContext?.transactionExpired).toBe(true);

    (getInterfaceContext as Mock).mockResolvedValue(persistedContext);
    await eventHandlers[ConfirmSignAndSendTransactionFormNames.Confirm]({
      id: 'interface-id',
    });

    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('applies the re-scan result only after the interface lock is released', async () => {
    setupTest();
    (transactionScanService.scanTransaction as Mock).mockResolvedValue({
      status: 'SUCCESS',
    });

    let releaseLock!: () => void;
    const heldLock = withInterfaceLock('interface-id', async () => {
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    });

    const refresh = refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(updateInterface).not.toHaveBeenCalled();

    releaseLock();
    await Promise.all([heldLock, refresh]);

    expect(updateInterface).toHaveBeenCalledWith(
      'interface-id',
      null,
      expect.objectContaining({ scanFetchStatus: 'fetched' }),
    );
  });
});
