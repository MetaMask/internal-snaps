import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { ClientRequestHandler } from './clientRequest';
import { ClientRequestMethod, SendErrorCodes } from './types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { Network, Networks } from '../../constants';
import type { AccountsService } from '../../services/accounts/AccountsService';
import type { AssetsService } from '../../services/assets/AssetsService';
import type { ConfirmationHandler } from '../../services/confirmation/ConfirmationHandler';
import type { FeeCalculatorService } from '../../services/send/FeeCalculatorService';
import type { SendService } from '../../services/send/SendService';
import type { StakingService } from '../../services/staking/StakingService';
import type { TransactionsService } from '../../services/transactions/TransactionsService';
import { mockLogger } from '../../utils/mockLogger';

describe('ClientRequestHandler', () => {
  describe('computeFee', () => {
    let clientRequestHandler: ClientRequestHandler;
    let mockAccountsService: jest.Mocked<AccountsService>;
    let mockAssetsService: jest.Mocked<AssetsService>;
    let mockSendService: jest.Mocked<SendService>;
    let mockFeeCalculatorService: jest.Mocked<FeeCalculatorService>;
    let mockTronWebFactory: jest.Mocked<TronWebFactory>;
    let mockSnapClient: jest.Mocked<SnapClient>;
    let mockStakingService: jest.Mocked<StakingService>;
    let mockConfirmationHandler: jest.Mocked<ConfirmationHandler>;
    let mockTronWeb: any;
    let mockTransactionsService: jest.Mocked<TransactionsService>;

    const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
    const TEST_TRANSACTION_BASE64 =
      'CgK0FiII40phBu42/OZAkJyY96YzWrADCB8SqwMKMXR5cGUuZ29vZ2xlYXBpcy5jb20vcHJvdG9jb2wuVHJpZ2dlclNtYXJ0Q29udHJhY3QS9QIKFUEU0B62M0bakw7g2jDVhRrBTODEeRIVQZlGn9WqCM/oNjlc6ZPA69Vn4sFPIsQCnd+TuwAAAAAAAAAAAAAAAKYU+AO2/XgJhqQseOycf3fm3tE8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC+vCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnq6OQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF1RSWHxzeWtuZjl8MC41fGJyaWRnZXJzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUQnNGcUttbVJ5WWNuWUphOFlEeFk1ZDJKQVJhSGVxdUJKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcLzdlPemMw==';

    beforeEach(() => {
      mockAccountsService = {
        findByIdOrThrow: jest.fn(),
        deriveTronKeypair: jest.fn(),
      } as unknown as jest.Mocked<AccountsService>;

      mockAssetsService = {
        getAssetsByAccountId: jest.fn(),
      } as unknown as jest.Mocked<AssetsService>;

      mockSendService = {} as unknown as jest.Mocked<SendService>;

      mockFeeCalculatorService = {
        computeFee: jest.fn(),
      } as unknown as jest.Mocked<FeeCalculatorService>;

      mockTronWeb = {
        utils: {
          deserializeTx: {
            deserializeTransaction: jest.fn(),
          },
        },
        trx: {
          sign: jest.fn(),
        },
      };

      mockTronWebFactory = {
        createClient: jest.fn().mockReturnValue(mockTronWeb),
      } as unknown as jest.Mocked<TronWebFactory>;

      mockSnapClient = {} as unknown as jest.Mocked<SnapClient>;
      mockStakingService = {} as unknown as jest.Mocked<StakingService>;
      mockConfirmationHandler =
        {} as unknown as jest.Mocked<ConfirmationHandler>;
      mockTransactionsService = {
        save: jest.fn(),
      } as unknown as jest.Mocked<TransactionsService>;
      clientRequestHandler = new ClientRequestHandler({
        logger: mockLogger,
        accountsService: mockAccountsService,
        assetsService: mockAssetsService,
        sendService: mockSendService,
        feeCalculatorService: mockFeeCalculatorService,
        tronWebFactory: mockTronWebFactory,
        snapClient: mockSnapClient,
        stakingService: mockStakingService,
        confirmationHandler: mockConfirmationHandler,
        transactionsService: mockTransactionsService,
      });
    });

    describe('when called with valid parameters from external dapp', () => {
      it('computes fee breakdown for TRC20 transfer transaction', async () => {
        const scope = Network.Shasta;
        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.ComputeFee,
          params: {
            accountId: TEST_ACCOUNT_ID,
            transaction: TEST_TRANSACTION_BASE64,
            scope,
            options: {
              visible: false,
              type: 'TriggerSmartContract',
            },
          },
        };

        // Mock account lookup
        mockAccountsService.findByIdOrThrow.mockResolvedValue({
          id: TEST_ACCOUNT_ID,
          address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
          entropySource: 'test-entropy',
          derivationPath: [],
        } as any);

        // Mock keypair derivation
        mockAccountsService.deriveTronKeypair.mockResolvedValue({
          privateKeyHex: 'test-private-key',
        } as any);

        // Mock transaction deserialization
        mockTronWeb.utils.deserializeTx.deserializeTransaction.mockReturnValue({
          contract: [
            {
              type: 'TriggerSmartContract',
              parameter: {
                value: {
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  owner_address: '41045d01eb63374da930ee0da30d58516ac14ce04c79',
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  contract_address: '419946f55aa08cfe8363959ce9930ebd567e2c14f',
                  data: 'a9059cbb000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c0000000000000000000000000000000000000000000000000000000000000000',
                },
              },
            },
          ],
        });

        // Mock transaction signing
        const signedTransaction = {
          txID: 'test-tx-id',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data: {
            contract: [
              {
                type: 'TriggerSmartContract',
                parameter: {
                  value: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    owner_address:
                      '41045d01eb63374da930ee0da30d58516ac14ce04c79',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    contract_address:
                      '419946f55aa08cfe8363959ce9930ebd567e2c14f',
                    data: 'a9059cbb',
                  },
                },
              },
            ],
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data_hex: 'test-hex',
          signature: ['test-signature'],
        };
        mockTronWeb.trx.sign.mockResolvedValue(signedTransaction);

        // Mock available resources
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { rawAmount: '5000' }, // Bandwidth
          { rawAmount: '100000' }, // Energy
        ] as any);

        // Mock fee calculation result - NO imageSvg field
        const feeResult = [
          {
            type: FeeType.Base,
            asset: {
              unit: Networks[scope].energy.symbol,
              type: Networks[scope].energy.id,
              amount: '65000',
              fungible: true as const,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: Networks[scope].bandwidth.symbol,
              type: Networks[scope].bandwidth.id,
              amount: '345',
              fungible: true as const,
            },
          },
        ];
        mockFeeCalculatorService.computeFee.mockResolvedValue(feeResult);

        // Execute
        const result = await clientRequestHandler.handle(request as any);

        // Verify
        expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
        );
        expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalled();
        expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
          scope,
          'test-private-key',
        );
        expect(
          mockTronWeb.utils.deserializeTx.deserializeTransaction,
        ).toHaveBeenCalledWith('TriggerSmartContract', expect.any(String));
        expect(mockTronWeb.trx.sign).toHaveBeenCalled();
        expect(mockAssetsService.getAssetsByAccountId).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
          [Networks[scope].bandwidth.id, Networks[scope].energy.id],
        );
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: signedTransaction,
          availableEnergy: BigNumber('100000'),
          availableBandwidth: BigNumber('5000'),
        });
        expect(result).toStrictEqual(feeResult);
      });

      it('computes fee for native TRX transfer', async () => {
        const scope = Network.Mainnet;
        const request = {
          jsonrpc: '2.0' as const,
          id: '2',
          method: ClientRequestMethod.ComputeFee,
          params: {
            accountId: TEST_ACCOUNT_ID,
            transaction: TEST_TRANSACTION_BASE64,
            scope,
            options: {
              visible: true,
              type: 'TransferContract',
            },
          },
        };

        mockAccountsService.findByIdOrThrow.mockResolvedValue({
          id: TEST_ACCOUNT_ID,
          address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
          entropySource: 'test-entropy',
          derivationPath: [],
        } as any);

        mockAccountsService.deriveTronKeypair.mockResolvedValue({
          privateKeyHex: 'test-private-key',
        } as any);

        mockTronWeb.utils.deserializeTx.deserializeTransaction.mockReturnValue({
          contract: [
            {
              type: 'TransferContract',
              parameter: {
                value: {
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  owner_address: '41045d01eb63374da930ee0da30d58516ac14ce04c79',
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  to_address: '419946f55aa08cfe8363959ce9930ebd567e2c14f',
                  amount: 1000000,
                },
              },
            },
          ],
        });

        const signedTransaction = {
          txID: 'test-tx-id-2',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data: {
            contract: [
              {
                type: 'TransferContract',
                parameter: {
                  value: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    owner_address:
                      '41045d01eb63374da930ee0da30d58516ac14ce04c79',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    to_address: '419946f55aa08cfe8363959ce9930ebd567e2c14f',
                    amount: 1000000,
                  },
                },
              },
            ],
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data_hex: 'test-hex-2',
          signature: ['test-signature-2'],
        };
        mockTronWeb.trx.sign.mockResolvedValue(signedTransaction);

        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { rawAmount: '1000' }, // Bandwidth
          { rawAmount: '0' }, // Energy (not needed for native transfer)
        ] as any);

        // Native transfer only uses bandwidth
        const feeResult = [
          {
            type: FeeType.Base,
            asset: {
              unit: Networks[scope].bandwidth.symbol,
              type: Networks[scope].bandwidth.id,
              amount: '268',
              fungible: true as const,
            },
          },
        ];
        mockFeeCalculatorService.computeFee.mockResolvedValue(feeResult);

        const result = await clientRequestHandler.handle(request as any);

        expect(result).toStrictEqual(feeResult);
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: signedTransaction,
          availableEnergy: BigNumber('0'),
          availableBandwidth: BigNumber('1000'),
        });
      });

      it('handles account with no available resources', async () => {
        const scope = Network.Nile;
        const request = {
          jsonrpc: '2.0' as const,
          id: '3',
          method: ClientRequestMethod.ComputeFee,
          params: {
            accountId: TEST_ACCOUNT_ID,
            transaction: TEST_TRANSACTION_BASE64,
            scope,
            options: {
              visible: false,
              type: 'TriggerSmartContract',
            },
          },
        };

        mockAccountsService.findByIdOrThrow.mockResolvedValue({
          id: TEST_ACCOUNT_ID,
          address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
          entropySource: 'test-entropy',
          derivationPath: [],
        } as any);

        mockAccountsService.deriveTronKeypair.mockResolvedValue({
          privateKeyHex: 'test-private-key',
        } as any);

        mockTronWeb.utils.deserializeTx.deserializeTransaction.mockReturnValue(
          {},
        );
        mockTronWeb.trx.sign.mockResolvedValue({
          txID: 'test-tx-id-3',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data: {},
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data_hex: 'test-hex-3',
          signature: [],
        });

        // No resources available
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          undefined, // No bandwidth asset
          undefined, // No energy asset
        ] as any);

        // When no resources available, user pays in TRX
        const feeResult = [
          {
            type: FeeType.Base,
            asset: {
              unit: Networks[scope].nativeToken.symbol,
              type: Networks[scope].nativeToken.id,
              amount: '13.5',
              fungible: true as const,
            },
          },
        ];
        mockFeeCalculatorService.computeFee.mockResolvedValue(feeResult);

        const result = await clientRequestHandler.handle(request as any);

        expect(result).toStrictEqual(feeResult);
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.any(Object),
          availableEnergy: BigNumber('0'),
          availableBandwidth: BigNumber('0'),
        });
      });
    });

    describe('when called with invalid parameters', () => {
      it('throws InvalidParamsError for missing accountId', async () => {
        const request = {
          jsonrpc: '2.0' as const,
          id: '4',
          method: ClientRequestMethod.ComputeFee,
          params: {
            transaction: TEST_TRANSACTION_BASE64,
            scope: Network.Shasta,
            options: {
              visible: false,
              type: 'TransferContract',
            },
          },
        };

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Invalid method parameter(s)');
      });

      it('throws InvalidParamsError for invalid transaction format', async () => {
        const request = {
          jsonrpc: '2.0' as const,
          id: '5',
          method: ClientRequestMethod.ComputeFee,
          params: {
            accountId: TEST_ACCOUNT_ID,
            transaction: 'not-valid-base64!!!',
            scope: Network.Shasta,
            options: {
              visible: false,
              type: 'TransferContract',
            },
          },
        };

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Invalid method parameter(s)');
      });

      it('throws error when account not found', async () => {
        const request = {
          jsonrpc: '2.0' as const,
          id: '6',
          method: ClientRequestMethod.ComputeFee,
          params: {
            accountId: TEST_ACCOUNT_ID,
            transaction: TEST_TRANSACTION_BASE64,
            scope: Network.Shasta,
            options: {
              visible: false,
              type: 'TransferContract',
            },
          },
        };

        mockAccountsService.findByIdOrThrow.mockRejectedValue(
          new Error('Account not found'),
        );

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Account not found');
      });
    });
  });

  describe('signRewardsMessage', () => {
    let clientRequestHandler: ClientRequestHandler;
    let mockAccountsService: jest.Mocked<AccountsService>;
    let mockAssetsService: jest.Mocked<AssetsService>;
    let mockSendService: jest.Mocked<SendService>;
    let mockFeeCalculatorService: jest.Mocked<FeeCalculatorService>;
    let mockTronWebFactory: jest.Mocked<TronWebFactory>;
    let mockSnapClient: jest.Mocked<SnapClient>;
    let mockStakingService: jest.Mocked<StakingService>;
    let mockConfirmationHandler: jest.Mocked<ConfirmationHandler>;
    let mockTronWeb: any;
    let mockTransactionsService: jest.Mocked<TransactionsService>;

    const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
    const TEST_ADDRESS = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
    const TEST_PRIVATE_KEY = 'test-private-key';

    /**
     * Helper function to convert a utf8 string to base64.
     *
     * @param utf8 - The utf8 string to convert.
     * @returns The base64 encoded string.
     */
    const utf8ToBase64 = (utf8: string): string => {
      // eslint-disable-next-line no-restricted-globals
      return Buffer.from(utf8, 'utf8').toString('base64');
    };

    beforeEach(() => {
      mockAccountsService = {
        findById: jest.fn(),
        deriveTronKeypair: jest.fn(),
      } as unknown as jest.Mocked<AccountsService>;

      mockAssetsService = {} as unknown as jest.Mocked<AssetsService>;
      mockSendService = {} as unknown as jest.Mocked<SendService>;
      mockFeeCalculatorService =
        {} as unknown as jest.Mocked<FeeCalculatorService>;

      mockTronWeb = {
        trx: {
          signMessageV2: jest.fn(),
        },
      };

      mockTronWebFactory = {
        createClient: jest.fn().mockReturnValue(mockTronWeb),
      } as unknown as jest.Mocked<TronWebFactory>;

      mockSnapClient = {} as unknown as jest.Mocked<SnapClient>;
      mockStakingService = {} as unknown as jest.Mocked<StakingService>;
      mockConfirmationHandler =
        {} as unknown as jest.Mocked<ConfirmationHandler>;
      mockTransactionsService =
        {} as unknown as jest.Mocked<TransactionsService>;

      clientRequestHandler = new ClientRequestHandler({
        logger: mockLogger,
        accountsService: mockAccountsService,
        assetsService: mockAssetsService,
        sendService: mockSendService,
        feeCalculatorService: mockFeeCalculatorService,
        tronWebFactory: mockTronWebFactory,
        snapClient: mockSnapClient,
        stakingService: mockStakingService,
        confirmationHandler: mockConfirmationHandler,
        transactionsService: mockTransactionsService,
      });
    });

    describe('when called with valid parameters', () => {
      it('signs a rewards message and returns the signature', async () => {
        const mockTimestamp = 1736660000;
        const message = utf8ToBase64(
          `rewards,${TEST_ADDRESS},${mockTimestamp}`,
        );
        const mockSignature = '0x1234567890abcdef';

        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.SignRewardsMessage,
          params: {
            accountId: TEST_ACCOUNT_ID,
            message,
          },
        };

        // Mock account lookup
        mockAccountsService.findById.mockResolvedValue({
          id: TEST_ACCOUNT_ID,
          address: TEST_ADDRESS,
          entropySource: 'test-entropy',
          derivationPath: [],
        } as any);

        // Mock keypair derivation
        mockAccountsService.deriveTronKeypair.mockResolvedValue({
          privateKeyHex: TEST_PRIVATE_KEY,
        } as any);

        // Mock message signing
        mockTronWeb.trx.signMessageV2.mockReturnValue(mockSignature);

        const result = await clientRequestHandler.handle(request);

        expect(mockAccountsService.findById).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
        );
        expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
          entropySource: 'test-entropy',
          derivationPath: [],
        });
        expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
          Network.Mainnet,
          TEST_PRIVATE_KEY,
        );
        expect(mockTronWeb.trx.signMessageV2).toHaveBeenCalledWith(
          `rewards,${TEST_ADDRESS},${mockTimestamp}`,
          TEST_PRIVATE_KEY,
        );
        expect(result).toStrictEqual({
          signature: mockSignature,
          signedMessage: message,
          signatureType: 'secp256k1',
        });
      });
    });

    describe('when called with invalid parameters', () => {
      it('throws error when message does not start with "rewards,"', async () => {
        const invalidMessage = utf8ToBase64('invalid-message');

        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.SignRewardsMessage,
          params: {
            accountId: TEST_ACCOUNT_ID,
            message: invalidMessage,
          },
        };

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Invalid method parameter(s)');
      });

      it('throws error when account is not found', async () => {
        const mockTimestamp = 1736660000;
        const message = utf8ToBase64(
          `rewards,${TEST_ADDRESS},${mockTimestamp}`,
        );

        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.SignRewardsMessage,
          params: {
            accountId: TEST_ACCOUNT_ID,
            message,
          },
        };

        mockAccountsService.findById.mockResolvedValue(null);

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Account not found');
      });

      it('throws error when address in message does not match signing account', async () => {
        const mockTimestamp = 1736660000;
        // Use a different address - validation will catch invalid addresses
        const differentAddress = 'invalid-address';
        const message = utf8ToBase64(
          `rewards,${differentAddress},${mockTimestamp}`,
        );

        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.SignRewardsMessage,
          params: {
            accountId: TEST_ACCOUNT_ID,
            message,
          },
        };

        // The validation struct will catch the invalid address format
        // before we can compare it to the signing account address
        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Invalid method parameter(s)');
      });

      it('throws error when message has invalid format', async () => {
        const invalidMessage = utf8ToBase64('rewards,invalid');

        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.SignRewardsMessage,
          params: {
            accountId: TEST_ACCOUNT_ID,
            message: invalidMessage,
          },
        };

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Invalid method parameter(s)');
      });

      it('throws error when timestamp is invalid', async () => {
        const invalidMessage = utf8ToBase64(
          `rewards,${TEST_ADDRESS},invalid-timestamp`,
        );

        const request = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.SignRewardsMessage,
          params: {
            accountId: TEST_ACCOUNT_ID,
            message: invalidMessage,
          },
        };

        await expect(
          clientRequestHandler.handle(request as any),
        ).rejects.toThrow('Invalid method parameter(s)');
      });
    });
  });
});

