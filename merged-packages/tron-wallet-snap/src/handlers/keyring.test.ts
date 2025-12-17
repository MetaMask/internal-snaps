import type { KeyringRequest } from '@metamask/keyring-api';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';
import { bytesToBase64, bytesToHex, stringToBytes } from '@metamask/utils';

import type { SnapClient } from '../clients/snap/SnapClient';
import { Network } from '../constants';
import type { TronKeyringAccount } from '../entities';
import { KeyringHandler } from './keyring';
import { TronMultichainMethod } from './keyring-types';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { AssetsService } from '../services/assets/AssetsService';
import type { ConfirmationHandler } from '../services/confirmation/ConfirmationHandler';
import type { TransactionsService } from '../services/transactions/TransactionsService';
import type { WalletService } from '../services/wallet/WalletService';
import { mockLogger } from '../utils/mockLogger';

/**
 * Helper function to convert string to base64.
 *
 * @param str - The string to convert.
 * @returns Base64 encoded string.
 */
function toBase64(str: string): string {
  return bytesToBase64(stringToBytes(str));
}

/**
 * Helper function to convert string to hex.
 *
 * @param str - The string to convert.
 * @returns Hex encoded string (without 0x prefix).
 */
function toHex(str: string): string {
  return bytesToHex(stringToBytes(str)).slice(2);
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
    entropySource: 'entropy-source-1' as any,
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
    mockSnapClient = {} as any;
    mockAccountsService = {
      findById: jest.fn().mockResolvedValue(mockAccount),
      findByIdOrThrow: jest.fn().mockResolvedValue(mockAccount),
      deriveAccount: jest.fn(),
    } as any;
    mockAssetsService = {} as any;
    mockTransactionsService = {
      fetchTransactionsForAccount: jest.fn(),
    } as any;
    mockWalletService = {
      handleKeyringRequest: jest
        .fn()
        .mockResolvedValue({ signature: '0xsignature123' }),
    } as any;
    mockConfirmationHandler = {
      handleKeyringRequest: jest.fn().mockResolvedValue(true),
    } as any;

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
      it('successfully signs a transaction', async () => {
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

        const result = await keyringHandler.submitRequest(request);

        expect(result).toStrictEqual({
          pending: false,
          result: { signature: '0xsignature123' },
        });
        expect(mockWalletService.handleKeyringRequest).toHaveBeenCalledWith({
          account: mockAccount,
          scope: Network.Mainnet,
          method: TronMultichainMethod.SignTransaction,
          params: request.request.params,
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
        } as any;

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
        } as any;

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

  describe('discoverAccounts', () => {
    const mockDerivedAccount: TronKeyringAccount = {
      id: '123e4567-e89b-42d3-a456-426614174001',
      address: 'TDerivedAddress12345678901234567',
      options: {},
      methods: [
        TronMultichainMethod.SignMessage,
        TronMultichainMethod.SignTransaction,
      ],
      type: 'tron:eoa',
      scopes: [Network.Mainnet, Network.Shasta],
      entropySource: 'test-entropy-source' as any,
      derivationPath: "m/44'/195'/0'/0/0",
      index: 0,
    };

    // Minimal mock transaction that satisfies the Transaction type
    const mockTransaction = {
      id: 'tx-123',
      type: 'send' as const,
      status: 'confirmed' as const,
      timestamp: Date.now(),
      chain: 'tron:728126428' as const,
      account: mockAccount.id,
      from: [],
      to: [],
      fees: [],
      events: [],
    };

    beforeEach(() => {
      jest
        .spyOn(mockAccountsService, 'deriveAccount')
        .mockImplementation()
        .mockResolvedValue(mockDerivedAccount);
      jest
        .spyOn(mockTransactionsService, 'fetchTransactionsForAccount')
        .mockImplementation();
    });

    it('returns empty array if there is no activity on any of the scopes', async () => {
      mockTransactionsService.fetchTransactionsForAccount
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await keyringHandler.discoverAccounts?.(
        [Network.Mainnet, Network.Shasta],
        'test-entropy-source',
        0,
      );

      expect(result).toStrictEqual([]);
      expect(mockAccountsService.deriveAccount).toHaveBeenCalledWith({
        entropySource: 'test-entropy-source',
        index: 0,
      });
    });

    it('returns discovered accounts when there is activity on any scope', async () => {
      mockTransactionsService.fetchTransactionsForAccount
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockTransaction]);

      const result = await keyringHandler.discoverAccounts?.(
        [Network.Mainnet, Network.Shasta],
        'test-entropy-source',
        3,
      );

      expect(result).toStrictEqual([
        {
          type: 'bip44',
          scopes: [Network.Mainnet, Network.Shasta],
          derivationPath: mockDerivedAccount.derivationPath,
        },
      ]);
    });

    it('throws error if there is an error fetching transactions', async () => {
      mockTransactionsService.fetchTransactionsForAccount.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        keyringHandler.discoverAccounts?.([Network.Mainnet], 'test', 0),
      ).rejects.toThrow('Network error');
    });

    it('throws error if no scopes are provided', async () => {
      await expect(
        keyringHandler.discoverAccounts?.([], 'test', 0),
      ).rejects.toThrow('Expected a nonempty array but received an empty one');
      expect(
        mockTransactionsService.fetchTransactionsForAccount,
      ).not.toHaveBeenCalled();
    });

    it('throws error if scope is not a valid Tron network', async () => {
      await expect(
        keyringHandler.discoverAccounts?.(
          ['invalid:network' as Network],
          'test',
          0,
        ),
      ).rejects.toThrow(/Expected one of/u);
      expect(
        mockTransactionsService.fetchTransactionsForAccount,
      ).not.toHaveBeenCalled();
    });

    it('throws error if groupIndex is negative', async () => {
      await expect(
        keyringHandler.discoverAccounts?.([Network.Mainnet], 'test', -1),
      ).rejects.toThrow(
        'Expected a number greater than or equal to 0 but received `-1`',
      );
      expect(
        mockTransactionsService.fetchTransactionsForAccount,
      ).not.toHaveBeenCalled();
    });
  });
});
