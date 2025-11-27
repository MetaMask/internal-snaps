import { assert, StructError } from '@metamask/superstruct';
import { bytesToBase64, stringToBytes } from '@metamask/utils';

import { Network } from '../constants';
import {
  SignMessageRequestStruct,
  SignTransactionRequestStruct,
  TronKeyringRequestStruct,
} from './structs';
import { TronMultichainMethod } from '../handlers/keyring-types';

// Helper function to convert string to base64
const toBase64 = (str: string): string => bytesToBase64(stringToBytes(str));

describe('Keyring Validation Structs', () => {
  describe('SignMessageRequestStruct', () => {
    it('validates valid signMessage params', () => {
      const validParams = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        message: toBase64('Hello World'),
      };

      expect(() => assert(validParams, SignMessageRequestStruct)).not.toThrow();
    });

    it('rejects invalid address', () => {
      const invalidParams = {
        address: 'invalid-address',
        message: toBase64('Hello'),
      };

      expect(() => assert(invalidParams, SignMessageRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects invalid base64 message', () => {
      const invalidParams = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        message: 'not-base64!!!',
      };

      expect(() => assert(invalidParams, SignMessageRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects missing address', () => {
      const invalidParams = {
        message: toBase64('Hello'),
      };

      expect(() => assert(invalidParams, SignMessageRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects missing message', () => {
      const invalidParams = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
      };

      expect(() => assert(invalidParams, SignMessageRequestStruct)).toThrow(
        StructError,
      );
    });
  });

  describe('SignTransactionRequestStruct', () => {
    it('validates valid signTransaction params', () => {
      const validParams = {
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        transaction: toBase64('transaction-data'),
      };

      expect(() =>
        assert(validParams, SignTransactionRequestStruct),
      ).not.toThrow();
    });

    it('rejects invalid scope', () => {
      const invalidParams = {
        address: 'not-a-tron-address',
        transaction: toBase64('transaction-data'),
      };

      expect(() => assert(invalidParams, SignTransactionRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects invalid address', () => {
      const invalidParams = {
        address: 'not-a-tron-address',
        transaction: 'invalid-base64!!!',
      };

      expect(() => assert(invalidParams, SignTransactionRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects invalid base64 transaction', () => {
      const invalidParams = {
        scope: Network.Mainnet,
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
        transaction: 'not-base64!!!',
      };

      expect(() => assert(invalidParams, SignTransactionRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects missing address', () => {
      const invalidParams = {
        transaction: toBase64('transaction-data'),
      };

      expect(() => assert(invalidParams, SignTransactionRequestStruct)).toThrow(
        StructError,
      );
    });

    it('rejects missing transaction', () => {
      const invalidParams = {
        scope: Network.Mainnet,
        address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
      };

      expect(() => assert(invalidParams, SignTransactionRequestStruct)).toThrow(
        StructError,
      );
    });
  });

  describe('TronKeyringRequestStruct', () => {
    describe('signMessage requests', () => {
      it('validates valid signMessage KeyringRequest', () => {
        const validRequest = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() =>
          assert(validRequest, TronKeyringRequestStruct),
        ).not.toThrow();
      });

      it('rejects invalid account UUID', () => {
        const invalidRequest = {
          account: 'not-a-uuid',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() => assert(invalidRequest, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });

      it('rejects missing scope', () => {
        const invalidRequest = {
          account: '123e4567-e89b-42d3-a456-426614174000',
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() => assert(invalidRequest, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });

      it('rejects invalid method', () => {
        const invalidRequest = {
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: 'invalidMethod',
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() => assert(invalidRequest, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });

      it('rejects missing params', () => {
        const invalidRequest = {
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
          },
        };

        expect(() => assert(invalidRequest, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });
    });

    describe('signTransaction requests', () => {
      it('validates valid signTransaction KeyringRequest', () => {
        const validRequest = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              transaction: toBase64('tx-data'),
            },
          },
        };

        expect(() =>
          assert(validRequest, TronKeyringRequestStruct),
        ).not.toThrow();
      });

      it('validates signTransaction with different scopes', () => {
        const validRequest = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Shasta,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              transaction: toBase64('transaction-data'),
            },
          },
        };

        expect(() =>
          assert(validRequest, TronKeyringRequestStruct),
        ).not.toThrow();
      });

      it('rejects invalid transaction params', () => {
        const invalidRequest = {
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignTransaction,
            params: {
              // Missing required fields
              scope: Network.Mainnet,
            },
          },
        };

        expect(() => assert(invalidRequest, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });
    });

    describe('edge cases', () => {
      it('rejects empty request object', () => {
        const invalidRequest = {};

        expect(() => assert(invalidRequest, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });

      it('rejects null request', () => {
        expect(() => assert(null, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });

      it('rejects undefined request', () => {
        expect(() => assert(undefined, TronKeyringRequestStruct)).toThrow(
          StructError,
        );
      });

      it('rejects request with extra fields', () => {
        const requestWithExtra = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
          extraField: 'should-not-be-here',
        };

        // Note: KeyringRequestStruct does not allow extra fields
        // This test verifies strict validation
        expect(() =>
          assert(requestWithExtra, TronKeyringRequestStruct),
        ).toThrow(StructError);
      });
    });

    describe('network scopes', () => {
      it('validates Mainnet scope', () => {
        const request = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Mainnet,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() => assert(request, TronKeyringRequestStruct)).not.toThrow();
      });

      it('validates Shasta scope', () => {
        const request = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Shasta,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() => assert(request, TronKeyringRequestStruct)).not.toThrow();
      });

      it('validates Nile scope', () => {
        const request = {
          id: '12345678-1234-4234-8234-123456789012',
          origin: 'test-dapp.com',
          account: '123e4567-e89b-42d3-a456-426614174000',
          scope: Network.Nile,
          request: {
            method: TronMultichainMethod.SignMessage,
            params: {
              address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
              message: toBase64('Hello'),
            },
          },
        };

        expect(() => assert(request, TronKeyringRequestStruct)).not.toThrow();
      });
    });
  });
});
