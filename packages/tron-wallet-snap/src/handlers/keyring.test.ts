import { AccountCreationType } from '@metamask/keyring-api';
import type {
  CreateAccountOptions as KeyringBatchCreateAccountOptions,
  KeyringRequest,
} from '@metamask/keyring-api';
import type { ExportAccountOptions } from '@metamask/keyring-api/v2';
import {
  InvalidParamsError,
  UserRejectedRequestError,
} from '@metamask/snaps-sdk';

import type { SnapClient } from '../clients/snap/SnapClient';
import { Network } from '../constants';
import type { TronKeyringAccount } from '../entities/keyring-account';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { AssetsService } from '../services/assets/AssetsService';
import type { ConfirmationHandler } from '../services/confirmation/ConfirmationHandler';
import type { TransactionsService } from '../services/transactions/TransactionsService';
import type { WalletService } from '../services/wallet/WalletService';
import { mockLogger } from '../utils/mockLogger';
import { KeyringHandler } from './keyring';
import { TronMultichainMethod } from './keyring-types';

/**
 * Helper function to convert string to base64.
 *
 * @param str - The string to convert.
 * @returns Base64 encoded string.
 */
function toBase64(str: string): string {
  return Buffer.from(str).toString('base64');
}

/**
 * Helper function to convert string to hex.
 *
 * @param str - The string to convert.
 * @returns Hex encoded string (without 0x prefix).
 */
function toHex(str: string): string {
  return Buffer.from(str).toString('hex');
}

