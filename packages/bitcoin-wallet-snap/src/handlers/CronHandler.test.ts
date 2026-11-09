import type { Amount, WalletTx } from '@metamask/bitcoindevkit';
import { TransactionType } from '@metamask/keyring-api';
import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import * as KeyringSnapSdk from '@metamask/keyring-snap-sdk';
import { State, SynchronizationError } from '@metamask/snap-networks-utils';
import type { IStateManager } from '@metamask/snap-networks-utils';
import type { Json, SnapsProvider, JsonRpcRequest } from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';

import snapManifest from '../../snap.manifest.json';
import type {
  BitcoinAccount,
  Logger,
  SnapClient,
  SnapState,
  SyncResult,
} from '../entities';
import type { SendFlowUseCases, AccountUseCases } from '../use-cases';
import { CronHandler, CronMethod } from './CronHandler';

describe('CronHandler', () => {
  const mockSendFlowUseCases = mock<SendFlowUseCases>();
  const mockAccountUseCases = mock<AccountUseCases>();
  const mockSnapClient = mock<SnapClient>();
  const mockState = mock<IStateManager<Partial<SnapState>>>();
  const mockSnap = mock<SnapsProvider>();
  const mockLogger = mock<Logger>();

  const handler = new CronHandler(
    mockAccountUseCases,
    mockSendFlowUseCases,
    mockSnapClient,
    mockState,
    mockSnap,
    mockLogger,
  );

  beforeEach(() => {
    vi.spyOn(KeyringSnapSdk, 'getSelectedAccounts');
    vi.clearAllMocks();
    mockSnapClient.getClientStatus.mockResolvedValue({
      active: true,
      locked: false,
      clientVersion: '1.0.0',
      platformVersion: '1.0.0',
    });
    // Default the repair rescan to nothing pending so existing tests don't
    // trigger a repair scan.
    mockState.getKey.mockResolvedValue({ pending: [] });
    mockAccountUseCases.isBalanceUnknown.mockResolvedValue(false);
  });

  describe('synchronizeAccounts', () => {
    const mockAccount1 = mock<BitcoinAccount>({ id: 'account-1' });
    const mockAccount2 = mock<BitcoinAccount>({ id: 'account-2' });
    const mockAccounts = [mockAccount1, mockAccount2];
    const request = { method: 'synchronizeAccounts' } as JsonRpcRequest;

    beforeEach(() => {
      // Transactions built from these accounts are classified as receives.
      const receivedAmount = mock<Amount>();
      receivedAmount.to_btc.mockReturnValue(0);
      for (const account of mockAccounts) {
        vi.mocked(account.sentAndReceived).mockReturnValue([
          receivedAmount,
          receivedAmount,
        ]);
      }
    });

    it('synchronizes all selected accounts and emits batched events', async () => {
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const mockResult2: SyncResult = {
        account: mockAccount2,
        transactionsToNotify: [],
      };
      (getSelectedAccounts as Mock).mockResolvedValue([
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
      (getSelectedAccounts as Mock).mockResolvedValue([
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

    it('forwards resolved senders when emitting transaction events', async () => {
      const mockTx = mock<WalletTx>();
      const senders = new Map([['txid-1', ['bc1qsender']]]);
      const mockResult1: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [mockTx],
        transactionSenders: senders,
      };
      (getSelectedAccounts as Mock).mockResolvedValue(['account-1']);
      mockAccountUseCases.list.mockResolvedValue([mockAccount1]);
      mockAccountUseCases.synchronize.mockResolvedValueOnce(mockResult1);

      await handler.route(request);

      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount1, [mockTx], senders);
    });

    it('propagates errors from list', async () => {
      const error = new Error();
      (getSelectedAccounts as Mock).mockResolvedValue(['account-1']);
      mockAccountUseCases.list.mockRejectedValue(error);

      await expect(handler.route(request)).rejects.toThrow(error);
    });

    it.each([
      { active: false, locked: true },
      { active: false, locked: false },
      { active: true, locked: true },
    ])(
      'does not access state when the client is unavailable: %j',
      async (status) => {
        mockSnapClient.getClientStatus.mockResolvedValue({
          ...status,
          clientVersion: '1.0.0',
          platformVersion: '1.0.0',
        });
        await handler.route(request);

        expect(mockAccountUseCases.synchronize).not.toHaveBeenCalled();
        expect(mockState.getKey).not.toHaveBeenCalled();
        expect(mockState.setKey).not.toHaveBeenCalled();
      },
    );

    it('reports failed accounts but still emits for successful ones', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      const syncError = new Error('error');
      (getSelectedAccounts as Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(syncError);

      await handler.route(request);

      expect(mockSnapClient.emitTrackingError).toHaveBeenCalledTimes(1);
      const [error] = mockSnapClient.emitTrackingError.mock.calls[0] as [Error];
      expect(error).toBeInstanceOf(SynchronizationError);
      expect(error.message).toBe(
        'synchronizeAccounts: Account synchronization failures (1 failed): account-2: Error: error',
      );

      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(
        mockAccounts.length,
      );
      // Should still emit for successful account
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0]]);
    });

    it('reports every failed account with its reason when several fail', async () => {
      (getSelectedAccounts as Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockRejectedValueOnce(new Error('esplora down'))
        .mockRejectedValueOnce(new Error('rate limited'));

      await handler.route(request);

      expect(mockSnapClient.emitTrackingError).toHaveBeenCalledTimes(1);
      const [error] = mockSnapClient.emitTrackingError.mock.calls[0] as [Error];
      expect(error).toBeInstanceOf(SynchronizationError);
      expect(error.message).toBe(
        'synchronizeAccounts: Account synchronization failures (2 failed): account-1: Error: esplora down; account-2: Error: rate limited',
      );
    });

    it('reports the wrapper error message as the failure reason', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      (getSelectedAccounts as Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        // Wrapped errors report the wrapper's message together with the
        // cause's message.
        .mockRejectedValueOnce(
          new Error('Failed to synchronize account', {
            cause: new Error('502 Bad Gateway'),
          }),
        );

      await handler.route(request);

      const [error] = mockSnapClient.emitTrackingError.mock.calls[0] as [Error];
      expect(error.message).toBe(
        'synchronizeAccounts: Account synchronization failures (1 failed): account-2: Error: Failed to synchronize account (Error: 502 Bad Gateway)',
      );
    });

    it('stringifies non-error rejection reasons defensively', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      (getSelectedAccounts as Mock).mockResolvedValue([
        'account-1',
        'account-2',
      ]);
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce({
          toString() {
            throw new Error('hostile toString');
          },
        });

      await handler.route(request);

      const [error] = mockSnapClient.emitTrackingError.mock.calls[0] as [Error];
      expect(error.message).toBe(
        'synchronizeAccounts: Account synchronization failures (1 failed): account-2: Unknown error',
      );
    });

    describe('repair rescan', () => {
      const buildTx = (txid: string): WalletTx =>
        mock<WalletTx>({
          txid: mock<WalletTx['txid']>({ toString: () => txid }),
        });

      beforeEach(() => {
        (getSelectedAccounts as Mock).mockResolvedValue([
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

      it('schedules a single synchronization job for normal sync and repair', () => {
        expect(
          snapManifest.initialPermissions['endowment:cronjob'].jobs,
        ).toStrictEqual([
          { duration: 'PT30S', request: { method: 'synchronizeAccounts' } },
        ]);
      });

      it('publishes normal updates first and prevents later same-account sync from overtaking repair', async () => {
        (getSelectedAccounts as Mock).mockResolvedValue(['account-1']);
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        const normalTransaction = buildTx('normal-tx');
        const pendingTransaction = mock<WalletTx>({
          txid: mock<WalletTx['txid']>({ toString: () => 'repair-tx' }),
          chain_position: mock<WalletTx['chain_position']>({
            is_confirmed: false,
          }),
        });
        const confirmedTransaction = mock<WalletTx>({
          txid: mock<WalletTx['txid']>({ toString: () => 'repair-tx' }),
          chain_position: mock<WalletTx['chain_position']>({
            is_confirmed: true,
          }),
        });
        const latestAccount = mock<BitcoinAccount>({ id: mockAccount1.id });
        mockAccountUseCases.synchronize.mockResolvedValue({
          account: mockAccount1,
          transactionsToNotify: [normalTransaction],
        });
        let releaseRepair!: (result: SyncResult) => void;
        const repairResult = new Promise<SyncResult>((resolve) => {
          releaseRepair = resolve;
        });
        let notifyRepairStarted!: () => void;
        const repairStarted = new Promise<void>((resolve) => {
          notifyRepairStarted = resolve;
        });
        mockAccountUseCases.fullScan.mockImplementation(async () => {
          notifyRepairStarted();
          return repairResult;
        });

        const firstRun = handler.synchronizeAccounts();
        let overlappingRun: Promise<void> | undefined;
        try {
          await Promise.race([repairStarted, firstRun]);
          expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
          overlappingRun = handler.synchronizeAccounts();
          await Promise.resolve();

          expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(1);
          expect(
            mockSnapClient.emitAccountBalancesUpdatedEvent,
          ).toHaveBeenCalledTimes(1);
          expect(
            mockSnapClient.emitAccountBalancesUpdatedEvent,
          ).toHaveBeenCalledWith([mockAccount1]);
          expect(
            mockSnapClient.emitAccountTransactionsUpdatedEvent,
          ).toHaveBeenCalledWith(mockAccount1, [normalTransaction]);
          expect(mockState.setKey).not.toHaveBeenCalled();
        } finally {
          releaseRepair({
            account: mockAccount1,
            transactionsToNotify: [pendingTransaction],
          });
          await Promise.all([firstRun, overlappingRun]);
        }

        mockState.getKey.mockResolvedValue({ pending: [] });
        mockAccountUseCases.list.mockResolvedValue([latestAccount]);
        mockAccountUseCases.synchronize.mockResolvedValue({
          account: latestAccount,
          transactionsToNotify: [confirmedTransaction],
        });
        await handler.synchronizeAccounts();

        expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(2);
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
        expect(
          mockSnapClient.emitAccountBalancesUpdatedEvent,
        ).toHaveBeenLastCalledWith([latestAccount]);
        expect(
          mockSnapClient.emitAccountTransactionsUpdatedEvent.mock.calls,
        ).toStrictEqual([
          [mockAccount1, [normalTransaction]],
          [mockAccount1, [pendingTransaction]],
          [latestAccount, [confirmedTransaction]],
        ]);
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: [],
        });
      });

      it('waits for normal synchronization and event publication before starting repair', async () => {
        (getSelectedAccounts as Mock).mockResolvedValue(['account-2']);
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        let releaseSynchronization!: (result: SyncResult) => void;
        const syncResult = new Promise<SyncResult>((resolve) => {
          releaseSynchronization = resolve;
        });
        let notifySyncStarted!: () => void;
        const syncStarted = new Promise<void>((resolve) => {
          notifySyncStarted = resolve;
        });
        mockAccountUseCases.synchronize.mockImplementation(async () => {
          notifySyncStarted();
          return syncResult;
        });
        const synchronization = handler.synchronizeAccounts();
        try {
          await syncStarted;
          expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
        } finally {
          releaseSynchronization({
            account: mockAccount2,
            transactionsToNotify: [],
          });
          await synchronization;
        }
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
        expect(
          mockSnapClient.emitAccountBalancesUpdatedEvent.mock
            .invocationCallOrder[0],
        ).toBeLessThan(
          mockAccountUseCases.fullScan.mock.invocationCallOrder[0] as number,
        );
      });

      it('does not start repair if the client locks during normal synchronization', async () => {
        (getSelectedAccounts as Mock).mockResolvedValue(['account-2']);
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        let releaseSynchronization!: (result: SyncResult) => void;
        const syncResult = new Promise<SyncResult>((resolve) => {
          releaseSynchronization = resolve;
        });
        mockAccountUseCases.synchronize.mockReturnValue(syncResult);
        const synchronization = handler.synchronizeAccounts();
        mockSnapClient.getClientStatus.mockResolvedValue({
          active: true,
          locked: true,
          clientVersion: '1.0.0',
          platformVersion: '1.0.0',
        });
        releaseSynchronization({
          account: mockAccount2,
          transactionsToNotify: [],
        });
        await synchronization;

        expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
        expect(mockState.getKey).not.toHaveBeenCalled();
      });

      it('retries a failed repair during the next synchronization run', async () => {
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        mockAccountUseCases.fullScan.mockRejectedValueOnce(
          new Error('scan failed'),
        );
        await handler.route(request);
        expect(mockState.setKey).not.toHaveBeenCalled();

        await handler.route(request);

        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(2);
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: [],
        });
      });

      it('can retry synchronization after a failure and then repair pending accounts', async () => {
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        mockAccountUseCases.list.mockRejectedValueOnce(
          new Error('list failed'),
        );
        await expect(handler.synchronizeAccounts()).rejects.toThrow(
          'list failed',
        );
        expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();

        await handler.synchronizeAccounts();

        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
        expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(2);
      });

      it('still repairs accounts when individual normal account synchronizations fail', async () => {
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        mockAccountUseCases.synchronize.mockRejectedValue(
          new Error('sync failed'),
        );

        await handler.route(request);

        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: [],
        });
      });

      it.each([
        { active: false, locked: false },
        { active: true, locked: true },
      ])('does not repair when the client is %o', async (status) => {
        mockState.getKey.mockResolvedValue({ pending: ['account-1'] });
        mockSnapClient.getClientStatus.mockResolvedValue({
          ...status,
          clientVersion: '1.0.0',
          platformVersion: '1.0.0',
        });
        await handler.route(request);
        expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
        expect(mockState.getKey).not.toHaveBeenCalled();
      });

      it('on first run, persists the full pending list, scans only the first account, and emits for missed transactions', async () => {
        const state: Pick<SnapState, 'rescanV1'> = {};
        mockState.getKey.mockResolvedValue(state.rescanV1);
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

        expect(mockState.getKey).toHaveBeenCalledWith('rescanV1');
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
        expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledTimes(1);
        expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
          'Missed Transactions Discovered',
          mockAccount1,
          txNew,
          'cron',
          TransactionType.Receive,
        );
        expect(
          mockSnapClient.emitAccountBalancesUpdatedEvent,
        ).toHaveBeenCalledWith([mockAccount1]);
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-1', 'account-2'],
        });
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-2'],
        });

        // The initial full list is persisted before the first scan, and the
        // shortened list is persisted only after the scan succeeds.
        expect(mockState.setKey).toHaveBeenCalledTimes(2);
        const [initialPersistOrder, shortenedPersistOrder] =
          mockState.setKey.mock.invocationCallOrder;
        const scanOrder =
          mockAccountUseCases.fullScan.mock.invocationCallOrder[0];
        expect(initialPersistOrder).toBeLessThan(scanOrder as number);
        expect(scanOrder).toBeLessThan(shortenedPersistOrder as number);

        expect(mockAccountUseCases.synchronize).toHaveBeenCalled();
      });

      it('on a subsequent run, scans only the next pending account', async () => {
        const state: Pick<SnapState, 'rescanV1'> = {
          rescanV1: { pending: ['account-2'] },
        };
        mockState.getKey.mockResolvedValue(state.rescanV1);
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount2,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockAccountUseCases.fullScan).toHaveBeenCalledTimes(1);
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount2);
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: [],
        });
      });

      it('prunes deleted accounts from the pending list before scanning', async () => {
        mockState.getKey.mockResolvedValue({
          pending: ['gone', 'account-2'],
        });
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount2,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-2'],
        });
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount2);

        // The pruned list is persisted before the scan runs.
        const pruneOrder = mockState.setKey.mock.invocationCallOrder[0];
        const scanOrder =
          mockAccountUseCases.fullScan.mock.invocationCallOrder[0];
        expect(pruneOrder).toBeLessThan(scanOrder as number);
      });

      it('does not scan when every pending account has been deleted', async () => {
        mockState.getKey.mockResolvedValue({ pending: ['gone'] });

        await handler.route(request);

        // The pending list is pruned to nothing, and the repair pass ends
        // without scanning anything.
        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: [],
        });
        expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
      });

      it('does nothing when nothing is pending, short-circuiting before list()', async () => {
        mockState.getKey.mockResolvedValue({ pending: [] });

        await handler.route(request);

        expect(mockAccountUseCases.fullScan).not.toHaveBeenCalled();
        expect(mockState.setKey).not.toHaveBeenCalled();
        expect(mockAccountUseCases.list).toHaveBeenCalledTimes(1);
      });

      it('reports a repair failure without shortening the pending list', async () => {
        mockState.getKey.mockResolvedValue({
          pending: ['account-1', 'account-2'],
        });
        const scanError = new Error('scan failed');
        mockAccountUseCases.fullScan.mockRejectedValue(scanError);

        await handler.route(request);

        expect(mockSnapClient.emitTrackingError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Account repair scan failed',
            cause: scanError,
          }),
        );
        // A failed repair remains pending for the next synchronization run.
        expect(mockState.setKey).not.toHaveBeenCalledWith('rescanV1', {
          pending: ['account-2'],
        });
        expect(mockAccountUseCases.synchronize).toHaveBeenCalled();
      });

      it('treats malformed stored state as unset and reinitializes pending from the account list', async () => {
        mockState.getKey.mockResolvedValue(true);
        mockAccountUseCases.fullScan.mockResolvedValue({
          account: mockAccount1,
          transactionsToNotify: [],
        });

        await handler.route(request);

        expect(mockState.setKey).toHaveBeenCalledWith('rescanV1', {
          pending: ['account-1', 'account-2'],
        });
        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
      });

      it('holds back the balance of a synced account whose balance is still unknown', async () => {
        mockAccountUseCases.synchronize
          .mockResolvedValueOnce({
            account: mockAccount1,
            transactionsToNotify: [],
          })
          .mockResolvedValueOnce({
            account: mockAccount2,
            transactionsToNotify: [],
          });
        mockAccountUseCases.isBalanceUnknown.mockImplementation(
          async (account) => account === mockAccount1,
        );

        await handler.route(request);

        expect(
          mockSnapClient.emitAccountBalancesUpdatedEvent,
        ).toHaveBeenCalledWith([mockAccount2]);
      });

      it('emits no balance event when every synced balance is unknown', async () => {
        mockAccountUseCases.isBalanceUnknown.mockResolvedValue(true);

        await handler.route(request);

        expect(
          mockSnapClient.emitAccountBalancesUpdatedEvent,
        ).not.toHaveBeenCalled();
      });

      it('uses shared unencrypted state without overwriting a concurrent index update', async () => {
        const stored: Record<string, Json> = {
          rescanV1: { pending: ['account-1'] },
          derivationPaths: { existing: 'account-1' },
        };
        const requestState = vi.fn(
          async ({
            method,
            params,
          }: {
            method: 'snap_getState' | 'snap_setState';
            params: { key: string; value: Json; encrypted: boolean };
          }) => {
            if (method === 'snap_getState') {
              const value = JSON.parse(
                JSON.stringify(stored[params.key] ?? null),
              );
              await Promise.resolve();
              return value;
            }
            stored[params.key] = params.value;
            return null;
          },
        );
        Object.defineProperty(globalThis, 'snap', {
          configurable: true,
          value: { request: requestState },
          writable: true,
        });
        const state = new State<Partial<SnapState>>({
          encrypted: false,
          defaultState: { derivationPaths: {} },
        });
        const stateHandler = new CronHandler(
          mockAccountUseCases,
          mockSendFlowUseCases,
          mockSnapClient,
          state,
          mockSnap,
          mockLogger,
        );

        await Promise.all([
          stateHandler.route(request),
          state.setKeyWith<SnapState['derivationPaths']>(
            'derivationPaths',
            (current) => ({ ...current, concurrent: 'account-2' }),
          ),
        ]);

        expect(mockAccountUseCases.fullScan).toHaveBeenCalledWith(mockAccount1);
        expect(stored).toStrictEqual({
          rescanV1: { pending: [] },
          derivationPaths: {
            existing: 'account-1',
            concurrent: 'account-2',
          },
        });
        expect(requestState).toHaveBeenCalledWith({
          method: 'snap_setState',
          params: {
            key: 'rescanV1',
            value: { pending: [] },
            encrypted: false,
          },
        });
        expect(
          requestState.mock.calls.every(([call]) => !call.params.encrypted),
        ).toBe(true);
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
      const [trackedError] = mockSnapClient.emitTrackingError.mock.calls[0] as [
        Error,
      ];
      expect(trackedError).toBeInstanceOf(SynchronizationError);
      expect(trackedError.message).toBe(
        'syncSelectedAccounts: Account synchronization failures (1 failed): account-2: Error: scan failed',
      );

      // Should emit for successful account only
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccounts[0]]);
    });

    it('reports every failed account with its reason when several fail', async () => {
      const syncError1 = new Error('esplora down');
      const syncError2 = new Error('rate limited');
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockRejectedValueOnce(syncError1)
        .mockRejectedValueOnce(syncError2);

      await handler.route(request);

      expect(mockSnapClient.emitTrackingError).toHaveBeenCalledTimes(1);
      const [trackedError] = mockSnapClient.emitTrackingError.mock.calls[0] as [
        Error,
      ];
      expect(trackedError).toBeInstanceOf(SynchronizationError);
      expect(trackedError.message).toBe(
        'syncSelectedAccounts: Account synchronization failures (2 failed): account-1: Error: esplora down; account-2: Error: rate limited',
      );
    });

    it('reports the wrapper error message as the failure reason', async () => {
      const mockResult: SyncResult = {
        account: mockAccount1,
        transactionsToNotify: [],
      };
      // Wrapped errors report the wrapper's message together with the
      // cause's message.
      const wrappedError = new Error('Failed to synchronize account', {
        cause: new Error('502 Bad Gateway'),
      });
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(wrappedError);

      await handler.route(request);

      const [trackedError] = mockSnapClient.emitTrackingError.mock.calls[0] as [
        Error,
      ];
      expect(trackedError.message).toBe(
        'syncSelectedAccounts: Account synchronization failures (1 failed): account-2: Error: Failed to synchronize account (Error: 502 Bad Gateway)',
      );
    });

    it('does not throw when reporting fails', async () => {
      const syncError = new Error('scan failed');
      mockAccountUseCases.list.mockResolvedValue(mockAccounts);
      mockAccountUseCases.synchronize
        .mockRejectedValueOnce(syncError)
        .mockResolvedValueOnce({
          account: mockAccount2,
          transactionsToNotify: [],
        });
      mockSnapClient.emitTrackingError.mockRejectedValueOnce(
        new Error('tracking down'),
      );

      await handler.route(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to report error',
        expect.anything(),
      );
      // The successful account's events are still emitted.
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccount2]);
    });
  });

  describe('sync coalescing', () => {
    it('coalesces concurrent synchronizeAccounts calls into one run', async () => {
      (getSelectedAccounts as Mock).mockResolvedValue([]);
      mockAccountUseCases.list.mockResolvedValue([]);

      await Promise.all([
        handler.synchronizeAccounts(),
        handler.synchronizeAccounts(),
        handler.synchronizeAccounts(),
      ]);

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(1);
    });

    it('runs synchronizeAccounts again once the previous run has finished', async () => {
      (getSelectedAccounts as Mock).mockResolvedValue([]);
      mockAccountUseCases.list.mockResolvedValue([]);

      await handler.synchronizeAccounts();
      await handler.synchronizeAccounts();

      expect(mockAccountUseCases.list).toHaveBeenCalledTimes(2);
    });

    it('reports failures once for coalesced synchronizeAccounts callers', async () => {
      const mockAccount = mock<BitcoinAccount>({ id: 'account-1' });
      (getSelectedAccounts as Mock).mockResolvedValue(['account-1']);
      mockAccountUseCases.list.mockResolvedValue([mockAccount]);
      mockAccountUseCases.synchronize.mockRejectedValue(
        new Error('sync failed'),
      );

      await Promise.all([
        handler.synchronizeAccounts(),
        handler.synchronizeAccounts(),
      ]);

      expect(mockAccountUseCases.synchronize).toHaveBeenCalledTimes(1);
      expect(mockSnapClient.emitTrackingError).toHaveBeenCalledTimes(1);
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

  describe('route', () => {
    it('throws error if unrecognized method', async () => {
      await expect(
        handler.route({ method: 'randomMethod' } as JsonRpcRequest),
      ).rejects.toThrow('Method not found: randomMethod');
    });
  });
});
