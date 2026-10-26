import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import {
  CONSENSYS_SR_NODE_ADDRESS,
  KnownCaip19Id,
  Network,
} from '../../constants';
import { BackgroundEventMethod } from '../../handlers/cronjob/cronjob';
import { trxToSun } from '../../utils/conversion';
import { mockLogger } from '../../utils/mockLogger';
import type { AccountsService } from '../accounts/AccountsService';
import type { TransactionExpirationRefresherService } from '../transaction-expiration-refresher/TransactionExpirationRefresherService';
import type { TransactionWithMetadata } from '../transaction-expiration-refresher/types';
import { StakingService } from './StakingService';

describe('StakingService', () => {
  let stakingService: StakingService;
  let mockAccountsService: jest.Mocked<AccountsService>;
  let mockTronWebFactory: jest.Mocked<TronWebFactory>;
  let mockSnapClient: jest.Mocked<SnapClient>;
  let mockTransactionExpirationRefresherService: jest.Mocked<TransactionExpirationRefresherService>;
  let mockTronWeb: any;

  const mockAccount: ExtendedKeyringAccount = {
    id: 'test-account-id',
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: ['tron:728126428'],
    entropySource: 'test-entropy',
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  const mockKeypair = {
    privateKeyHex:
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',

    privateKeyBytes: Buffer.from(
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      'hex',
    ),

    publicKeyBytes: Buffer.from(
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      'hex',
    ),
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
  };

  const mockTransaction = {
    txID: 'mock-transaction-id',
    raw_data_hex: 'mock-raw-data-hex',

    raw_data: {
      expiration: 1_700_000_060_000,
      ref_block_bytes: '0001',
      ref_block_hash: '0011223344556677',
      timestamp: 1_700_000_000_000,
      contract: [
        {
          type: 'FreezeBalanceV2Contract',
          parameter: {
            value: {
              owner_address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',

              frozen_balance: 1000000,
              resource: 'BANDWIDTH',
            },
          },
        },
      ],
    },
  } as unknown as TransactionWithMetadata;

  const mockSignedTransaction = {
    ...mockTransaction,
    signature: ['mock-signature'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTronWeb = {
      transactionBuilder: {
        freezeBalanceV2: jest.fn().mockResolvedValue(mockTransaction),
        unfreezeBalanceV2: jest.fn().mockResolvedValue(mockTransaction),
        vote: jest.fn().mockResolvedValue(mockTransaction),
        withdrawExpireUnfreeze: jest.fn().mockResolvedValue(mockTransaction),
        withdrawBlockRewards: jest.fn().mockResolvedValue(mockTransaction),
      },
      trx: {
        sign: jest.fn().mockResolvedValue(mockSignedTransaction),
        sendRawTransaction: jest
          .fn()
          .mockResolvedValue({ result: true, txid: 'mock-tx-id' }),
      },
    };

    mockAccountsService = {
      deriveTronKeypair: jest.fn().mockResolvedValue(mockKeypair),
      findByIdOrThrow: jest.fn().mockResolvedValue(mockAccount),
    } as unknown as jest.Mocked<AccountsService>;

    mockTronWebFactory = {
      createClient: jest.fn().mockReturnValue(mockTronWeb),
      executeBroadcast: jest
        .fn()
        .mockImplementation(
          async (_scope: Network, operation: () => Promise<unknown>) =>
            operation(),
        ),
    } as unknown as jest.Mocked<TronWebFactory>;

    mockSnapClient = {
      scheduleBackgroundEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SnapClient>;
    mockTransactionExpirationRefresherService = {
      ensureFreshMetadata: jest
        .fn()
        .mockImplementation(async ({ transaction }) => transaction),
    } as unknown as jest.Mocked<TransactionExpirationRefresherService>;

    stakingService = new StakingService({
      logger: mockLogger,
      accountsService: mockAccountsService,
      tronWebFactory: mockTronWebFactory,
      snapClient: mockSnapClient,
      transactionExpirationRefresherService:
        mockTransactionExpirationRefresherService,
    });
  });

  describe('stake', () => {
    it('successfully stakes TRX for BANDWIDTH', async () => {
      const amount = BigNumber(1000000);
      const assetId = KnownCaip19Id.TrxMainnet;
      const purpose = 'BANDWIDTH';

      await stakingService.stake({
        account: mockAccount,
        assetId,
        amount,
        purpose,
      });

      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });

      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        mockKeypair.privateKeyHex,
      );

      expect(
        mockTronWeb.transactionBuilder.freezeBalanceV2,
      ).toHaveBeenCalledWith(
        Number(trxToSun(amount)),
        purpose,
        mockAccount.address,
      );

      expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(mockTransaction);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledWith(
        mockSignedTransaction,
      );

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.SynchronizeAccount,
        params: { accountId: mockAccount.id },
        duration: 'PT5S',
      });
    });

    it('builds and signs once when retrying a transient broadcast failure', async () => {
      mockTronWebFactory.executeBroadcast.mockImplementation(
        async (_scope: Network, operation: () => Promise<unknown>) => {
          try {
            return await operation();
          } catch {
            return operation();
          }
        },
      );
      mockTronWeb.trx.sendRawTransaction
        .mockRejectedValueOnce(
          Object.assign(new Error('unavailable'), {
            response: { status: 503 },
          }),
        )
        .mockResolvedValue({ result: true, txid: 'mock-tx-id' });

      await stakingService.stake({
        account: mockAccount,
        assetId: KnownCaip19Id.TrxMainnet,
        amount: BigNumber(1000000),
        purpose: 'BANDWIDTH',
      });

      expect(
        mockTronWeb.transactionBuilder.freezeBalanceV2,
      ).toHaveBeenCalledTimes(1);
      expect(mockTronWeb.transactionBuilder.vote).toHaveBeenCalledTimes(1);
      expect(mockTronWeb.trx.sign).toHaveBeenCalledTimes(2);
      expect(mockTronWeb.trx.sign).toHaveBeenNthCalledWith(1, mockTransaction);
      expect(mockTronWeb.trx.sign).toHaveBeenNthCalledWith(2, mockTransaction);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledTimes(3);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
        1,
        mockSignedTransaction,
      );
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
        2,
        mockSignedTransaction,
      );
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
        3,
        mockSignedTransaction,
      );
    });

    it('refreshes each prebuilt transaction immediately before signing', async () => {
      let releaseFreezeBroadcast = (): void => undefined;
      const freezeBroadcastPending = new Promise<void>((resolve) => {
        releaseFreezeBroadcast = resolve;
      });
      let markFreezeBroadcastStarted = (): void => undefined;
      const freezeBroadcastStarted = new Promise<void>((resolve) => {
        markFreezeBroadcastStarted = resolve;
      });
      const freezeTransaction = {
        ...mockTransaction,
        txID: 'freeze-transaction-id',
      };
      const voteTransaction = {
        ...mockTransaction,
        txID: 'expired-vote-transaction-id',
      };
      const freshVoteTransaction = {
        ...voteTransaction,
        txID: 'fresh-vote-transaction-id',
      };
      mockTronWeb.transactionBuilder.freezeBalanceV2.mockResolvedValueOnce(
        freezeTransaction,
      );
      mockTronWeb.transactionBuilder.vote.mockResolvedValueOnce(
        voteTransaction,
      );
      mockTransactionExpirationRefresherService.ensureFreshMetadata
        .mockResolvedValueOnce(freezeTransaction)
        .mockResolvedValueOnce(freshVoteTransaction);
      mockTronWebFactory.executeBroadcast
        .mockImplementationOnce(async (_scope, operation) => {
          markFreezeBroadcastStarted();
          await freezeBroadcastPending;
          return operation();
        })
        .mockImplementation(async (_scope, operation) => operation());

      const stakePromise = stakingService.stake({
        account: mockAccount,
        assetId: KnownCaip19Id.TrxMainnet,
        amount: BigNumber(1000000),
        purpose: 'BANDWIDTH',
      });

      await freezeBroadcastStarted;
      expect(
        mockTransactionExpirationRefresherService.ensureFreshMetadata,
      ).toHaveBeenCalledTimes(1);
      expect(mockTronWeb.trx.sign).toHaveBeenCalledTimes(1);

      releaseFreezeBroadcast();
      await stakePromise;

      expect(
        mockTransactionExpirationRefresherService.ensureFreshMetadata,
      ).toHaveBeenNthCalledWith(1, {
        scope: Network.Mainnet,
        transaction: freezeTransaction,
      });
      expect(
        mockTransactionExpirationRefresherService.ensureFreshMetadata,
      ).toHaveBeenNthCalledWith(2, {
        scope: Network.Mainnet,
        transaction: voteTransaction,
      });
      expect(mockTronWeb.trx.sign).toHaveBeenNthCalledWith(
        2,
        freshVoteTransaction,
      );
    });

    it('synchronizes after a vote rejection following a successful freeze', async () => {
      mockTronWeb.trx.sendRawTransaction
        .mockResolvedValueOnce({ result: true, txid: 'freeze-tx-id' })
        .mockResolvedValueOnce({ result: false, message: 'Vote rejected' });

      await expect(
        stakingService.stake({
          account: mockAccount,
          assetId: KnownCaip19Id.TrxMainnet,
          amount: BigNumber(1000000),
          purpose: 'BANDWIDTH',
        }),
      ).rejects.toThrow('Failed to send transaction: Vote rejected');

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.SynchronizeAccount,
        params: { accountId: mockAccount.id },
        duration: 'PT5S',
      });
    });

    it('preserves the vote rejection if synchronization scheduling fails', async () => {
      mockTronWeb.trx.sendRawTransaction
        .mockResolvedValueOnce({ result: true, txid: 'freeze-tx-id' })
        .mockResolvedValueOnce({ result: false, message: 'Vote rejected' });
      mockSnapClient.scheduleBackgroundEvent.mockRejectedValueOnce(
        new Error('Scheduling failed'),
      );

      await expect(
        stakingService.stake({
          account: mockAccount,
          assetId: KnownCaip19Id.TrxMainnet,
          amount: BigNumber(1000000),
          purpose: 'BANDWIDTH',
        }),
      ).rejects.toThrow('Failed to send transaction: Vote rejected');
    });

    it('successfully stakes TRX for ENERGY', async () => {
      const amount = BigNumber(2000000);
      const assetId = KnownCaip19Id.TrxNile;
      const purpose = 'ENERGY';

      await stakingService.stake({
        account: mockAccount,
        assetId,
        amount,
        purpose,
      });

      expect(
        mockTronWeb.transactionBuilder.freezeBalanceV2,
      ).toHaveBeenCalledWith(
        Number(trxToSun(amount)),
        purpose,
        mockAccount.address,
      );

      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Nile,
        mockKeypair.privateKeyHex,
      );
    });

    it('correctly parses chainId from different network asset IDs', async () => {
      const testCases = [
        { assetId: KnownCaip19Id.TrxMainnet, expectedNetwork: Network.Mainnet },
        { assetId: KnownCaip19Id.TrxNile, expectedNetwork: Network.Nile },
        { assetId: KnownCaip19Id.TrxShasta, expectedNetwork: Network.Shasta },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        await stakingService.stake({
          account: mockAccount,
          assetId: testCase.assetId as any,
          amount: BigNumber(1000000),
          purpose: 'BANDWIDTH',
        });

        expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
          testCase.expectedNetwork,
          mockKeypair.privateKeyHex,
        );
      }
    });

    it('handles different amount values correctly', async () => {
      const testCases = [
        { amount: BigNumber(1) },
        { amount: BigNumber(1000000) },
        { amount: BigNumber('1000000000000') },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        await stakingService.stake({
          account: mockAccount,
          assetId: KnownCaip19Id.TrxMainnet,
          amount: testCase.amount,
          purpose: 'BANDWIDTH',
        });

        expect(
          mockTronWeb.transactionBuilder.freezeBalanceV2,
        ).toHaveBeenCalledWith(
          Number(trxToSun(testCase.amount)),
          'BANDWIDTH',
          mockAccount.address,
        );
      }
    });

    it('correctly derives keypair for staking', async () => {
      const customAccount = {
        ...mockAccount,
        entropySource: 'custom-entropy',
        derivationPath: "m/44'/195'/1'/0/0" as const,
      };

      await stakingService.stake({
        account: customAccount,
        assetId: KnownCaip19Id.TrxMainnet as any,
        amount: BigNumber(1000000),
        purpose: 'BANDWIDTH',
      });

      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: 'custom-entropy',
        derivationPath: "m/44'/195'/1'/0/0",
      });
    });

    it('uses Consensys SR node address by default when srNodeAddress is not provided', async () => {
      const amount = BigNumber(100);
      const assetId = KnownCaip19Id.TrxMainnet;
      const purpose = 'BANDWIDTH';

      await stakingService.stake({
        account: mockAccount,
        assetId,
        amount,
        purpose,
      });

      expect(mockTronWeb.transactionBuilder.vote).toHaveBeenCalledWith(
        { [CONSENSYS_SR_NODE_ADDRESS]: 100 },
        mockAccount.address,
      );
    });

    it('uses custom SR node address when provided', async () => {
      const amount = BigNumber(100);
      const assetId = KnownCaip19Id.TrxMainnet;
      const purpose = 'BANDWIDTH';
      const customSrNodeAddress = 'TSR1234567890abcdefghijklmnopqrstuv';

      await stakingService.stake({
        account: mockAccount,
        assetId,
        amount,
        purpose,
        srNodeAddress: customSrNodeAddress,
      });

      expect(mockTronWeb.transactionBuilder.vote).toHaveBeenCalledWith(
        { [customSrNodeAddress]: 100 },
        mockAccount.address,
      );
    });

    it('overrides Consensys SR node with custom address when provided', async () => {
      const amount = BigNumber(500);
      const assetId = KnownCaip19Id.TrxNile;
      const purpose = 'ENERGY';
      const customSrNodeAddress = 'TCustomSRNode12345678901234567890';

      await stakingService.stake({
        account: mockAccount,
        assetId,
        amount,
        purpose,
        srNodeAddress: customSrNodeAddress,
      });

      expect(mockTronWeb.transactionBuilder.vote).toHaveBeenCalledWith(
        { [customSrNodeAddress]: 500 },
        mockAccount.address,
      );

      // Verify Consensys SR node was NOT used
      expect(mockTronWeb.transactionBuilder.vote).not.toHaveBeenCalledWith(
        expect.objectContaining({
          [CONSENSYS_SR_NODE_ADDRESS]: expect.any(Number),
        }),
        expect.anything(),
      );
    });
  });

  describe('unstake', () => {
    it('successfully unstakes TRX staked for BANDWIDTH on Mainnet', async () => {
      const amount = BigNumber(1000000);
      const assetId = KnownCaip19Id.TrxStakedForBandwidthMainnet;

      await stakingService.unstake({
        account: mockAccount,
        assetId,
        amount,
      });

      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });

      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        mockKeypair.privateKeyHex,
      );

      expect(
        mockTronWeb.transactionBuilder.unfreezeBalanceV2,
      ).toHaveBeenCalledWith(
        Number(trxToSun(amount)),
        'BANDWIDTH',
        mockAccount.address,
      );

      expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(mockTransaction);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledWith(
        mockSignedTransaction,
      );

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.SynchronizeAccount,
        params: { accountId: mockAccount.id },
        duration: 'PT5S',
      });
    });

    it('successfully unstakes TRX staked for BANDWIDTH on all networks', async () => {
      const testCases = [
        {
          assetId: KnownCaip19Id.TrxStakedForBandwidthMainnet,
          expectedNetwork: Network.Mainnet,
        },
        {
          assetId: KnownCaip19Id.TrxStakedForBandwidthNile,
          expectedNetwork: Network.Nile,
        },
        {
          assetId: KnownCaip19Id.TrxStakedForBandwidthShasta,
          expectedNetwork: Network.Shasta,
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        await stakingService.unstake({
          account: mockAccount,
          assetId: testCase.assetId as any,
          amount: BigNumber(1000000),
        });

        expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
          testCase.expectedNetwork,
          mockKeypair.privateKeyHex,
        );

        expect(
          mockTronWeb.transactionBuilder.unfreezeBalanceV2,
        ).toHaveBeenCalledWith(
          Number(trxToSun(1000000)),
          'BANDWIDTH',
          mockAccount.address,
        );
      }
    });

    it('successfully unstakes TRX staked for ENERGY on all networks', async () => {
      const testCases = [
        {
          assetId: KnownCaip19Id.TrxStakedForEnergyMainnet,
          expectedNetwork: Network.Mainnet,
        },
        {
          assetId: KnownCaip19Id.TrxStakedForEnergyNile,
          expectedNetwork: Network.Nile,
        },
        {
          assetId: KnownCaip19Id.TrxStakedForEnergyShasta,
          expectedNetwork: Network.Shasta,
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        await stakingService.unstake({
          account: mockAccount,
          assetId: testCase.assetId as any,
          amount: BigNumber(2000000),
        });

        expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
          testCase.expectedNetwork,
          mockKeypair.privateKeyHex,
        );

        expect(
          mockTronWeb.transactionBuilder.unfreezeBalanceV2,
        ).toHaveBeenCalledWith(
          Number(trxToSun(2000000)),
          'ENERGY',
          mockAccount.address,
        );
      }
    });

    it('throws error for invalid asset ID', async () => {
      const invalidAssetId = 'tron:728126428/slip44:invalid' as any;
      const amount = BigNumber(1000000);

      await expect(
        stakingService.unstake({
          account: mockAccount,
          assetId: invalidAssetId,
          amount,
        }),
      ).rejects.toThrow('Invalid asset ID');
    });

    it('correctly derives keypair for unstaking', async () => {
      const customAccount = {
        ...mockAccount,
        entropySource: 'custom-entropy',
        derivationPath: "m/44'/195'/2'/0/0" as const,
      };

      await stakingService.unstake({
        account: customAccount,
        assetId: KnownCaip19Id.TrxStakedForBandwidthMainnet as any,
        amount: BigNumber(1000000),
      });

      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: 'custom-entropy',
        derivationPath: "m/44'/195'/2'/0/0",
      });
    });

    it('handles different amount values correctly', async () => {
      const testCases = [
        { amount: BigNumber(1) },
        { amount: BigNumber(1000000) },
        { amount: BigNumber('1000000000000') },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        await stakingService.unstake({
          account: mockAccount,
          assetId: KnownCaip19Id.TrxStakedForBandwidthMainnet,
          amount: testCase.amount,
        });

        expect(
          mockTronWeb.transactionBuilder.unfreezeBalanceV2,
        ).toHaveBeenCalledWith(
          Number(trxToSun(testCase.amount)),
          'BANDWIDTH',
          mockAccount.address,
        );
      }
    });
  });

  describe('claimUnstakedTrx', () => {
    it('builds, signs, and broadcasts a withdrawExpireUnfreeze transaction', async () => {
      await stakingService.claimUnstakedTrx({
        account: mockAccount,
        scope: Network.Mainnet,
      });

      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });
      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        mockKeypair.privateKeyHex,
      );
      expect(
        mockTronWeb.transactionBuilder.withdrawExpireUnfreeze,
      ).toHaveBeenCalledWith(mockAccount.address);
      expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(mockTransaction);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledWith(
        mockSignedTransaction,
      );
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.SynchronizeAccount,
        params: { accountId: mockAccount.id },
        duration: 'PT5S',
      });
    });
  });

  describe('claimTrxStakingRewards', () => {
    it('builds, signs, and broadcasts a withdrawBlockRewards transaction', async () => {
      await stakingService.claimTrxStakingRewards({
        account: mockAccount,
        scope: Network.Mainnet,
      });

      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });
      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        mockKeypair.privateKeyHex,
      );
      expect(
        mockTronWeb.transactionBuilder.withdrawBlockRewards,
      ).toHaveBeenCalledWith(mockAccount.address);
      expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(mockTransaction);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledWith(
        mockSignedTransaction,
      );
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.SynchronizeAccount,
        params: { accountId: mockAccount.id },
        duration: 'PT5S',
      });
    });
  });
});
