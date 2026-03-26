import { FeeType } from '@metamask/keyring-api';
import type { JsonRpcRequest } from '@metamask/snaps-sdk';
import type { Infer } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';
import type { Transaction, TransferContract } from 'tronweb/lib/esm/types';

import { ClientRequestHandler } from './clientRequest';
import { ClientRequestMethod, SendErrorCodes } from './types';
import type { OnAmountInputRequestStruct } from './validation';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { Network, Networks } from '../../constants';
import type { NativeAsset, ResourceAsset } from '../../entities/assets';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import type { AccountsService } from '../../services/accounts/AccountsService';
import type { AssetsService } from '../../services/assets/AssetsService';
import type { ConfirmationHandler } from '../../services/confirmation/ConfirmationHandler';
import type { FeeCalculatorService } from '../../services/send/FeeCalculatorService';
import type { SendService } from '../../services/send/SendService';
import type { ComputeFeeResult } from '../../services/send/types';
import type { StakingService } from '../../services/staking/StakingService';
import type { TransactionsService } from '../../services/transactions/TransactionsService';
import { trxToSun } from '../../utils/conversion';
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
                // eslint-disable-next-line @typescript-eslint/naming-convention
                type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
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

        // Mock fee calculation result
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
        const result = await clientRequestHandler.handle(
          request as JsonRpcRequest,
        );

        // Verify - no signing needed for fee computation
        expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
        );
        // deriveTronKeypair is NOT called - no private key needed for fee computation
        expect(mockAccountsService.deriveTronKeypair).not.toHaveBeenCalled();
        expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(scope);
        expect(
          mockTronWeb.utils.deserializeTx.deserializeTransaction,
        ).toHaveBeenCalledWith('TriggerSmartContract', expect.any(String));
        // trx.sign is NOT called - fee computation uses unsigned transactions
        expect(mockTronWeb.trx.sign).not.toHaveBeenCalled();
        expect(mockAssetsService.getAssetsByAccountId).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
          [Networks[scope].bandwidth.id, Networks[scope].energy.id],
        );
        // computeFee receives unsigned transaction (no signature field)
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.objectContaining({
            txID: expect.any(String),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            raw_data: expect.any(Object),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            raw_data_hex: expect.any(String),
            visible: false,
          }),
          availableEnergy: BigNumber('100000'),
          availableBandwidth: BigNumber('5000'),
          feeLimit: undefined,
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
                // eslint-disable-next-line @typescript-eslint/naming-convention
                type_url: 'type.googleapis.com/protocol.TransferContract',
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

        const result = await clientRequestHandler.handle(
          request as JsonRpcRequest,
        );

        expect(result).toStrictEqual(feeResult);
        // computeFee receives unsigned transaction (no signature field)
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.objectContaining({
            txID: expect.any(String),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            raw_data: expect.any(Object),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            raw_data_hex: expect.any(String),
          }),
          availableEnergy: BigNumber('0'),
          availableBandwidth: BigNumber('1000'),
          feeLimit: undefined,
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

        mockTronWeb.utils.deserializeTx.deserializeTransaction.mockReturnValue({
          contract: [
            {
              type: 'TriggerSmartContract',
              parameter: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
                value: {
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  owner_address: '41045d01eb63374da930ee0da30d58516ac14ce04c79',
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  contract_address: '419946f55aa08cfe8363959ce9930ebd567e2c14f',
                },
              },
            },
          ],
        });
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

        const result = await clientRequestHandler.handle(
          request as JsonRpcRequest,
        );

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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
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
          clientRequestHandler.handle(request as JsonRpcRequest),
        ).rejects.toThrow('Invalid method parameter(s)');
      });
    });
  });
});

