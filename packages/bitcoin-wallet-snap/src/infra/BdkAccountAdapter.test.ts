import type {
  AddressInfo,
  ChangeSet,
  DescriptorPair,
  KeychainKind,
  Network,
  ScriptBuf,
  SpkIndexed,
} from '@metamask/bitcoindevkit';
import { Wallet } from '@metamask/bitcoindevkit';
import { mock } from 'jest-mock-extended';

import { WalletError } from '../entities';
import { BdkAccountAdapter } from './BdkAccountAdapter';

jest.mock('@metamask/bitcoindevkit', () => ({
  FeeRate: jest.fn(),
  OutPoint: { from_string: jest.fn() },
  SignOptions: jest.fn(),
  Txid: { from_string: jest.fn() },
  UnconfirmedTx: jest.fn(),
  Wallet: {
    create: jest.fn(),
    load: jest.fn(),
  },
}));

describe('BdkAccountAdapter', () => {
  const mockWallet = mock<Wallet>();
  const mockId = 'test-id';
  const mockDerivationPath = ['m', "84'", "0'", "0'"];
  const mockDescriptors = mock<DescriptorPair>({
    external: 'ext-desc',
    internal: 'int-desc',
  });
  const mockChangeSet = mock<ChangeSet>();
  const mockNetwork: Network = 'bitcoin';

  beforeEach(() => {
    jest.mocked(Wallet.create).mockReturnValue(mockWallet);
    jest.mocked(Wallet.load).mockReturnValue(mockWallet);
  });

  describe('WebAssembly availability guard', () => {
    let originalWebAssembly: typeof WebAssembly;

    beforeEach(() => {
      originalWebAssembly = globalThis.WebAssembly;
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'WebAssembly', {
        configurable: true,
        value: originalWebAssembly,
        writable: true,
      });
    });

    /** Simulates an environment where WebAssembly is unavailable (e.g., iOS Lockdown Mode). */
    function disableWebAssembly(): void {
      Object.defineProperty(globalThis, 'WebAssembly', {
        configurable: true,
        value: undefined,
        writable: true,
      });
    }

    describe('create', () => {
      it('throws WalletError when WebAssembly is unavailable', () => {
        disableWebAssembly();

        expect(() =>
          BdkAccountAdapter.create(
            mockId,
            mockDerivationPath,
            mockDescriptors,
            mockNetwork,
          ),
        ).toThrow(WalletError);
      });

      it('error message mentions iOS Lockdown Mode', () => {
        disableWebAssembly();

        expect(() =>
          BdkAccountAdapter.create(
            mockId,
            mockDerivationPath,
            mockDescriptors,
            mockNetwork,
          ),
        ).toThrow(/Lockdown Mode/u);
      });

      it('does not call Wallet.create when WebAssembly is unavailable', () => {
        disableWebAssembly();

        expect(() =>
          BdkAccountAdapter.create(
            mockId,
            mockDerivationPath,
            mockDescriptors,
            mockNetwork,
          ),
        ).toThrow(WalletError);
        expect(Wallet.create).not.toHaveBeenCalled();
      });

      it('calls Wallet.create when WebAssembly is available', () => {
        BdkAccountAdapter.create(
          mockId,
          mockDerivationPath,
          mockDescriptors,
          mockNetwork,
        );

        expect(Wallet.create).toHaveBeenCalledWith(
          mockNetwork,
          mockDescriptors.external,
          mockDescriptors.internal,
        );
      });

      it('returns a BdkAccountAdapter instance when WebAssembly is available', () => {
        const result = BdkAccountAdapter.create(
          mockId,
          mockDerivationPath,
          mockDescriptors,
          mockNetwork,
        );

        expect(result).toBeInstanceOf(BdkAccountAdapter);
      });
    });

    describe('load', () => {
      it('throws WalletError when WebAssembly is unavailable', () => {
        disableWebAssembly();

        expect(() =>
          BdkAccountAdapter.load(mockId, mockDerivationPath, mockChangeSet),
        ).toThrow(WalletError);
      });

      it('error message mentions iOS Lockdown Mode', () => {
        disableWebAssembly();

        expect(() =>
          BdkAccountAdapter.load(mockId, mockDerivationPath, mockChangeSet),
        ).toThrow(/Lockdown Mode/u);
      });

      it('does not call Wallet.load when WebAssembly is unavailable', () => {
        disableWebAssembly();

        expect(() =>
          BdkAccountAdapter.load(mockId, mockDerivationPath, mockChangeSet),
        ).toThrow(WalletError);
        expect(Wallet.load).not.toHaveBeenCalled();
      });

      it('calls Wallet.load without descriptors', () => {
        BdkAccountAdapter.load(mockId, mockDerivationPath, mockChangeSet);

        expect(Wallet.load).toHaveBeenCalledWith(mockChangeSet);
      });

      it('calls Wallet.load with descriptors', () => {
        BdkAccountAdapter.load(
          mockId,
          mockDerivationPath,
          mockChangeSet,
          mockDescriptors,
        );

        expect(Wallet.load).toHaveBeenCalledWith(
          mockChangeSet,
          mockDescriptors.external,
          mockDescriptors.internal,
        );
      });

      it('returns a BdkAccountAdapter instance when WebAssembly is available', () => {
        const result = BdkAccountAdapter.load(
          mockId,
          mockDerivationPath,
          mockChangeSet,
        );

        expect(result).toBeInstanceOf(BdkAccountAdapter);
      });
    });
  });

  describe('revealToScript', () => {
    const mockScript = mock<ScriptBuf>();

    const indexed = (keychain: KeychainKind, index: number): SpkIndexed =>
      mock<SpkIndexed>({ 0: keychain, 1: index });

    const adapter = (): BdkAccountAdapter =>
      BdkAccountAdapter.create(
        mockId,
        mockDerivationPath,
        mockDescriptors,
        mockNetwork,
      );

    it('returns false and reveals nothing when the script is not ours', () => {
      mockWallet.derivation_of_spk.mockReturnValue(undefined);

      expect(adapter().revealToScript(mockScript)).toBe(false);
      expect(mockWallet.reveal_addresses_to).not.toHaveBeenCalled();
    });

    it('returns false and reveals nothing when the index is already revealed', () => {
      mockWallet.derivation_of_spk.mockReturnValue(indexed('internal', 4));
      mockWallet.derivation_index.mockReturnValue(4);

      expect(adapter().revealToScript(mockScript)).toBe(false);
      expect(mockWallet.reveal_addresses_to).not.toHaveBeenCalled();
    });

    it('reveals up to the index when the script lies beyond the revealed set', () => {
      mockWallet.derivation_of_spk.mockReturnValue(indexed('internal', 7));
      mockWallet.derivation_index.mockReturnValue(4);
      mockWallet.reveal_addresses_to.mockReturnValue([mock<AddressInfo>()]);

      expect(adapter().revealToScript(mockScript)).toBe(true);
      expect(mockWallet.reveal_addresses_to).toHaveBeenCalledWith(
        'internal',
        7,
      );
    });

    it('reveals when the keychain has no revealed index yet', () => {
      mockWallet.derivation_of_spk.mockReturnValue(indexed('external', 0));
      mockWallet.derivation_index.mockReturnValue(undefined);
      mockWallet.reveal_addresses_to.mockReturnValue([mock<AddressInfo>()]);

      expect(adapter().revealToScript(mockScript)).toBe(true);
      expect(mockWallet.reveal_addresses_to).toHaveBeenCalledWith(
        'external',
        0,
      );
    });

    it('returns false when the reveal produces no new addresses', () => {
      mockWallet.derivation_of_spk.mockReturnValue(indexed('external', 7));
      mockWallet.derivation_index.mockReturnValue(4);
      mockWallet.reveal_addresses_to.mockReturnValue([]);

      expect(adapter().revealToScript(mockScript)).toBe(false);
    });
  });
});
