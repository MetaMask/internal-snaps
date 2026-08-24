import { SolMethod } from '@metamask/keyring-api';
import { JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import { transactionScanService, state } from '../../../../snapContext';
import { METAMASK_ORIGIN, Network } from '../../../constants/solana';
import { serialize } from '../../../serialization/serialize';
import { EXPIRED_TRANSACTION_SCAN } from '../../../services/transaction-scan/buildExpiredScanResult';
import { isTransactionBlockhashExpired } from '../../../services/transaction-scan/isTransactionBlockhashExpired';
import { trackError } from '../../../utils/errors';
import { getInterfaceContext, updateInterface } from '../../../utils/interface';
import { refreshConfirmationEstimation } from './refreshConfirmationEstimation';

jest.mock(
  '../../../services/transaction-scan/isTransactionBlockhashExpired',
  () => ({
    isTransactionBlockhashExpired: jest.fn().mockResolvedValue(false),
  }),
);

jest.mock('../../../utils/errors', () => ({
  trackError: jest.fn().mockResolvedValue('tracked-error-id'),
}));

jest.mock('../../../serialization/serialize', () => ({
  serialize: jest.fn((value) => value),
}));

jest.mock('../../../utils/interface', () => ({
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME: 'confirmation-interface',
  getInterfaceContext: jest.fn(),
  updateInterface: jest.fn(),
}));

jest.mock(
  '../../../../features/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest',
  () => ({
    ConfirmTransactionRequest: () => null,
  }),
);

jest.mock('../../../../snapContext', () => ({
  connection: {
    getRpc: jest.fn(),
  },
  state: {
    getKey: jest.fn(),
  },
  transactionScanService: {
    scanTransaction: jest.fn(),
  },
}));

const setupTest = () => {
  jest.clearAllMocks();

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

  (state.getKey as jest.Mock).mockResolvedValue({
    'confirmation-interface': 'interface-id',
  });
  (getInterfaceContext as jest.Mock).mockResolvedValue(interfaceContext);
  (updateInterface as jest.Mock).mockResolvedValue(undefined);
  (serialize as jest.Mock).mockImplementation((value) => value);
  jest.mocked(isTransactionBlockhashExpired).mockResolvedValue(false);

  return interfaceContext;
};

describe('refreshConfirmationEstimation', () => {
  it('disables confirmation with an expired scan result for an invalid blockhash', async () => {
    setupTest();

    (transactionScanService.scanTransaction as jest.Mock).mockResolvedValue({
      status: 'SUCCESS',
    });
    jest.mocked(isTransactionBlockhashExpired).mockResolvedValue(true);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
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

    (transactionScanService.scanTransaction as jest.Mock).mockRejectedValue(
      error,
    );

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
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
    (getInterfaceContext as jest.Mock).mockResolvedValue(interfaceContext);
    jest.mocked(isTransactionBlockhashExpired).mockResolvedValue(true);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
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
      origin: METAMASK_ORIGIN,
    };
    (getInterfaceContext as jest.Mock).mockResolvedValue(interfaceContext);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(isTransactionBlockhashExpired).not.toHaveBeenCalled();
  });

  it('preserves the existing scan while checking a valid blockhash without simulation', async () => {
    const existingScan = { status: 'SUCCESS' };
    const interfaceContext = {
      ...setupTest(),
      preferences: { simulateOnChainActions: false },
      scan: existingScan,
    };

    (getInterfaceContext as jest.Mock).mockResolvedValue(interfaceContext);

    await refreshConfirmationEstimation({
      request: {} as JsonRpcRequest<JsonRpcParams>,
    });

    expect(transactionScanService.scanTransaction).not.toHaveBeenCalled();
    expect(updateInterface).toHaveBeenNthCalledWith(
      1,
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