describe('ClientRequestHandler - onAmountInput', () => {
  const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEST_TO_ADDRESS = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
  const scope = Network.Mainnet;
  const nativeTokenId = Networks[scope].nativeToken.id;
  type OnAmountInputRequest = Infer<typeof OnAmountInputRequestStruct>;
  type WithOnAmountInputHandlerCallback<ReturnValue> = (payload: {
    handler: ClientRequestHandler;
    mockAccountsService: jest.Mocked<Pick<AccountsService, 'findById'>>;
    mockAssetsService: jest.Mocked<Pick<AssetsService, 'getAssetsByAccountId'>>;
    mockSendService: jest.Mocked<Pick<SendService, 'buildTransaction'>>;
    mockFeeCalculatorService: jest.Mocked<
      Pick<FeeCalculatorService, 'computeFee'>
    >;
  }) => Promise<ReturnValue> | ReturnValue;

  const mockAccount: TronKeyringAccount = {
    id: TEST_ACCOUNT_ID,
    address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
    type: 'tron:eoa',
    options: {},
    methods: [],
    scopes: [scope],
    entropySource: 'test-entropy',
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  const createNativeAsset = (
    uiAmount: string,
    rawAmount: string,
  ): NativeAsset => ({
    assetType: nativeTokenId,
    keyringAccountId: TEST_ACCOUNT_ID,
    network: scope,
    symbol: 'TRX',
    decimals: 6,
    rawAmount,
    uiAmount,
    iconUrl: Networks[scope].nativeToken.iconUrl,
  });

  const createResourceAsset = (
    assetType: ResourceAsset['assetType'],
    uiAmount: string,
    rawAmount: string,
  ): ResourceAsset => ({
    assetType,
    keyringAccountId: TEST_ACCOUNT_ID,
    network: scope,
    symbol:
      assetType === Networks[scope].bandwidth.id
        ? Networks[scope].bandwidth.symbol
        : Networks[scope].energy.symbol,
    decimals: 0,
    rawAmount,
    uiAmount,
    iconUrl:
      assetType === Networks[scope].bandwidth.id
        ? Networks[scope].bandwidth.iconUrl
        : Networks[scope].energy.iconUrl,
  });

  const createMockTransferTransaction = (): Transaction<TransferContract> => ({
    visible: false,
    txID: 'mock-tx-id',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    raw_data: {
      contract: [
        {
          type: 'TransferContract' as Transaction<TransferContract>['raw_data']['contract'][number]['type'],
          parameter: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            type_url: 'type.googleapis.com/protocol.TransferContract',
            value: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              owner_address: `41${'a'.repeat(40)}`,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              to_address: `41${'b'.repeat(40)}`,
              amount: 1000000,
            },
          },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ref_block_bytes: '0000',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ref_block_hash: '0'.repeat(16),
      expiration: Date.now() + 60000,
      timestamp: Date.now(),
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    raw_data_hex: 'mock-hex',
  });

  /**
   * Wraps `onAmountInput` tests by creating a fresh handler and fresh mocks.
   *
   * @param testFunction - The test body receiving the handler and relevant mocks.
   * @returns The return value of the callback.
   */
  async function withOnAmountInputHandler<ReturnValue>(
    testFunction: WithOnAmountInputHandlerCallback<ReturnValue>,
  ): Promise<ReturnValue> {
    const mockAccountsService: jest.Mocked<Pick<AccountsService, 'findById'>> =
      {
        findById: jest.fn(),
      };

    const mockAssetsService: jest.Mocked<
      Pick<AssetsService, 'getAssetsByAccountId'>
    > = {
      getAssetsByAccountId: jest.fn(),
    };

    const mockSendService: jest.Mocked<Pick<SendService, 'buildTransaction'>> =
      {
        buildTransaction: jest.fn(),
      };

    const mockFeeCalculatorService: jest.Mocked<
      Pick<FeeCalculatorService, 'computeFee'>
    > = {
      computeFee: jest.fn(),
    };

    const handler = new ClientRequestHandler({
      logger: mockLogger,
      accountsService: mockAccountsService as unknown as AccountsService,
      assetsService: mockAssetsService as unknown as AssetsService,
      sendService: mockSendService as unknown as SendService,
      feeCalculatorService:
        mockFeeCalculatorService as unknown as FeeCalculatorService,
      tronWebFactory: {} as TronWebFactory,
      snapClient: {} as SnapClient,
      stakingService: {} as StakingService,
      confirmationHandler: {} as ConfirmationHandler,
      transactionsService: {} as TransactionsService,
    });

    return await testFunction({
      handler,
      mockAccountsService,
      mockAssetsService,
      mockSendService,
      mockFeeCalculatorService,
    });
  }

  it('returns valid and skips fee validation when toAddress is missing', async () => {
    await withOnAmountInputHandler(
      async ({
        handler,
        mockAccountsService,
        mockAssetsService,
        mockSendService,
        mockFeeCalculatorService,
      }) => {
        const request: OnAmountInputRequest = {
          jsonrpc: '2.0' as const,
          id: '1',
          method: ClientRequestMethod.OnAmountInput,
          params: {
            accountId: TEST_ACCOUNT_ID,
            assetId: nativeTokenId,
            value: '10',
          },
        };

        const mockAsset = createNativeAsset('100', '100000000');
        const mockAssets: [
          NativeAsset,
          NativeAsset,
          ResourceAsset,
          ResourceAsset,
        ] = [
          mockAsset,
          mockAsset,
          createResourceAsset(Networks[scope].bandwidth.id, '5000', '5000'),
          createResourceAsset(Networks[scope].energy.id, '100000', '100000'),
        ];

        mockAccountsService.findById.mockResolvedValue(mockAccount);
        mockAssetsService.getAssetsByAccountId.mockResolvedValue(mockAssets);

        const result = await handler.handle(request);

        expect(result).toStrictEqual({ valid: true, errors: [] });
        expect(mockSendService.buildTransaction).not.toHaveBeenCalled();
        expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
      },
    );
  });

  it('uses provided toAddress when building the transaction for fee estimation', async () => {
    await withOnAmountInputHandler(
      async ({
        handler,
        mockAccountsService,
        mockAssetsService,
        mockSendService,
        mockFeeCalculatorService,
      }) => {
        const request: OnAmountInputRequest = {
          jsonrpc: '2.0' as const,
          id: '2',
          method: ClientRequestMethod.OnAmountInput,
          params: {
            accountId: TEST_ACCOUNT_ID,
            assetId: nativeTokenId,
            value: '10',
            toAddress: TEST_TO_ADDRESS,
          },
        };

        const mockAsset = createNativeAsset('100', '100000000');
        const mockAssets: [
          NativeAsset,
          NativeAsset,
          ResourceAsset,
          ResourceAsset,
        ] = [
          mockAsset,
          mockAsset,
          createResourceAsset(Networks[scope].bandwidth.id, '5000', '5000'),
          createResourceAsset(Networks[scope].energy.id, '100000', '100000'),
        ];
        const builtTransaction = createMockTransferTransaction();
        const mockFees: ComputeFeeResult = [
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '1',
              fungible: true,
            },
          },
        ];

        mockAccountsService.findById.mockResolvedValue(mockAccount);
        mockAssetsService.getAssetsByAccountId.mockResolvedValue(mockAssets);
        mockSendService.buildTransaction.mockResolvedValue(builtTransaction);
        mockFeeCalculatorService.computeFee.mockResolvedValue(mockFees);

        const result = await handler.handle(request);

        expect(result).toStrictEqual({ valid: true, errors: [] });
        expect(mockSendService.buildTransaction).toHaveBeenCalledWith({
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset: mockAsset,
          amount: new BigNumber('10'),
        });
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: builtTransaction,
          availableEnergy: BigNumber('100000'),
          availableBandwidth: BigNumber('5000'),
        });
      },
    );
  });

  it('passes amount as BigNumber (not number) to preserve decimal precision', async () => {
    await withOnAmountInputHandler(
      async ({
        handler,
        mockAccountsService,
        mockAssetsService,
        mockSendService,
        mockFeeCalculatorService,
      }) => {
        const request: OnAmountInputRequest = {
          jsonrpc: '2.0' as const,
          id: '5',
          method: ClientRequestMethod.OnAmountInput,
          params: {
            accountId: TEST_ACCOUNT_ID,
            assetId: nativeTokenId,
            value: '0.99',
            toAddress: TEST_TO_ADDRESS,
          },
        };

        const mockAsset = createNativeAsset('100', '100000000');
        const mockAssets: [
          NativeAsset,
          NativeAsset,
          ResourceAsset,
          ResourceAsset,
        ] = [
          mockAsset,
          mockAsset,
          createResourceAsset(Networks[scope].bandwidth.id, '5000', '5000'),
          createResourceAsset(Networks[scope].energy.id, '100000', '100000'),
        ];
        const builtTransaction = createMockTransferTransaction();
        const mockFees: ComputeFeeResult = [
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ];

        mockAccountsService.findById.mockResolvedValue(mockAccount);
        mockAssetsService.getAssetsByAccountId.mockResolvedValue(mockAssets);
        mockSendService.buildTransaction.mockResolvedValue(builtTransaction);
        mockFeeCalculatorService.computeFee.mockResolvedValue(mockFees);

        await handler.handle(request);

        const calledAmount = mockSendService.buildTransaction.mock.calls[0]?.[0]
          ?.amount as BigNumber;

        // Must be a BigNumber, not a number — prevents IEEE 754 precision loss
        expect(calledAmount).toBeInstanceOf(BigNumber);
        // Must preserve exact decimal representation (0.99, not 0.98999999999999999...)
        expect(calledAmount.toString()).toBe('0.99');
      },
    );
  });

  it('returns insufficient balance when the asset balance is too low and toAddress is missing', async () => {
    await withOnAmountInputHandler(
      async ({
        handler,
        mockAccountsService,
        mockAssetsService,
        mockSendService,
        mockFeeCalculatorService,
      }) => {
        const request: OnAmountInputRequest = {
          jsonrpc: '2.0' as const,
          id: '3',
          method: ClientRequestMethod.OnAmountInput,
          params: {
            accountId: TEST_ACCOUNT_ID,
            assetId: nativeTokenId,
            value: '10',
          },
        };

        const lowBalanceAsset = createNativeAsset('5', '5000000');
        const mockAssets: [
          NativeAsset,
          NativeAsset,
          ResourceAsset,
          ResourceAsset,
        ] = [
          lowBalanceAsset,
          lowBalanceAsset,
          createResourceAsset(Networks[scope].bandwidth.id, '5000', '5000'),
          createResourceAsset(Networks[scope].energy.id, '100000', '100000'),
        ];

        mockAccountsService.findById.mockResolvedValue(mockAccount);
        mockAssetsService.getAssetsByAccountId.mockResolvedValue(mockAssets);

        const result = await handler.handle(request);

        expect(result).toStrictEqual({
          valid: false,
          errors: [{ code: SendErrorCodes.InsufficientBalance }],
        });
        expect(mockSendService.buildTransaction).not.toHaveBeenCalled();
        expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
      },
    );
  });

  it('returns insufficient balance to cover fee when toAddress is provided and fees exceed the native balance', async () => {
    await withOnAmountInputHandler(
      async ({
        handler,
        mockAccountsService,
        mockAssetsService,
        mockSendService,
        mockFeeCalculatorService,
      }) => {
        const request: OnAmountInputRequest = {
          jsonrpc: '2.0' as const,
          id: '4',
          method: ClientRequestMethod.OnAmountInput,
          params: {
            accountId: TEST_ACCOUNT_ID,
            assetId: nativeTokenId,
            value: '10',
            toAddress: TEST_TO_ADDRESS,
          },
        };

        const mockAsset = createNativeAsset('10', '10000000');
        const mockAssets: [
          NativeAsset,
          NativeAsset,
          ResourceAsset,
          ResourceAsset,
        ] = [
          mockAsset,
          mockAsset,
          createResourceAsset(Networks[scope].bandwidth.id, '0', '0'),
          createResourceAsset(Networks[scope].energy.id, '0', '0'),
        ];
        const builtTransaction = createMockTransferTransaction();
        const mockFees: ComputeFeeResult = [
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '1',
              fungible: true,
            },
          },
        ];

        mockAccountsService.findById.mockResolvedValue(mockAccount);
        mockAssetsService.getAssetsByAccountId.mockResolvedValue(mockAssets);
        mockSendService.buildTransaction.mockResolvedValue(builtTransaction);
        mockFeeCalculatorService.computeFee.mockResolvedValue(mockFees);

        const result = await handler.handle(request);

        expect(result).toStrictEqual({
          valid: false,
          errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
        });
      },
    );
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

    const result = await clientRequestHandler.handle(request as JsonRpcRequest);

    expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
      TEST_ACCOUNT_ID,
    );
    // deriveTronKeypair is NOT called - no private key needed for fee computation
    expect(mockAccountsService.deriveTronKeypair).not.toHaveBeenCalled();
    expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(scope);
    expect(mockTronWeb.transactionBuilder.freezeBalanceV2).toHaveBeenCalledWith(
      Number(trxToSun(10)),
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
    // computeFee receives unsigned transaction (no signature field)
    expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
      scope,
      transaction: builtTransaction,
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

    const result = (await clientRequestHandler.handle(
      request as JsonRpcRequest,
    )) as any;

    expect(result).toStrictEqual({
      valid: false,
      errors: [SendErrorCodes.InsufficientBalance],
    });
    expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
  });
});

