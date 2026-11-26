/* eslint-disable @typescript-eslint/naming-convention */
import {
  FeeType,
  TransactionType,
  TrxAccountType,
} from '@metamask/keyring-api';
import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';
import type { AnalyticsService } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import { TronWeb, Types as TronwebTypes } from 'tronweb';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import {
  FEE_LIMIT,
  Network,
  Networks,
  TRACK_TX_INTERVAL,
} from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { TronKeyringAccount } from '../../entities/tronKeyringAccount';
import { SendErrorCodes } from '../../handlers/clientRequest/types';
import { BackgroundEventMethod } from '../../handlers/cronjob/cronjob';
import { mockLogger } from '../../utils/mockLogger';
import type { AccountsService } from '../accounts/AccountsService';
import type { AssetsService } from '../assets/AssetsService';
import { TransactionExpirationRefresherService } from '../transaction-expiration-refresher/TransactionExpirationRefresherService';
import type { FeeCalculatorService } from './FeeCalculatorService';
import { SendService } from './SendService';

type Transaction = TronwebTypes.Transaction<TronwebTypes.TransferContract>;

type BroadcastResult =
  TronwebTypes.BroadcastReturn<TronwebTypes.SignedTransaction>;

const TEST_DERIVATION_PATH = "m/44'/195'/0'/0/0";

const createAccount = (
  overrides: Partial<TronKeyringAccount> = {},
): TronKeyringAccount => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  address: '',
  type: TrxAccountType.Eoa,
  options: {},
  methods: [],
  scopes: [Network.Mainnet],
  entropySource: 'test-entropy',
  derivationPath: TEST_DERIVATION_PATH,
  index: 0,
  ...overrides,
});

const createKeypair = (
  privateKeyHex: string,
  address: string,
): Awaited<ReturnType<AccountsService['deriveTronKeypair']>> => ({
  privateKeyBytes: new Uint8Array(),
  publicKeyBytes: new Uint8Array(),
  privateKeyHex,
  address,
});

const createBroadcastResult = (
  transaction: TronwebTypes.SignedTransaction,
  overrides: Partial<BroadcastResult> = {},
): BroadcastResult => ({
  result: true,
  txid: 'broadcast-tx-id',
  code: '',
  message: '',
  transaction,
  ...overrides,
});

const mockAnalyticsService = {
  trackTransactionSubmitted: vi.fn().mockResolvedValue(undefined),
} as unknown as AnalyticsService;

