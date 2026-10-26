import type {
  FeeEstimates,
  TxOut,
  ScriptBuf,
  Amount,
  Transaction,
  Txid,
  WalletTx,
  AddressType,
  Network,
  Psbt,
  Address,
} from '@metamask/bitcoindevkit';
import type { BIP32Node, BIP39Node, JsonSLIP10Node } from '@metamask/key-tree';
import {
  mnemonicPhraseToBytes,
  SLIP10Node as RealSlip10Node,
} from '@metamask/key-tree';
import { TransactionStatus, TransactionType } from '@metamask/keyring-api';
import { Signer } from 'bip322-js';
import { mock } from 'jest-mock-extended';

import type {
  BitcoinAccount,
  BitcoinAccountRepository,
  BlockchainClient,
  ConfirmationRepository,
  Inscription,
  Logger,
  MetaProtocolsClient,
  SnapClient,
  TransactionBuilder,
} from '../entities';
import {
  AccountCapability,
  TrackingSnapEvent,
  ValidationError,
} from '../entities';
import { CronMethod } from '../handlers/CronHandler';
import type {
  CreateAccountParams,
  DiscoverAccountParams,
} from './AccountUseCases';
import {
  AccountUseCases,
  DISCOVERY_SCAN_REUSE_TTL_MS,
  FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS,
  FULL_SCAN_ON_DEMAND_MIN_INTERVAL_MS,
  FULL_SCAN_RECOVERY_MIN_INTERVAL_MS,
  getOnDemandFullScanIntervalMs,
  MAX_IMMEDIATE_FULL_SCANS_ON_CREATE,
  SENDER_LOOKUP_CONCURRENCY,
  SENDER_RESOLUTION_LIMIT,
} from './AccountUseCases';

