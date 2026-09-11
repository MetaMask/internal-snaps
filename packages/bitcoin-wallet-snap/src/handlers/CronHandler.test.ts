import type { WalletTx } from '@metamask/bitcoindevkit';
import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import type { SnapsProvider, JsonRpcRequest } from '@metamask/snaps-sdk';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount, SnapClient, SyncResult } from '../entities';
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
    // Default the repair rescan to nothing pending so existing tests don't
    // trigger a repair scan.
    mockSnapClient.getState.mockResolvedValue({ pending: [] });
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

    describe('repair rescan', () => {
      const buildTx = (txid: string): WalletTx =>
        mock<WalletTx>({
          txid: mock<WalletTx['txid']>({ toString: () => txid }),
        });

      beforeEach(() => {
        (getSelectedAccounts as jest.Mock).mockResolvedValue([
          'account-1',
          'account-2',
        ]);
        mockAccountUseCases.list.mockResolvedValue(mockAccounts);
        mockAccountUseCases.synchronize.mockResolvedValue({
          account: mockAccount1,
          transactionsToNotify: [],
        });
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount1,
          transactionsToNotify: [],
        });
        mockAccount1.listTransactions.mockReturnValue([]);
        mockAccount2.listTransactions.mockReturnValue([]);
      });

      it('on first run, persists the full pending list, scans only the first account, and emits for missed transactions', async () => {
        mockSnapClient.getState.mockResolvedValue(null);
        const txBefore = buildTx('txid-existing');
        const txNew = buildTx('txid-new');
        mockAccount1.listTransactions
          .mockReturnValueOnce([txBefore])
          .mockReturnValueOnce([txBefore, txNew]);
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount1,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockSnapClient.getState).toHaveBeenCalledWith('rescanV1');
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
        expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledTimes(1);
        expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
          'Missed Transactions Discovered',
          mockAccount1,
          txNew,
          'cron',
        );
        expect(
          mockSnapClient.emitAccountBalancesUpdatedEvent,
        ).toHaveBeenCalledWith([mockAccount1]);
        expect(mockSnapClient.setState).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-1', 'account-2'],
        });
        expect(mockSnapClient.setState).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-2'],
        });

        // The initial full list is persisted before the first scan, and the
        // shortened list is persisted only after the scan succeeds.
        expect(mockSnapClient.setState).toHaveBeenCalledTimes(2);
        const [initialPersistOrder, shortenedPersistOrder] =
          mockSnapClient.setState.mock.invocationCallOrder;
        const scanOrder =
          mockAccountUseCases.fullScan.mock.invocationCallOrder[0];
        expect(initialPersistOrder).toBeLessThan(scanOrder as number);
        expect(scanOrder).toBeLessThan(shortenedPersistOrder as number);

        // The normal sync flow still runs afterwards.
        expect(mockAccountUseCases.synchronize).toHaveBeenCalled();
      });

      it('on a subsequent run, scans only the next pending account', async () => {
        mockSnapClient.getState.mockResolvedValue({ pending: ['account-2'] });
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount2,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount2);
        expect(mockSnapClient.setState).toHaveBeenCalledWith('rescanV1', {
          pending: [],
        });
      });

      it('prunes deleted accounts from the pending list before scanning', async () => {
        mockSnapClient.getState.mockResolvedValue({
          pending: ['gone', 'account-2'],
        });
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount2,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockSnapClient.setState).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-2'],
        });
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount2);

        // The pruned list is persisted before the scan runs.
        const pruneOrder = mockSnapClient.setState.mock.invocationCallOrder[0];
        const scanOrder =
          mockAccountUseCases.fullScan.mock.invocationCallOrder[0];
        expect(pruneOrder).toBeLessThan(scanOrder as number);
      });

      it('does nothing when nothing is pending, short-circuiting before list()', async () => {
        mockSnapClient.getState.mockResolvedValue({ pending: [] });

        await handler.route(request);

        expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
        expect(mockSnapClient.setState).not.toHaveBeenCalled();
        // The regular sync flow is the only caller of `list()` here — the
        // repair path short-circuits on the empty pending list before
        // reaching it.
        expect(mockAccountUseCases.list).toHaveBeenCalledTimes(1);
      });

      it('reports a scan failure without shortening the pending list, and still runs the regular sync', async () => {
        mockSnapClient.getState.mockResolvedValue({
          pending: ['account-1', 'account-2'],
        });
        const scanError = new Error('scan failed');
        mockAccountUseCases.fullScan.mockRejectedValue(scanError);

        await handler.route(request);

        expect(mockSnapClient.emitTrackingError).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'SynchronizationError',
            message: 'Account repair scan failed',
            cause: scanError,
          }),
        );
        expect(mockSnapClient.setState).not.toHaveBeenCalledWith('rescanV1', {
          pending: ['account-2'],
        });
        expect(mockAccountUseCases.synchronize).toHaveBeenCalled();
      });

      it('treats malformed stored state as unset and reinitializes pending from the account list', async () => {
        mockSnapClient.getState.mockResolvedValue(true);
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount1,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockSnapClient.setState).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-1', 'account-2'],
        });
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
      });
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

  describe('sync coalescing', () => {
    it('coalesces concurrent synchronizeAccounts calls into one run', async () => {
      (getSelectedAccounts as jest.Mock).mockResolvedValue([]);
      mockAccountUseCases.list.mockResolvedValue([]);

      await Promise.all([
        handler.synchronizeAccounts(),
        handler.synchronizeAccounts(),
        handler.synchronizeAccounts(),
      ]);

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(1);
    });

    it('runs synchronizeAccounts again once the previous run has finished', async () => {
      (getSelectedAccounts as jest.Mock).mockResolvedValue([]);
      mockAccountUseCases.list.mockResolvedValue([]);

      await handler.synchronizeAccounts();
      await handler.synchronizeAccounts();

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(2);
    });

    it('rejects all coalesced synchronizeAccounts callers on a shared failure', async () => {
      const mockAccount = mock<BitcoinAccount>({ id: 'account-1' });
      (getSelectedAccounts as jest.Mock).mockResolvedValue(['account-1']);
      mockAccountUseCases.list.mockResolvedValue([mockAccount]);
      mockAccountUseCases.synchronize.mockRejectedValue(
        new Error('sync failed'),
      );

      const first = handler.synchronizeAccounts();
      const second = handler.synchronizeAccounts();

      await expect(first).rejects.toThrow('Account synchronization failures');
      await expect(second).rejects.toThrow('Account synchronization failures');
      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent syncSelectedAccounts calls for the same accounts regardless of order', async () => {
      mockAccountUseCases.list.mockResolvedValue([]);

      await Promise.all([
        handler.syncSelectedAccounts(['account-1', 'account-2']),
        handler.syncSelectedAccounts(['account-2', 'account-1']),
      ]);

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent syncSelectedAccounts calls for duplicate account IDs', async () => {
      mockAccountUseCases.list.mockResolvedValue([]);

      await Promise.all([
        handler.syncSelectedAccounts(['account-1']),
        handler.syncSelectedAccounts(['account-1', 'account-1']),
      ]);

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(1);
    });

    it('does not coalesce syncSelectedAccounts calls for different accounts', async () => {
      mockAccountUseCases.list.mockResolvedValue([]);

      await Promise.all([
        handler.syncSelectedAccounts(['account-1']),
        handler.syncSelectedAccounts(['account-2']),
      ]);

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(2);
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
});
