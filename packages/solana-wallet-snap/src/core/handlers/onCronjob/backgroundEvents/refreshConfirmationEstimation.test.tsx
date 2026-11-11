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
  connection,
  transactionScanService,
  state,
} from '../../../../snapContext';
import { Network } from '../../../constants/solana';
import { EXPIRED_TRANSACTION_SCAN } from '../../../services/transaction-scan/buildExpiredScanResult';
import { isTransactionBlockhashExpired } from '../../../services/transaction-scan/isTransactionBlockhashExpired';
import * as BlockhashExpired from '../../../services/transaction-scan/isTransactionBlockhashExpired';
import * as Errors from '../../../utils/errors';
import { trackError } from '../../../utils/errors';
import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  getInterfaceContext,
  updateInterface,
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

  it('disables confirmation with an expired scan result for an invalid blockhash', async () => {
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
        scan: EXPIRED_TRANSACTION_SCAN,
        scanFetchStatus: 'fetched',
      }),
    );
  });

  it('tracks refresh failures and restores the fetched state', async () => {
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
        scan: EXPIRED_TRANSACTION_SCAN,
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

  it('preserves the existing scan without a fetching state while checking a valid blockhash without simulation', async () => {
    const existingScan = { status: 'SUCCESS' };
    const interfaceContext = {
      ...setupTest(),
      preferences: { simulateOnChainActions: false, useSecurityAlerts: true },
      scan: existingScan,
    };

    (getInterfaceContext as Mock).mockResolvedValue(interfaceContext);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest,
    });

    expect(transactionScanService.scanTransaction).not.toHaveBeenCalled();
    expect(updateInterface).not.toHaveBeenCalledWith(
      'interface-id',
      null,
      expect.objectContaining({ scanFetchStatus: 'fetching' }),
    );
    expect(updateInterface).toHaveBeenLastCalledWith(
      'interface-id',
      null,
      expect.objectContaining({
        scan: existingScan,
        scanFetchStatus: 'fetched',
      }),
    );
  });
});