describe('AccountUseCases', () => {
  const mockLogger = mock<Logger>();
  const mockSnapClient = mock<SnapClient>();
  const mockRepository = mock<BitcoinAccountRepository>();
  const mockConfirmationRepository = mock<ConfirmationRepository>();
  const mockChain = mock<BlockchainClient>();
  const mockMetaProtocols = mock<MetaProtocolsClient>();
  const fallbackFeeRate = 5.0;
  const targetBlocksConfirmation = 3;

  const useCases = new AccountUseCases(
    mockLogger,
    mockSnapClient,
    mockRepository,
    mockConfirmationRepository,
    mockChain,
    fallbackFeeRate,
    targetBlocksConfirmation,
    mockMetaProtocols,
  );

  /**
   * Stubs the sent amount on an account so that transactions built from it are
   * classified as sends by `mapToTransactionType`.
   *
   * @param account - The account to stub.
   * @param sentBtc - The sent amount in BTC.
   */
  const stubSentAmount = (account: BitcoinAccount, sentBtc = 1): void => {
    const sentAmount = mock<Amount>();
    jest.spyOn(sentAmount, 'to_btc').mockReturnValue(sentBtc);
    jest
      .mocked(account.sentAndReceived)
      .mockReturnValue([sentAmount, mock<Amount>()]);
  };

  describe('get', () => {
    it('returns account', async () => {
      const mockAccount = mock<BitcoinAccount>();
      mockAccount.id = 'some-id';

      mockRepository.get.mockResolvedValue(mockAccount);

      const result = await useCases.get('some-id');

      expect(mockRepository.get).toHaveBeenCalledWith('some-id');
      expect(result).toBe(mockAccount);
    });

    it('throws Error if account is not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      await expect(useCases.get('some-id')).rejects.toThrow(
        'Account not found',
      );

      expect(mockRepository.get).toHaveBeenCalledWith('some-id');
    });

    it('propagates an error if the repository get fails', async () => {
      const mockAccount = mock<BitcoinAccount>();
      mockAccount.id = 'some-id';

      const error = new Error('Get failed');
      mockRepository.get.mockRejectedValue(error);

      await expect(useCases.get('some-id')).rejects.toBe(error);

      expect(mockRepository.get).toHaveBeenCalledWith('some-id');
    });
  });

  describe('list', () => {
    it('returns accounts', async () => {
      const mockAccount = mock<BitcoinAccount>();

      mockRepository.getAll.mockResolvedValue([mockAccount]);

      const result = await useCases.list();

      expect(mockRepository.getAll).toHaveBeenCalled();
      expect(result).toStrictEqual([mockAccount]);
    });

    it('propagates an error if the repository getAll fails', async () => {
      const error = new Error('Get failed');
      mockRepository.getAll.mockRejectedValue(error);

      await expect(useCases.list()).rejects.toBe(error);

      expect(mockRepository.getAll).toHaveBeenCalled();
    });
  });

  describe('getByIds', () => {
    it('returns accounts by id', async () => {
      const mockAccount = mock<BitcoinAccount>();

      mockRepository.getByIds.mockResolvedValue([mockAccount]);

      const result = await useCases.getByIds(['some-id']);

      expect(mockRepository.getByIds).toHaveBeenCalledWith(['some-id']);
      expect(result).toStrictEqual([mockAccount]);
    });

    it('propagates an error if the repository getByIds fails', async () => {
      const error = new Error('Get failed');
      mockRepository.getByIds.mockRejectedValue(error);

      await expect(useCases.getByIds(['some-id'])).rejects.toBe(error);

      expect(mockRepository.getByIds).toHaveBeenCalledWith(['some-id']);
    });
  });

  describe('createMany', () => {
    const createParams: CreateAccountParams = {
      network: 'bitcoin',
      entropySource: 'some-source',
      index: 1,
      addressType: 'p2wpkh',
      synchronize: false,
      correlationId: 'correlation-id',
      accountName: 'My account',
    };
    const firstDerivationPath = ['some-source', "84'", "0'", "1'"];
    const secondDerivationPath = ['some-source', "84'", "0'", "2'"];
    const existingAccount = mock<BitcoinAccount>({
      id: 'existing-id',
      network: createParams.network,
    });
    const newAccount = mock<BitcoinAccount>({
      id: 'new-id',
      network: createParams.network,
    });
    const mockSnapshot = {
      accounts: null,
      derivationPaths: null,
    };

    it('reuses existing accounts and bulk-inserts newly-created accounts', async () => {
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [existingAccount, null],
        snapshot: mockSnapshot,
      });
      mockRepository.createMany.mockResolvedValue([newAccount]);

      const result = await useCases.createMany([
        createParams,
        { ...createParams, index: 2, synchronize: true },
      ]);

      expect(mockRepository.getByDerivationPaths).toHaveBeenCalledWith([
        firstDerivationPath,
        secondDerivationPath,
      ]);
      expect(mockRepository.createMany).toHaveBeenCalledWith([
        {
          derivationPath: secondDerivationPath,
          network: createParams.network,
          addressType: createParams.addressType,
        },
      ]);
      expect(newAccount.revealNextAddress).toHaveBeenCalled();
      expect(mockRepository.insertMany).toHaveBeenCalledWith(
        [newAccount],
        mockSnapshot,
      );
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        duration: 'PT1S',
        method: CronMethod.FullScanAccount,
        params: { accountId: newAccount.id },
      });
      expect(result).toStrictEqual([existingAccount, newAccount]);
    });

    it('creates only one account for duplicate derivation paths in the same batch', async () => {
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: mockSnapshot,
      });
      mockRepository.createMany.mockResolvedValue([newAccount]);

      const result = await useCases.createMany([createParams, createParams]);

      expect(mockRepository.getByDerivationPaths).toHaveBeenCalledWith([
        firstDerivationPath,
      ]);
      expect(mockRepository.createMany).toHaveBeenCalledTimes(1);
      expect(mockRepository.createMany).toHaveBeenCalledWith([
        {
          derivationPath: firstDerivationPath,
          network: createParams.network,
          addressType: createParams.addressType,
        },
      ]);
      expect(mockRepository.insertMany).toHaveBeenCalledWith(
        [newAccount],
        mockSnapshot,
      );
      expect(result).toStrictEqual([newAccount, newAccount]);
    });

    it('does not create or insert accounts when all accounts already exist', async () => {
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [existingAccount],
        snapshot: mockSnapshot,
      });

      const result = await useCases.createMany([createParams]);

      expect(mockRepository.createMany).not.toHaveBeenCalled();
      expect(mockRepository.insertMany).not.toHaveBeenCalled();
      expect(result).toStrictEqual([existingAccount]);
    });

    it('propagates insertMany errors without emitting account-created events', async () => {
      const error = new Error('insertMany failed');
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: mockSnapshot,
      });
      mockRepository.createMany.mockResolvedValue([newAccount]);
      mockRepository.insertMany.mockRejectedValue(error);

      await expect(useCases.createMany([createParams])).rejects.toBe(error);

      expect(mockRepository.insertMany).toHaveBeenCalledWith(
        [newAccount],
        mockSnapshot,
      );
    });

    it('logs phase timings for a batch creation', async () => {
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: mockSnapshot,
      });
      mockRepository.createMany.mockResolvedValue([newAccount]);

      await useCases.createMany([createParams]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[createMany\] Phase timings \{.*"requested":1.*"created":1.*"lookupMs":\d+.*"deriveMs":\d+.*"persistMs":\d+.*"totalMs":\d+.*\}$/u,
        ),
      );
    });

    it('propagates createMany errors without inserting accounts', async () => {
      const error = new Error('createMany failed');
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: mockSnapshot,
      });
      mockRepository.createMany.mockRejectedValue(error);

      await expect(useCases.createMany([createParams])).rejects.toBe(error);

      expect(mockRepository.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('discover', () => {
    const discoverParams: DiscoverAccountParams = {
      network: 'bitcoin',
      entropySource: 'some-source',
      index: 1,
      addressType: 'p2wpkh',
    };
    const mockAccount = mock<BitcoinAccount>({
      network: discoverParams.network,
    });

    beforeEach(() => {
      mockRepository.create.mockResolvedValue(mockAccount);
    });

    it.each([
      { tAddressType: 'p2pkh', purpose: "44'" },
      { tAddressType: 'p2sh', purpose: "49'" },
      { tAddressType: 'p2wsh', purpose: "45'" },
      { tAddressType: 'p2wpkh', purpose: "84'" },
      { tAddressType: 'p2tr', purpose: "86'" },
    ] as { tAddressType: AddressType; purpose: string }[])(
      'discovers an account of type: %s',
      async ({ tAddressType, purpose }) => {
        const derivationPath = [
          discoverParams.entropySource,
          purpose,
          "0'",
          `${discoverParams.index}'`,
        ];

        await useCases.discover({
          ...discoverParams,
          addressType: tAddressType,
        });

        expect(mockRepository.getByDerivationPath).toHaveBeenCalledWith(
          derivationPath,
        );
        expect(mockRepository.create).toHaveBeenCalledWith(
          derivationPath,
          discoverParams.network,
          tAddressType,
        );
        expect(mockChain.fullScan).toHaveBeenCalledWith(
          mockAccount,
          'discovery',
        );
      },
    );

    it.each([
      { tNetwork: 'bitcoin', coinType: "0'" },
      { tNetwork: 'testnet', coinType: "1'" },
      { tNetwork: 'testnet4', coinType: "1'" },
      { tNetwork: 'signet', coinType: "1'" },
      { tNetwork: 'regtest', coinType: "1'" },
    ] as { tNetwork: Network; coinType: string }[])(
      'should discover an account on network: %s',
      async ({ tNetwork, coinType }) => {
        const expectedDerivationPath = [
          discoverParams.entropySource,
          "84'",
          coinType,
          `${discoverParams.index}'`,
        ];

        await useCases.discover({
          ...discoverParams,
          network: tNetwork,
        });

        expect(mockRepository.getByDerivationPath).toHaveBeenCalledWith(
          expectedDerivationPath,
        );
        expect(mockRepository.create).toHaveBeenCalledWith(
          expectedDerivationPath,
          tNetwork,
          discoverParams.addressType,
        );
        expect(mockChain.fullScan).toHaveBeenCalledWith(
          mockAccount,
          'discovery',
        );
      },
    );

    it('returns an existing account if one already exists on same network', async () => {
      mockRepository.getByDerivationPath.mockResolvedValue(mockAccount);

      const result = await useCases.discover(discoverParams);

      expect(mockRepository.getByDerivationPath).toHaveBeenCalled();
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockChain.fullScan).not.toHaveBeenCalled();

      expect(result).toBe(mockAccount);
    });

    it('propagates an error if getByDerivationPath throws', async () => {
      const error = new Error('getByDerivationPath failed');
      mockRepository.getByDerivationPath.mockRejectedValue(error);

      await expect(useCases.discover(discoverParams)).rejects.toBe(error);

      expect(mockRepository.getByDerivationPath).toHaveBeenCalled();
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('propagates an error if create throws', async () => {
      const error = new Error('create failed');
      mockRepository.create.mockRejectedValue(error);

      await expect(useCases.discover(discoverParams)).rejects.toBe(error);

      expect(mockRepository.getByDerivationPath).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('propagates an error if fullScan throws', async () => {
      const error = new Error('fullScan failed');
      mockChain.fullScan.mockRejectedValue(error);

      await expect(useCases.discover(discoverParams)).rejects.toBe(error);

      expect(mockRepository.getByDerivationPath).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockChain.fullScan).toHaveBeenCalled();
    });
  });

  describe('synchronize', () => {
    const mockAccount = mock<BitcoinAccount>({
      id: 'some-id',
      network: 'bitcoin',
      listTransactions: jest.fn(),
    });

    beforeEach(() => {
      const receivedAmount = mock<Amount>();
      jest.spyOn(receivedAmount, 'to_btc').mockReturnValue(0);
      mockAccount.listTransactions.mockReturnValue([]);
      mockAccount.sentAndReceived.mockReturnValue([
        receivedAmount,
        receivedAmount,
      ]);
      mockChain.getTransactionSenders.mockResolvedValue([]);
    });

    it('synchronizes', async () => {
      mockAccount.listTransactions.mockReturnValue([]);

      const result = await useCases.synchronize(mockAccount, 'test');

      expect(mockChain.sync).toHaveBeenCalledWith(mockAccount);
      expect(mockAccount.listTransactions).toHaveBeenCalledTimes(2);
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [],
        transactionSenders: undefined,
      });
    });

    it('synchronizes with new transactions', async () => {
      const mockInscriptions = mock<Inscription[]>();
      const mockTransaction = mock<WalletTx>();
      mockAccount.listTransactions
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockTransaction]);
      mockMetaProtocols.fetchInscriptions.mockResolvedValue(mockInscriptions);

      const result = await useCases.synchronize(mockAccount, 'test');

      expect(mockChain.sync).toHaveBeenCalledWith(mockAccount);
      expect(mockAccount.listTransactions).toHaveBeenCalledTimes(2);
      expect(mockMetaProtocols.fetchInscriptions).toHaveBeenCalledWith(
        mockAccount,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockAccount,
        mockInscriptions,
      );
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionReceived,
        mockAccount,
        mockTransaction,
        'test',
        TransactionType.Receive,
      );
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [mockTransaction],
        transactionSenders: undefined,
      });
    });

    it('resolves senders for newly received transactions', async () => {
      const mockTransaction2 = mock<WalletTx>({
        txid: { toString: () => 'txid-receive' },
      });
      mockAccount.listTransactions
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockTransaction2]);
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);

      const result = await useCases.synchronize(mockAccount, 'test');

      expect(mockChain.getTransactionSenders).toHaveBeenCalledWith(
        'bitcoin',
        'txid-receive',
      );
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [mockTransaction2],
        transactionSenders: new Map([['txid-receive', ['bc1qsender']]]),
      });
    });

    it('synchronizes with confirmed transactions', async () => {
      const mockTxPending = mock<WalletTx>({
        chain_position: { is_confirmed: false },
        txid: {
          toString: () => 'txid',
        },
      });
      const mockTxConfirmed = mock<WalletTx>({
        ...mockTxPending,

        chain_position: { is_confirmed: true },
      });
      mockAccount.listTransactions
        .mockReturnValueOnce([mockTxPending])
        .mockReturnValueOnce([mockTxConfirmed]);

      const result = await useCases.synchronize(mockAccount, 'test');

      expect(mockChain.sync).toHaveBeenCalledWith(mockAccount);
      expect(mockAccount.listTransactions).toHaveBeenCalledTimes(2);
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionFinalized,
        mockAccount,
        mockTxConfirmed,
        'test',
        TransactionType.Receive,
        TransactionStatus.Confirmed,
      );
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [mockTxConfirmed],
        transactionSenders: undefined,
      });
    });

    it('keeps the balance-derived classification on Transaction Finalized', async () => {
      // The accepted inconsistency: the unified swap/bridge flow
      // reports `swap`/`bridgeSend` on Transaction Submitted, but the
      // sync-driven Transaction Finalized cannot recover it and stays
      // balance-derived (`send`/`receive`).
      const mockTxPending = mock<WalletTx>({
        chain_position: { is_confirmed: false },
        txid: {
          toString: () => 'txid',
        },
      });
      const mockTxConfirmed = mock<WalletTx>({
        ...mockTxPending,
        chain_position: { is_confirmed: true },
      });
      mockAccount.listTransactions
        .mockReturnValueOnce([mockTxPending])
        .mockReturnValueOnce([mockTxConfirmed]);
      stubSentAmount(mockAccount, 1);

      await useCases.synchronize(mockAccount, 'test');

      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionFinalized,
        mockAccount,
        mockTxConfirmed,
        'test',
        TransactionType.Send,
        TransactionStatus.Confirmed,
      );
    });

    it('synchronizes with both new and confirmed transactions', async () => {
      const mockTxPending = mock<WalletTx>({
        chain_position: { is_confirmed: false },
        txid: {
          toString: () => 'txid1',
        },
      });
      const mockTxNew = mock<WalletTx>({
        chain_position: { is_confirmed: false },
        txid: {
          toString: () => 'txid2',
        },
      });
      const mockTxConfirmed = mock<WalletTx>({
        ...mockTxPending,

        chain_position: { is_confirmed: true },
      });

      const mockTxPreviouslyConfirmed = mock<WalletTx>({
        chain_position: { is_confirmed: true },
      });
      const mockTxReorged = mock<WalletTx>({
        ...mockTxPreviouslyConfirmed,

        chain_position: { is_confirmed: false },
      });

      mockAccount.listTransactions
        .mockReturnValueOnce([mockTxPending, mockTxPreviouslyConfirmed])
        .mockReturnValueOnce([mockTxConfirmed, mockTxNew, mockTxReorged]);
      const mockInscriptions = mock<Inscription[]>();
      mockMetaProtocols.fetchInscriptions.mockResolvedValue(mockInscriptions);
      const origin = 'test';

      const result = await useCases.synchronize(mockAccount, origin);

      expect(mockChain.sync).toHaveBeenCalledWith(mockAccount);
      expect(mockAccount.listTransactions).toHaveBeenCalledTimes(2);
      expect(mockMetaProtocols.fetchInscriptions).toHaveBeenCalledWith(
        mockAccount,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockAccount,
        mockInscriptions,
      );

      // Check for TransactionFinalized event for confirmed transaction
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionFinalized,
        mockAccount,
        mockTxConfirmed,
        origin,
        TransactionType.Receive,
        TransactionStatus.Confirmed,
      );

      // Check for TransactionReceived event for new transaction
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionReceived,
        mockAccount,
        mockTxNew,
        origin,
        TransactionType.Receive,
      );

      // Check for TransactionReorged event for reorged transaction
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionReorged,
        mockAccount,
        mockTxReorged,
        origin,
        TransactionType.Receive,
      );

      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledTimes(3);
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [mockTxConfirmed, mockTxNew, mockTxReorged],
        transactionSenders: undefined,
      });
    });

    it('should emit TransactionReorged when a confirmed transaction becomes unconfirmed', async () => {
      const mockTxConfirmed = mock<WalletTx>({
        chain_position: { is_confirmed: true },
      });
      const mockTxReorged = mock<WalletTx>({
        ...mockTxConfirmed,
        chain_position: { is_confirmed: false },
      });
      mockAccount.listTransactions
        .mockReturnValueOnce([mockTxConfirmed])
        .mockReturnValueOnce([mockTxReorged]);

      const result = await useCases.synchronize(mockAccount, 'test');

      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledTimes(1);
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionReorged,
        mockAccount,
        mockTxReorged,
        'test',
        TransactionType.Receive,
      );
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [mockTxReorged],
        transactionSenders: undefined,
      });
    });

    it('propagates an error if the chain sync fails', async () => {
      const error = new Error('Sync failed');
      mockChain.sync.mockRejectedValue(error);

      await expect(useCases.synchronize(mockAccount, 'test')).rejects.toBe(
        error,
      );

      expect(mockChain.sync).toHaveBeenCalled();
    });

    it('propagates an error if the repository update fails', async () => {
      mockChain.sync.mockResolvedValue();
      const error = new Error('Update failed');
      mockRepository.update.mockRejectedValue(error);

      await expect(useCases.synchronize(mockAccount, 'test')).rejects.toBe(
        error,
      );

      expect(mockChain.sync).toHaveBeenCalled();
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('does not synchronize assets if utxo protection is disabled', async () => {
      const testUseCases = new AccountUseCases(
        mockLogger,
        mockSnapClient,
        mockRepository,
        mockConfirmationRepository,
        mockChain,
        fallbackFeeRate,
        targetBlocksConfirmation,
        undefined,
      );
      const mockTransaction = mock<WalletTx>();
      mockAccount.listTransactions
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockTransaction]);

      await testUseCases.synchronize(mockAccount, 'test');

      expect(mockMetaProtocols.fetchInscriptions).not.toHaveBeenCalled();
    });

    it('continues synchronization when tracking events fail', async () => {
      const mockTransaction = mock<WalletTx>();
      const mockInscriptions = mock<Inscription[]>();
      const trackingError = new Error('Tracking service unavailable');

      mockAccount.listTransactions
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockTransaction]);
      mockMetaProtocols.fetchInscriptions.mockResolvedValue(mockInscriptions);
      mockSnapClient.emitTrackingEvent.mockImplementation(async () => {
        mockLogger.error(
          `Failed to track event: ${TrackingSnapEvent.TransactionReceived}`,
          trackingError,
        );
      });

      const result = await useCases.synchronize(mockAccount, 'test');

      // core synchronization functionality should still work
      expect(mockChain.sync).toHaveBeenCalledWith(mockAccount);
      expect(mockAccount.listTransactions).toHaveBeenCalledTimes(2);
      expect(mockMetaProtocols.fetchInscriptions).toHaveBeenCalledWith(
        mockAccount,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockAccount,
        mockInscriptions,
      );

      // tracking should have been attempted
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionReceived,
        mockAccount,
        mockTransaction,
        'test',
        TransactionType.Receive,
      );

      // error should be logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Received',
        trackingError,
      );

      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: [mockTransaction],
        transactionSenders: undefined,
      });
    });
  });

  describe('fullScan', () => {
    const mockAccount = mock<BitcoinAccount>({
      id: 'some-id',
    });
    const mockInscriptions = mock<Inscription[]>();
    const mockTransactions: WalletTx[] = [mock<WalletTx>()];

    beforeEach(() => {
      const receivedAmount = mock<Amount>();
      jest.spyOn(receivedAmount, 'to_btc').mockReturnValue(0);
      mockAccount.sentAndReceived.mockReturnValue([
        receivedAmount,
        receivedAmount,
      ]);
      mockAccount.listTransactions.mockReturnValue([]);
      // A rescan of an account that already synchronized once.
      mockAccount.hasSynchronized.mockReturnValue(true);
    });

    it('performs a full scan', async () => {
      mockAccount.listTransactions.mockReturnValue(mockTransactions);
      mockMetaProtocols.fetchInscriptions.mockResolvedValue(mockInscriptions);
      mockChain.getTransactionSenders.mockResolvedValue([]);

      const result = await useCases.fullScan(mockAccount);

      expect(mockChain.fullScan).toHaveBeenCalledTimes(1);
      expect(mockChain.fullScan).toHaveBeenCalledWith(mockAccount, 'scan');
      expect(mockMetaProtocols.fetchInscriptions).toHaveBeenCalledWith(
        mockAccount,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockAccount,
        mockInscriptions,
      );
      expect(result).toStrictEqual({
        account: mockAccount,
        transactionsToNotify: mockTransactions,
        transactionSenders: undefined,
      });
    });

    it('scans an account that never synchronized with the discovery gap only, when it finds no activity', async () => {
      mockAccount.hasSynchronized.mockReturnValue(false);
      mockChain.fullScan.mockResolvedValue();

      await useCases.fullScan(mockAccount);

      expect(mockChain.fullScan).toHaveBeenCalledTimes(1);
      expect(mockChain.fullScan).toHaveBeenCalledWith(mockAccount, 'discovery');
      expect(mockRepository.update).toHaveBeenCalledTimes(1);
    });

    it('completes the initial scan to the standard gap when the discovery gap finds activity', async () => {
      mockAccount.hasSynchronized.mockReturnValue(false);
      mockChain.fullScan.mockImplementationOnce(async () => {
        mockAccount.listTransactions.mockReturnValue(mockTransactions);
      });
      mockChain.extendDiscoveryScan.mockResolvedValueOnce();
      mockChain.getTransactionSenders.mockResolvedValue([]);

      const result = await useCases.fullScan(mockAccount);

      // The discovery-gap scan is not repeated with the standard gap: only
      // the addresses the standard gap adds are checked.
      expect(mockChain.fullScan.mock.calls).toStrictEqual([
        [mockAccount, 'discovery'],
      ]);
      expect(mockChain.extendDiscoveryScan).toHaveBeenCalledTimes(1);
      expect(mockChain.extendDiscoveryScan).toHaveBeenCalledWith(mockAccount);
      expect(result.transactionsToNotify).toStrictEqual(mockTransactions);
    });

    it('does not extend an initial scan that found no activity, nor a rescan', async () => {
      mockAccount.hasSynchronized.mockReturnValue(false);
      await useCases.fullScan(mockAccount);
      mockAccount.hasSynchronized.mockReturnValue(true);
      mockAccount.listTransactions.mockReturnValue(mockTransactions);
      mockChain.getTransactionSenders.mockResolvedValue([]);
      await useCases.fullScan(mockAccount);

      expect(mockChain.extendDiscoveryScan).not.toHaveBeenCalled();
    });

    it('fails the initial scan (to be retried) if the standard-gap completion fails', async () => {
      mockAccount.hasSynchronized.mockReturnValue(false);
      const error = new Error('Failed to fetch');
      mockChain.fullScan.mockImplementationOnce(async () => {
        mockAccount.listTransactions.mockReturnValue(mockTransactions);
      });
      mockChain.extendDiscoveryScan.mockRejectedValueOnce(error);
      mockRepository.update.mockClear();

      await expect(useCases.fullScan(mockAccount)).rejects.toBe(error);

      expect(mockChain.fullScan).toHaveBeenCalledTimes(1);
      expect(mockChain.extendDiscoveryScan).toHaveBeenCalledTimes(1);
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('propagates an error if the chain full scan fails', async () => {
      const error = new Error('Full scan failed');
      mockChain.fullScan.mockRejectedValue(error);

      await expect(useCases.fullScan(mockAccount)).rejects.toBe(error);

      expect(mockChain.fullScan).toHaveBeenCalled();
    });

    it('propagates an error if fetchInscriptions fails', async () => {
      mockChain.fullScan.mockResolvedValue();
      const error = new Error('fetchInscriptions failed');
      mockMetaProtocols.fetchInscriptions.mockRejectedValue(error);

      await expect(useCases.fullScan(mockAccount)).rejects.toBe(error);

      expect(mockChain.fullScan).toHaveBeenCalled();
      expect(mockMetaProtocols.fetchInscriptions).toHaveBeenCalled();
    });

    it('propagates an error if the repository update fails', async () => {
      mockChain.fullScan.mockResolvedValue();
      mockMetaProtocols.fetchInscriptions.mockResolvedValue(mockInscriptions);
      const error = new Error('Update failed');
      mockRepository.update.mockRejectedValue(error);

      await expect(useCases.fullScan(mockAccount)).rejects.toBe(error);

      expect(mockChain.fullScan).toHaveBeenCalled();
      expect(mockMetaProtocols.fetchInscriptions).toHaveBeenCalled();
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('does not scan for assets if utxo protection is disabled', async () => {
      const testUseCases = new AccountUseCases(
        mockLogger,
        mockSnapClient,
        mockRepository,
        mockConfirmationRepository,
        mockChain,
        fallbackFeeRate,
        targetBlocksConfirmation,
        undefined,
      );

      await testUseCases.fullScan(mockAccount);

      expect(mockMetaProtocols.fetchInscriptions).not.toHaveBeenCalled();
    });

    it('resolves senders for the scanned transactions', async () => {
      const scannedTx = mock<WalletTx>({
        txid: { toString: () => 'txid-receive' },
      });
      mockAccount.listTransactions.mockReturnValue([scannedTx]);
      mockMetaProtocols.fetchInscriptions.mockResolvedValue(mockInscriptions);
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);

      const result = await useCases.fullScan(mockAccount);

      expect(result.transactionSenders).toStrictEqual(
        new Map([['txid-receive', ['bc1qsender']]]),
      );
    });

    it('caps the sender lookups so the scan does not resolve the whole history', async () => {
      const scannedTxs = Array.from(
        { length: SENDER_RESOLUTION_LIMIT + 5 },
        (_, index) =>
          mock<WalletTx>({ txid: { toString: () => `txid-${index}` } }),
      );
      mockAccount.listTransactions.mockReturnValue(scannedTxs);
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);

      await useCases.fullScan(mockAccount);

      expect(mockChain.getTransactionSenders).toHaveBeenCalledTimes(
        SENDER_RESOLUTION_LIMIT,
      );
    });
  });

  describe('resolveTransactionSenders', () => {
    const createTx = (txid: string): WalletTx =>
      mock<WalletTx>({ txid: { toString: () => txid } });

    const mockAccount2 = mock<BitcoinAccount>({
      id: 'some-id',
      network: 'bitcoin',
    });

    const mockSentAmount = mock<Amount>();
    const mockReceivedAmount = mock<Amount>();

    beforeEach(() => {
      mockAccount2.sentAndReceived.mockReturnValue([
        mockSentAmount,
        mockReceivedAmount,
      ]);
    });

    it('resolves the funding addresses of receives', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);

      const result = await useCases.resolveTransactionSenders(mockAccount2, [
        createTx('txid-receive'),
      ]);

      expect(mockChain.getTransactionSenders).toHaveBeenCalledWith(
        'bitcoin',
        'txid-receive',
      );
      expect(result).toStrictEqual(new Map([['txid-receive', ['bc1qsender']]]));
    });

    it('does not query the indexer for sends', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0.5);

      const result = await useCases.resolveTransactionSenders(mockAccount2, [
        createTx('txid-send'),
      ]);

      expect(mockChain.getTransactionSenders).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns undefined when receives have no senders', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);
      mockChain.getTransactionSenders.mockResolvedValue([]);

      const result = await useCases.resolveTransactionSenders(mockAccount2, [
        createTx('txid-receive'),
      ]);

      expect(result).toBeUndefined();
    });

    it('skips a failed lookup without failing the others', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);
      mockChain.getTransactionSenders
        .mockRejectedValueOnce(new Error('indexer unavailable'))
        .mockResolvedValueOnce(['bc1qsender']);

      const result = await useCases.resolveTransactionSenders(mockAccount2, [
        createTx('txid-fail'),
        createTx('txid-ok'),
      ]);

      expect(result).toStrictEqual(new Map([['txid-ok', ['bc1qsender']]]));
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to resolve transaction senders: %o',
        expect.any(Error),
      );
    });

    it('bounds concurrent indexer lookups', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);

      let inFlight = 0;
      let peak = 0;
      mockChain.getTransactionSenders.mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return ['bc1qsender'];
      });

      const txs = Array.from(
        { length: SENDER_LOOKUP_CONCURRENCY * 2 + 1 },
        (_, index) => createTx(`txid-${index}`),
      );

      await useCases.resolveTransactionSenders(mockAccount2, txs);

      expect(mockChain.getTransactionSenders).toHaveBeenCalledTimes(txs.length);
      expect(peak).toBeLessThanOrEqual(SENDER_LOOKUP_CONCURRENCY);
      expect(peak).toBeGreaterThan(1);
    });

    it('shares the concurrency budget across accounts', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);

      let inFlight = 0;
      let peak = 0;
      mockChain.getTransactionSenders.mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return ['bc1qsender'];
      });

      const mockOtherAccount = mock<BitcoinAccount>({
        id: 'other-id',
        network: 'bitcoin',
      });
      mockOtherAccount.sentAndReceived.mockReturnValue([
        mockSentAmount,
        mockReceivedAmount,
      ]);

      const txs = Array.from(
        { length: SENDER_LOOKUP_CONCURRENCY * 2 },
        (_, index) => createTx(`txid-${index}`),
      );

      // `synchronize` runs concurrently for every selected account, so two
      // accounts resolving at once must not reach 2x the shared budget.
      await Promise.all([
        useCases.resolveTransactionSenders(mockAccount2, txs),
        useCases.resolveTransactionSenders(mockOtherAccount, txs),
      ]);

      expect(peak).toBeLessThanOrEqual(SENDER_LOOKUP_CONCURRENCY);
    });

    it('releases the concurrency slot when a lookup fails', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);
      mockChain.getTransactionSenders.mockRejectedValue(
        new Error('indexer unavailable'),
      );

      const failingTxs = Array.from(
        { length: SENDER_LOOKUP_CONCURRENCY },
        (_, index) => createTx(`txid-fail-${index}`),
      );

      await useCases.resolveTransactionSenders(mockAccount2, failingTxs);

      // A limiter that leaks a slot on rejection would drain the budget and
      // hang every later lookup.
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);
      const result = await useCases.resolveTransactionSenders(mockAccount2, [
        createTx('txid-after-failure'),
      ]);

      expect(result).toStrictEqual(
        new Map([['txid-after-failure', ['bc1qsender']]]),
      );
    });

    it('caps the lookups at the given limit', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);

      const txs = [createTx('txid-1'), createTx('txid-2'), createTx('txid-3')];

      const result = await useCases.resolveTransactionSenders(
        mockAccount2,
        txs,
        2,
      );

      expect(mockChain.getTransactionSenders).toHaveBeenCalledTimes(2);
      expect(mockChain.getTransactionSenders).toHaveBeenCalledWith(
        'bitcoin',
        'txid-1',
      );
      expect(mockChain.getTransactionSenders).not.toHaveBeenCalledWith(
        'bitcoin',
        'txid-3',
      );
      expect(result).toStrictEqual(
        new Map([
          ['txid-1', ['bc1qsender']],
          ['txid-2', ['bc1qsender']],
        ]),
      );
    });

    it('resolves every receive when no limit is given', async () => {
      jest.spyOn(mockSentAmount, 'to_btc').mockReturnValue(0);
      mockChain.getTransactionSenders.mockResolvedValue(['bc1qsender']);

      const txs = Array.from({ length: SENDER_RESOLUTION_LIMIT + 5 }, (_, i) =>
        createTx(`txid-${i}`),
      );

      await useCases.resolveTransactionSenders(mockAccount2, txs);

      expect(mockChain.getTransactionSenders).toHaveBeenCalledTimes(txs.length);
    });
  });

  describe('delete', () => {
    it('throws error if account is not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      await expect(useCases.delete('non-existent-id')).rejects.toThrow(
        'Account not found',
      );

      expect(mockRepository.get).toHaveBeenCalledWith('non-existent-id');
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('removes an account without emitting keyring events', async () => {
      const mockAccount = mock<BitcoinAccount>();
      mockAccount.id = 'some-id';

      mockRepository.get.mockResolvedValue(mockAccount);

      await useCases.delete(mockAccount.id);

      expect(mockRepository.get).toHaveBeenCalledWith(mockAccount.id);
      expect(mockRepository.delete).toHaveBeenCalledWith(mockAccount.id);
    });

    it('propagates an error if the repository fails', async () => {
      const mockAccount = mock<BitcoinAccount>();
      mockAccount.id = 'some-id';
      const error = new Error('Delete failed');

      mockRepository.get.mockResolvedValue(mockAccount);
      mockRepository.delete.mockRejectedValue(error);

      await expect(useCases.delete(mockAccount.id)).rejects.toBe(error);

      expect(mockRepository.get).toHaveBeenCalled();
      expect(mockRepository.delete).toHaveBeenCalled();
    });
  });

  describe('signPsbt', () => {
    const mockTxid = mock<Txid>();
    const mockOutput = mock<TxOut>({
      script_pubkey: mock<ScriptBuf>(),
      value: mock<Amount>(),
    });
    const mockPsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
      toString,
    });
    const mockTransaction = mock<Transaction>({
      // TODO: enable when this is merged: https://github.com/rustwasm/wasm-bindgen/issues/1818

      compute_txid: jest.fn(),
      clone: jest.fn(),
    });
    const mockSignedPsbt = mock<Psbt>({
      toString: () => 'mockSignedPsbt',
    });
    const mockAccount = mock<BitcoinAccount>({
      network: 'bitcoin',
      addressType: 'p2wpkh',
      sign: jest.fn(),
      capabilities: [AccountCapability.SignPsbt],
    });
    const mockWalletTx = mock<WalletTx>();
    const mockFeeRate = 3;
    const mockFeeEstimates = mock<FeeEstimates>({
      get: () => mockFeeRate,
    });
    const mockFilledPsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
    });
    const mockTxBuilder = mock<TransactionBuilder>({
      addRecipientByScript: jest.fn(),
      feeRate: jest.fn(),
      drainToByScript: jest.fn(),
      drainWallet: jest.fn(),
      finish: jest.fn(),
      unspendable: jest.fn(),
    });

    beforeEach(() => {
      mockRepository.getWithSigner.mockResolvedValue(mockAccount);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);
      mockTransaction.clone.mockReturnThis();
      mockAccount.buildTx.mockReturnValue(mockTxBuilder);
      mockAccount.sign.mockReturnValue(mockSignedPsbt);
      mockAccount.extractTransaction.mockReturnValue(mockTransaction);
      mockTxBuilder.addRecipientByScript.mockReturnThis();
      mockTxBuilder.feeRate.mockReturnThis();
      mockTxBuilder.drainToByScript.mockReturnThis();
      mockTxBuilder.untouchedOrdering.mockReturnThis();
      mockTxBuilder.finish.mockReturnValue(mockFilledPsbt);
      mockTxBuilder.unspendable.mockReturnThis();
      mockChain.getFeeEstimates.mockResolvedValue(mockFeeEstimates);
      stubSentAmount(mockAccount);
    });

    it('throws error if account is not found', async () => {
      mockRepository.getWithSigner.mockResolvedValue(null);

      await expect(
        useCases.signPsbt('non-existent-id', mockPsbt, 'metamask', {
          fill: false,
          broadcast: false,
        }),
      ).rejects.toThrow('Account not found');
    });

    it('signs a PSBT', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);

      const { txid, psbt } = await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        {
          fill: false,
          broadcast: false,
        },
      );

      expect(mockRepository.getWithSigner).toHaveBeenCalledWith('account-id');
      expect(mockAccount.sign).toHaveBeenCalledWith(mockPsbt);
      expect(txid).toBeUndefined();
      expect(psbt).toBe('mockSignedPsbt');
    });

    it('signs and broadcasts a PSBT', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);

      const { txid, psbt, canBeMalleable } = await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        {
          fill: false,
          broadcast: true,
        },
      );

      expect(mockRepository.getWithSigner).toHaveBeenCalledWith('account-id');
      expect(mockAccount.sign).toHaveBeenCalledWith(mockPsbt);
      expect(mockChain.broadcast).toHaveBeenCalledWith(
        mockAccount.network,
        mockTransaction,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(mockTransaction.compute_txid).toHaveBeenCalled();
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccount]);
      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount, [mockWalletTx]);
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionSubmitted,
        mockAccount,
        mockWalletTx,
        'metamask',
        TransactionType.Send,
      );
      expect(txid).toBe(mockTxid);
      expect(psbt).toBe('mockSignedPsbt');
      expect(canBeMalleable).toBe(false);
    });

    it('reports an explicit swap classification on Transaction Submitted', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);

      await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        { fill: false, broadcast: true },
        undefined,
        TransactionType.Swap,
      );

      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionSubmitted,
        mockAccount,
        mockWalletTx,
        'metamask',
        TransactionType.Swap,
      );
    });

    it('omits canBeMalleable when broadcast is false', async () => {
      const { canBeMalleable } = await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        { fill: false, broadcast: false },
      );

      expect(canBeMalleable).toBeUndefined();
    });

    it('sets canBeMalleable=true when broadcasting from a legacy P2PKH account', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);
      const legacyAccount = { ...mockAccount, addressType: 'p2pkh' as const };
      mockRepository.getWithSigner.mockResolvedValueOnce(legacyAccount);

      const { canBeMalleable } = await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        { fill: false, broadcast: true },
      );

      expect(canBeMalleable).toBe(true);
    });

    it('fills, signs and broadcasts a PSBT', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);

      const { psbt, txid } = await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        {
          fill: true,
          broadcast: true,
        },
      );

      expect(mockRepository.getWithSigner).toHaveBeenCalledWith('account-id');
      expect(mockChain.getFeeEstimates).toHaveBeenCalledWith(
        mockAccount.network,
      );
      expect(mockAccount.sign).toHaveBeenCalledWith(mockFilledPsbt);
      expect(mockChain.broadcast).toHaveBeenCalledWith(
        mockAccount.network,
        mockTransaction,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(mockTransaction.compute_txid).toHaveBeenCalled();
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccount]);
      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount, [mockWalletTx]);
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionSubmitted,
        mockAccount,
        mockWalletTx,
        'metamask',
        TransactionType.Send,
      );
      expect(txid).toBe(mockTxid);
      expect(psbt).toBe('mockSignedPsbt');
    });

    it('propagates an error if getWithSigner fails', async () => {
      const error = new Error('getWithSigner failed');
      mockRepository.getWithSigner.mockRejectedValueOnce(error);

      await expect(
        useCases.signPsbt('account-id', mockPsbt, 'metamask', {
          fill: false,
          broadcast: false,
        }),
      ).rejects.toBe(error);
    });

    it('propagates an error if broadcast fails', async () => {
      const error = new Error('broadcast failed');
      mockChain.broadcast.mockRejectedValueOnce(error);

      await expect(
        useCases.signPsbt('account-id', mockPsbt, 'metamask', {
          fill: false,
          broadcast: true,
        }),
      ).rejects.toBe(error);
    });

    it('propagates an error if update fails', async () => {
      const error = new Error('update failed');
      mockRepository.update.mockRejectedValue(error);

      await expect(
        useCases.signPsbt('account-id', mockPsbt, 'metamask', {
          fill: false,
          broadcast: true,
        }),
      ).rejects.toBe(error);
    });

    it('continues transaction processing when tracking events fail', async () => {
      const trackingError = new Error('Tracking service unavailable');
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);
      mockSnapClient.emitTrackingEvent.mockImplementation(async () => {
        mockLogger.error(
          `Failed to track event: ${TrackingSnapEvent.TransactionSubmitted}`,
          trackingError,
        );
      });

      // Should complete successfully despite tracking failure
      const { txid, psbt } = await useCases.signPsbt(
        'account-id',
        mockPsbt,
        'metamask',
        {
          fill: false,
          broadcast: true,
        },
      );

      // Core transaction functionality should work
      expect(mockRepository.getWithSigner).toHaveBeenCalledWith('account-id');
      expect(mockAccount.sign).toHaveBeenCalledWith(mockPsbt);
      expect(mockChain.broadcast).toHaveBeenCalledWith(
        mockAccount.network,
        mockTransaction,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccount]);
      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount, [mockWalletTx]);

      // Tracking should have been attempted
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionSubmitted,
        mockAccount,
        mockWalletTx,
        'metamask',
        TransactionType.Send,
      );

      // Error should be logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Submitted',
        trackingError,
      );

      // Transaction should still be successful
      expect(txid).toBe(mockTxid);
      expect(psbt).toBe('mockSignedPsbt');
    });

    it('reveals and persists own output scripts after signing (broadcast: false)', async () => {
      mockAccount.isMine.mockReturnValue(true);
      mockAccount.revealToScript.mockReturnValue(true);

      await useCases.signPsbt('account-id', mockPsbt, 'metamask', {
        fill: false,
        broadcast: false,
      });

      expect(mockAccount.revealToScript).toHaveBeenCalledWith(
        mockOutput.script_pubkey,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
    });

    it('reveals and persists own output scripts after signing (broadcast: true)', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockAccount.isMine.mockReturnValue(true);
      mockAccount.revealToScript.mockReturnValue(true);

      await useCases.signPsbt('account-id', mockPsbt, 'metamask', {
        fill: false,
        broadcast: true,
      });

      expect(mockAccount.revealToScript).toHaveBeenCalledWith(
        mockOutput.script_pubkey,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
    });

    it('does not persist when no output scripts get revealed (broadcast: false)', async () => {
      mockAccount.isMine.mockReturnValue(true);
      mockAccount.revealToScript.mockReturnValue(false);

      await useCases.signPsbt('account-id', mockPsbt, 'metamask', {
        fill: false,
        broadcast: false,
      });

      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('only persists once via #broadcast when no output scripts get revealed (broadcast: true)', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockAccount.isMine.mockReturnValue(true);
      mockAccount.revealToScript.mockReturnValue(false);

      await useCases.signPsbt('account-id', mockPsbt, 'metamask', {
        fill: false,
        broadcast: true,
      });

      expect(mockRepository.update).toHaveBeenCalledTimes(1);
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
    });

    it('does not call revealToScript for outputs that are not isMine', async () => {
      mockAccount.isMine.mockReturnValue(false);

      await useCases.signPsbt('account-id', mockPsbt, 'metamask', {
        fill: false,
        broadcast: false,
      });

      expect(mockAccount.revealToScript).not.toHaveBeenCalled();
    });
  });

  describe('fillPsbt', () => {
    const mockOutput = mock<TxOut>({
      script_pubkey: mock<ScriptBuf>(),
      value: mock<Amount>(),
    });
    const mockTemplatePsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
      toString: () => 'base64Psbt',
    });
    const mockAccount = mock<BitcoinAccount>({
      id: 'account-id',
      network: 'bitcoin',
      sign: jest.fn(),
      isMine: () => false,
      capabilities: [AccountCapability.FillPsbt],
    });
    const mockFeeRate = 3;
    const mockFeeEstimates = mock<FeeEstimates>({
      get: () => mockFeeRate,
    });
    const mockFrozenUTXOs = ['utxo1', 'utxo2'];
    const mockFilledPsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
    });
    const mockTxBuilder = mock<TransactionBuilder>({
      addRecipientByScript: jest.fn(),
      feeRate: jest.fn(),
      drainToByScript: jest.fn(),
      drainWallet: jest.fn(),
      finish: jest.fn(),
      unspendable: jest.fn(),
    });

    beforeEach(() => {
      mockRepository.get.mockResolvedValue(mockAccount);
      mockRepository.getFrozenUTXOs.mockResolvedValue(mockFrozenUTXOs);
      mockAccount.buildTx.mockReturnValue(mockTxBuilder);
      mockTxBuilder.addRecipientByScript.mockReturnThis();
      mockTxBuilder.feeRate.mockReturnThis();
      mockTxBuilder.drainToByScript.mockReturnThis();
      mockTxBuilder.untouchedOrdering.mockReturnThis();
      mockTxBuilder.finish.mockReturnValue(mockFilledPsbt);
      mockTxBuilder.unspendable.mockReturnThis();
      mockChain.getFeeEstimates.mockResolvedValue(mockFeeEstimates);
    });

    it('throws error if account is not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      await expect(
        useCases.fillPsbt('non-existent-id', mockTemplatePsbt),
      ).rejects.toThrow('Account not found');
    });

    it('fills PSBT without change output', async () => {
      const psbt = await useCases.fillPsbt('account-id', mockTemplatePsbt);

      expect(mockRepository.get).toHaveBeenCalledWith('account-id');
      expect(mockRepository.getFrozenUTXOs).toHaveBeenCalledWith(
        mockAccount.id,
      );
      expect(mockChain.getFeeEstimates).toHaveBeenCalledWith(
        mockAccount.network,
      );
      expect(mockTxBuilder.unspendable).toHaveBeenCalledWith(mockFrozenUTXOs);
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenCalledWith(
        mockOutput.value,
        mockOutput.script_pubkey,
      );
      expect(mockTxBuilder.feeRate).toHaveBeenCalledWith(mockFeeRate);
      expect(mockTxBuilder.untouchedOrdering).toHaveBeenCalled();
      expect(mockTxBuilder.finish).toHaveBeenCalled();

      expect(psbt).toBe(mockFilledPsbt);
    });

    it('fills PSBT with change output', async () => {
      mockRepository.get.mockResolvedValueOnce({
        ...mockAccount,
        isMine: () => true,
      });

      const psbt = await useCases.fillPsbt('account-id', mockTemplatePsbt);

      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledWith(
        mockOutput.script_pubkey,
      );
      expect(mockAccount.revealToScript).not.toHaveBeenCalled();
      expect(psbt).toBe(mockFilledPsbt);
    });

    it('propagates an error if get fails', async () => {
      const error = new Error('get failed');
      mockRepository.get.mockRejectedValueOnce(error);

      await expect(
        useCases.fillPsbt('account-id', mockTemplatePsbt),
      ).rejects.toBe(error);
    });

    it('throws ValidationError if tx building fails', async () => {
      const error = new Error('builder error');
      mockTxBuilder.finish.mockImplementation(() => {
        throw error;
      });

      await expect(
        useCases.fillPsbt('account-id', mockTemplatePsbt),
      ).rejects.toThrow(
        new ValidationError(
          'Failed to build PSBT from template: builder error',
          {
            id: 'account-id',
            templatePsbt: 'base64Psbt',
            feeRate: mockFeeRate,
          },
          error,
        ),
      );
    });

    it('includes non-Error cause in ValidationError message', async () => {
      mockTxBuilder.finish.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { message: 'InsufficientFunds', code: 11 };
      });

      await expect(
        useCases.fillPsbt('account-id', mockTemplatePsbt),
      ).rejects.toThrow(
        'Failed to build PSBT from template: InsufficientFunds',
      );
    });

    it('uses unknown cause when error has no message', async () => {
      mockTxBuilder.finish.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 42;
      });

      await expect(
        useCases.fillPsbt('account-id', mockTemplatePsbt),
      ).rejects.toThrow('Failed to build PSBT from template: unknown cause');
    });

    it('preserves all outputs from bridge PSBT template including change', async () => {
      // Simulate a bridge transaction with 3 outputs:
      // Output 0: Bridge deposit
      // Output 1: OP_RETURN data
      // Output 2: Change output
      const bridgeDepositOutput = mock<TxOut>({
        script_pubkey: mock<ScriptBuf>(),
        value: mock<Amount>(),
      });
      const opReturnOutput = mock<TxOut>({
        script_pubkey: mock<ScriptBuf>(),
        value: mock<Amount>(),
      });
      const changeOutput = mock<TxOut>({
        script_pubkey: mock<ScriptBuf>(),
        value: mock<Amount>(),
      });

      const bridgePsbt = mock<Psbt>({
        unsigned_tx: {
          output: [bridgeDepositOutput, opReturnOutput, changeOutput],
        },
        toString: () => 'bridgePsbtBase64',
      });

      // Mock the built PSBT to have matching output count (3 outputs)
      // This simulates the happy path where drainToByScript works correctly
      const builtBridgePsbt = mock<Psbt>({
        unsigned_tx: {
          output: [bridgeDepositOutput, opReturnOutput, changeOutput],
        },
      });
      mockTxBuilder.finish.mockReturnValue(builtBridgePsbt);

      // Account recognizes the change output as its own
      const accountWithChange = mock<BitcoinAccount>({
        id: 'account-id',
        network: 'bitcoin',
        isMine: (script: ScriptBuf) => script === changeOutput.script_pubkey,
        capabilities: [AccountCapability.FillPsbt],
      });
      accountWithChange.buildTx.mockReturnValue(mockTxBuilder);
      mockRepository.get.mockResolvedValueOnce(accountWithChange);

      await useCases.fillPsbt('account-id', bridgePsbt);

      // Verify exact call counts:
      // - drainToByScript: called exactly 1 time (for change output)
      // - addRecipientByScript: called exactly 2 times (for bridge deposit and OP_RETURN)
      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledTimes(1);
      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledWith(
        changeOutput.script_pubkey,
      );

      expect(mockTxBuilder.addRecipientByScript).toHaveBeenCalledTimes(2);
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        1,
        bridgeDepositOutput.value,
        bridgeDepositOutput.script_pubkey,
      );
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        2,
        opReturnOutput.value,
        opReturnOutput.script_pubkey,
      );

      // finish() should only be called once since output count matches
      expect(mockTxBuilder.finish).toHaveBeenCalledTimes(1);
    });

    it('rebuilds with fixed recipients when change output is dropped (full-balance swap)', async () => {
      // This test specifically covers the case where change was dropped
      // when user swapped their entire balance through a bridge
      // Simulate a bridge transaction with 3 outputs:
      // Output 0: Bridge deposit
      // Output 1: OP_RETURN data
      // Output 2: Change output
      const bridgeDepositOutput = mock<TxOut>({
        script_pubkey: mock<ScriptBuf>(),
        value: mock<Amount>(),
      });
      const opReturnOutput = mock<TxOut>({
        script_pubkey: mock<ScriptBuf>(),
        value: mock<Amount>(),
      });
      const changeOutput = mock<TxOut>({
        script_pubkey: mock<ScriptBuf>(),
        value: mock<Amount>(),
      });

      const fullBalanceSwapPsbt = mock<Psbt>({
        unsigned_tx: {
          output: [bridgeDepositOutput, opReturnOutput, changeOutput],
        },
        toString: () => 'fullBalanceSwapPsbt',
      });

      // First build returns PSBT with dropped change
      const droppedChangePsbt = mock<Psbt>({
        unsigned_tx: {
          output: [bridgeDepositOutput, opReturnOutput], // Only 2 outputs - change is dropped
        },
      });
      // Second build (rebuild) returns PSBT with all outputs preserved
      const rebuiltPsbt = mock<Psbt>({
        unsigned_tx: {
          output: [bridgeDepositOutput, opReturnOutput, changeOutput], // All 3 outputs preserved
        },
      });
      mockTxBuilder.finish
        .mockReturnValueOnce(droppedChangePsbt) // First attempt: change dropped
        .mockReturnValueOnce(rebuiltPsbt); // Second attempt: rebuilt with fixed recipients

      // Account recognizes the change output as its own
      const accountFullBalance = mock<BitcoinAccount>({
        id: 'account-id',
        network: 'bitcoin',
        isMine: (script: ScriptBuf) => script === changeOutput.script_pubkey,
        capabilities: [AccountCapability.FillPsbt],
      });
      accountFullBalance.buildTx.mockReturnValue(mockTxBuilder);
      mockRepository.get.mockResolvedValueOnce(accountFullBalance);

      const result = await useCases.fillPsbt('account-id', fullBalanceSwapPsbt);

      // finish() called twice: first attempt (change dropped) + rebuild
      expect(mockTxBuilder.finish).toHaveBeenCalledTimes(2);

      // drainToByScript: called exactly 1 time (for change output in first attempt)
      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledTimes(1);
      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledWith(
        changeOutput.script_pubkey,
      );

      // addRecipientByScript call count:
      // First attempt: 2 calls (bridge deposit + OP_RETURN)
      // Second attempt (rebuild): 3 calls (all outputs as fixed recipients)
      // Total: 2 + 3 = 5
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenCalledTimes(5);

      // First attempt: bridge deposit and OP_RETURN
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        1,
        bridgeDepositOutput.value,
        bridgeDepositOutput.script_pubkey,
      );
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        2,
        opReturnOutput.value,
        opReturnOutput.script_pubkey,
      );

      // Second attempt (rebuild): all 3 outputs as fixed recipients
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        3,
        bridgeDepositOutput.value,
        bridgeDepositOutput.script_pubkey,
      );
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        4,
        opReturnOutput.value,
        opReturnOutput.script_pubkey,
      );
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        5,
        changeOutput.value,
        changeOutput.script_pubkey,
      );

      // Result should be the rebuilt PSBT with all outputs preserved
      expect(result).toBe(rebuiltPsbt);
    });

    const identifiableOutput = (scriptHex: string, sats: bigint): TxOut => {
      const scriptPubkey = mock<ScriptBuf>();
      scriptPubkey.to_hex_string.mockReturnValue(scriptHex);
      const value = mock<Amount>();
      value.to_sat.mockReturnValue(sats);

      return mock<TxOut>({ script_pubkey: scriptPubkey, value });
    };

    const accountOwning = (owned: ScriptBuf[]): BitcoinAccount => {
      const account = mock<BitcoinAccount>({
        id: 'account-id',
        network: 'bitcoin',
        isMine: (script: ScriptBuf) => owned.includes(script),
        capabilities: [AccountCapability.FillPsbt],
      });
      account.buildTx.mockReturnValue(mockTxBuilder);
      return account;
    };

    it('adds every template output as a fixed recipient when the wallet-owned output is not last', async () => {
      const changeOutput = identifiableOutput('0014aaaa', 2548n);
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [changeOutput, depositOutput] },
        toString: () => 'templateBase64',
      });
      mockTxBuilder.finish.mockReturnValue(
        mock<Psbt>({
          unsigned_tx: { output: [changeOutput, depositOutput] },
        }),
      );
      mockRepository.get.mockResolvedValueOnce(
        accountOwning([changeOutput.script_pubkey]),
      );

      await useCases.fillPsbt('account-id', template);

      expect(mockTxBuilder.drainToByScript).not.toHaveBeenCalled();
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenCalledTimes(2);
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        1,
        changeOutput.value,
        changeOutput.script_pubkey,
      );
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenNthCalledWith(
        2,
        depositOutput.value,
        depositOutput.script_pubkey,
      );
    });

    it('throws when the built outputs are reordered against the template', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const opReturnOutput = identifiableOutput('6a3ecccc', 0n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput, opReturnOutput] },
        toString: () => 'templateBase64',
      });
      mockTxBuilder.finish.mockReturnValue(
        mock<Psbt>({
          unsigned_tx: {
            output: [
              opReturnOutput,
              identifiableOutput('0014aaaa', 2548n),
              depositOutput,
            ],
          },
        }),
      );
      mockRepository.get.mockResolvedValueOnce(accountOwning([]));

      await expect(useCases.fillPsbt('account-id', template)).rejects.toThrow(
        'Built PSBT does not preserve the template outputs',
      );
    });

    it('throws when a built output value diverges from the template', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput] },
        toString: () => 'templateBase64',
      });
      mockTxBuilder.finish.mockReturnValue(
        mock<Psbt>({
          unsigned_tx: { output: [identifiableOutput('5120bbbb', 1n)] },
        }),
      );
      mockRepository.get.mockResolvedValueOnce(accountOwning([]));

      await expect(useCases.fillPsbt('account-id', template)).rejects.toThrow(
        'Built PSBT does not preserve the template outputs',
      );
    });

    it('accepts a built PSBT that appends a change output after the template outputs', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const opReturnOutput = identifiableOutput('6a3ecccc', 0n);
      const appendedChange = identifiableOutput('0014aaaa', 2548n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput, opReturnOutput] },
        toString: () => 'templateBase64',
      });
      const builtPsbt = mock<Psbt>({
        unsigned_tx: {
          output: [depositOutput, opReturnOutput, appendedChange],
        },
      });
      mockTxBuilder.finish.mockReturnValue(builtPsbt);
      mockRepository.get.mockResolvedValueOnce(
        accountOwning([appendedChange.script_pubkey]),
      );

      expect(await useCases.fillPsbt('account-id', template)).toBe(builtPsbt);
    });

    it('throws when the built PSBT appends an output that is not ours', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput] },
        toString: () => 'templateBase64',
      });
      mockTxBuilder.finish.mockReturnValue(
        mock<Psbt>({
          unsigned_tx: {
            output: [depositOutput, identifiableOutput('5120dddd', 1000n)],
          },
        }),
      );
      mockRepository.get.mockResolvedValueOnce(accountOwning([]));

      await expect(useCases.fillPsbt('account-id', template)).rejects.toThrow(
        'Built PSBT does not preserve the template outputs',
      );
    });

    it('throws when the built PSBT appends more than one output', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const firstAppended = identifiableOutput('0014aaaa', 1000n);
      const secondAppended = identifiableOutput('0014eeee', 1000n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput] },
        toString: () => 'templateBase64',
      });
      mockTxBuilder.finish.mockReturnValue(
        mock<Psbt>({
          unsigned_tx: {
            output: [depositOutput, firstAppended, secondAppended],
          },
        }),
      );
      mockRepository.get.mockResolvedValueOnce(
        accountOwning([
          firstAppended.script_pubkey,
          secondAppended.script_pubkey,
        ]),
      );

      await expect(useCases.fillPsbt('account-id', template)).rejects.toThrow(
        'Built PSBT does not preserve the template outputs',
      );
    });

    it('accepts the drained output taking a value the template did not specify', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 496774n);
      const changeOutput = identifiableOutput('0014aaaa', 1000n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput, changeOutput] },
        toString: () => 'templateBase64',
      });
      const builtPsbt = mock<Psbt>({
        unsigned_tx: {
          output: [depositOutput, identifiableOutput('0014aaaa', 2548n)],
        },
      });
      mockTxBuilder.finish.mockReturnValue(builtPsbt);
      mockRepository.get.mockResolvedValueOnce(
        accountOwning([changeOutput.script_pubkey]),
      );

      expect(await useCases.fillPsbt('account-id', template)).toBe(builtPsbt);
      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledWith(
        changeOutput.script_pubkey,
      );
    });

    it('throws when the rebuild changes the value of the wallet-owned output', async () => {
      const depositOutput = identifiableOutput('5120bbbb', 100000n);
      const changeOutput = identifiableOutput('0014aaaa', 5000n);
      const template = mock<Psbt>({
        unsigned_tx: { output: [depositOutput, changeOutput] },
        toString: () => 'templateBase64',
      });
      // first attempt drops the sub-dust drain, so the rebuild adds every
      // template output as a fixed recipient and no drain is configured
      mockTxBuilder.finish
        .mockReturnValueOnce(
          mock<Psbt>({ unsigned_tx: { output: [depositOutput] } }),
        )
        .mockReturnValueOnce(
          mock<Psbt>({
            unsigned_tx: {
              output: [depositOutput, identifiableOutput('0014aaaa', 1n)],
            },
          }),
        );
      mockRepository.get.mockResolvedValueOnce(
        accountOwning([changeOutput.script_pubkey]),
      );

      await expect(useCases.fillPsbt('account-id', template)).rejects.toThrow(
        'Built PSBT does not preserve the template outputs',
      );
    });
  });

  describe('computeFee', () => {
    const mockFee = mock<Amount>();
    const mockOutput = mock<TxOut>({
      script_pubkey: mock<ScriptBuf>(),
      value: mock<Amount>(),
    });
    const mockTemplatePsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
      toString: () => 'base64Psbt',
    });
    const mockAccount = mock<BitcoinAccount>({
      id: 'account-id',
      network: 'bitcoin',
      isMine: () => false,
      capabilities: [AccountCapability.ComputeFee],
    });
    const mockFeeRate = 3;
    const mockFeeEstimates = mock<FeeEstimates>({
      get: () => mockFeeRate,
    });
    const mockFrozenUTXOs = ['utxo1', 'utxo2'];
    const mockFilledPsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
    });
    const mockTxBuilder = mock<TransactionBuilder>({
      addRecipientByScript: jest.fn(),
      feeRate: jest.fn(),
      drainToByScript: jest.fn(),
      finish: jest.fn(),
      unspendable: jest.fn(),
    });

    beforeEach(() => {
      mockRepository.get.mockResolvedValue(mockAccount);
      mockRepository.getFrozenUTXOs.mockResolvedValue(mockFrozenUTXOs);
      mockAccount.buildTx.mockReturnValue(mockTxBuilder);
      mockTxBuilder.addRecipientByScript.mockReturnThis();
      mockTxBuilder.feeRate.mockReturnThis();
      mockTxBuilder.drainToByScript.mockReturnThis();
      mockTxBuilder.untouchedOrdering.mockReturnThis();
      mockTxBuilder.finish.mockReturnValue(mockFilledPsbt);
      mockTxBuilder.unspendable.mockReturnThis();
      mockFilledPsbt.fee.mockReturnValue(mockFee);
      mockChain.getFeeEstimates.mockResolvedValue(mockFeeEstimates);
    });

    it('throws error if account is not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      await expect(
        useCases.computeFee('account-id', mockTemplatePsbt),
      ).rejects.toThrow('Account not found');
    });

    it('computes fee for PSBT without change output', async () => {
      const fee = await useCases.computeFee('account-id', mockTemplatePsbt);

      expect(mockRepository.get).toHaveBeenCalledWith('account-id');
      expect(mockRepository.getFrozenUTXOs).toHaveBeenCalledWith('account-id');
      expect(mockChain.getFeeEstimates).toHaveBeenCalledWith('bitcoin');
      expect(mockTxBuilder.unspendable).toHaveBeenCalledWith(mockFrozenUTXOs);
      expect(mockTxBuilder.addRecipientByScript).toHaveBeenCalledWith(
        mockOutput.value,
        mockOutput.script_pubkey,
      );
      expect(mockTxBuilder.feeRate).toHaveBeenCalledWith(mockFeeRate);
      expect(mockTxBuilder.untouchedOrdering).toHaveBeenCalled();
      expect(mockTxBuilder.finish).toHaveBeenCalled();
      expect(fee).toBe(mockFee);
    });

    it('computes fee for PSBT with change output', async () => {
      mockRepository.get.mockResolvedValueOnce({
        ...mockAccount,
        isMine: () => true,
      });

      const fee = await useCases.computeFee('account-id', mockTemplatePsbt);

      expect(mockTxBuilder.drainToByScript).toHaveBeenCalledWith(
        mockOutput.script_pubkey,
      );
      expect(mockTxBuilder.addRecipientByScript).not.toHaveBeenCalled();
      expect(mockAccount.revealToScript).not.toHaveBeenCalled();
      expect(fee).toBe(mockFee);
    });

    it('uses fallback fee rate when estimate is not available', async () => {
      mockChain.getFeeEstimates.mockResolvedValueOnce({
        ...mockFeeEstimates,
        get: () => undefined,
      });

      await useCases.computeFee('account-id', mockTemplatePsbt);

      expect(mockTxBuilder.feeRate).toHaveBeenCalledWith(fallbackFeeRate);
    });

    it('uses fallback fee rate when the estimate is zero', async () => {
      mockChain.getFeeEstimates.mockResolvedValueOnce({
        ...mockFeeEstimates,
        get: () => 0,
      });

      await useCases.computeFee('account-id', mockTemplatePsbt);

      expect(mockTxBuilder.feeRate).toHaveBeenCalledWith(fallbackFeeRate);
    });

    it('clamps a fractional estimate below 1 sat/vB instead of using zero', async () => {
      mockChain.getFeeEstimates.mockResolvedValueOnce({
        ...mockFeeEstimates,
        get: () => 0.285,
      });

      await useCases.computeFee('account-id', mockTemplatePsbt);

      expect(mockTxBuilder.feeRate).toHaveBeenCalledWith(1);
      expect(mockTxBuilder.feeRate).not.toHaveBeenCalledWith(0);
    });
  });

  describe('sendTransfer', () => {
    const recipients = [
      {
        address: 'bcrt1qstku2y3pfh9av50lxj55arm8r5gj8tf2yv5nxz',
        amount: '1000',
      },
    ];
    const mockTxid = mock<Txid>();
    const mockOutput = mock<TxOut>({
      script_pubkey: mock<ScriptBuf>(),
      value: mock<Amount>(),
    });
    const mockPsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
      toString,
    });
    const mockTransaction = mock<Transaction>({
      // TODO: enable when this is merged: https://github.com/rustwasm/wasm-bindgen/issues/1818

      compute_txid: jest.fn(),
      clone: jest.fn(),
    });
    const mockSignedPsbt = mock<Psbt>({
      toString: () => 'mockSignedPsbt',
    });
    const mockAccount = mock<BitcoinAccount>({
      network: 'bitcoin',
      addressType: 'p2wpkh',
      sign: jest.fn(),
      capabilities: [AccountCapability.SendTransfer],
    });
    const mockWalletTx = mock<WalletTx>();
    const mockFeeRate = 3;
    const mockFeeEstimates = mock<FeeEstimates>({
      get: () => mockFeeRate,
    });
    const mockFilledPsbt = mock<Psbt>({
      unsigned_tx: {
        output: [mockOutput],
      },
    });
    const mockTxBuilder = mock<TransactionBuilder>({
      addRecipient: jest.fn(),
      addRecipientByScript: jest.fn(),
      feeRate: jest.fn(),
      drainToByScript: jest.fn(),
      drainWallet: jest.fn(),
      finish: jest.fn(),
      unspendable: jest.fn(),
    });

    beforeEach(() => {
      mockRepository.getWithSigner.mockResolvedValue(mockAccount);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);
      mockTransaction.clone.mockReturnThis();
      mockAccount.buildTx.mockReturnValue(mockTxBuilder);
      mockAccount.sign.mockReturnValue(mockSignedPsbt);
      mockAccount.extractTransaction.mockReturnValue(mockTransaction);
      mockTxBuilder.addRecipient.mockReturnThis();
      mockTxBuilder.addRecipientByScript.mockReturnThis();
      mockTxBuilder.feeRate.mockReturnThis();
      mockTxBuilder.drainToByScript.mockReturnThis();
      mockTxBuilder.untouchedOrdering.mockReturnThis();
      mockTxBuilder.finish.mockReturnValue(mockFilledPsbt);
      mockTxBuilder.unspendable.mockReturnThis();
      mockChain.getFeeEstimates.mockResolvedValue(mockFeeEstimates);
      mockRepository.getFrozenUTXOs.mockResolvedValue([]);
      stubSentAmount(mockAccount);
    });

    it('throws error if there are multiple recipients', async () => {
      const multipleRecipients = [
        { address: 'addr1', amount: '1000' },
        { address: 'addr2', amount: '2000' },
      ];

      await expect(
        useCases.sendTransfer('account-id', multipleRecipients, 'metamask'),
      ).rejects.toThrow('There should be exactly one recipient');
    });

    it('throws error if there are no recipients', async () => {
      await expect(
        useCases.sendTransfer('account-id', [], 'metamask'),
      ).rejects.toThrow('There should be exactly one recipient');
    });

    it('throws error if account is not found', async () => {
      mockRepository.getWithSigner.mockResolvedValue(null);

      await expect(
        useCases.sendTransfer('non-existent-id', recipients, 'metamask'),
      ).rejects.toThrow('Account not found');
    });

    it('sends funds', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);

      const result = await useCases.sendTransfer(
        'account-id',
        recipients,
        'metamask',
      );

      expect(mockRepository.getWithSigner).toHaveBeenCalledWith('account-id');
      expect(mockTxBuilder.addRecipient).toHaveBeenCalledWith(
        '1000',
        'bcrt1qstku2y3pfh9av50lxj55arm8r5gj8tf2yv5nxz',
      );
      expect(mockChain.getFeeEstimates).toHaveBeenCalledWith(
        mockAccount.network,
      );
      expect(mockAccount.sign).toHaveBeenCalledWith(mockFilledPsbt);
      expect(mockChain.broadcast).toHaveBeenCalledWith(
        mockAccount.network,
        mockTransaction,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(mockTransaction.compute_txid).toHaveBeenCalled();
      expect(
        mockSnapClient.emitAccountBalancesUpdatedEvent,
      ).toHaveBeenCalledWith([mockAccount]);
      expect(
        mockSnapClient.emitAccountTransactionsUpdatedEvent,
      ).toHaveBeenCalledWith(mockAccount, [mockWalletTx]);
      expect(mockSnapClient.emitTrackingEvent).toHaveBeenCalledWith(
        TrackingSnapEvent.TransactionSubmitted,
        mockAccount,
        mockWalletTx,
        'metamask',
        TransactionType.Send,
      );
      expect(result.txid).toBe(mockTxid);
      expect(result.canBeMalleable).toBe(false);
    });

    it('sets canBeMalleable=true on legacy P2PKH accounts', async () => {
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);
      mockTxBuilder.finish.mockReturnValueOnce(mockPsbt);

      const legacyAccount = { ...mockAccount, addressType: 'p2pkh' as const };
      mockRepository.getWithSigner.mockResolvedValueOnce(legacyAccount);

      const result = await useCases.sendTransfer(
        'account-id',
        recipients,
        'metamask',
      );

      expect(result.canBeMalleable).toBe(true);
    });

    it('propagates an error if getWithSigner fails', async () => {
      const error = new Error('getWithSigner failed');
      mockRepository.getWithSigner.mockRejectedValueOnce(error);

      await expect(
        useCases.sendTransfer('account-id', recipients, 'metamask'),
      ).rejects.toBe(error);
    });

    it('propagates an error if broadcast fails', async () => {
      const error = new Error('broadcast failed');
      mockChain.broadcast.mockRejectedValueOnce(error);
      mockTxBuilder.finish.mockReturnValueOnce(mockPsbt);

      await expect(
        useCases.sendTransfer('account-id', recipients, 'metamask'),
      ).rejects.toBe(error);
    });

    it('propagates an error if update fails', async () => {
      const error = new Error('update failed');
      mockRepository.update.mockRejectedValue(error);
      mockTxBuilder.finish.mockReturnValueOnce(mockPsbt);

      await expect(
        useCases.sendTransfer('account-id', recipients, 'metamask'),
      ).rejects.toBe(error);
    });
  });

  describe('broadcastPsbt', () => {
    const mockTxid = mock<Txid>();
    const mockPsbt = mock<Psbt>();
    const mockTransaction = mock<Transaction>({
      compute_txid: jest.fn(),
      clone: jest.fn(),
    });
    const mockWalletTx = mock<WalletTx>();
    const mockAccount = mock<BitcoinAccount>({
      network: 'bitcoin',
      addressType: 'p2wpkh',
      capabilities: [AccountCapability.BroadcastPsbt],
    });

    beforeEach(() => {
      mockRepository.get.mockResolvedValue(mockAccount);
      mockAccount.extractTransaction.mockReturnValue(mockTransaction);
      mockTransaction.compute_txid.mockReturnValue(mockTxid);
      mockTransaction.clone.mockReturnThis();
      mockAccount.getTransaction.mockReturnValue(mockWalletTx);
      stubSentAmount(mockAccount);
    });

    it('throws error if account is not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      await expect(
        useCases.broadcastPsbt('non-existent-id', mockPsbt, 'metamask'),
      ).rejects.toThrow('Account not found');
    });

    it('throws PermissionError if account lacks BroadcastPsbt capability', async () => {
      const accountNoCap = mock<BitcoinAccount>({
        capabilities: [],
      });
      mockRepository.get.mockResolvedValue(accountNoCap);

      await expect(
        useCases.broadcastPsbt('account-id', mockPsbt, 'metamask'),
      ).rejects.toThrow('Account missing given capability');
    });

    it('broadcasts a PSBT and returns txid with canBeMalleable=false for P2WPKH', async () => {
      const result = await useCases.broadcastPsbt(
        'account-id',
        mockPsbt,
        'metamask',
      );

      expect(mockRepository.get).toHaveBeenCalledWith('account-id');
      expect(mockAccount.extractTransaction).toHaveBeenCalledWith(mockPsbt);
      expect(mockChain.broadcast).toHaveBeenCalledWith(
        mockAccount.network,
        mockTransaction,
      );
      expect(mockRepository.update).toHaveBeenCalledWith(mockAccount);
      expect(result.txid).toBe(mockTxid);
      expect(result.canBeMalleable).toBe(false);
    });

    it('returns canBeMalleable=true when broadcasting from a legacy P2PKH account', async () => {
      const legacyAccount = { ...mockAccount, addressType: 'p2pkh' as const };
      mockRepository.get.mockResolvedValueOnce(legacyAccount);

      const result = await useCases.broadcastPsbt(
        'account-id',
        mockPsbt,
        'metamask',
      );

      expect(result.txid).toBe(mockTxid);
      expect(result.canBeMalleable).toBe(true);
    });
  });

  describe('getFrozenUTXOs', () => {
    it('delegates to repository', async () => {
      mockRepository.getFrozenUTXOs.mockResolvedValue(['txid:0', 'txid:1']);

      const result = await useCases.getFrozenUTXOs('account-id');

      expect(mockRepository.getFrozenUTXOs).toHaveBeenCalledWith('account-id');
      expect(result).toStrictEqual(['txid:0', 'txid:1']);
    });
  });

  describe('signMessage', () => {
    const mockAccount = mock<BitcoinAccount>({
      id: 'account-id',
      publicAddress: mock<Address>({
        toString: () => 'bcrt1qs2fj7czz0amfm74j73yujx6dn6223md56gkkuy',
      }),
      capabilities: [AccountCapability.SignMessage],
      derivationPath: ['m', "84'", "0'"],
    });
    const mockMessage = 'Hello, world!';
    const mockOrigin = 'metamask';

    beforeEach(() => {
      mockRepository.get.mockResolvedValue(mockAccount);
      mockSnapClient.getPrivateEntropy.mockResolvedValue({
        privateKey:
          '0xdf23b869a1395aec3bf878797daac998ed4acf404fa26ff622eef7f30dc46791',
      } as JsonSLIP10Node);
    });

    it('throws error if account is not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      await expect(
        useCases.signMessage('non-existent-id', mockMessage, mockOrigin),
      ).rejects.toThrow('Account not found');
    });

    it('signs a message', async () => {
      const expectedSignature =
        'AkcwRAIgZxodJQ60t9Rr/hABEHZ1zPUJ4m5hdM5QLpysH8fDSzgCIENOEuZtYf9/Nn/ZW15PcImkknol403dmZrgoOQ+6K+TASECwDKypXm/ElmVTxTLJ7nao6X5mB/iGbU2Q2qtot0QRL4=';

      const signature = await useCases.signMessage(
        'account-id',
        mockMessage,
        mockOrigin,
      );

      expect(mockRepository.get).toHaveBeenCalledWith('account-id');
      expect(mockSnapClient.getPrivateEntropy).toHaveBeenCalledWith([
        'm',
        "84'",
        "0'",
        '0',
        '0',
      ]);
      expect(mockConfirmationRepository.insertSignMessage).toHaveBeenCalledWith(
        mockAccount,
        mockMessage,
        mockOrigin,
      );
      expect(signature).toBe(expectedSignature);
    });

    it('throws WalletError if fails to sign message', async () => {
      mockSnapClient.getPrivateEntropy.mockResolvedValue({
        privateKey: '0x1234567890abcdef', // wrong private key returned
      } as JsonSLIP10Node);

      await expect(
        useCases.signMessage('account-id', mockMessage, mockOrigin),
      ).rejects.toThrow('Failed to sign message');
    });

    it('does not include the signed message in WalletError metadata', async () => {
      mockSnapClient.getPrivateEntropy.mockResolvedValue({
        privateKey: '0x1234567890abcdef', // wrong private key returned
      } as JsonSLIP10Node);

      let thrownError: unknown;
      try {
        await useCases.signMessage('account-id', mockMessage, mockOrigin);
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError).toMatchObject({
        message: 'Failed to sign message',
        data: { id: 'account-id' },
      });
      expect(
        (thrownError as { data?: Record<string, unknown> }).data,
      ).not.toHaveProperty('message');
    });

    it('throws AssertionError if entropy has no privateKey', async () => {
      mockSnapClient.getPrivateEntropy.mockResolvedValue(
        mock<JsonSLIP10Node>({ privateKey: undefined }),
      );

      await expect(
        useCases.signMessage('account-id', mockMessage, mockOrigin),
      ).rejects.toThrow('Failed to get private entropy');
    });

    it('propagates an error if get fails', async () => {
      const error = new Error('get failed');
      mockRepository.get.mockRejectedValueOnce(error);

      await expect(
        useCases.signMessage('account-id', mockMessage, mockOrigin),
      ).rejects.toBe(error);
    });

    it('propagates an error if getPrivateEntropy fails', async () => {
      const error = new Error('getPrivateEntropy failed');
      mockSnapClient.getPrivateEntropy.mockRejectedValue(error);

      await expect(
        useCases.signMessage('account-id', mockMessage, mockOrigin),
      ).rejects.toBe(error);
    });

    it('skips confirmation when skipConfirmation option is true', async () => {
      await useCases.signMessage('account-id', mockMessage, mockOrigin, {
        skipConfirmation: true,
      });

      expect(
        mockConfirmationRepository.insertSignMessage,
      ).not.toHaveBeenCalled();
    });
  });

  describe('signProofOfOwnershipMessages', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const parentPath = ['entropy-1', "84'", "1'"];
    const mockMessage = 'metamask:proof-of-ownership:nonce:bcrt1qaddress';

    /**
     * Derives the real SLIP-10 node for a path from the fixture mnemonic.
     *
     * @param segments - Hardened path segments below the master node.
     * @returns The derived node.
     */
    async function deriveFixtureNode(
      segments: string[],
    ): Promise<RealSlip10Node> {
      const derivationPath: [BIP39Node, ...BIP32Node[]] = [
        mnemonicPhraseToBytes(mnemonic) as BIP39Node,
        ...segments.map((segment) => `bip32:${segment}` as BIP32Node),
      ];

      return RealSlip10Node.fromDerivationPath({
        derivationPath,
        curve: 'secp256k1',
      });
    }

    const createAccount = (index: number): BitcoinAccount =>
      mock<BitcoinAccount>({
        id: `account-${index}`,
        publicAddress: mock<Address>({
          toString: () => 'bcrt1qs2fj7czz0amfm74j73yujx6dn6223md56gkkuy',
        }),
        capabilities: [AccountCapability.SignMessage],
        derivationPath: [...parentPath, `${index}'`],
        network: 'regtest',
      });

    beforeEach(async () => {
      const parentNode = await deriveFixtureNode(["84'", "1'"]);
      mockSnapClient.getPrivateEntropy.mockResolvedValue(parentNode.toJSON());
    });

    it('signs messages with one private entropy fetch for accounts sharing a parent path', async () => {
      jest
        .spyOn(Signer, 'sign')
        .mockReturnValueOnce('mock-bip322-signature-0')
        .mockReturnValueOnce('mock-bip322-signature-1');

      const result = await useCases.signProofOfOwnershipMessages([
        { account: createAccount(0), message: mockMessage },
        { account: createAccount(1), message: mockMessage },
      ]);

      expect(mockSnapClient.getPrivateEntropy).toHaveBeenCalledTimes(1);
      expect(mockSnapClient.getPrivateEntropy).toHaveBeenCalledWith(parentPath);
      expect(
        mockConfirmationRepository.insertSignMessage,
      ).not.toHaveBeenCalled();
      expect(result).toStrictEqual([
        { signature: 'mock-bip322-signature-0' },
        { signature: 'mock-bip322-signature-1' },
      ]);
    });

    it('returns an item-level error when an account cannot sign messages', async () => {
      const account = createAccount(0);
      account.capabilities = [];

      const result = await useCases.signProofOfOwnershipMessages([
        { account, message: mockMessage },
      ]);

      expect(mockSnapClient.getPrivateEntropy).not.toHaveBeenCalled();
      expect(result).toStrictEqual([
        { error: 'Account missing given capability' },
      ]);
    });

    it('does not expose derivation error details in batch signing results', async () => {
      const sensitiveError = 'derived private key bytes: secret';
      jest.spyOn(RealSlip10Node, 'fromJSON').mockResolvedValueOnce({
        derive: jest.fn().mockRejectedValue(new Error(sensitiveError)),
      } as never);

      const result = await useCases.signProofOfOwnershipMessages([
        { account: createAccount(0), message: mockMessage },
      ]);

      expect(result).toStrictEqual([{ error: 'Unable to derive private key' }]);
      expect(JSON.stringify(result)).not.toContain(sensitiveError);
    });
  });
  describe('balance-unknown tracking and the full scan queue', () => {
    const buildStatefulUseCases = (): {
      useCases: AccountUseCases;
      snapClient: ReturnType<typeof mock<SnapClient>>;
      state: Record<string, unknown>;
    } => {
      const state: Record<string, unknown> = {};
      const snapClient = mock<SnapClient>();
      snapClient.getState.mockImplementation(async (key?: string) =>
        key !== undefined && Object.hasOwn(state, key)
          ? (JSON.parse(JSON.stringify(state[key])) as never)
          : (null as never),
      );
      snapClient.setState.mockImplementation(async (key, value) => {
        state[key as string] = JSON.parse(JSON.stringify(value));
      });
      return {
        useCases: new AccountUseCases(
          mockLogger,
          snapClient,
          mockRepository,
          mockConfirmationRepository,
          mockChain,
          fallbackFeeRate,
          targetBlocksConfirmation,
          undefined,
        ),
        snapClient,
        state,
      };
    };

    const buildAccount = (
      id: string,
      synchronized: boolean,
    ): BitcoinAccount => {
      const account = mock<BitcoinAccount>({ id, network: 'bitcoin' });
      account.hasSynchronized.mockReturnValue(synchronized);
      account.listTransactions.mockReturnValue([]);
      return account;
    };

    it('reports the balance of a never-synchronized account as unknown', async () => {
      const { useCases: testUseCases } = buildStatefulUseCases();

      expect(
        await testUseCases.isBalanceUnknown(buildAccount('a', false)),
      ).toBe(true);
      expect(await testUseCases.isBalanceUnknown(buildAccount('b', true))).toBe(
        false,
      );
    });

    it('keeps a new account unknown until its first full scan succeeds, and retries a failed scan', async () => {
      const { useCases: testUseCases } = buildStatefulUseCases();
      const account = buildAccount('new-id', true);
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([account]);
      mockRepository.update.mockResolvedValue();

      await testUseCases.createMany([
        {
          network: 'bitcoin',
          entropySource: 'some-source',
          index: 0,
          addressType: 'p2wpkh',
          synchronize: false,
        },
      ]);
      expect(await testUseCases.isBalanceUnknown(account)).toBe(true);
      expect(await testUseCases.isInitialFullScanPending('new-id')).toBe(true);

      mockChain.fullScan.mockRejectedValueOnce(new Error('Failed to fetch'));
      await expect(testUseCases.fullScan(account)).rejects.toThrow(
        'Failed to fetch',
      );
      expect(await testUseCases.isBalanceUnknown(account)).toBe(true);
      // Backoff: not due right after the failure.
      expect(await testUseCases.listDueFullScans([account], 2)).toStrictEqual(
        [],
      );

      mockChain.fullScan.mockResolvedValueOnce();
      await testUseCases.fullScan(account);
      expect(await testUseCases.isBalanceUnknown(account)).toBe(false);
    });

    it('queues never-synchronized accounts and returns at most `max` due accounts', async () => {
      const { useCases: testUseCases, state } = buildStatefulUseCases();
      // The queue already exists (e.g. the repair scan finished).
      state.rescanV1 = { pending: [] };
      const synced = buildAccount('synced', true);
      const legacy1 = buildAccount('legacy-1', false);
      const legacy2 = buildAccount('legacy-2', false);
      const legacy3 = buildAccount('legacy-3', false);

      const due = await testUseCases.listDueFullScans(
        [synced, legacy1, legacy2, legacy3],
        2,
      );

      expect(due).toStrictEqual([legacy1, legacy2]);
      expect(state.rescanV1).toStrictEqual({
        pending: ['legacy-1', 'legacy-2', 'legacy-3'],
      });
    });
  });

  describe('full scan coordination (single-flight, on-demand, recovery)', () => {
    const NOW = 1_700_000_000_000;
    let nowSpy: jest.SpyInstance<number, []>;

    const buildUseCases = (): {
      useCases: AccountUseCases;
      snapClient: ReturnType<typeof mock<SnapClient>>;
    } => {
      const state: Record<string, unknown> = {};
      const snapClient = mock<SnapClient>();
      snapClient.getState.mockImplementation(async (key?: string) =>
        key !== undefined && Object.hasOwn(state, key)
          ? (JSON.parse(JSON.stringify(state[key])) as never)
          : (null as never),
      );
      snapClient.setState.mockImplementation(async (key, value) => {
        state[key as string] = JSON.parse(JSON.stringify(value));
      });
      return {
        useCases: new AccountUseCases(
          mockLogger,
          snapClient,
          mockRepository,
          mockConfirmationRepository,
          mockChain,
          fallbackFeeRate,
          targetBlocksConfirmation,
          undefined,
        ),
        snapClient,
      };
    };

    const buildAccount = (id: string, synchronized = true): BitcoinAccount => {
      const account = mock<BitcoinAccount>({ id, network: 'bitcoin' });
      account.hasSynchronized.mockReturnValue(synchronized);
      account.listTransactions.mockReturnValue([]);
      return account;
    };

    const fullScanEvents = (
      snapClient: ReturnType<typeof mock<SnapClient>>,
    ): unknown[] =>
      snapClient.scheduleBackgroundEvent.mock.calls.filter(
        ([event]) => event.method === CronMethod.FullScanAccount,
      );

    beforeEach(() => {
      mockChain.fullScan.mockReset();
      mockChain.sync.mockReset();
      mockRepository.update.mockResolvedValue();
      nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('computes a bounded on-demand interval', () => {
      expect(getOnDemandFullScanIntervalMs(0)).toBe(
        FULL_SCAN_ON_DEMAND_MIN_INTERVAL_MS,
      );
      expect(getOnDemandFullScanIntervalMs(1)).toBe(30_000);
      expect(getOnDemandFullScanIntervalMs(2)).toBe(60_000);
      expect(getOnDemandFullScanIntervalMs(3)).toBe(
        FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS,
      );
      expect(getOnDemandFullScanIntervalMs(50)).toBe(
        FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS,
      );
      expect(FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS).toBe(2 * 60_000);
    });

    it('runs one full scan per account at a time (single-flight)', async () => {
      const { useCases: testUseCases } = buildUseCases();
      const account = buildAccount('a');
      let finishScan: () => void = () => undefined;
      mockChain.fullScan.mockReturnValue(
        new Promise<void>((resolve) => {
          finishScan = resolve;
        }),
      );

      const first = testUseCases.fullScan(account);
      const second = testUseCases.fullScan(account);
      expect(testUseCases.isFullScanInFlight('a')).toBe(true);
      finishScan();
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(mockChain.fullScan).toHaveBeenCalledTimes(1);
      expect(secondResult).toBe(firstResult);
      expect(testUseCases.isFullScanInFlight('a')).toBe(false);

      // A later scan runs again.
      mockChain.fullScan.mockResolvedValue();
      await testUseCases.fullScan(account);
      expect(mockChain.fullScan).toHaveBeenCalledTimes(2);
    });

    it('makes a sync join an in-flight full scan instead of fetching concurrently', async () => {
      const { useCases: testUseCases } = buildUseCases();
      const scanned = buildAccount('a');
      const stale = buildAccount('a');
      let finishScan: () => void = () => undefined;
      mockChain.fullScan.mockReturnValue(
        new Promise<void>((resolve) => {
          finishScan = resolve;
        }),
      );

      const scan = testUseCases.fullScan(scanned);
      const sync = testUseCases.synchronize(stale, 'cron');
      finishScan();
      await scan;

      expect(await sync).toStrictEqual({
        account: scanned,
        transactionsToNotify: [],
      });
      expect(mockChain.sync).not.toHaveBeenCalled();
    });

    it('excludes in-flight and just-scanned accounts from the cron queue', async () => {
      const { useCases: testUseCases } = buildUseCases();
      const account = buildAccount('a', false);
      let finishScan: () => void = () => undefined;
      mockChain.fullScan.mockReturnValue(
        new Promise<void>((resolve) => {
          finishScan = resolve;
        }),
      );

      const scan = testUseCases.fullScan(account);
      expect(await testUseCases.listDueFullScans([account], 2)).toStrictEqual(
        [],
      );
      finishScan();
      await scan;
    });

    it('starts the first full scan of new accounts right away, even without `synchronize`', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const accounts = ['n1', 'n2', 'n3'].map((id) => buildAccount(id));
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null, null, null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue(accounts);
      mockRepository.insertMany.mockResolvedValue(accounts);

      await testUseCases.createMany(
        [0, 1, 2].map((index) => ({
          network: 'bitcoin' as const,
          entropySource: 'some-source',
          index,
          addressType: 'p2wpkh' as const,
          synchronize: false,
        })),
      );

      expect(fullScanEvents(snapClient)).toStrictEqual(
        accounts.slice(0, MAX_IMMEDIATE_FULL_SCANS_ON_CREATE).map(({ id }) => [
          {
            duration: 'PT1S',
            method: CronMethod.FullScanAccount,
            params: { accountId: id },
          },
        ]),
      );
      // The scheduled accounts are not picked again by the cron queue.
      const due = await testUseCases.listDueFullScans(accounts, 3);
      expect(due.map(({ id }) => id)).toStrictEqual(['n3']);
    });

    it('deduplicates on-demand scan requests from balance requests', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');

      expect(
        await testUseCases.requestFullScan(account, 'balance-request'),
      ).toBe(true);
      expect(
        await testUseCases.requestFullScan(account, 'balance-request'),
      ).toBe(false);
      expect(
        await testUseCases.requestFullScan(account, 'sync-succeeded'),
      ).toBe(false);
      expect(fullScanEvents(snapClient)).toHaveLength(1);

      nowSpy.mockReturnValue(NOW + FULL_SCAN_ON_DEMAND_MIN_INTERVAL_MS);
      expect(
        await testUseCases.requestFullScan(account, 'balance-request'),
      ).toBe(true);
      expect(fullScanEvents(snapClient)).toHaveLength(2);
    });

    it('does not request a scan while one is running', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');
      let finishScan: () => void = () => undefined;
      mockChain.fullScan.mockReturnValue(
        new Promise<void>((resolve) => {
          finishScan = resolve;
        }),
      );

      const scan = testUseCases.fullScan(account);
      expect(
        await testUseCases.requestFullScan(account, 'balance-request'),
      ).toBe(false);
      finishScan();
      await scan;
      expect(fullScanEvents(snapClient)).toHaveLength(0);
    });

    it('backs off on-demand scans after failures, bounded to 2 minutes', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');
      mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));

      for (let i = 0; i < 4; i++) {
        await expect(testUseCases.fullScan(account)).rejects.toThrow(
          'Failed to fetch',
        );
      }

      nowSpy.mockReturnValue(NOW + FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS - 1);
      expect(
        await testUseCases.requestFullScan(account, 'balance-request'),
      ).toBe(false);
      nowSpy.mockReturnValue(NOW + FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS);
      expect(
        await testUseCases.requestFullScan(account, 'balance-request'),
      ).toBe(true);
      expect(fullScanEvents(snapClient)).toHaveLength(1);
    });

    it('runs the pending full scan promptly once syncs succeed again after an outage', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([account]);
      mockRepository.insertMany.mockResolvedValue([account]);
      await testUseCases.createMany([
        {
          network: 'bitcoin',
          entropySource: 'some-source',
          index: 0,
          addressType: 'p2wpkh',
          synchronize: false,
        },
      ]);
      snapClient.scheduleBackgroundEvent.mockClear();

      // Outage: repeated scans fail (on-demand interval now 2 minutes) and
      // the cron syncs fail too.
      mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));
      for (let i = 0; i < 4; i++) {
        await expect(testUseCases.fullScan(account)).rejects.toThrow(
          'Failed to fetch',
        );
      }
      mockChain.sync.mockRejectedValueOnce(new Error('Failed to fetch'));
      await expect(testUseCases.synchronize(account, 'cron')).rejects.toThrow(
        'Failed to fetch',
      );

      // The network comes back: the next cron sync (30 s later) succeeds and
      // runs the full scan right away, without waiting for the backoff.
      nowSpy.mockReturnValue(NOW + 30_000);
      mockChain.sync.mockResolvedValueOnce();
      await testUseCases.synchronize(account, 'cron');

      expect(fullScanEvents(snapClient)).toStrictEqual([
        [
          {
            duration: 'PT1S',
            method: CronMethod.FullScanAccount,
            params: { accountId: 'a' },
          },
        ],
      ]);
    });

    it('lets a successful sync trigger the pending scan, bounded by the on-demand backoff', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([account]);
      mockRepository.insertMany.mockResolvedValue([account]);
      await testUseCases.createMany([
        {
          network: 'bitcoin',
          entropySource: 'some-source',
          index: 0,
          addressType: 'p2wpkh',
          synchronize: false,
        },
      ]);
      snapClient.scheduleBackgroundEvent.mockClear();
      mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));
      for (let i = 0; i < 3; i++) {
        await expect(testUseCases.fullScan(account)).rejects.toThrow(
          'Failed to fetch',
        );
      }
      mockChain.sync.mockResolvedValue();

      nowSpy.mockReturnValue(NOW + 60_000);
      await testUseCases.synchronize(account, 'cron');
      expect(fullScanEvents(snapClient)).toHaveLength(0);

      nowSpy.mockReturnValue(NOW + FULL_SCAN_ON_DEMAND_MAX_INTERVAL_MS);
      await testUseCases.synchronize(account, 'cron');
      expect(fullScanEvents(snapClient)).toHaveLength(1);
    });

    it('does not request scans from syncs of accounts with a known balance', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');
      mockChain.sync.mockResolvedValue();

      await testUseCases.synchronize(account, 'cron');

      expect(fullScanEvents(snapClient)).toHaveLength(0);
    });

    it('treats a failed full scan joined by a sync as a failed sync, so the next successful sync recovers promptly (v3 item 6)', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const account = buildAccount('a');
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([account]);
      mockRepository.insertMany.mockResolvedValue([account]);
      await testUseCases.createMany([
        {
          network: 'bitcoin',
          entropySource: 'some-source',
          index: 0,
          addressType: 'p2wpkh',
          synchronize: false,
        },
      ]);
      snapClient.scheduleBackgroundEvent.mockClear();

      // Outage: scans keep failing (on-demand interval now 2 minutes).
      mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));
      for (let i = 0; i < 3; i++) {
        await expect(testUseCases.fullScan(account)).rejects.toThrow(
          'Failed to fetch',
        );
      }
      // The cron sync joins the next (failing) scan instead of syncing.
      let failScan: (error: Error) => void = () => undefined;
      mockChain.fullScan.mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          failScan = reject;
        }),
      );
      const scan = testUseCases.fullScan(account);
      const joinedSynchronization = testUseCases.synchronize(account, 'cron');
      failScan(new Error('Failed to fetch'));
      await expect(scan).rejects.toThrow('Failed to fetch');
      await expect(joinedSynchronization).rejects.toThrow('Failed to fetch');
      expect(mockChain.sync).not.toHaveBeenCalled();

      // The connection heals: the next cron sync (30 s later) succeeds and
      // requests the full scan right away, not after the 2-minute backoff.
      nowSpy.mockReturnValue(NOW + 30_000);
      mockChain.sync.mockResolvedValueOnce();
      await testUseCases.synchronize(account, 'cron');

      expect(fullScanEvents(snapClient)).toStrictEqual([
        [
          {
            duration: 'PT1S',
            method: CronMethod.FullScanAccount,
            params: { accountId: 'a' },
          },
        ],
      ]);
    });

    describe('first heal of a never-synchronized account (v7)', () => {
      const createNeverSyncedAccount = async (
        testUseCases: AccountUseCases,
        snapClient: ReturnType<typeof mock<SnapClient>>,
      ): Promise<BitcoinAccount> => {
        const account = buildAccount('a', false);
        mockRepository.getByDerivationPaths.mockResolvedValue({
          accounts: [null],
          snapshot: { accounts: null, derivationPaths: null },
        });
        mockRepository.createMany.mockResolvedValue([account]);
        mockRepository.insertMany.mockResolvedValue([account]);
        await testUseCases.createMany([
          {
            network: 'bitcoin',
            entropySource: 'some-source',
            index: 0,
            addressType: 'p2wpkh',
            synchronize: false,
          },
        ]);
        snapClient.scheduleBackgroundEvent.mockClear();
        return account;
      };

      const at = (offsetMs: number): void => {
        nowSpy.mockReturnValue(NOW + offsetMs);
      };

      /**
       * Seconds until the scheduled full scans run, from their ISO durations.
       *
       * @param snapClient - The snap client mock.
       * @returns The delays in seconds, one per scheduled full scan.
       */
      const scheduledScanDelays = (
        snapClient: ReturnType<typeof mock<SnapClient>>,
      ): number[] =>
        snapClient.scheduleBackgroundEvent.mock.calls
          .filter(([event]) => event.method === CronMethod.FullScanAccount)
          .map(([event]) => Number(/^PT(\d+)S$/u.exec(event.duration ?? '')?.[1]));

      it('requests the full scan within seconds when the first successful sync comes 25 s after a failed scan (A-v6 22:49:13)', async () => {
        const { useCases: testUseCases, snapClient } = buildUseCases();
        const account = await createNeverSyncedAccount(testUseCases, snapClient);
        mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));
        mockChain.sync.mockRejectedValue(new Error('Failed to fetch'));

        // Outage, with the A-v6 timeline (seconds after onboarding): the
        // first scans fail at +0 and +2, on-demand retries at +31 and +92,
        // and the 30 s cron syncs fail in between.
        for (const [offset, kind] of [
          [0, 'scan'],
          [2, 'scan'],
          [26, 'sync'],
          [31, 'scan'],
          [56, 'sync'],
          [86, 'sync'],
          [92, 'scan'],
        ] as const) {
          at(offset * 1000);
          const step =
            kind === 'scan'
              ? testUseCases.fullScan(account)
              : testUseCases.synchronize(account, 'cron');
          await expect(step).rejects.toThrow('Failed to fetch');
        }
        // The backoff has grown: a balance request (client retry) is now
        // held back by the 2-minute on-demand interval.
        at(116_000);
        expect(
          await testUseCases.requestFullScan(account, 'balance-request'),
        ).toBe(false);
        expect(fullScanEvents(snapClient)).toHaveLength(0);

        // Heal: the next cron sync, 25 s after the last failed scan, succeeds.
        at(117_000);
        mockChain.sync.mockResolvedValue();
        await testUseCases.synchronize(account, 'cron');

        const delays = scheduledScanDelays(snapClient);
        expect(delays).toHaveLength(1);
        expect(delays[0]).toBeLessThanOrEqual(5);
        expect(fullScanEvents(snapClient)).toStrictEqual([
          [
            {
              duration: 'PT1S',
              method: CronMethod.FullScanAccount,
              params: { accountId: 'a' },
            },
          ],
        ]);

        // No duplicate scan before the scheduled one runs: neither the cron
        // queue, nor later syncs, nor balance requests add another.
        at(118_000);
        expect(await testUseCases.listDueFullScans([account], 2)).toStrictEqual(
          [],
        );
        await testUseCases.synchronize(account, 'cron');
        expect(
          await testUseCases.requestFullScan(account, 'balance-request'),
        ).toBe(false);
        expect(fullScanEvents(snapClient)).toHaveLength(1);

        // The scheduled scan runs and succeeds: the balance is known and the
        // following syncs request nothing more.
        mockChain.fullScan.mockResolvedValue();
        await testUseCases.fullScan(account);
        jest.mocked(account.hasSynchronized).mockReturnValue(true);
        expect(await testUseCases.isBalanceUnknown(account)).toBe(false);
        at(147_000);
        await testUseCases.synchronize(account, 'cron');
        expect(fullScanEvents(snapClient)).toHaveLength(1);
        expect(mockChain.fullScan).toHaveBeenCalledTimes(5);
      });

      it('defers, rather than drops, a recovery that arrives right after a failed scan', async () => {
        const { useCases: testUseCases, snapClient } = buildUseCases();
        const account = await createNeverSyncedAccount(testUseCases, snapClient);
        mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));
        mockChain.sync.mockRejectedValueOnce(new Error('Failed to fetch'));
        for (let i = 0; i < 3; i++) {
          await expect(testUseCases.fullScan(account)).rejects.toThrow(
            'Failed to fetch',
          );
        }
        await expect(testUseCases.synchronize(account, 'cron')).rejects.toThrow(
          'Failed to fetch',
        );

        // The sync succeeds 2 s after the last failed scan.
        at(2_000);
        mockChain.sync.mockResolvedValue();
        await testUseCases.synchronize(account, 'cron');

        expect(scheduledScanDelays(snapClient)).toStrictEqual([
          (FULL_SCAN_RECOVERY_MIN_INTERVAL_MS - 2_000) / 1000,
        ]);
        // Still a single scan while it is pending.
        at(4_000);
        await testUseCases.synchronize(account, 'cron');
        expect(await testUseCases.listDueFullScans([account], 2)).toStrictEqual(
          [],
        );
        expect(fullScanEvents(snapClient)).toHaveLength(1);
      });

      it('keeps the on-demand backoff for successful syncs that are not a recovery', async () => {
        const { useCases: testUseCases, snapClient } = buildUseCases();
        const account = await createNeverSyncedAccount(testUseCases, snapClient);
        mockChain.fullScan.mockRejectedValue(new Error('Failed to fetch'));
        for (let i = 0; i < 3; i++) {
          await expect(testUseCases.fullScan(account)).rejects.toThrow(
            'Failed to fetch',
          );
        }
        // Syncs never failed (only the scans did): no recovery, so the
        // 2-minute on-demand interval still applies.
        mockChain.sync.mockResolvedValue();
        at(25_000);
        await testUseCases.synchronize(account, 'cron');
        expect(fullScanEvents(snapClient)).toHaveLength(0);
      });
    });
  });

  describe('discovery scan reuse and the discovery frontier (v3 item 1)', () => {
    const NOW = 1_700_000_000_000;
    let nowSpy: jest.SpyInstance<number, []>;

    const buildUseCases = (): {
      useCases: AccountUseCases;
      snapClient: ReturnType<typeof mock<SnapClient>>;
    } => {
      const state: Record<string, unknown> = {};
      const snapClient = mock<SnapClient>();
      snapClient.getState.mockImplementation(async (key?: string) =>
        key !== undefined && Object.hasOwn(state, key)
          ? (JSON.parse(JSON.stringify(state[key])) as never)
          : (null as never),
      );
      snapClient.setState.mockImplementation(async (key, value) => {
        state[key as string] = JSON.parse(JSON.stringify(value));
      });
      return {
        useCases: new AccountUseCases(
          mockLogger,
          snapClient,
          mockRepository,
          mockConfirmationRepository,
          mockChain,
          fallbackFeeRate,
          targetBlocksConfirmation,
          undefined,
        ),
        snapClient,
      };
    };

    const buildAccount = (
      id: string,
      { synchronized = true, transactions = 0 } = {},
    ): BitcoinAccount => {
      const account = mock<BitcoinAccount>({ id, network: 'bitcoin' });
      account.hasSynchronized.mockReturnValue(synchronized);
      account.listTransactions.mockReturnValue(
        Array.from({ length: transactions }, () => mock<WalletTx>()),
      );
      return account;
    };

    const request = (index: number): CreateAccountParams => ({
      network: 'bitcoin',
      entropySource: 'some-source',
      index,
      addressType: 'p2wpkh',
      synchronize: false,
    });

    const eventsOf = (
      snapClient: ReturnType<typeof mock<SnapClient>>,
      method: string,
    ): unknown[] =>
      snapClient.scheduleBackgroundEvent.mock.calls
        .filter(([event]) => event.method === method)
        .map(([event]) => event);

    const discover = async (
      testUseCases: AccountUseCases,
      account: BitcoinAccount,
      index: number,
    ): Promise<void> => {
      mockRepository.getByDerivationPath.mockResolvedValueOnce(null);
      mockRepository.create.mockResolvedValueOnce(account);
      mockChain.fullScan.mockResolvedValueOnce();
      await testUseCases.discover({
        network: 'bitcoin',
        entropySource: 'some-source',
        index,
        addressType: 'p2wpkh',
      });
    };

    beforeEach(() => {
      mockChain.fullScan.mockReset();
      mockChain.sync.mockReset();
      mockRepository.createMany.mockReset();
      mockRepository.insertMany.mockReset();
      mockRepository.update.mockResolvedValue();
      nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('reuses the account discovery just scanned as its first synchronization', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const discovered = buildAccount('d1');
      await discover(testUseCases, discovered, 1);
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.insertMany.mockResolvedValue([discovered]);

      const created = await testUseCases.createMany([request(1)]);

      expect(created).toStrictEqual([discovered]);
      expect(mockRepository.createMany).not.toHaveBeenCalled();
      expect(mockRepository.insertMany).toHaveBeenCalledWith(
        [discovered],
        expect.anything(),
      );
      expect(discovered.revealNextAddress).toHaveBeenCalled();
      // No second full scan: not scheduled, not queued.
      expect(mockChain.fullScan).toHaveBeenCalledTimes(1);
      expect(eventsOf(snapClient, CronMethod.FullScanAccount)).toHaveLength(0);
      expect(await testUseCases.isInitialFullScanPending('d1')).toBe(false);
      expect(await testUseCases.isBalanceUnknown(discovered)).toBe(false);
    });

    it('syncs (instead of full-scanning) new accounts above the lowest index discovery found unused', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      // Onboarding: discovery finds index 1 unused, then alignment creates
      // groups 1..4 because other networks have activity there.
      const discovered = buildAccount('d1');
      await discover(testUseCases, discovered, 1);
      const fresh = ['a2', 'a3', 'a4'].map((id) =>
        buildAccount(id, { synchronized: false }),
      );
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null, null, null, null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue(fresh);
      mockRepository.insertMany.mockResolvedValue([discovered, ...fresh]);

      await testUseCases.createMany([1, 2, 3, 4].map(request));

      expect(mockRepository.createMany).toHaveBeenCalledTimes(1);
      expect(
        mockRepository.createMany.mock.calls[0]?.[0].map(
          ({ derivationPath }) => derivationPath[3],
        ),
      ).toStrictEqual(["2'", "3'", "4'"]);
      expect(eventsOf(snapClient, CronMethod.FullScanAccount)).toHaveLength(0);
      expect(
        eventsOf(snapClient, CronMethod.SyncSelectedAccounts),
      ).toStrictEqual([
        {
          duration: 'PT1S',
          method: CronMethod.SyncSelectedAccounts,
          params: { accountIds: ['a2', 'a3', 'a4'] },
        },
      ]);
      expect(await testUseCases.isInitialFullScanPending('a2')).toBe(false);
      // Not picked by the cron full-scan queue either.
      expect(await testUseCases.listDueFullScans(fresh, 5)).toStrictEqual([]);
      // Discovery's own scan is the only full scan.
      expect(mockChain.fullScan).toHaveBeenCalledTimes(1);
    });

    it('answers a balance request for a fresh account with a sync, and full-scans normally once it synced', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      await discover(testUseCases, buildAccount('d1'), 1);
      const fresh = buildAccount('a2', { synchronized: false });
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([fresh]);
      mockRepository.insertMany.mockResolvedValue([fresh]);
      await testUseCases.createMany([request(2)]);
      snapClient.scheduleBackgroundEvent.mockClear();

      expect(await testUseCases.requestFullScan(fresh, 'balance-request')).toBe(
        true,
      );
      expect(snapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        duration: 'PT1S',
        method: CronMethod.SyncSelectedAccounts,
        params: { accountIds: ['a2'] },
      });

      // After its first successful sync, it is a regular account again.
      mockChain.sync.mockResolvedValueOnce();
      jest.mocked(fresh.hasSynchronized).mockReturnValue(true);
      await testUseCases.synchronize(fresh, 'cron');
      snapClient.scheduleBackgroundEvent.mockClear();
      nowSpy.mockReturnValue(NOW + 60_000);
      await testUseCases.requestFullScan(fresh, 'balance-request');
      expect(snapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        duration: 'PT1S',
        method: CronMethod.FullScanAccount,
        params: { accountId: 'a2' },
      });
    });

    it('still full-scans accounts at or below an index with activity', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      // Discovery found activity at index 1 (frontier not set by it).
      await discover(testUseCases, buildAccount('d1', { transactions: 2 }), 1);
      const next = buildAccount('a2', { synchronized: false });
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([next]);
      mockRepository.insertMany.mockResolvedValue([next]);

      await testUseCases.createMany([request(2)]);

      expect(
        eventsOf(snapClient, CronMethod.SyncSelectedAccounts),
      ).toHaveLength(0);
      expect(eventsOf(snapClient, CronMethod.FullScanAccount)).toStrictEqual([
        {
          duration: 'PT1S',
          method: CronMethod.FullScanAccount,
          params: { accountId: 'a2' },
        },
      ]);
    });

    it('reproduces the onboarding of run B-v3: accounts created before discovery get discovery-gap first scans', async () => {
      // Run B-v3 (restored SRP with five synced account groups):
      // 1. wallet init creates index 0;
      // 2. the account-tree sync creates groups 1..4, whose non-EVM
      //    post-alignment calls createAccounts(range 1..4);
      // 3. only then discovery runs, at index 5 (the next group index).
      // Discovery therefore never precedes the creations: no reuse and no
      // frontier apply, and all five accounts need an initial scan.
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const funded = buildAccount('a0', { synchronized: false });
      const empty = ['a1', 'a2', 'a3', 'a4'].map((id) =>
        buildAccount(id, { synchronized: false }),
      );
      mockRepository.getByDerivationPaths.mockResolvedValueOnce({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValueOnce([funded]);
      await testUseCases.createMany([request(0)]);
      mockRepository.getByDerivationPaths.mockResolvedValueOnce({
        accounts: [null, null, null, null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValueOnce(empty);
      await testUseCases.createMany([1, 2, 3, 4].map(request));
      await discover(testUseCases, buildAccount('d5'), 5);

      // Immediate scans: index 0, then the first MAX_IMMEDIATE ones of the
      // batch; the rest wait for the cron queue (the +26 s burst).
      expect(
        eventsOf(snapClient, CronMethod.FullScanAccount).map(
          (event) => (event as { params: { accountId: string } }).params,
        ),
      ).toStrictEqual([
        { accountId: 'a0' },
        ...['a1', 'a2']
          .slice(0, MAX_IMMEDIATE_FULL_SCANS_ON_CREATE)
          .map((accountId) => ({ accountId })),
      ]);
      expect(
        (await testUseCases.listDueFullScans([funded, ...empty], 5)).map(
          ({ id }) => id,
        ),
      ).toStrictEqual(['a3', 'a4']);

      // Every initial scan uses the discovery gap; only the funded account
      // gets the standard-gap completion.
      mockChain.fullScan.mockReset();
      mockChain.fullScan.mockImplementation(async (account) => {
        if (account === funded) {
          jest
            .mocked(funded.listTransactions)
            .mockReturnValue([mock<WalletTx>()]);
        }
      });
      stubSentAmount(funded);
      for (const account of [funded, ...empty]) {
        await testUseCases.fullScan(account);
      }
      expect(
        mockChain.fullScan.mock.calls.map(([account, mode]) => [
          account.id,
          mode,
        ]),
      ).toStrictEqual([
        ['a0', 'discovery'],
        ['a1', 'discovery'],
        ['a2', 'discovery'],
        ['a3', 'discovery'],
        ['a4', 'discovery'],
      ]);
      // B-v4: the funded account is completed to the standard gap without
      // repeating its discovery-gap scan.
      expect(
        mockChain.extendDiscoveryScan.mock.calls.map(([account]) => account.id),
      ).toStrictEqual(['a0']);
    });

    it('requests a standard-gap scan for a reused discovery scan that found activity', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      const discovered = buildAccount('d1', { transactions: 3 });
      await discover(testUseCases, discovered, 1);
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null],
        snapshot: { accounts: null, derivationPaths: null },
      });

      await testUseCases.createMany([request(1)]);

      expect(mockRepository.createMany).not.toHaveBeenCalled();
      expect(eventsOf(snapClient, CronMethod.FullScanAccount)).toStrictEqual([
        {
          duration: 'PT1S',
          method: CronMethod.FullScanAccount,
          params: { accountId: 'd1' },
        },
      ]);
      // Its balance is known from the discovery scan meanwhile.
      expect(await testUseCases.isInitialFullScanPending('d1')).toBe(false);

      // The scheduled scan uses the standard gap (the account synchronized).
      mockChain.fullScan.mockResolvedValueOnce();
      stubSentAmount(discovered);
      await testUseCases.fullScan(discovered);
      expect(mockChain.fullScan).toHaveBeenLastCalledWith(discovered, 'scan');
    });

    it('does not reuse discovery results older than the reuse TTL', async () => {
      const { useCases: testUseCases, snapClient } = buildUseCases();
      await discover(testUseCases, buildAccount('d1'), 1);
      nowSpy.mockReturnValue(NOW + DISCOVERY_SCAN_REUSE_TTL_MS);
      const derived = buildAccount('n1', { synchronized: false });
      const fresh = buildAccount('n2', { synchronized: false });
      mockRepository.getByDerivationPaths.mockResolvedValue({
        accounts: [null, null],
        snapshot: { accounts: null, derivationPaths: null },
      });
      mockRepository.createMany.mockResolvedValue([derived, fresh]);
      mockRepository.insertMany.mockResolvedValue([derived, fresh]);

      await testUseCases.createMany([request(1), request(2)]);

      expect(mockRepository.createMany.mock.calls[0]?.[0]).toHaveLength(2);
      expect(
        eventsOf(snapClient, CronMethod.SyncSelectedAccounts),
      ).toHaveLength(0);
      expect(eventsOf(snapClient, CronMethod.FullScanAccount)).toHaveLength(2);
    });
  });
});
