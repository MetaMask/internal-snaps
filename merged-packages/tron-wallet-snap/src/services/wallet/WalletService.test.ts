import { SnapError } from '@metamask/snaps-sdk';
import { bytesToBase64, stringToBytes } from '@metamask/utils';

import { WalletService } from './WalletService';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import {
  TronMultichainErrors,
  TronMultichainMethod,
} from '../../handlers/keyring-types';
import { mockLogger } from '../../utils/mockLogger';
import type { AccountsService } from '../accounts/AccountsService';

/**
 * Helper function to convert string to base64.
 *
 * @param str - The string to convert.
 * @returns Base64 encoded string.
 */
function toBase64(str: string): string {
  return bytesToBase64(stringToBytes(str));
}

describe('WalletService', () => {
  const mockTronKeypair = {
    privateKeyBytes: new Uint8Array(32),
    publicKeyBytes: new Uint8Array(33),
    privateKeyHex: 'abcd1234privatekey',
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
  };

  const mockAccount: TronKeyringAccount = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    options: {},
    methods: ['signMessage', 'signTransaction'],
    type: 'tron:eoa',
    scopes: [Network.Mainnet, Network.Shasta],
    entropySource: 'entropy-source-1' as any,
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  let walletService: WalletService;
  let mockAccountsService: jest.Mocked<AccountsService>;
  let mockTronWebFactory: jest.Mocked<TronWebFactory>;
  let mockTronWeb: any;

  beforeEach(() => {
    mockTronWeb = {
      trx: {
        signMessageV2: jest.fn().mockReturnValue('0xsignature123'),
        sign: jest.fn().mockResolvedValue({
          signature: ['abcd1234signature'],
        }),
      },
      utils: {
        transaction: {
          txPbToTxID: jest.fn().mockReturnValue({ txID: 'tx123' }),
        },
      },
      isAddress: jest.fn().mockReturnValue(true),
    };

    mockAccountsService = {
      deriveTronKeypair: jest.fn().mockResolvedValue(mockTronKeypair),
    } as any;

    mockTronWebFactory = {
      createClient: jest.fn().mockReturnValue(mockTronWeb),
    } as any;

    walletService = new WalletService({
      logger: mockLogger,
      accountsService: mockAccountsService,
      tronWebFactory: mockTronWebFactory,
    });
  });

  describe('handleKeyringRequest', () => {
    it('routes signMessage requests correctly', async () => {
      const params = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        message: toBase64('Hello World'),
      };

      const result = await walletService.handleKeyringRequest({
        account: mockAccount,
        scope: Network.Mainnet,
        method: TronMultichainMethod.SignMessage,
        params,
      });

      expect(result).toStrictEqual({ signature: '0xsignature123' });
      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });
    });

    it('routes signTransaction requests correctly', async () => {
      const params = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        transaction: toBase64('transaction-data'),
      };

      const result = await walletService.handleKeyringRequest({
        account: mockAccount,
        scope: Network.Mainnet,
        method: TronMultichainMethod.SignTransaction,
        params,
      });

      expect(result).toStrictEqual({ signature: '0xabcd1234signature' });
    });

    it('throws SnapError for unsupported methods', async () => {
      await expect(
        walletService.handleKeyringRequest({
          account: mockAccount,
          scope: Network.Mainnet,
          method: 'unsupportedMethod' as any,
          params: {},
        }),
      ).rejects.toThrow(SnapError);
    });

    it('handles user rejection errors', async () => {
      mockTronWeb.trx.signMessageV2.mockImplementation(() => {
        const error: any = new Error('User rejected');
        error.code = 4100;
        throw error;
      });

      await expect(
        walletService.handleKeyringRequest({
          account: mockAccount,
          scope: Network.Mainnet,
          method: TronMultichainMethod.SignMessage,
          params: {
            address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
            message: toBase64('Hello'),
          },
        }),
      ).rejects.toThrow(TronMultichainErrors.UserRejected.message);
    });

    it('handles invalid parameter errors', async () => {
      await expect(
        walletService.handleKeyringRequest({
          account: mockAccount,
          scope: Network.Mainnet,
          method: TronMultichainMethod.SignMessage,
          params: {
            // Missing required fields
          },
        }),
      ).rejects.toThrow('Expected a');
    });
  });

  describe('signMessage', () => {
    it('signs a message successfully', async () => {
      const params = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        message: toBase64('Hello World'),
      };

      const result = await walletService.signMessage({
        account: mockAccount,
        scope: Network.Mainnet,
        params,
      });

      expect(result).toStrictEqual({ signature: '0xsignature123' });
      expect(mockAccountsService.deriveTronKeypair).toHaveBeenCalledWith({
        entropySource: mockAccount.entropySource,
        derivationPath: mockAccount.derivationPath,
      });
      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        mockTronKeypair.privateKeyHex,
      );
      expect(mockTronWeb.trx.signMessageV2).toHaveBeenCalledWith(
        'Hello World',
        mockTronKeypair.privateKeyHex,
      );
    });

    it('decodes base64 message before signing', async () => {
      const originalMessage = 'Test Message 123';
      const params = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        message: toBase64(originalMessage),
      };

      await walletService.signMessage({
        account: mockAccount,
        scope: Network.Mainnet,
        params,
      });

      expect(mockTronWeb.trx.signMessageV2).toHaveBeenCalledWith(
        originalMessage,
        expect.any(String),
      );
    });

    it('throws error for invalid params', async () => {
      await expect(
        walletService.signMessage({
          account: mockAccount,
          scope: Network.Mainnet,
          params: {
            // Missing required fields
          },
        }),
      ).rejects.toThrow('Expected a');
    });
  });

  describe('signTransaction', () => {
    it('signs a transaction successfully', async () => {
      const transactionData = 'transaction-data-bytes';
      const params = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        transaction: toBase64(transactionData),
      };

      const result = await walletService.signTransaction({
        account: mockAccount,
        scope: Network.Mainnet,
        params,
      });

      expect(result).toStrictEqual({ signature: '0xabcd1234signature' });
      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Mainnet,
        mockTronKeypair.privateKeyHex,
      );
    });

    it('deserializes transaction from base64', async () => {
      const params = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        transaction: toBase64('tx-data'),
      };

      await walletService.signTransaction({
        account: mockAccount,
        scope: Network.Mainnet,
        params,
      });

      expect(mockTronWeb.utils.transaction.txPbToTxID).toHaveBeenCalled();
      expect(mockTronWeb.trx.sign).toHaveBeenCalled();
    });

    it('handles transaction format errors', async () => {
      mockTronWeb.utils.transaction.txPbToTxID.mockImplementation(() => {
        throw new Error('Failed to deserialize transaction');
      });

      await expect(
        walletService.signTransaction({
          account: mockAccount,
          scope: Network.Mainnet,
          params: {
            address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
            transaction: toBase64('valid-but-unparseable-transaction-data'),
          },
        }),
      ).rejects.toThrow('Failed to deserialize transaction');
    });

    it('throws error for invalid params', async () => {
      await expect(
        walletService.signTransaction({
          account: mockAccount,
          scope: Network.Mainnet,
          params: {
            // Missing required fields
          },
        }),
      ).rejects.toThrow('Expected');
    });

    it('prefixes signature with 0x', async () => {
      mockTronWeb.trx.sign.mockResolvedValue({
        signature: ['abcdef123456'],
      });

      const result = await walletService.signTransaction({
        account: mockAccount,
        scope: Network.Mainnet,
        params: {
          address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
          transaction: toBase64('transaction-data'),
        },
      });

      expect(result.signature).toMatch(/^0x/u);
      expect(result.signature).toBe('0xabcdef123456');
    });

    it('handles empty signature array', async () => {
      mockTronWeb.trx.sign.mockResolvedValue({
        signature: [],
      });

      const result = await walletService.signTransaction({
        account: mockAccount,
        scope: Network.Mainnet,
        params: {
          address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
          transaction: toBase64('transaction-data'),
        },
      });

      expect(result.signature).toBe('0x');
    });
  });

  describe('resolveAccountAddress', () => {
    const keyringAccounts = [
      {
        ...mockAccount,
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        scopes: [Network.Mainnet, Network.Shasta],
      },
      {
        ...mockAccount,
        id: '987e6543-e89b-42d3-a456-426614174999',
        address: 'TGehVcNhud84JDCGrNHKVz9jEAVKUpbuiv',
        scopes: [Network.Mainnet],
      },
    ];

    it('resolves valid Tron address for signMessage', async () => {
      const scope = Network.Mainnet;
      const address = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signMessage',
        params: { address, message: toBase64('test') },
      };

      mockTronWeb.isAddress.mockReturnValue(true);

      const result = await walletService.resolveAccountAddress(
        keyringAccounts,
        scope,
        request,
      );

      expect(result).toStrictEqual({ address: `${scope}:${address}` });
      expect(mockTronWeb.isAddress).toHaveBeenCalledWith(address);
    });

    it('resolves valid Tron address for signTransaction', async () => {
      const scope = Network.Mainnet;
      const address = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signTransaction',
        params: {
          scope,
          address,
          transaction: toBase64('transaction-data'),
        },
      };

      mockTronWeb.isAddress.mockReturnValue(true);

      const result = await walletService.resolveAccountAddress(
        keyringAccounts,
        scope,
        request,
      );

      expect(result).toStrictEqual({ address: `${scope}:${address}` });
      expect(mockTronWeb.isAddress).toHaveBeenCalledWith(address);
    });

    it('throws error for invalid address', async () => {
      const scope = Network.Mainnet;
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signMessage',
        params: { address: 'invalid-address', message: toBase64('test') },
      };

      mockTronWeb.isAddress.mockReturnValue(false);

      await expect(
        walletService.resolveAccountAddress(keyringAccounts, scope, request),
      ).rejects.toThrow('Invalid Tron address');
    });

    it('throws error for missing address parameter', async () => {
      const scope = Network.Mainnet;
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signMessage',
        params: { message: toBase64('test') },
      };

      await expect(
        walletService.resolveAccountAddress(keyringAccounts, scope, request),
      ).rejects.toThrow('Address parameter is required');
    });

    it('throws error for account not in keyring', async () => {
      const scope = Network.Mainnet;
      const address = 'TUnknownAddressNotInKeyring1234567890';
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signMessage',
        params: { address, message: toBase64('test') },
      };

      mockTronWeb.isAddress.mockReturnValue(true);

      await expect(
        walletService.resolveAccountAddress(keyringAccounts, scope, request),
      ).rejects.toThrow('Account not found in keyring');
    });

    it('throws error for no accounts with scope', async () => {
      const scope = Network.Nile;
      const address = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signMessage',
        params: { address, message: toBase64('test') },
      };

      await expect(
        walletService.resolveAccountAddress(keyringAccounts, scope, request),
      ).rejects.toThrow('No accounts with scope');
    });

    it('throws error for unsupported method', async () => {
      const scope = Network.Mainnet;
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'unsupportedMethod',
        params: { address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8' },
      };

      await expect(
        walletService.resolveAccountAddress(keyringAccounts, scope, request),
      ).rejects.toThrow('Expected one of');
    });

    it('resolves address for different networks', async () => {
      const address = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'signMessage',
        params: { address, message: toBase64('test') },
      };

      mockTronWeb.isAddress.mockReturnValue(true);

      const shastaResult = await walletService.resolveAccountAddress(
        keyringAccounts,
        Network.Shasta,
        request,
      );

      expect(shastaResult).toStrictEqual({
        address: `${Network.Shasta}:${address}`,
      });
      expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
        Network.Shasta,
        '0'.repeat(64),
      );
    });

    it('throws error for missing method', async () => {
      const scope = Network.Mainnet;
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        params: { address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8' },
      } as any;

      await expect(
        walletService.resolveAccountAddress(keyringAccounts, scope, request),
      ).rejects.toThrow('Expected one of');
    });
  });
});
