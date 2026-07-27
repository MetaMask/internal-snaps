import { SnapError } from '@metamask/snaps-sdk';

import { isSnapRpcError, sanitizeSensitiveError } from './sensitiveErrors';

describe('sensitiveErrors', () => {
  describe('sanitizeSensitiveError', () => {
    it('returns the original error when no sensitive info exists', () => {
      const error = new Error('Network request failed');

      expect(sanitizeSensitiveError(error)).toBe(error);
    });

    it('returns the original value when no error exists', () => {
      expect(sanitizeSensitiveError(null)).toBeNull();
    });

    it('returns a generic error when the message contains sensitive info', () => {
      const error = new Error('Failed to derive private key');

      expect(sanitizeSensitiveError(error)).toStrictEqual(
        new Error(
          'Key derivation failed. Please check your connection and try again.',
        ),
      );
    });

    it('returns a generic error when the stack contains sensitive info', () => {
      const error = new Error('Failed to derive account');
      error.stack = 'Error: safe message\n    at mnemonicHandler.ts:1:1';

      expect(sanitizeSensitiveError(error)).toStrictEqual(
        new Error(
          'Key derivation failed. Please check your connection and try again.',
        ),
      );
    });

    it('preserves Snap RPC error types', () => {
      const error = new SnapError('private key failed');

      expect(sanitizeSensitiveError(error)).toBeInstanceOf(SnapError);
    });
  });

  describe('isSnapRpcError', () => {
    it('returns true for Snap RPC errors', () => {
      expect(isSnapRpcError(new SnapError('Snap error'))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isSnapRpcError(new Error('Unexpected error'))).toBe(false);
    });
  });
});