describe('ClientRequestHandler - computeStakeFee', () => {
  let clientRequestHandler: ClientRequestHandler;
  let mockAccountsService: jest.Mocked<AccountsService>;
  let mockAssetsService: jest.Mocked<AssetsService>;
  let mockSendService: jest.Mocked<SendService>;
  let mockFeeCalculatorService: jest.Mocked<FeeCalculatorService>;
  let mockTronWebFactory: jest.Mocked<TronWebFactory>;
  let mockSnapClient: jest.Mocked<SnapClient>;
  let mockStakingService: jest.Mocked<StakingService>;
  let mockConfirmationHandler: jest.Mocked<ConfirmationHandler>;
  let mockTransactionsService: jest.Mocked<TransactionsService>;
  let mockTronWeb: any;

  const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockAccountsService = {
      findByIdOrThrow: jest.fn(),
      deriveTronKeypair: jest.fn(),
    } as unknown as jest.Mocked<AccountsService>;

    mockAssetsService = {
      getAssetByAccountId: jest.fn(),
      getAssetsByAccountId: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;

    mockSendService = {} as unknown as jest.Mocked<SendService>;

    mockFeeCalculatorService = {
      computeFee: jest.fn(),
    } as unknown as jest.Mocked<FeeCalculatorService>;

    mockTronWeb = {
      trx: {
        sign: jest.fn(),
      },
      transactionBuilder: {
        freezeBalanceV2: jest.fn(),
      },
    };

    mockTronWebFactory = {
      createClient: jest.fn().mockReturnValue(mockTronWeb),
    } as unknown as jest.Mocked<TronWebFactory>;

    mockSnapClient = {} as unknown as jest.Mocked<SnapClient>;
    mockStakingService = {} as unknown as jest.Mocked<StakingService>;
    mockConfirmationHandler = {} as unknown as jest.Mocked<ConfirmationHandler>;
    mockTransactionsService = {
      save: jest.fn(),
    } as unknown as jest.Mocked<TransactionsService>;
    clientRequestHandler = new ClientRequestHandler({
      logger: mockLogger,
      accountsService: mockAccountsService,
      assetsService: mockAssetsService,
      sendService: mockSendService,
      feeCalculatorService: mockFeeCalculatorService,
      tronWebFactory: mockTronWebFactory,
      snapClient: mockSnapClient,
      stakingService: mockStakingService,
      confirmationHandler: mockConfirmationHandler,
      transactionsService: mockTransactionsService,
    });
  });

  it('computes fee breakdown for TRX staking on mainnet', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: ClientRequestMethod.ComputeStakeFee,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        value: '10',
        options: {
          purpose: 'ENERGY' as const,
        },
      },
    };

    const scope = Network.Mainnet;

    // Mock account lookup
    mockAccountsService.findByIdOrThrow.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
      entropySource: 'test-entropy',
      derivationPath: [],
    } as any);

    // Mock keypair derivation
    mockAccountsService.deriveTronKeypair.mockResolvedValue({
      privateKeyHex: 'test-private-key',
    } as any);

    const builtTransaction = {
      txID: 'stake-tx-id',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data: {
        contract: [],
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data_hex: 'stake-hex',
    };

    mockTronWeb.transactionBuilder.freezeBalanceV2.mockResolvedValue(
      builtTransaction,
    );

    const signedTransaction = {
      ...builtTransaction,
      signature: ['stake-signature'],
    };
    mockTronWeb.trx.sign.mockResolvedValue(signedTransaction);

    // Native TRX asset for mainnet
    const nativeAssetId = Networks[scope].nativeToken.id;

    // Mock native balance and resources
    (mockAssetsService.getAssetByAccountId as jest.Mock).mockResolvedValue({
      uiAmount: '100',
    });
    mockAssetsService.getAssetsByAccountId.mockResolvedValue([
      { rawAmount: '5000' }, // Bandwidth
      { rawAmount: '100000' }, // Energy
    ] as any);

    const feeResult = [
      {
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].energy.symbol,
          type: Networks[scope].energy.id,
          amount: '65000',
          fungible: true as const,
        },
      },
    ];
    mockFeeCalculatorService.computeFee.mockResolvedValue(feeResult);

    const result = await clientRequestHandler.handle(request as any);

    expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
      TEST_ACCOUNT_ID,
    );
    expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalled();
    expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
      scope,
      'test-private-key',
    );
    expect(mockTronWeb.transactionBuilder.freezeBalanceV2).toHaveBeenCalledWith(
      10 * 10 ** 6,
      'ENERGY',
      'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    );
    expect(mockAssetsService.getAssetByAccountId).toHaveBeenCalledWith(
      TEST_ACCOUNT_ID,
      nativeAssetId,
    );
    expect(mockAssetsService.getAssetsByAccountId).toHaveBeenCalledWith(
      TEST_ACCOUNT_ID,
      [Networks[scope].bandwidth.id, Networks[scope].energy.id],
    );
    expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
      scope,
      transaction: signedTransaction,
      availableEnergy: BigNumber('100000'),
      availableBandwidth: BigNumber('5000'),
    });
    expect(result).toStrictEqual(feeResult);
  });

  it('returns insufficient balance error when staking more than balance', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '2',
      method: ClientRequestMethod.ComputeStakeFee,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        value: '10',
        options: {
          purpose: 'BANDWIDTH' as const,
        },
      },
    };

    mockAccountsService.findByIdOrThrow.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
      entropySource: 'test-entropy',
      derivationPath: [],
    } as any);

    // Account has only 5 TRX
    (mockAssetsService.getAssetByAccountId as jest.Mock).mockResolvedValue({
      uiAmount: '5',
    });

    const result = (await clientRequestHandler.handle(request as any)) as any;

    expect(result).toStrictEqual({
      valid: false,
      errors: [SendErrorCodes.InsufficientBalance],
    });
    expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
  });
});