describe('ClientRequestHandler - confirmSend validation', () => {
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

  const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEST_TO_ADDRESS = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
  const scope = Network.Mainnet;

  beforeEach(() => {
    mockAccountsService = {
      findById: jest.fn(),
      findByIdOrThrow: jest.fn(),
      deriveTronKeypair: jest.fn(),
    } as unknown as jest.Mocked<AccountsService>;

    mockAssetsService = {
      getAssetByAccountId: jest.fn(),
      getAssetsByAccountId: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;

    mockSendService = {
      validateSend: jest.fn(),
      buildTransaction: jest.fn(),
      signAndSendTransaction: jest.fn(),
    } as unknown as jest.Mocked<SendService>;

    mockFeeCalculatorService = {
      computeFee: jest.fn(),
    } as unknown as jest.Mocked<FeeCalculatorService>;

    mockTronWebFactory = {
      createClient: jest.fn(),
    } as unknown as jest.Mocked<TronWebFactory>;

    mockSnapClient = {} as unknown as jest.Mocked<SnapClient>;
    mockStakingService = {} as unknown as jest.Mocked<StakingService>;
    mockConfirmationHandler = {
      confirmTransactionRequest: jest.fn(),
    } as unknown as jest.Mocked<ConfirmationHandler>;
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

  it('returns InsufficientBalance when validateSend returns InsufficientBalance', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: ClientRequestMethod.ConfirmSend,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        toAddress: TEST_TO_ADDRESS,
        amount: '10',
        assetId: Networks[scope].nativeToken.id,
      },
    };

    // Mock account found
    mockAccountsService.findById.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
      entropySource: 'test-entropy',
      derivationPath: [],
      type: 'tron:basic',
    } as any);

    // Mock asset found
    const mockAsset = {
      assetType: Networks[scope].nativeToken.id,
      symbol: 'TRX',
      decimals: 6,
      uiAmount: '100',
      rawAmount: '100000000',
    };
    (mockAssetsService.getAssetByAccountId as jest.Mock).mockResolvedValue(
      mockAsset,
    );

    // validateSend returns insufficient balance
    mockSendService.validateSend.mockResolvedValue({
      valid: false,
      errorCode: 'InsufficientBalance' as any,
    });

    const result = (await clientRequestHandler.handle(
      request as JsonRpcRequest,
    )) as any;

    expect(result).toStrictEqual({
      valid: false,
      errors: [{ code: SendErrorCodes.InsufficientBalance }],
    });

    expect(mockSendService.validateSend).toHaveBeenCalledWith({
      scope,
      fromAccountId: TEST_ACCOUNT_ID,
      toAddress: TEST_TO_ADDRESS,
      asset: mockAsset,
      amount: BigNumber('10'),
    });

    // Should not proceed to build transaction or confirmation
    expect(mockSendService.buildTransaction).not.toHaveBeenCalled();
    expect(
      mockConfirmationHandler.confirmTransactionRequest,
    ).not.toHaveBeenCalled();
  });

  it('returns InsufficientBalanceToCoverFee when validateSend returns InsufficientBalanceToCoverFee', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: ClientRequestMethod.ConfirmSend,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        toAddress: TEST_TO_ADDRESS,
        amount: '99',
        assetId: Networks[scope].nativeToken.id,
      },
    };

    mockAccountsService.findById.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
      entropySource: 'test-entropy',
      derivationPath: [],
      type: 'tron:basic',
    } as any);

    const mockAsset = {
      assetType: Networks[scope].nativeToken.id,
      symbol: 'TRX',
      decimals: 6,
      uiAmount: '100',
      rawAmount: '100000000',
    };
    (mockAssetsService.getAssetByAccountId as jest.Mock).mockResolvedValue(
      mockAsset,
    );

    // validateSend returns insufficient balance to cover fee
    mockSendService.validateSend.mockResolvedValue({
      valid: false,
      errorCode: 'InsufficientBalanceToCoverFee' as any,
    });

    const result = (await clientRequestHandler.handle(
      request as JsonRpcRequest,
    )) as any;

    expect(result).toStrictEqual({
      valid: false,
      errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
    });

    expect(mockSendService.buildTransaction).not.toHaveBeenCalled();
    expect(
      mockConfirmationHandler.confirmTransactionRequest,
    ).not.toHaveBeenCalled();
  });

  it('proceeds to confirmation when validateSend returns valid', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: ClientRequestMethod.ConfirmSend,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        toAddress: TEST_TO_ADDRESS,
        amount: '10',
        assetId: Networks[scope].nativeToken.id,
      },
    };

    const mockAccount = {
      id: TEST_ACCOUNT_ID,
      address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
      entropySource: 'test-entropy',
      derivationPath: [],
      type: 'tron:basic',
    };
    mockAccountsService.findById.mockResolvedValue(mockAccount as any);

    const mockAsset = {
      assetType: Networks[scope].nativeToken.id,
      symbol: 'TRX',
      decimals: 6,
      uiAmount: '100',
      rawAmount: '100000000',
    };
    (mockAssetsService.getAssetByAccountId as jest.Mock).mockResolvedValue(
      mockAsset,
    );

    // validateSend returns valid
    mockSendService.validateSend.mockResolvedValue({ valid: true });

    // Mock the rest of the flow
    mockAssetsService.getAssetsByAccountId.mockResolvedValue([
      { rawAmount: '1000' }, // Bandwidth
      { rawAmount: '50000' }, // Energy
    ] as any);

    const mockTransaction = {
      txID: 'test-tx-id',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data: {},
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data_hex: 'test-hex',
    };
    mockSendService.buildTransaction.mockResolvedValue(mockTransaction as any);

    const mockFees = [
      {
        type: 'base' as const,
        asset: {
          unit: 'TRX',
          type: Networks[scope].nativeToken.id,
          amount: '0',
          fungible: true as const,
        },
      },
    ];
    mockFeeCalculatorService.computeFee.mockResolvedValue(mockFees as any);

    // User confirms
    mockConfirmationHandler.confirmTransactionRequest.mockResolvedValue(true);

    // Transaction sent successfully
    mockSendService.signAndSendTransaction.mockResolvedValue({
      result: true,
      txid: 'broadcast-tx-id',
    } as any);

    const result = await clientRequestHandler.handle(request as JsonRpcRequest);

    // Should have proceeded through the full flow
    expect(mockSendService.validateSend).toHaveBeenCalled();
    expect(mockSendService.buildTransaction).toHaveBeenCalled();
    expect(mockFeeCalculatorService.computeFee).toHaveBeenCalled();
    expect(
      mockConfirmationHandler.confirmTransactionRequest,
    ).toHaveBeenCalled();
    expect(mockSendService.signAndSendTransaction).toHaveBeenCalled();

    // Result should be the transaction result
    expect(result).toMatchObject({
      transactionId: 'broadcast-tx-id',
      status: 'submitted',
    });

    // buildTransaction must receive a BigNumber to preserve decimal precision
    const calledAmount = mockSendService.buildTransaction.mock.calls[0]?.[0]
      ?.amount as BigNumber;
    expect(calledAmount).toBeInstanceOf(BigNumber);
    expect(calledAmount.toString()).toBe('10');
  });

  it('returns Invalid error when account is not found', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: ClientRequestMethod.ConfirmSend,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        toAddress: TEST_TO_ADDRESS,
        amount: '10',
        assetId: Networks[scope].nativeToken.id,
      },
    };

    // Account not found
    mockAccountsService.findById.mockResolvedValue(null);

    const result = (await clientRequestHandler.handle(
      request as JsonRpcRequest,
    )) as any;

    expect(result).toStrictEqual({
      valid: false,
      errors: [{ code: SendErrorCodes.Invalid }],
    });

    expect(mockSendService.validateSend).not.toHaveBeenCalled();
  });

  it('returns InsufficientBalance when asset is not found', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: ClientRequestMethod.ConfirmSend,
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        toAddress: TEST_TO_ADDRESS,
        amount: '10',
        assetId: Networks[scope].nativeToken.id,
      },
    };

    mockAccountsService.findById.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
      entropySource: 'test-entropy',
      derivationPath: [],
      type: 'tron:basic',
    } as any);

    // Asset not found
    (mockAssetsService.getAssetByAccountId as jest.Mock).mockResolvedValue(
      null,
    );

    const result = (await clientRequestHandler.handle(
      request as JsonRpcRequest,
    )) as any;

    expect(result).toStrictEqual({
      valid: false,
      errors: [{ code: SendErrorCodes.InsufficientBalance }],
    });

    expect(mockSendService.validateSend).not.toHaveBeenCalled();
  });
});

