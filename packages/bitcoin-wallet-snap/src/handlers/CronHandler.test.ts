import type { WalletTx } from '@metamask/bitcoindevkit';
import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import type { SnapsProvider, JsonRpcRequest } from '@metamask/snaps-sdk';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount, SnapClient, SyncResult } from '../entities';
import { TrackingSnapEvent } from '../entities';
import type { SendFlowUseCases, AccountUseCases } from '../use-cases';
import { CronHandler, CronMethod } from './CronHandler';

jest.mock('@metamask/keyring-snap-sdk', () => ({
  getSelectedAccounts: jest.fn(),
}));

describe('CronHandler', () => {
  const mockSendFlowUseCases = mock<SendFlowUseCases>();
  const mockAccountUseCases = mock<AccountUseCases>();
  const mockSnapClient = mock<SnapClient>();
  const mockSnap = mock<SnapsProvider>();

  const handler = new CronHandler(
    mockAccountUseCases,
    mockSendFlowUseCases,
    mockSnapClient,
    mockSnap,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockSnapClient.getClientStatus.mockResolvedValue({
      active: true,
      locked: false,
      clientVersion: '1.0.0',
      platformVersion: '1.0.0',
    });
  });

  describe('synchronizeAccounts', () => {
    const mockAccount1 = mock<BitcoinAccount>({ id: 'account-1' });
    const mockAccount2 = mock<BitcoinAccount>({ id: 'account-2' });
    const mockAccounts = [mockAccount1, mockAccount2];
    const request = { method: 'synchronizeAccounts' } as JsonRpcRequest;

    it('synchronizes all selected accounts and emits batched events', async () => {
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      (getSelectedAccounts as jest.Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(mockSnapClient.getClientStatus).toHaveBeenCalled();
      expect(mockAccountUseCases.list).toHaveBeenCalled();
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(
        mockAccounts.length,
      );
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccounts);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledTimes(1);
    });

    it('emits transaction events for accounts with new transactions', async () => {
      const mockTx = mock<WalletTx>();
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [mockTx],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      (getSelectedAccounts as jest.Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount1, [mockTx]);
      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from list', async () => {
      const error = new Error();
      (getSelectedAccounts as jest.Mock).mockResolvedValue(['account-1']);
      mockAccountUseCases.list.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });

    it('returns early if the client is not active', async () => {
      mockSnapClient.getClientStatus.mockResolvedValue({
        active: false,
        locked: true,
        clientVersion: '1.0.0',
        platformVersion: '1.0.0',
      });
      await handler.route(request);

      expect(mockAccountUseCases.synchronize).not.toHaveBeenCalled();
    });

    it('throws error if some account fails but still emits for successful ones', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      (getSelectedAccounts as jest.Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(new Error('error'));

      await expect(handler.route(request)).rejects.toThrow(
        'Account synchronization failures',
      );

      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(
        mockAccounts.length,
      );
      // Should still emit for successful account
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0]]);
    });
  });

  describe('refreshRates', () => {
    const request = {
      method: CronMethod.RefreshRates,
      params: { interfaceId: 'id' },
    } as unknown as JsonRpcRequest;

    it('throws if invalid params', async () => {
      await expect(
        handler.route({ ...request, params: { invalid: true } }),
      ).rejects.toThrow('');
    });

    it('refreshes the send form rates', async () => {
      await handler.route(request);

      expect(mockSendFlowUseCases.refresh).toHaveBeenCalledWith('id');
    });

    it('returns early if the client is not active', async () => {
      mockSnapClient.getClientStatus.mockResolvedValue({
        active: false,
        locked: true,
        clientVersion: '1.0.0',
        platformVersion: '1.0.0',
      });
      await handler.route(request);

      expect(mockSendFlowUseCases.refresh).not.toHaveBeenCalled();
    });

    it('propagates errors from refresh', async () => {
      const error = new Error();
      mockSendFlowUseCases.refresh.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });
  });

  describe('syncSelectedAccounts', () => {
    const mockAccount1 = mock<BitcoinAccount>({ id: 'account-1' });
    const mockAccount2 = mock<BitcoinAccount>({ id: 'account-2' });
    const mockAccount3 = mock<BitcoinAccount>({ id: 'account-3' });
    const mockAccounts = [mockAccount1, mockAccount2, mockAccount3];
    const request = {
      method: CronMethod.SyncSelectedAccounts,
      params: { accountIds: ['account-1', 'account-2'] },
    } as unknown as JsonRpcRequest;

    it('throws if invalid params', async () => {
      await expect(
        handler.route({ ...request, params: { invalid: true } }),
      ).rejects.toThrow('');
    });

    it('synchronizes selected accounts and emits batched events', async () => {
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(mockAccountUseCases.list).toHaveBeenCalled();
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(2);
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledWith(
        mockAccounts[0],
        'metamask',
      );
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledWith(
        mockAccounts[1],
        'metamask',
      );
      // Verify batched balance event
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0], mockAccounts[1]]);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledTimes(1);
    });

    it('returns early if the client is not active', async () => {
      mockSnapClient.getClientStatus.mockResolvedValue({
        active: false,
        locked: true,
        clientVersion: '1.0.0',
        platformVersion: '1.0.0',
      });
      await handler.route(request);

      expect(mockAccountUseCases.synchronize).not.toHaveBeenCalled();
    });

    it('propagates errors from list', async () => {
      const error = new Error();
      mockAccountUseCases.list.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });

    it('emits events only for successful accounts when some fail', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const syncError = new Error('scan failed');
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(syncError);

      const result = await handler.route(request);

      expect(result).toBeUndefined();
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(2);
      expect(mockSnapClient.emitTrackingError).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SynchronizationError',
          message: 'Failed to synchronize 1 selected accounts',
          cause: syncError,
        }),
      );

      // Should emit for successful account only
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0]]);
    });
  });

  describe('fullScanAccount', () => {
    const mockAccount = mock<BitcoinAccount>({ id: 'account-1' });
    const request = {
      method: CronMethod.FullScanAccount,
      params: { accountId: 'account-1' },
    } as unknown as JsonRpcRequest;

    it('throws if invalid params', async () => {
      await expect(
        handler.route({ ...request, params: { invalid: true } }),
      ).rejects.toThrow('');
    });

    it('performs full scan and emits events', async () => {
      const mockTxs = [mock<WalletTx>()];
      const mockResult: SyncResult = {
        account: mockAccount,
        transactionsToNotify: mockTxs,
      };
      mockAccountUseCases.get.mockResolvedValue(mockAccount);
      mockAccountUseCases.fullScan.mockResolvedValue(mockResult);

      await handler.route(request);

      expect(mockAccountUseCases.get).toHaveBeenCalledWith('account-1');
      expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccount]);
      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount, mockTxs);
    });

    it('returns early if the client is not active', async () => {
      mockSnapClient.getClientStatus.mockResolvedValue({
        active: false,
        locked: true,
        clientVersion: '1.0.0',
        platformVersion: '1.0.0',
      });
      await handler.route(request);

      expect(mockAccountUseCases.get).not.toHaveBeenCalled();
      expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
    });

    it('propagates errors from get', async () => {
      const error = new Error('get failed');
      mockAccountUseCases.get.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });

    it('propagates errors from fullScan', async () => {
      const error = new Error('fullScan failed');
      mockAccountUseCases.get.mockResolvedValue(mockAccount);
      mockAccountUseCases.fullScan.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });
  });

  describe('synchronizeAllAccounts', () => {
    const mockAccount1 = mock<BitcoinAccount>({ id: 'account-1' });
    const mockAccount2 = mock<BitcoinAccount>({ id: 'account-2' });
    const mockAccounts = [mockAccount1, mockAccount2];
    const request = {
      method: CronMethod.SynchronizeAllAccounts,
    } as unknown as JsonRpcRequest;

    it('returns early if the client is not active', async () => {
      mockSnapClient.getClientStatus.mockResolvedValue({
        active: false,
        locked: true,
        clientVersion: '1.0.0',
        platformVersion: '1.0.0',
      });
      await handler.route(request);

      expect(mockAccountUseCases.synchronize).not.toHaveBeenCalled();
    });

    it('synchronizes every account from list without filtering by selection', async () => {
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(getSelectedAccounts).not.toHaveBeenCalled();
      expect(mockAccountUseCases.list).toHaveBeenCalled();
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(2);
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledWith(
        mockAccount1,
        'cron',
      );
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledWith(
        mockAccount2,
        'cron',
      );
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccounts);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledTimes(1);
    });

    it('throws error if some account fails but still emits for successful ones', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(new Error('error'));

      await expect(handler.route(request)).rejects.toThrow(
        'Account synchronization failures',
      );

      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(2);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0]]);
    });

    it('propagates errors from list', async () => {
      const error = new Error();
      mockAccountUseCases.list.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });
  });

  describe('fullScanAccounts', () => {
    const mockAccount1 = mock<BitcoinAccount>({ id: 'account-1' });
    const mockAccount2 = mock<BitcoinAccount>({ id: 'account-2' });
    const mockAccounts = [mockAccount1, mockAccount2];
    const request = {
      method: CronMethod.FullScanAccounts,
    } as unknown as JsonRpcRequest;

    beforeEach(() => {
      mockAccount1.listTransactions.mockReturnValue([]);
      mockAccount2.listTransactions.mockReturnValue([]);
    });

    it('returns early if the client is not active', async () => {
      mockSnapClient.getClientStatus.mockResolvedValue({
        active: false,
        locked: true,
        clientVersion: '1.0.0',
        platformVersion: '1.0.0',
      });
      await handler.route(request);

      expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
    });

    it('calls fullScan for every account from list', async () => {
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.fullScan
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(mockAccountUseCases.list).toHaveBeenCalled();
      expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
      expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount2);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccounts);
    });

    it('emits a tracking event for each newly-found transaction after a scan increases the tx count', async () => {
      const existingTx = mock<WalletTx>({
        txid: { toString: () => 'existing-txid' },
      });
      const newTx = mock<WalletTx>({
        txid: { toString: () => 'new-txid' },
      });

      mockAccount1.listTransactions
        .mockReturnValueOnce([existingTx])
        .mockReturnValueOnce([existingTx, newTx]);

      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [existingTx, newTx],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.fullScan
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledTimes(1);
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.ScanDiscoveredMissedTransactions,
        mockAccount1,
        newTx,
        'cron',
      );
    });

    it('does not emit a tracking event when the scan finds no new transactions', async () => {
      const existingTx = mock<WalletTx>({
        txid: { toString: () => 'existing-txid' },
      });

      mockAccount1.listTransactions
        .mockReturnValueOnce([existingTx])
        .mockReturnValueOnce([existingTx]);

      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [existingTx],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.fullScan
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await handler.route(request);

      expect(mockSnapClient.emitTrackingEvent).not.toHaveBeenCalled();
    });

    it('aggregates failures without blocking other accounts', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const error = new Error('scan failed');
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.fullScan
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(error);

      await expect(handler.route(request)).rejects.toThrow(
        'Full scan failures',
      );

      expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(2);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0]]);
    });

    it('propagates errors from list', async () => {
      const error = new Error();
      mockAccountUseCases.list.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });
  });
});