describe('SendService', () => {
  type MockTransferContract = Transaction['raw_data']['contract'][number];

  type MockTransferTransaction = Transaction & {
    raw_data: Omit<Transaction['raw_data'], 'contract'> & {
      contract: [MockTransferContract];
    };
  };

  describe('signAndSendTransaction', () => {
    const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
    const TEST_TO_ADDRESS = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
    const TEST_OWNER_HEX = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';
    const TEST_FROM_ADDRESS = TronWeb.address.fromHex(TEST_OWNER_HEX);
    const ALT_OWNER_HEX = '41bace09b0c75ff01da2cb86cf05bc0d6d1af21f5d';
    const ALT_ADDRESS = TronWeb.address.fromHex(ALT_OWNER_HEX);

    let sendService: SendService;
    let mockAccountsService: MockProxy<AccountsService>;
    let mockAssetsService: MockProxy<AssetsService>;
    let mockTronWebFactory: MockProxy<TronWebFactory>;
    let mockFeeCalculatorService: MockProxy<FeeCalculatorService>;
    let mockSnapClient: MockProxy<SnapClient>;
    let mockTronWeb: DeepMockProxy<TronWeb>;
    let mockTransactionExpirationRefresherService: MockProxy<TransactionExpirationRefresherService>;
    let broadcastResult: BroadcastResult;

    const createMockTransaction = (
      ownerAddress = TEST_OWNER_HEX,
    ): MockTransferTransaction =>
      ({
        visible: false,
        txID: 'mock-tx-id',
        raw_data: {
          contract: [
            {
              type: 'TransferContract',
              parameter: {
                value: {
                  owner_address: ownerAddress,
                  to_address: TronWeb.address.toHex(TEST_TO_ADDRESS),
                  amount: 1000000,
                },
              },
            },
          ],
        },
        raw_data_hex: 'mock-hex',
      }) as unknown as MockTransferTransaction;

    const createMockTrc20Transaction = (
      ownerAddress = TEST_OWNER_HEX,
    ): TronwebTypes.Transaction<TronwebTypes.TriggerSmartContract> =>
      ({
        visible: false,
        txID: 'mock-trc20-tx-id',
        raw_data: {
          contract: [
            {
              type: 'TriggerSmartContract',
              parameter: {
                type_url: 'type.googleapis.com/protocol.Transaction.Contract',
                value: {
                  owner_address: ownerAddress,
                  contract_address: TronWeb.address.toHex(TEST_TO_ADDRESS),
                  data: 'a9059cbb000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c0000000000000000000000000000000000000000000000000000000000000000',
                },
              },
            },
          ],
          ref_block_bytes: '0000',
          ref_block_hash: '0000000000000000',
          expiration: 0,
          timestamp: 0,
        },
        raw_data_hex: 'mock-trc20-hex',
      }) as unknown as TronwebTypes.Transaction<TronwebTypes.TriggerSmartContract>;

    beforeEach(() => {
      vi.clearAllMocks();

      mockAccountsService = mock<AccountsService>();
      mockAccountsService.findByIdOrThrow.mockResolvedValue(
        createAccount({ id: TEST_ACCOUNT_ID, address: TEST_FROM_ADDRESS }),
      );
      mockAccountsService.deriveTronKeypair.mockResolvedValue(
        createKeypair('test-private-key', TEST_FROM_ADDRESS),
      );

      mockAssetsService = mock<AssetsService>();

      const signedTransaction = {
        ...createMockTransaction(),
        signature: ['test-signature'],
      };
      broadcastResult = createBroadcastResult(signedTransaction);
      mockTronWeb = mockDeep<TronWeb>();
      mockTronWeb.trx.sign.mockResolvedValue(signedTransaction);
      mockTronWeb.trx.sendRawTransaction.mockResolvedValue(broadcastResult);

      mockTronWebFactory = mock<TronWebFactory>();
      mockTronWebFactory.createClient.mockReturnValue(mockTronWeb);
      mockTronWebFactory.executeBroadcast.mockImplementation(
        async (_network, operation) => operation(),
      );

      mockFeeCalculatorService = mock<FeeCalculatorService>();

      mockSnapClient = mock<SnapClient>();

      mockTransactionExpirationRefresherService =
        mock<TransactionExpirationRefresherService>();
      mockTransactionExpirationRefresherService.ensureFreshMetadata.mockImplementation(
        async ({ transaction }) => transaction,
      );

      sendService = new SendService({
        accountsService: mockAccountsService,
        assetsService: mockAssetsService,
        tronWebFactory: mockTronWebFactory,
        feeCalculatorService: mockFeeCalculatorService,
        logger: mockLogger,
        snapClient: mockSnapClient,
        analyticsService: mockAnalyticsService,
        transactionExpirationRefresherService:
          mockTransactionExpirationRefresherService,
      });
    });

    it('signs, broadcasts, and tracks a transaction when signer matches owner_address', async () => {
      const transaction = createMockTransaction();

      const result = await sendService.signAndSendTransaction({
        scope: Network.Mainnet,
        fromAccountId: TEST_ACCOUNT_ID,
        transaction,
      });

      expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
        TEST_ACCOUNT_ID,
      );
      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: 'test-entropy',
        derivationPath: TEST_DERIVATION_PATH,
      });
      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        'test-private-key',
      );
      expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(transaction);
      expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          signature: ['test-signature'],
        }),
      );
      expect(
        mockAnalyticsService.trackTransactionSubmitted,
      ).toHaveBeenCalledWith({
        origin: DEFAULT_METAMASK_ORIGIN,
        accountType: 'tron:eoa',
        chainIdCaip: Network.Mainnet,
        transactionType: TransactionType.Send,
      });
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.TrackTransaction,
        params: {
          txId: 'broadcast-tx-id',
          scope: Network.Mainnet,
          accountIds: [TEST_ACCOUNT_ID],
          attempt: 0,
          transactionType: TransactionType.Send,
        },
        duration: TRACK_TX_INTERVAL,
      });
      expect(result).toStrictEqual(broadcastResult);
    });

    it('tracks the security properties with the submitted event', async () => {
      await sendService.signAndSendTransaction({
        scope: Network.Mainnet,
        fromAccountId: TEST_ACCOUNT_ID,
        transaction: createMockTransaction(),
        context: {
          securityProperties: {
            securityAlertResponse: 'Benign',
          },
        },
      });

      expect(
        mockAnalyticsService.trackTransactionSubmitted,
      ).toHaveBeenCalledWith({
        origin: DEFAULT_METAMASK_ORIGIN,
        accountType: 'tron:eoa',
        chainIdCaip: Network.Mainnet,
        transactionType: TransactionType.Send,
        securityAlertResponse: 'Benign',
      });
    });

    it('schedules tracking with the security properties nested under securityProperties', async () => {
      await sendService.signAndSendTransaction({
        scope: Network.Mainnet,
        fromAccountId: TEST_ACCOUNT_ID,
        transaction: createMockTransaction(),
        context: {
          securityProperties: {
            securityAlertResponse: 'Benign',
          },
        },
      });

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.TrackTransaction,
        params: {
          txId: 'broadcast-tx-id',
          scope: Network.Mainnet,
          accountIds: [TEST_ACCOUNT_ID],
          attempt: 0,
          transactionType: TransactionType.Send,
          securityProperties: {
            securityAlertResponse: 'Benign',
          },
        },
        duration: TRACK_TX_INTERVAL,
      });
    });

    it('classifies a unified TRC20 send as send rather than unknown', async () => {
      const transaction = createMockTrc20Transaction();

      await sendService.signAndSendTransaction({
        scope: Network.Mainnet,
        fromAccountId: TEST_ACCOUNT_ID,
        transaction,
      });

      expect(
        mockAnalyticsService.trackTransactionSubmitted,
      ).toHaveBeenCalledWith({
        origin: DEFAULT_METAMASK_ORIGIN,
        accountType: 'tron:eoa',
        chainIdCaip: Network.Mainnet,
        transactionType: TransactionType.Send,
      });
      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: BackgroundEventMethod.TrackTransaction,
        params: {
          txId: 'broadcast-tx-id',
          scope: Network.Mainnet,
          accountIds: [TEST_ACCOUNT_ID],
          attempt: 0,
          transactionType: TransactionType.Send,
        },
        duration: TRACK_TX_INTERVAL,
      });
    });

    it('rejects transactions whose owner_address does not match the signer', async () => {
      await expect(
        sendService.signAndSendTransaction({
          scope: Network.Mainnet,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction: createMockTransaction(ALT_OWNER_HEX),
        }),
      ).rejects.toThrow(
        `Transaction owner_address (${ALT_ADDRESS}) does not match derived signer address (${TEST_FROM_ADDRESS})`,
      );

      expect(mockTronWeb.trx.sign).not.toHaveBeenCalled();
      expect(mockTronWeb.trx.sendRawTransaction).not.toHaveBeenCalled();
    });
  });

  describe('validateSend', () => {
    let sendService: SendService;
    let mockAccountsService: MockProxy<AccountsService>;
    let mockAssetsService: MockProxy<AssetsService>;
    let mockTronWebFactory: MockProxy<TronWebFactory>;
    let mockFeeCalculatorService: MockProxy<FeeCalculatorService>;
    let mockSnapClient: MockProxy<SnapClient>;
    let mockTronWeb: DeepMockProxy<TronWeb>;
    let mockTransactionExpirationRefresherService: MockProxy<TransactionExpirationRefresherService>;

    const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
    const TEST_TO_ADDRESS = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
    const TEST_FROM_ADDRESS = 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT';

    const scope = Network.Mainnet;
    const nativeTokenId = Networks[scope].nativeToken.id;
    const bandwidthId = Networks[scope].bandwidth.id;
    const energyId = Networks[scope].energy.id;

    const createNativeAsset = (): AssetEntity => ({
      assetType: nativeTokenId,
      keyringAccountId: TEST_ACCOUNT_ID,
      network: scope,
      symbol: 'TRX',
      decimals: 6,
      rawAmount: '0',
      uiAmount: '0',
      iconUrl: '',
    });

    const createAssetBalance = (
      balance: Pick<AssetEntity, 'rawAmount'> &
        Partial<Pick<AssetEntity, 'uiAmount'>>,
    ): AssetEntity => ({ ...createNativeAsset(), ...balance });

    const createTrc20Asset = (): AssetEntity => ({
      assetType: `${scope}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,
      keyringAccountId: TEST_ACCOUNT_ID,
      network: scope,
      symbol: 'USDT',
      decimals: 6,
      rawAmount: '0',
      uiAmount: '0',
      iconUrl: '',
    });

    const createMockTransaction = (): MockTransferTransaction => ({
      visible: false,
      txID: 'mock-tx-id',
      raw_data: {
        contract: [
          {
            type: 'TransferContract' as MockTransferContract['type'],
            parameter: {
              type_url: 'type.googleapis.com/protocol.TransferContract',
              value: {
                owner_address: `41${'a'.repeat(40)}`,
                to_address: `41${'b'.repeat(40)}`,
                amount: 1000000,
              },
            },
          },
        ],
        ref_block_bytes: '0000',
        ref_block_hash: '0000000000000000',
        expiration: 0,
        timestamp: 0,
      },
      raw_data_hex: 'mock-hex',
    });

    const createMockTrc20Transaction =
      (): TronwebTypes.Transaction<TronwebTypes.TriggerSmartContract> => ({
        visible: false,
        txID: 'mock-tx-id',
        raw_data: {
          contract: [
            {
              type: TronwebTypes.ContractType.TriggerSmartContract,
              parameter: {
                type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
                value: {
                  owner_address: `41${'a'.repeat(40)}`,
                  contract_address: `41${'b'.repeat(40)}`,
                },
              },
            },
          ],
          ref_block_bytes: '0000',
          ref_block_hash: '0000000000000000',
          expiration: 0,
          timestamp: 0,
        },
        raw_data_hex: 'mock-hex',
      });

    const createBlock = ({
      number,
      timestamp,
      hashSegment = '1122334455667788',
    }: {
      number: number;
      timestamp: number;
      hashSegment?: string;
    }): TronwebTypes.Block => ({
      blockID: `${'0'.repeat(16)}${hashSegment}${'f'.repeat(32)}`,
      block_header: {
        raw_data: {
          number,
          timestamp,
          txTrieRoot: '',
          witness_address: '',
          parentHash: '',
          version: 0,
        },
        witness_signature: '',
      },
    });

    const getRefBlockBytes = (number: number): string =>
      number.toString(16).slice(-4).padStart(4, '0');

    beforeEach(() => {
      vi.clearAllMocks();

      mockAccountsService = mock<AccountsService>();
      mockAccountsService.findByIdOrThrow.mockResolvedValue(
        createAccount({ id: TEST_ACCOUNT_ID, address: TEST_FROM_ADDRESS }),
      );

      mockAssetsService = mock<AssetsService>();

      mockTronWeb = mockDeep<TronWeb>();
      mockTronWeb.transactionBuilder.sendTrx.mockResolvedValue(
        createMockTransaction(),
      );
      mockTronWeb.transactionBuilder.triggerSmartContract.mockResolvedValue({
        result: { result: true },
        transaction: createMockTrc20Transaction(),
      });
      mockTronWeb.utils.transaction.txJsonToPb.mockImplementation(
        (transaction: TronwebTypes.Transaction) => transaction,
      );
      mockTronWeb.utils.transaction.txPbToRawDataHex.mockReturnValue(
        '1234567890abcdef',
      );
      mockTronWeb.utils.transaction.txPbToTxID.mockReturnValue('mock-tx-id');

      mockTronWebFactory = mock<TronWebFactory>();
      mockTronWebFactory.createClient.mockReturnValue(mockTronWeb);
      mockTronWebFactory.executeBroadcast.mockImplementation(
        async (_network, operation) => operation(),
      );

      mockFeeCalculatorService = mock<FeeCalculatorService>();

      mockSnapClient = mock<SnapClient>();

      mockTransactionExpirationRefresherService =
        mock<TransactionExpirationRefresherService>();
      mockTransactionExpirationRefresherService.ensureFreshMetadata.mockImplementation(
        async ({ transaction }) => transaction,
      );

      sendService = new SendService({
        accountsService: mockAccountsService,
        assetsService: mockAssetsService,
        tronWebFactory: mockTronWebFactory,
        feeCalculatorService: mockFeeCalculatorService,
        logger: mockLogger,
        snapClient: mockSnapClient,
        analyticsService: mockAnalyticsService,
        transactionExpirationRefresherService:
          mockTransactionExpirationRefresherService,
      });
    });

    describe('native TRX transfers', () => {
      it('returns valid when user has enough TRX to cover amount and fees', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10); // Sending 10 TRX

        // User has 100 TRX, 1000 bandwidth, 0 energy
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance (asset being sent)
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance (native token)
          createAssetBalance({ rawAmount: '1000' }), // Bandwidth
          createAssetBalance({ rawAmount: '0' }), // Energy
        ]);

        // Fee is 0 TRX (user has enough bandwidth)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '266',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
        expect(mockAssetsService.getAccountAssetsByIDs).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
          [nativeTokenId, nativeTokenId, bandwidthId, energyId],
        );
      });

      it('returns InsufficientBalance when user does not have enough TRX to send', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(100); // Trying to send 100 TRX

        // User only has 50 TRX
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '50', rawAmount: '50000000' }), // TRX balance (asset being sent)
          createAssetBalance({ uiAmount: '50', rawAmount: '50000000' }), // TRX balance (native token)
          createAssetBalance({ rawAmount: '1000' }), // Bandwidth
          createAssetBalance({ rawAmount: '0' }), // Energy
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalance,
        });
        // Should not call feeCalculatorService since we fail early
        expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
      });

      it('returns InsufficientBalanceToCoverFee when TRX amount + fees exceed balance', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(99); // Sending 99 TRX

        // User has 100 TRX but no bandwidth (fees will be charged in TRX)
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance (asset being sent)
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance (native token)
          createAssetBalance({ rawAmount: '0' }), // No bandwidth
          createAssetBalance({ rawAmount: '0' }), // No energy
        ]);

        // Fee is 2 TRX (user has no bandwidth, must pay in TRX)
        // Total needed: 99 + 2 = 101 TRX, but user only has 100
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '2',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
        });
      });

      it('returns valid when sending exact balance minus fees', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(98); // Sending 98 TRX

        // User has 100 TRX, no bandwidth
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance (native token)
          createAssetBalance({ rawAmount: '0' }), // No bandwidth
          createAssetBalance({ rawAmount: '0' }), // No energy
        ]);

        // Fee is 2 TRX
        // Total needed: 98 + 2 = 100 TRX, user has exactly 100
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '2',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
      });
    });

    describe('TRC20 token transfers', () => {
      it('returns valid when user has enough tokens and TRX for fees', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(50); // Sending 50 USDT

        // User has 100 USDT, 10 TRX for fees, some energy
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // USDT balance (asset being sent)
          createAssetBalance({ uiAmount: '10', rawAmount: '10000000' }), // TRX balance (native token for fees)
          createAssetBalance({ rawAmount: '500' }), // Bandwidth
          createAssetBalance({ rawAmount: '50000' }), // Energy
        ]);

        // Fee is 3 TRX (energy overage)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '3',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: energyId,
              amount: '50000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '345',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
      });

      it('returns InsufficientBalance when user does not have enough tokens', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(100); // Trying to send 100 USDT

        // User only has 50 USDT
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '50', rawAmount: '50000000' }), // USDT balance (not enough)
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // TRX balance (plenty for fees)
          createAssetBalance({ rawAmount: '1000' }), // Bandwidth
          createAssetBalance({ rawAmount: '100000' }), // Energy
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalance,
        });
        expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
      });

      it('returns InsufficientBalanceToCoverFee when user has tokens but not enough TRX for fees', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(50); // Sending 50 USDT

        // User has 100 USDT but only 1 TRX (not enough for fees)
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // USDT balance (plenty)
          createAssetBalance({ uiAmount: '1', rawAmount: '1000000' }), // TRX balance (not enough for fees)
          createAssetBalance({ rawAmount: '0' }), // No bandwidth
          createAssetBalance({ rawAmount: '0' }), // No energy
        ]);

        // Fee is 10 TRX (no energy/bandwidth, everything paid in TRX)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '10',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
        });
      });

      it('returns valid when user has tokens and exact TRX for fees', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(50); // Sending 50 USDT

        // User has 100 USDT and exactly 5 TRX for fees
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // USDT balance
          createAssetBalance({ uiAmount: '5', rawAmount: '5000000' }), // TRX balance (exact for fees)
          createAssetBalance({ rawAmount: '0' }), // No bandwidth
          createAssetBalance({ rawAmount: '0' }), // No energy
        ]);

        // Fee is exactly 5 TRX
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '5',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
      });
    });

    describe('edge cases', () => {
      it('handles missing asset balances (undefined)', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10);

        // All balances are undefined
        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          null, // No asset balance
          null, // No native token balance
          null, // No bandwidth
          null, // No energy
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Should fail because user has 0 balance
        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalance,
        });
      });

      it('handles zero amount send with fees', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(0); // Sending 0 TRX

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '1', rawAmount: '1000000' }), // 1 TRX balance
          createAssetBalance({ uiAmount: '1', rawAmount: '1000000' }), // 1 TRX native
          createAssetBalance({ rawAmount: '0' }), // No bandwidth
          createAssetBalance({ rawAmount: '0' }), // No energy
        ]);

        // Fee is 0.5 TRX
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0.5',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Total needed: 0 + 0.5 = 0.5 TRX, user has 1 TRX
        expect(result).toStrictEqual({ valid: true });
      });

      it('handles fee calculation with no TRX fee (all covered by resources)', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(10);

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }), // USDT balance
          createAssetBalance({ uiAmount: '0', rawAmount: '0' }), // 0 TRX balance
          createAssetBalance({ rawAmount: '10000' }), // Plenty of bandwidth
          createAssetBalance({ rawAmount: '200000' }), // Plenty of energy
        ]);

        // Fee is 0 TRX (user has enough bandwidth and energy)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: energyId,
              amount: '65000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '345',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // User can send tokens even with 0 TRX because fees are covered by resources
        expect(result).toStrictEqual({ valid: true });
      });

      it('handles account activation fee (1 TRX) for new recipient', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(1); // Sending 1 TRX to new account

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '2', rawAmount: '2000000' }), // 2 TRX balance
          createAssetBalance({ uiAmount: '2', rawAmount: '2000000' }), // 2 TRX native
          createAssetBalance({ rawAmount: '1000' }), // Bandwidth (enough)
          createAssetBalance({ rawAmount: '0' }), // No energy needed for native transfer
        ]);

        // Fee includes 1 TRX activation fee
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '1', // 1 TRX activation fee
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '266',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Total needed: 1 (amount) + 1 (activation) = 2 TRX, user has exactly 2
        expect(result).toStrictEqual({ valid: true });
      });

      it('fails when account activation fee causes insufficient balance', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(1.5); // Sending 1.5 TRX to new account

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '2', rawAmount: '2000000' }), // 2 TRX balance
          createAssetBalance({ uiAmount: '2', rawAmount: '2000000' }), // 2 TRX native
          createAssetBalance({ rawAmount: '1000' }), // Bandwidth (enough)
          createAssetBalance({ rawAmount: '0' }), // No energy
        ]);

        // Fee includes 1 TRX activation fee
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '1', // 1 TRX activation fee
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '266',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Total needed: 1.5 (amount) + 1 (activation) = 2.5 TRX, user only has 2
        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
        });
      });
    });

    describe('transaction building', () => {
      it('builds transaction with correct toAddress for fee calculation', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10);

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ rawAmount: '1000' }),
          createAssetBalance({ rawAmount: '0' }),
        ]);

        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ]);

        await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Verify transaction was built with the actual toAddress
        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_TO_ADDRESS,
          10 * 1e6, // Amount in SUN
          TEST_FROM_ADDRESS,
        );

        // Verify fee calculator was called with the built transaction
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.objectContaining({ txID: 'mock-tx-id' }),
          availableEnergy: expect.any(BigNumber),
          availableBandwidth: expect.any(BigNumber),
        });
      });

      it('preserves fractional amount precision for TRX (no floating-point loss)', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber('0.99');

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ rawAmount: '1000' }),
          createAssetBalance({ rawAmount: '0' }),
        ]);

        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ]);

        await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // 0.99 TRX = 990000 SUN — not 989999 (which would happen with Number(0.99) * 1e6)
        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_TO_ADDRESS,
          990000,
          TEST_FROM_ADDRESS,
        );
      });

      it('preserves fractional amount precision for TRC20 tokens', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber('0.99');

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ rawAmount: '1000' }),
          createAssetBalance({ rawAmount: '100000' }),
        ]);

        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ]);

        await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // 0.99 USDT with 6 decimals = 990000 raw — must be exact
        expect(
          mockTronWeb.transactionBuilder.triggerSmartContract,
        ).toHaveBeenCalledWith(
          'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          'transfer(address,uint256)',
          {},
          [
            { type: 'address', value: TEST_TO_ADDRESS },
            { type: 'uint256', value: '990000' },
          ],
          TEST_FROM_ADDRESS,
        );
      });

      it('propagates feeLimit through validateSend', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10);

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ uiAmount: '100', rawAmount: '100000000' }),
          createAssetBalance({ rawAmount: '1000' }),
          createAssetBalance({ rawAmount: '0' }),
        ]);
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ]);

        await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
          feeLimit: FEE_LIMIT,
        });

        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_TO_ADDRESS,
          10 * 1e6,
          TEST_FROM_ADDRESS,
        );
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.objectContaining({
            raw_data: expect.objectContaining({
              fee_limit: FEE_LIMIT,
            }),
          }),
          availableEnergy: expect.any(BigNumber),
          availableBandwidth: expect.any(BigNumber),
          feeLimit: FEE_LIMIT,
        });
      });

      it('applies fee_limit to native transactions and refreshes derived fields', async () => {
        const asset = createNativeAsset();
        const result = await sendService.buildTransaction({
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount: new BigNumber(10),
          feeLimit: FEE_LIMIT,
        });

        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_TO_ADDRESS,
          10 * 1e6,
          TEST_FROM_ADDRESS,
        );
        expect(result.raw_data.fee_limit).toBe(FEE_LIMIT);
        expect(mockTronWeb.utils.transaction.txJsonToPb).toHaveBeenCalledWith(
          expect.objectContaining({
            raw_data: expect.objectContaining({
              fee_limit: FEE_LIMIT,
            }),
          }),
        );
        expect(result.raw_data_hex).toBe('1234567890abcdef');
        expect(result.txID).toBe('ck-tx-id');
      });

      it('passes feeLimit through when building TRC20 transactions', async () => {
        const asset = createTrc20Asset();

        await sendService.buildTransaction({
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount: new BigNumber(10),
          feeLimit: FEE_LIMIT,
        });

        expect(
          mockTronWeb.transactionBuilder.triggerSmartContract,
        ).toHaveBeenCalledWith(
          'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          'transfer(address,uint256)',
          { feeLimit: FEE_LIMIT },
          expect.any(Array),
          TEST_FROM_ADDRESS,
        );
      });

      it('builds a self-send TRX transaction like any other send', async () => {
        const asset = createNativeAsset();

        const result = await sendService.buildTransaction({
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_FROM_ADDRESS,
          asset,
          amount: new BigNumber(1),
        });

        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_FROM_ADDRESS,
          1_000_000,
          TEST_FROM_ADDRESS,
        );
        expect(result).toStrictEqual(createMockTransaction());
      });

      it('validates a self-send like any other send', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(1);

        mockAssetsService.getAccountAssetsByIDs.mockResolvedValue([
          createAssetBalance({ uiAmount: '24.10979', rawAmount: '24109790' }),
          createAssetBalance({ uiAmount: '24.10979', rawAmount: '24109790' }),
          createAssetBalance({ rawAmount: '1000' }),
          createAssetBalance({ rawAmount: '0' }),
        ]);
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_FROM_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_FROM_ADDRESS,
          1_000_000,
          TEST_FROM_ADDRESS,
        );
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.objectContaining({ txID: 'mock-tx-id' }),
          availableEnergy: expect.any(BigNumber),
          availableBandwidth: expect.any(BigNumber),
        });
      });
    });

    describe('signAndSendTransaction', () => {
      const ownerAddressHex = `41${'a'.repeat(40)}`;
      const ownerAddress = 'TRXcKoEvHr6Y38VMcDYGBEYKznvH3XUX4g';

      const getSignedInput = (): TronwebTypes.Transaction => {
        const input = mockTronWeb.trx.sign.mock.calls[0]?.[0];
        if (input === undefined || typeof input === 'string') {
          throw new Error('Expected trx.sign to receive a transaction');
        }
        return input;
      };

      beforeEach(() => {
        mockAccountsService.findByIdOrThrow.mockResolvedValue(
          createAccount({ id: TEST_ACCOUNT_ID, address: ownerAddress }),
        );
        mockAccountsService.deriveTronKeypair.mockResolvedValue(
          createKeypair('test-private-key', ownerAddress),
        );
        mockTronWeb.trx.sign.mockImplementation(async (transaction) =>
          typeof transaction === 'string'
            ? transaction
            : { ...transaction, signature: ['test-signature'] },
        );
        mockTronWeb.trx.sendRawTransaction.mockImplementation(
          async (signedTransaction) => createBroadcastResult(signedTransaction),
        );
      });

      it('refreshes stale transaction metadata before signing and broadcasting', async () => {
        sendService = new SendService({
          accountsService: mockAccountsService,
          assetsService: mockAssetsService,
          tronWebFactory: mockTronWebFactory,
          feeCalculatorService: mockFeeCalculatorService,
          logger: mockLogger,
          snapClient: mockSnapClient,
          analyticsService: mockAnalyticsService,
          transactionExpirationRefresherService:
            new TransactionExpirationRefresherService({
              tronWebFactory: mockTronWebFactory,
            }),
        });
        const currentTimestamp = Date.now();
        const currentBlock = createBlock({
          number: 200_000,
          timestamp: currentTimestamp,
          hashSegment: '0011223344556677',
        });
        const transaction = createMockTransaction();
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        transaction.raw_data.ref_block_bytes = '0000';
        transaction.raw_data.ref_block_hash = '0000000000000000';
        transaction.raw_data.expiration = currentTimestamp - 1;
        transaction.raw_data.timestamp = currentTimestamp - 60_000;
        const originalTransaction = structuredClone(transaction);
        mockTronWeb.trx.getCurrentBlock.mockResolvedValue(currentBlock);

        await sendService.signAndSendTransaction({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction,
        });

        const signedTransaction = getSignedInput();
        expect(signedTransaction).not.toBe(transaction);
        expect(signedTransaction.raw_data.ref_block_bytes).toBe(
          getRefBlockBytes(200_000),
        );
        expect(signedTransaction.raw_data.ref_block_hash).toBe(
          '0011223344556677',
        );
        expect(signedTransaction.raw_data.expiration).toBe(
          currentTimestamp + 60_000,
        );
        expect(signedTransaction.raw_data.timestamp).toBe(currentTimestamp);
        expect(signedTransaction.raw_data_hex).toBe('1234567890abcdef');
        expect(signedTransaction.txID).toBe('mock-tx-id');
        expect(transaction.raw_data.ref_block_bytes).toBe(
          originalTransaction.raw_data.ref_block_bytes,
        );
        expect(transaction.raw_data.ref_block_hash).toBe(
          originalTransaction.raw_data.ref_block_hash,
        );
        expect(transaction.raw_data.expiration).toBe(
          originalTransaction.raw_data.expiration,
        );
        expect(transaction.raw_data.timestamp).toBe(
          originalTransaction.raw_data.timestamp,
        );
        expect(transaction.raw_data_hex).toBe(originalTransaction.raw_data_hex);
        expect(transaction.txID).toBe(originalTransaction.txID);
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledWith({
          ...signedTransaction,
          signature: ['test-signature'],
        });
      });

      it('signs the transaction returned by the injected expiration refresher', async () => {
        const transaction = createMockTransaction();
        const freshTransaction = {
          ...createMockTransaction(),
          txID: 'fresh-tx-id',
        };
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        freshTransaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        mockTransactionExpirationRefresherService.ensureFreshMetadata.mockResolvedValue(
          freshTransaction,
        );

        await sendService.signAndSendTransaction({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction,
        });

        expect(
          mockTransactionExpirationRefresherService.ensureFreshMetadata,
        ).toHaveBeenCalledWith({ scope, transaction });
        expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(freshTransaction);
      });

      it('signs valid transaction metadata without unnecessary modification', async () => {
        sendService = new SendService({
          accountsService: mockAccountsService,
          assetsService: mockAssetsService,
          tronWebFactory: mockTronWebFactory,
          feeCalculatorService: mockFeeCalculatorService,
          logger: mockLogger,
          snapClient: mockSnapClient,
          analyticsService: mockAnalyticsService,
          transactionExpirationRefresherService:
            new TransactionExpirationRefresherService({
              tronWebFactory: mockTronWebFactory,
            }),
        });
        const currentTimestamp = Date.now();
        const referencedBlock = createBlock({
          number: 199_990,
          timestamp: currentTimestamp - 30_000,
          hashSegment: 'abcdef1234567890',
        });
        const currentBlock = createBlock({
          number: 200_000,
          timestamp: currentTimestamp,
        });
        const transaction = createMockTransaction();
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        transaction.raw_data.ref_block_bytes = getRefBlockBytes(199_990);
        transaction.raw_data.ref_block_hash = 'abcdef1234567890';
        transaction.raw_data.expiration = currentTimestamp + 45_000;
        transaction.raw_data.timestamp = currentTimestamp - 30_000;
        mockTronWeb.trx.getCurrentBlock.mockResolvedValue(currentBlock);
        mockTronWeb.trx.getBlockByNumber.mockResolvedValue(referencedBlock);

        await sendService.signAndSendTransaction({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction,
        });

        expect(transaction.raw_data.ref_block_bytes).toBe(
          getRefBlockBytes(199_990),
        );
        expect(transaction.raw_data.ref_block_hash).toBe('abcdef1234567890');
        expect(transaction.raw_data.expiration).toBe(currentTimestamp + 45_000);
        expect(transaction.raw_data_hex).toBe('mock-hex');
        expect(mockTronWeb.trx.getBlockByNumber).toHaveBeenCalledWith(199_990);
        expect(mockTronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
        expect(mockTronWeb.trx.sign).toHaveBeenCalledWith(transaction);
      });

      it('throws when broadcasting a signed transaction fails', async () => {
        const currentTimestamp = Date.now();
        const currentBlock = createBlock({
          number: 200_000,
          timestamp: currentTimestamp,
          hashSegment: 'abcdef1234567890',
        });
        const transaction = createMockTransaction();
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        transaction.raw_data.ref_block_bytes = getRefBlockBytes(200_000);
        transaction.raw_data.ref_block_hash = 'abcdef1234567890';
        transaction.raw_data.expiration = currentTimestamp + 45_000;
        transaction.raw_data.timestamp = currentTimestamp;
        mockTronWeb.trx.getCurrentBlock.mockResolvedValue(currentBlock);
        mockTronWeb.trx.sendRawTransaction.mockImplementation(
          async (signedTransaction) =>
            createBroadcastResult(signedTransaction, {
              result: false,
              txid: '',
              message: 'expired',
            }),
        );

        await expect(
          sendService.signAndSendTransaction({
            scope,
            fromAccountId: TEST_ACCOUNT_ID,
            transaction,
          }),
        ).rejects.toThrow('Failed to send transaction: expired');
      });

      it('treats an already-broadcast transaction as successful', async () => {
        const transaction = createMockTransaction();
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        mockTronWeb.trx.sendRawTransaction.mockImplementation(
          async (signedTransaction) =>
            createBroadcastResult(signedTransaction, {
              code: 'DUP_TRANSACTION_ERROR',
              txid: transaction.txID,
              message: 'Transaction already exists',
              result: false,
            }),
        );

        const result = await sendService.signAndSendTransaction({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction,
        });

        expect(result).toStrictEqual(
          expect.objectContaining({ txid: transaction.txID }),
        );
        expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({ txId: transaction.txID }),
          }),
        );
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledTimes(1);
      });

      it('signs once and retries the same signed transaction on a transient broadcast failure', async () => {
        const transaction = createMockTransaction();
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        const signedTransaction = {
          ...transaction,
          signature: ['test-signature'],
        };
        mockTronWeb.trx.sign.mockResolvedValue(signedTransaction);
        mockTronWebFactory.executeBroadcast.mockImplementation(
          async (_network: Network, operation: () => Promise<unknown>) => {
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
          .mockResolvedValue(createBroadcastResult(signedTransaction));

        await sendService.signAndSendTransaction({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction,
        });

        expect(mockTronWeb.trx.sign).toHaveBeenCalledTimes(1);
        expect(
          mockTransactionExpirationRefresherService.ensureFreshMetadata,
        ).toHaveBeenCalledTimes(1);
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledTimes(2);
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
          1,
          signedTransaction,
        );
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
          2,
          signedTransaction,
        );
      });

      it('retries a transient Tron node response with the same signed transaction', async () => {
        const transaction = createMockTransaction();
        transaction.raw_data.contract[0].parameter.value.owner_address =
          ownerAddressHex;
        const signedTransaction = {
          ...transaction,
          signature: ['test-signature'],
        };
        mockTronWeb.trx.sign.mockResolvedValue(signedTransaction);
        mockTronWebFactory.executeBroadcast.mockImplementation(
          async (_network: Network, operation: () => Promise<unknown>) => {
            try {
              return await operation();
            } catch {
              return operation();
            }
          },
        );
        mockTronWeb.trx.sendRawTransaction
          .mockResolvedValueOnce(
            createBroadcastResult(signedTransaction, {
              code: 'SERVER_BUSY',
              txid: '',
              message: 'Server busy',
              result: false,
            }),
          )
          .mockResolvedValue(createBroadcastResult(signedTransaction));

        await sendService.signAndSendTransaction({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          transaction,
        });

        expect(mockTronWeb.trx.sign).toHaveBeenCalledTimes(1);
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledTimes(2);
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
          1,
          signedTransaction,
        );
        expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenNthCalledWith(
          2,
          signedTransaction,
        );
      });
    });
  });

  describe('Allows for recipients to be senders', () => {
    it('builds a native transfer when the recipient is the sender', async () => {
      const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
      const address = 'TRXcKoEvHr6Y38VMcDYGBEYKznvH3XUX4g';

      vi.spyOn(tronWeb.trx, 'getCurrentRefBlockParams').mockResolvedValue({
        ref_block_bytes: '0123',
        ref_block_hash: 'aabbccdd00112233',
        expiration: 123456,
        timestamp: 789,
      });

      const transaction = await tronWeb.transactionBuilder.sendTrx(
        address,
        1_000_000,
        address,
      );

      const [contract] = transaction.raw_data.contract;
      expect(contract?.type).toBe('TransferContract');
      expect(contract?.parameter.value).toStrictEqual({
        to_address: TronWeb.address.toHex(address),
        owner_address: TronWeb.address.toHex(address),
        amount: 1_000_000,
      });
    });
  });
});