describe('ClientRequestHandler - claimUnstakedTrx', () => {
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

  const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

  const mockAccount = {
    id: TEST_ACCOUNT_ID,
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    entropySource: 'test-entropy',
    derivationPath: "m/44'/195'/0'/0/0",
  };

  beforeEach(() => {
    mockAccountsService = {
      findByIdOrThrow: jest.fn().mockResolvedValue(mockAccount),
    } as unknown as jest.Mocked<AccountsService>;

    mockAssetsService = {} as unknown as jest.Mocked<AssetsService>;
    mockSendService = {} as unknown as jest.Mocked<SendService>;
    mockFeeCalculatorService =
      {} as unknown as jest.Mocked<FeeCalculatorService>;
    mockTronWebFactory = {
      createClient: jest.fn(),
    } as unknown as jest.Mocked<TronWebFactory>;
    mockSnapClient = {} as unknown as jest.Mocked<SnapClient>;
    mockStakingService = {
      claimUnstakedTrx: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StakingService>;
    mockConfirmationHandler = {
      confirmClaimUnstakedTrx: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<ConfirmationHandler>;
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

  it('claims unstaked TRX successfully when user confirms', async () => {
    mockConfirmationHandler.confirmClaimUnstakedTrx.mockResolvedValue(true);

    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'claimUnstakedTrx',
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        assetId: Networks[Network.Mainnet].nativeToken.id,
      },
    };

    const result = await clientRequestHandler.handle(request as JsonRpcRequest);

    expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
      TEST_ACCOUNT_ID,
    );
    expect(
      mockConfirmationHandler.confirmClaimUnstakedTrx,
    ).toHaveBeenCalledWith({
      account: mockAccount,
      scope: Network.Mainnet,
    });
    expect(mockStakingService.claimUnstakedTrx).toHaveBeenCalledWith({
      account: mockAccount,
      scope: Network.Mainnet,
    });
    expect(result).toStrictEqual({ valid: true, errors: [] });
  });

  it('throws when user rejects the confirmation', async () => {
    mockConfirmationHandler.confirmClaimUnstakedTrx.mockResolvedValue(false);

    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'claimUnstakedTrx',
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        assetId: Networks[Network.Mainnet].nativeToken.id,
      },
    };

    await expect(
      clientRequestHandler.handle(request as JsonRpcRequest),
    ).rejects.toThrow('User rejected the request.');

    expect(
      mockConfirmationHandler.confirmClaimUnstakedTrx,
    ).toHaveBeenCalledWith({
      account: mockAccount,
      scope: Network.Mainnet,
    });
    expect(mockStakingService.claimUnstakedTrx).not.toHaveBeenCalled();
  });

  it('throws InvalidParamsError for invalid params', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'claimUnstakedTrx',
      params: {
        fromAccountId: 'not-a-uuid',
        assetId: 'invalid-asset',
      },
    };

    await expect(
      clientRequestHandler.handle(request as JsonRpcRequest),
    ).rejects.toThrow('Invalid method parameter(s)');
  });
});

