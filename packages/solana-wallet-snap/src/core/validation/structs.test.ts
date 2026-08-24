/* eslint-disable jest/require-to-throw-message */
import { assert, is } from '@metamask/superstruct';

import { Base58Struct, Base64Struct, UuidStruct } from './structs';

describe('structs', () => {
  describe('Uuid', () => {
    it('validates valid UUIDs', () => {
      const validUuids = [
        'c747acb9-1b2b-4352-b9da-3d658fcc3cc7',
        '2507a426-ac26-43c4-a82a-250f5d999398',
        '52d181f4-d050-4971-b448-17c15107fa3b',
      ];

      validUuids.forEach((uuid) => {
        expect(() => assert(uuid, UuidStruct)).not.toThrow();
        expect(is(uuid, UuidStruct)).toBe(true);
      });
    });
  });

  describe('Base58Struct', () => {
    it('validates valid Base58 strings', () => {
      const validBase58Strings = [
        '72k1xXWG59wUsYv7h2', // Decoded: "Hello, world!"
        '3yZe7d', // Decoded: "Test"
        'JxF12TrwUP45BMd', // Decoded: "Base58 Example"
        '5Q444645Hz4hD7AuSj5z8m6jKLd3TxoMwp4Y7UWVKGqy', // Example Solana address
        'Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD', // Example IPFS hash
        '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', // All valid Base58 chars
      ];

      validBase58Strings.forEach((base58String) => {
        expect(() => assert(base58String, Base58Struct)).not.toThrow();
        expect(is(base58String, Base58Struct)).toBe(true);
      });
    });

    it('rejects invalid Base58 strings', () => {
      const invalidBase58Strings = [
        'invalid-base58-string',
        '', // empty string
        '0', // 0 is not used in Base58
        'O', // uppercase O is not used in Base58
        'l', // lowercase L is not used in Base58
        'I', // uppercase i is not used in Base58
        'hello world', // spaces not allowed
        'base+58', // special characters not allowed
        '12345!', // exclamation mark not allowed
        'ABC 123', // spaces not allowed
        'TEST@123', // @ symbol not allowed
        '你好', // non-ASCII characters
        'BASE_58', // underscore not allowed
        'test\n123', // newlines not allowed
        'test\t123', // tabs not allowed
      ];

      invalidBase58Strings.forEach((base58String) => {
        expect(() => assert(base58String, Base58Struct)).toThrow();
        expect(is(base58String, Base58Struct)).toBe(false);
      });
    });
  });

  describe('Base64Struct', () => {
    it('validates valid Base64 strings', () => {
      const validBase64Strings = [
        'SGVsbG8sIFdvcmxkIQ==', // "Hello, World!"
        'dGVzdA==', // "test"
        'YWJzb2x1dGU=', // "aBc"
        'aGVsbG8=', // "hello"
        'aGVsbG8sIHdvcmxkIQ==', // "hello, world!"
      ];

      validBase64Strings.forEach((base64String) => {
        expect(() => assert(base64String, Base64Struct)).not.toThrow();
        expect(is(base64String, Base64Struct)).toBe(true);
      });
    });

    it('rejects invalid Base64 strings', () => {
      const invalidBase64Strings = [
        // Invalid characters
        'ABC!DEF', // Contains '!' which is not in Base64 alphabet
        'ABC DEF', // Contains space which is not in Base64 alphabet
        'ABC_DEF', // Contains '_' which is not in standard Base64 (but is in URL-safe variant)
        'ABC-DEF', // Contains '-' which is not in standard Base64 (but is in URL-safe variant)

        // Invalid padding
        'A=', // Single character with padding (should be 'A===')
        'AB=', // Two characters with single padding (should be 'AB==')
        'ABC=A', // Padding in the middle
        'ABCD=', // Padding when not needed (length is multiple of 4)
        'A===', // Too much padding for a single character
        'AB===', // Too much padding for two characters
        'ABC==', // Too much padding for three characters

        // Invalid length
        'A', // Single character without proper padding
        'AB', // Two characters without proper padding
        'ABC', // Three characters without proper padding

        // Padding in wrong position
        '=ABC', // Padding at the beginning
        'A=BC', // Padding in the middle
        'AB=C', // Padding in the middle

        // Mixed issues
        'A=B=C=', // Multiple padding characters in wrong positions
        'AB!C=', // Invalid character and padding
        'ABCDE=', // Length not a multiple of 4 with incorrect padding

        // Empty string
        '', // Empty string is not valid Base64

        // URL-safe Base64 characters in standard Base64
        'ABC-DEF+GHI', // Mixed URL-safe and standard Base64
        'ABC_DEF/GHI', // Mixed URL-safe and standard Base64
      ];

      invalidBase64Strings.forEach((base64String) => {
        expect(() => assert(base64String, Base64Struct)).toThrow(base64String);
        expect(is(base64String, Base64Struct)).toBe(false);
      });
    });
  });
});
