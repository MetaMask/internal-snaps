import type { ScriptBuf } from '@metamask/bitcoindevkit';
import { mock } from 'jest-mock-extended';

import type { AccountMetadata, AccountState } from '../entities';
import { WalletError } from '../entities';
import { StoredAccountAdapter } from './StoredAccountAdapter';

jest.mock('@metamask/bitcoindevkit', () => ({
  Address: {
    from_string: jest.fn(),
  },
}));

describe('StoredAccountAdapter', () => {
  const mockId = 'test-id';
  const mockScript = mock<ScriptBuf>();
  const mockMetadata: AccountMetadata = {
    address: 'bc1qcached...',
    addressType: 'p2wpkh',
    network: 'bitcoin',
    publicDescriptor: 'cached-public-descriptor',
  };
  const mockAccountState: AccountState & { metadata: AccountMetadata } = {
    derivationPath: ['entropy', "84'", "0'", "0'"],
    wallet: '{"mywallet":"data"}',
    inscriptions: [],
    metadata: mockMetadata,
  };

  const adapter = (): StoredAccountAdapter =>
    StoredAccountAdapter.load(mockId, mockAccountState);

  describe('canLoad', () => {
    it('returns true when the account carries metadata', () => {
      expect(StoredAccountAdapter.canLoad(mockAccountState)).toBe(true);
    });

    it('returns false when the account has no metadata', () => {
      const accountWithoutMetadata: AccountState = {
        derivationPath: mockAccountState.derivationPath,
        wallet: mockAccountState.wallet,
        inscriptions: [],
      };

      expect(StoredAccountAdapter.canLoad(accountWithoutMetadata)).toBe(false);
    });
  });

  describe('load', () => {
    it('returns a StoredAccountAdapter instance', () => {
      expect(adapter()).toBeInstanceOf(StoredAccountAdapter);
    });
  });

  describe('isChange', () => {
    it('throws a WalletError since stored metadata cannot inspect scripts', () => {
      expect(() => adapter().isChange(mockScript)).toThrow(WalletError);
    });

    it('names the account in the error data', () => {
      expect(() => adapter().isChange(mockScript)).toThrow(
        expect.objectContaining({ data: { id: mockId } }),
      );
    });
  });

  describe('isMine', () => {
    it('throws a WalletError since stored metadata cannot inspect scripts', () => {
      expect(() => adapter().isMine(mockScript)).toThrow(WalletError);
    });
  });
});