describe('ClientRequestHandler - claimTrxStakingRewards', () => {
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

  const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

  const mockAccount = {
    id: TEST_ACCOUNT_ID,
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    entropySource: 'test-entropy',
    derivationPath: "m/44'/195'/0'/0/0",
  };

  beforeEach(() => {
    mockAccountsService = {
      findByIdOrThrow: jest.fn().mockResolvedValue(mockAccount),
    } as unknown as jest.Mocked<AccountsService>;

    mockAssetsService = {} as unknown as jest.Mocked<AssetsService>;
    mockSendService = {} as unknown as jest.Mocked<SendService>;
    mockFeeCalculatorService =
      {} as unknown as jest.Mocked<FeeCalculatorService>;
    mockTronWebFactory = {
      createClient: jest.fn(),
    } as unknown as jest.Mocked<TronWebFactory>;
    mockSnapClient = {} as unknown as jest.Mocked<SnapClient>;
    mockStakingService = {
      claimTrxStakingRewards: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StakingService>;
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

  it('claims staking rewards successfully', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'claimTrxStakingRewards',
      params: {
        fromAccountId: TEST_ACCOUNT_ID,
        assetId: Networks[Network.Mainnet].nativeToken.id,
      },
    };

    const result = await clientRequestHandler.handle(request as JsonRpcRequest);

    expect(mockAccountsService.findByIdOrThrow).toHaveBeenCalledWith(
      TEST_ACCOUNT_ID,
    );
    expect(mockStakingService.claimTrxStakingRewards).toHaveBeenCalledWith({
      account: mockAccount,
      scope: Network.Mainnet,
    });
    expect(result).toStrictEqual({ valid: true, errors: [] });
  });

  it('throws InvalidParamsError for invalid params', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'claimTrxStakingRewards',
      params: {
        fromAccountId: 'not-a-uuid',
        assetId: 'invalid-asset',
      },
    };

    await expect(
      clientRequestHandler.handle(request as JsonRpcRequest),
    ).rejects.toThrow('Invalid method parameter(s)');
  });
});