describe('KeyringHandler', () => {
  const mockAccount: TronKeyringAccount = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    options: {},
    methods: [
      TronMultichainMethod.SignMessage,
      TronMultichainMethod.SignTransaction,
    ],
    type: 'tron:eoa',
    scopes: [Network.Mainnet, Network.Shasta],
    entropySource: 'entropy-source-1',
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  let keyringHandler: KeyringHandler;
  let mockSnapClient: jest.Mocked<SnapClient>;
  let mockAccountsService: jest.Mocked<AccountsService>;
  let mockAssetsService: jest.Mocked<AssetsService>;
  let mockTransactionsService: jest.Mocked<TransactionsService>;
  let mockWalletService: jest.Mocked<WalletService>;
  let mockConfirmationHandler: jest.Mocked<ConfirmationHandler>;

  beforeEach(() => {
    mockSnapClient = {
      scheduleBackgroundEvent: jest.fn().mockResolvedValue(undefined),
      trackError: jest.fn(),
    } as unknown as jest.Mocked<SnapClient>;
    mockAccountsService = {
      findById: jest.fn().mockResolvedValue(mockAccount),
      findByIdOrThrow: jest.fn().mockResolvedValue(mockAccount),
      deriveAccount: jest.fn(),
      create: jest.fn(),
      createAccounts: jest.fn(),
      getAll: jest.fn().mockResolvedValue([mockAccount]),
      deriveTronKeypair: jest.fn().mockResolvedValue({
        privateKeyHex: 'a'.repeat(64),
        privateKeyBytes: new Uint8Array(32),
        publicKeyBytes: new Uint8Array(33),
        address: mockAccount.address,
      }),
    } as unknown as jest.Mocked<AccountsService>;
    mockAssetsService = {
      getByKeyringAccountId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AssetsService>;
    mockTransactionsService = {
      checkAddressActivity: jest.fn(),
      findByAccounts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TransactionsService>;
    mockWalletService = {
      handleKeyringRequest: jest
        .fn()
        .mockResolvedValue({ signature: '0xsignature123' }),
    } as unknown as jest.Mocked<WalletService>;
    mockConfirmationHandler = {
      handleKeyringRequest: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<ConfirmationHandler>;

    keyringHandler = new KeyringHandler({
      logger: mockLogger,
      snapClient: mockSnapClient,
      accountsService: mockAccountsService,
      assetsService: mockAssetsService,
      transactionsService: mockTransactionsService,
      walletService: mockWalletService,
      confirmationHandler: mockConfirmationHandler,
    });
  });

  describe('submitRequest', () => {
    describe('signMessage', () => {
      it('successfully signs a message', async () => {
        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000001',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello World'),
            },
          },
        };

        const result = await keyringHandler.submitRequest(request);

        expect(result).toStrictEqual({
          pending: false,
          result: { signature: '0xsignature123' },
        });
        expect(mockAccountsService.findById).toHaveBeenCalledWith(
          mockAccount.id,
        );
        expect(
          mockConfirmationHandler.handleKeyringRequest,
        ).toHaveBeenCalledWith({
          request,
          account: mockAccount,
        });
        expect(mockWalletService.handleKeyringRequest).toHaveBeenCalledWith({
          account: mockAccount,
          scope: Network.Mainnet,
          method: TronMultichainMethod.SignMessage,
          params: request.request.params,
        });
      });

      it('throws error if user rejects the request', async () => {
        mockConfirmationHandler.handleKeyringRequest.mockResolvedValue(false);

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000002',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          UserRejectedRequestError,
        );
        expect(mockWalletService.handleKeyringRequest).not.toHaveBeenCalled();
      });

      it('throws error if account not found', async () => {
        mockAccountsService.findById.mockResolvedValue(null);

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000003',
          origin: 'https://test-origin.com',
          account: '123e4567-e89b-42d3-a456-426614174999',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          'not found',
        );
      });
    });

    describe('signTransaction', () => {
      it('confirms and signs the transaction without modifying its payload', async () => {
        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000004',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              transaction: {
                rawDataHex: toHex('transaction-data'),
                type: 'TransferContract',
              },
            },
          },
        };
        const transactionParams = request.request.params as {
          transaction: {
            rawDataHex: string;
            type: string;
          };
        };

        const result = await keyringHandler.submitRequest(request);

        expect(result).toStrictEqual({
          pending: false,
          result: { signature: '0xsignature123' },
        });
        // The request reaching confirmation keeps the dApp's original payload.
        expect(
          mockConfirmationHandler.handleKeyringRequest,
        ).toHaveBeenCalledWith({
          request: expect.objectContaining({
            request: expect.objectContaining({
              params: expect.objectContaining({
                transaction: expect.objectContaining({
                  rawDataHex: transactionParams.transaction.rawDataHex,
                }),
              }),
            }),
          }),
          account: mockAccount,
        });
        expect(mockWalletService.handleKeyringRequest).toHaveBeenCalledWith({
          account: mockAccount,
          scope: Network.Mainnet,
          method: TronMultichainMethod.SignTransaction,
          params: expect.objectContaining({
            transaction: expect.objectContaining({
              rawDataHex: transactionParams.transaction.rawDataHex,
            }),
          }),
        });
      });

      it('throws error if user rejects transaction signing', async () => {
        mockConfirmationHandler.handleKeyringRequest.mockResolvedValue(false);

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000005',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              transaction: {
                rawDataHex: toHex('transaction-data'),
                type: 'TransferContract',
              },
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          UserRejectedRequestError,
        );
      });
    });

    describe('validation', () => {
      it('throws error for invalid scope', async () => {
        const invalidAccount = {
          ...mockAccount,
          scopes: [Network.Mainnet],
        };
        mockAccountsService.findById.mockResolvedValue(invalidAccount);

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000006',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Shasta,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          'is not allowed for this account',
        );
      });

      it('throws error for unsupported method', async () => {
        const invalidAccount = {
          ...mockAccount,
          methods: [TronMultichainMethod.SignMessage],
        };
        mockAccountsService.findById.mockResolvedValue(invalidAccount);

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000007',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              transaction: {
                rawDataHex: toHex('transaction-data'),
                type: 'TransferContract',
              },
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          'is not allowed for this account',
        );
      });

      it('throws error for malformed request structure', async () => {
        const invalidRequest = {
          id: '00000000-0000-4000-8000-000000000008',
          origin: 'https://test-origin.com',
          account: 'invalid-uuid',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {},
          },
        } as unknown as KeyringRequest;

        await expect(
          keyringHandler.submitRequest(invalidRequest),
        ).rejects.toThrow('UuidV4');
      });

      it('throws error for missing params', async () => {
        const request = {
          id: '00000000-0000-4000-8000-000000000009',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            // Missing params
          },
        } as unknown as KeyringRequest;

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          'satisfy a union',
        );
      });
    });

    describe('error handling', () => {
      it('propagates wallet service errors', async () => {
        mockWalletService.handleKeyringRequest.mockRejectedValue(
          new Error('Signing failed'),
        );

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000010',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          'Signing failed',
        );
      });

      it('propagates confirmation handler errors', async () => {
        mockConfirmationHandler.handleKeyringRequest.mockRejectedValue(
          new Error('Confirmation failed'),
        );

        const request: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000011',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        await expect(keyringHandler.submitRequest(request)).rejects.toThrow(
          'Confirmation failed',
        );
      });
    });

    describe('multiple accounts', () => {
      it('handles different accounts correctly', async () => {
        const account2: TronKeyringAccount = {
          ...mockAccount,
          id: '987e6543-e89b-42d3-a456-426614174999',
          address: 'TGehVcNhud84JDCGrNHKVz9jEAVKUpbuiv',
        };

        mockAccountsService.findById
          .mockResolvedValueOnce(mockAccount)
          .mockResolvedValueOnce(account2);

        const request1: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000012',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: mockAccount.address,
              message: toBase64('Message 1'),
            },
          },
        };

        const request2: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000013',
          origin: 'https://test-origin.com',
          account: account2.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: account2.address,
              message: toBase64('Message 2'),
            },
          },
        };

        await keyringHandler.submitRequest(request1);
        await keyringHandler.submitRequest(request2);

        expect(mockAccountsService.findById).toHaveBeenCalledTimes(2);
        expect(mockWalletService.handleKeyringRequest).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ account: mockAccount }),
        );
        expect(mockWalletService.handleKeyringRequest).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ account: account2 }),
        );
      });
    });

    describe('multiple networks', () => {
      it('handles different networks correctly', async () => {
        const mainnetRequest: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000014',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Mainnet'),
            },
          },
        };

        const shastaRequest: KeyringRequest = {
          id: '00000000-0000-4000-8000-000000000015',
          origin: 'https://test-origin.com',
          account: mockAccount.id,
          scope: Network.Shasta,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Shasta'),
            },
          },
        };

        await keyringHandler.submitRequest(mainnetRequest);
        await keyringHandler.submitRequest(shastaRequest);

        expect(mockWalletService.handleKeyringRequest).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ scope: Network.Mainnet }),
        );
        expect(mockWalletService.handleKeyringRequest).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ scope: Network.Shasta }),
        );
      });
    });
  });

  describe('setSelectedAccounts', () => {
    const NON_EXISTENT_ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174999';

    it('schedules a background sync for known accounts', async () => {
      await keyringHandler.setSelectedAccounts([mockAccount.id]);

      expect(mockSnapClient.scheduleBackgroundEvent).toHaveBeenCalledWith({
        method: 'onSynchronizeSelectedAccounts',
        params: { accountIds: [mockAccount.id] },
        duration: 'PT1S',
      });
    });

    it('rejects if an account id is not a valid UUID', async () => {
      await expect(
        keyringHandler.setSelectedAccounts([mockAccount.id, 'not-a-uuid']),
      ).rejects.toThrow(InvalidParamsError);

      expect(mockSnapClient.scheduleBackgroundEvent).not.toHaveBeenCalled();
    });

    it('rejects if an account id is not part of existing accounts', async () => {
      await expect(
        keyringHandler.setSelectedAccounts([
          mockAccount.id,
          NON_EXISTENT_ACCOUNT_ID,
        ]),
      ).rejects.toThrow(InvalidParamsError);

      expect(mockSnapClient.scheduleBackgroundEvent).not.toHaveBeenCalled();
    });
  });

  describe('getAccounts', () => {
    it('fails with cause', async () => {
      const causeError = new Error('Account error');

      mockAccountsService.getAll.mockRejectedValue(causeError);

      await expect(keyringHandler.getAccounts()).rejects.toThrow(
        'Error listing accounts',
      );
    });
  });

  describe('createAccounts', () => {
    it('delegates to accountsService.createAccounts and returns the result', async () => {
      const createdAccounts = [
        {
          id: mockAccount.id,
          address: mockAccount.address,
          type: mockAccount.type,
          options: mockAccount.options,
          methods: mockAccount.methods,
          scopes: mockAccount.scopes,
        },
      ];
      const options: KeyringBatchCreateAccountOptions = {
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: 'entropy-source-1',
        groupIndex: 0,
      };

      mockAccountsService.createAccounts.mockResolvedValue(createdAccounts);

      const result = await keyringHandler.createAccounts(options);

      expect(mockAccountsService.createAccounts).toHaveBeenCalledWith(options);
      expect(result).toStrictEqual(createdAccounts);
    });

    it('sanitizes errors before rethrowing from accountsService.createAccounts', async () => {
      mockAccountsService.createAccounts.mockRejectedValue(
        new Error('batch create failed'),
      );

      await expect(
        keyringHandler.createAccounts({
          type: AccountCreationType.Bip44DeriveIndex,
          entropySource: 'entropy-source-1',
          groupIndex: 0,
        } satisfies KeyringBatchCreateAccountOptions),
      ).rejects.toThrow(
        'Key derivation failed. Please check your connection and try again.',
      );
    });

    it('delegates bip44:discover to accountsService.createAccounts and returns the account', async () => {
      const createdAccounts = [
        {
          id: mockAccount.id,
          address: mockAccount.address,
          type: mockAccount.type,
          options: mockAccount.options,
          methods: mockAccount.methods,
          scopes: mockAccount.scopes,
        },
      ];
      const options: KeyringBatchCreateAccountOptions = {
        type: AccountCreationType.Bip44Discover,
        entropySource: 'entropy-source-1',
        groupIndex: 0,
      };

      mockAccountsService.createAccounts.mockResolvedValue(createdAccounts);

      const result = await keyringHandler.createAccounts(options);

      expect(mockAccountsService.createAccounts).toHaveBeenCalledWith(options);
      expect(result).toStrictEqual(createdAccounts);
    });

    it('delegates bip44:discover to accountsService.createAccounts and returns empty array when no activity', async () => {
      const options: KeyringBatchCreateAccountOptions = {
        type: AccountCreationType.Bip44Discover,
        entropySource: 'entropy-source-1',
        groupIndex: 5,
      };

      mockAccountsService.createAccounts.mockResolvedValue([]);

      const result = await keyringHandler.createAccounts(options);

      expect(mockAccountsService.createAccounts).toHaveBeenCalledWith(options);
      expect(result).toStrictEqual([]);
    });
  });

  describe('getAccountAssets', () => {
    it('returns asset types for an account', async () => {
      const result = await keyringHandler.getAccountAssets(mockAccount.id);

      expect(result).toStrictEqual([]);
      expect(mockAssetsService.getByKeyringAccountId).toHaveBeenCalledWith(
        mockAccount.id,
      );
    });

    it('throws when the account is not found', async () => {
      mockAccountsService.findById.mockResolvedValue(null);

      await expect(
        keyringHandler.getAccountAssets(mockAccount.id),
      ).rejects.toThrow('not found');
    });
  });

  describe('getAccountTransactions', () => {
    it('returns paginated transactions for an account', async () => {
      const result = await keyringHandler.getAccountTransactions(
        mockAccount.id,
        { limit: 10, next: null },
      );

      expect(result).toStrictEqual({ data: [], next: null });
      expect(mockTransactionsService.findByAccounts).toHaveBeenCalledWith([
        mockAccount,
      ]);
    });
  });

  describe('exportAccount', () => {
    const validPrivateKeyHex = 'a'.repeat(64);

    it('returns the private key with default hexadecimal encoding', async () => {
      const result = await keyringHandler.exportAccount(mockAccount.id);

      expect(result).toStrictEqual({
        type: 'private-key',
        encoding: 'hexadecimal',
        privateKey: validPrivateKeyHex,
      });
      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });
    });

    it('returns the private key with explicit hexadecimal encoding', async () => {
      const options: ExportAccountOptions = {
        type: 'private-key',
        encoding: 'hexadecimal',
      };

      const result = await keyringHandler.exportAccount(
        mockAccount.id,
        options,
      );

      expect(result).toStrictEqual({
        type: 'private-key',
        encoding: 'hexadecimal',
        privateKey: validPrivateKeyHex,
      });
    });

    it('throws when the account is not found', async () => {
      mockAccountsService.findById.mockResolvedValue(null);

      await expect(
        keyringHandler.exportAccount(mockAccount.id),
      ).rejects.toThrow('not found');
    });

    it('throws when a non-hexadecimal encoding is requested', async () => {
      const options = {
        type: 'private-key',
        encoding: 'base58',
      } as unknown as ExportAccountOptions;

      await expect(
        keyringHandler.exportAccount(mockAccount.id, options),
      ).rejects.toThrow('Only hexadecimal private key export is supported');
    });

    it('throws SnapError when key derivation fails', async () => {
      mockAccountsService.deriveTronKeypair.mockRejectedValue(
        new Error('derivation failed'),
      );

      await expect(
        keyringHandler.exportAccount(mockAccount.id),
      ).rejects.toThrow('Error exporting account');
    });

    it('throws SnapError when the derived private key fails hex validation', async () => {
      mockAccountsService.deriveTronKeypair.mockResolvedValue({
        privateKeyHex: 'not-valid-hex',
        privateKeyBytes: new Uint8Array(32),
        publicKeyBytes: new Uint8Array(33),
        address: mockAccount.address,
      });

      await expect(
        keyringHandler.exportAccount(mockAccount.id),
      ).rejects.toThrow('Error exporting account');
    });
  });
});
