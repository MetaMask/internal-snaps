import { hexToBytes } from '@metamask/utils';
import { Keypair } from '@stellar/stellar-sdk';

import { KnownCaip2ChainId } from '../../api';
import { MAX_INT64 } from '../../constants';
import { getSlip44AssetId } from '../../utils';
import { bufferToUint8Array } from '../../utils/buffer';
import {
  generateMockStellarKeyringAccounts,
  generateStellarKeyringAccount,
} from '../account/__mocks__/account.fixtures';
import { DerivedAccountAddressMismatchException } from '../account/exceptions';
import { AccountNotActivatedException, NetworkService } from '../network';
import {
  generateStellarAddress,
  getTestWallet,
} from '../wallet/__mocks__/wallet.fixtures';
import {
  createMockAccountWithBalances,
  DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
  horizonSource,
  mockOnChainAccountService,
} from './__mocks__/onChainAccount.fixtures';
import { OnChainAccount } from './OnChainAccount';
import type { OnChainAccountSerializableFull } from './OnChainAccountSerializable';
import { OnChainAccountSynchronizeService } from './OnChainAccountSynchronizeService';

jest.mock('../../utils/logger');
jest.mock('../../utils/snap');

describe('OnChainAccountService', () => {
  const seed = hexToBytes(
    '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  );

  const getNetworkServiceSpies = () => ({
    getAccountSpy: jest.spyOn(NetworkService.prototype, 'getAccount'),
    getAccountLedgerMetaSpy: jest.spyOn(
      NetworkService.prototype,
      'getAccountLedgerMeta',
    ),
    loadOnChainAccountSpy: jest.spyOn(
      NetworkService.prototype,
      'loadOnChainAccount',
    ),
  });

  describe('isAccountActivated', () => {
    it('returns true when getAccount returns an account', async () => {
      const { getAccountSpy } = getNetworkServiceSpies();
      const wallet = getTestWallet({ seed });
      const onChainAcc = createMockAccountWithBalances(
        wallet.address,
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const onChain = new OnChainAccount(
        onChainAcc,
        KnownCaip2ChainId.Mainnet,
        horizonSource(onChainAcc, KnownCaip2ChainId.Mainnet),
      );
      getAccountSpy.mockResolvedValue(onChain);

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.isAccountActivated({
        accountAddress: onChain.accountId,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(result).toBe(true);
    });

    it('returns false when getAccount throws AccountNotActivatedException', async () => {
      const { getAccountSpy } = getNetworkServiceSpies();
      const accountAddress = generateStellarAddress();
      getAccountSpy.mockRejectedValue(
        new AccountNotActivatedException(
          accountAddress,
          KnownCaip2ChainId.Mainnet,
        ),
      );

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.isAccountActivated({
        accountAddress,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(result).toBe(false);
    });

    it('rethrows errors other than AccountNotActivatedException', async () => {
      const { getAccountSpy } = getNetworkServiceSpies();
      const accountAddress = generateStellarAddress();
      getAccountSpy.mockRejectedValue(new Error('Horizon unavailable'));

      const { onChainAccountService } = mockOnChainAccountService();

      await expect(
        onChainAccountService.isAccountActivated({
          accountAddress,
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow('Horizon unavailable');
    });
  });

  describe('resolveOnChainAccount', () => {
    it('returns loaded account when Horizon account id matches the requested address', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
      const keyringAccount = generateStellarKeyringAccount(
        globalThis.crypto.randomUUID(),
        signer.publicKey(),
        'entropy-source-1',
        0,
      );
      const loadedAcc = createMockAccountWithBalances(
        signer.publicKey(),
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const loaded = new OnChainAccount(
        loadedAcc,
        KnownCaip2ChainId.Mainnet,
        horizonSource(loadedAcc, KnownCaip2ChainId.Mainnet),
      );
      const { loadOnChainAccountSpy } = getNetworkServiceSpies();
      loadOnChainAccountSpy.mockResolvedValue(loaded);

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.resolveOnChainAccount(
        keyringAccount.address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result.accountId).toStrictEqual(signer.publicKey());
      expect(loadOnChainAccountSpy).toHaveBeenCalledWith(
        keyringAccount.address,
        KnownCaip2ChainId.Mainnet,
      );
    });

    it('throws when loaded account id does not match the requested address', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
      const other = Keypair.random();
      const loadedAcc = createMockAccountWithBalances(
        other.publicKey(),
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const loaded = new OnChainAccount(
        loadedAcc,
        KnownCaip2ChainId.Mainnet,
        horizonSource(loadedAcc, KnownCaip2ChainId.Mainnet),
      );
      const { loadOnChainAccountSpy } = getNetworkServiceSpies();
      loadOnChainAccountSpy.mockResolvedValue(loaded);

      const { onChainAccountService } = mockOnChainAccountService();
      await expect(
        onChainAccountService.resolveOnChainAccount(
          signer.publicKey(),
          KnownCaip2ChainId.Mainnet,
        ),
      ).rejects.toThrow(DerivedAccountAddressMismatchException);
    });
  });

  describe('resolveOnChainAccountByKeyringAccountId', () => {
    it('returns null when no snapshot exists for the keyring id and scope', async () => {
      const keyringAccountId = globalThis.crypto.randomUUID();
      const accountAddress = Keypair.random().publicKey();
      const { onChainAccountService, onChainAccountRepository } =
        mockOnChainAccountService();
      const findByAccountIdSpy = jest.spyOn(
        onChainAccountRepository,
        'findByKeyringAccountId',
      );
      findByAccountIdSpy.mockResolvedValue(null);

      const result =
        await onChainAccountService.resolveOnChainAccountByKeyringAccountId(
          keyringAccountId,
          accountAddress,
          KnownCaip2ChainId.Mainnet,
        );

      expect(result).toBeNull();
      expect(findByAccountIdSpy).toHaveBeenCalledWith(
        keyringAccountId,
        KnownCaip2ChainId.Mainnet,
      );
    });

    it('returns rehydrated OnChainAccount when a snapshot exists', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
      const keyringAccountId = globalThis.crypto.randomUUID();
      const loadedAcc = createMockAccountWithBalances(
        signer.publicKey(),
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const binding = horizonSource(
        loadedAcc,
        KnownCaip2ChainId.Mainnet,
      ) as OnChainAccountSerializableFull;

      const { onChainAccountService, onChainAccountRepository } =
        mockOnChainAccountService();
      const findByAccountIdSpy = jest.spyOn(
        onChainAccountRepository,
        'findByKeyringAccountId',
      );
      findByAccountIdSpy.mockResolvedValue(binding);

      const result =
        await onChainAccountService.resolveOnChainAccountByKeyringAccountId(
          keyringAccountId,
          signer.publicKey(),
          KnownCaip2ChainId.Mainnet,
        );

      expect(result).toBeInstanceOf(OnChainAccount);
      expect(result?.accountId).toStrictEqual(signer.publicKey());
      expect(findByAccountIdSpy).toHaveBeenCalledWith(
        keyringAccountId,
        KnownCaip2ChainId.Mainnet,
      );
    });
  });

  describe('resolveOnChainAccountFromCore', () => {
    const usdcIssuer =
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    const usdcId = `stellar:pubnet/asset:USDC-${usdcIssuer}` as const;
    const sep41Id =
      'stellar:pubnet/sep41:CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75' as const;

    it('returns null when Core migration is off', async () => {
      const { onChainAccountService, assetsService } =
        mockOnChainAccountService();
      const getAccountAssetsByScopeSpy = jest.spyOn(
        assetsService,
        'getAccountAssetsByScope',
      );

      expect(
        await onChainAccountService.resolveOnChainAccountFromCore(
          KnownCaip2ChainId.Mainnet,
          globalThis.crypto.randomUUID(),
          Keypair.random().publicKey(),
        ),
      ).toBeNull();
      expect(getAccountAssetsByScopeSpy).not.toHaveBeenCalled();
    });

    it('returns null when Core returns no holdings', async () => {
      const { onChainAccountService, assetsService } =
        mockOnChainAccountService();
      jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
      jest
        .spyOn(assetsService, 'getAccountAssetsByScope')
        .mockResolvedValue([]);

      expect(
        await onChainAccountService.resolveOnChainAccountFromCore(
          KnownCaip2ChainId.Mainnet,
          globalThis.crypto.randomUUID(),
          Keypair.random().publicKey(),
        ),
      ).toBeNull();
    });

    it('binds native, classic, and SEP-41 holdings from Core', async () => {
      const accountAddress = Keypair.random().publicKey();
      const keyringAccountId = globalThis.crypto.randomUUID();
      const { onChainAccountService, assetsService } =
        mockOnChainAccountService();
      jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
      const getAccountAssetsByScopeSpy = jest
        .spyOn(assetsService, 'getAccountAssetsByScope')
        .mockResolvedValue([
          {
            id: getSlip44AssetId(KnownCaip2ChainId.Mainnet),
            chainId: KnownCaip2ChainId.Mainnet,
            balance: {
              amount: '5',
              metadata: {
                spendableBalance: '40000000',
                minimumReserveBalance: '10000000',
                decimal: 7,
              },
            },
            metadata: { symbol: 'XLM', decimals: 7 },
          },
          {
            id: usdcId,
            chainId: KnownCaip2ChainId.Mainnet,
            balance: {
              amount: '0.1630079',
              metadata: {
                limit: MAX_INT64,
                authorized: true,
                sponsored: false,
              },
            },
            metadata: { symbol: 'USDC', decimals: 7 },
          },
          {
            id: sep41Id,
            chainId: KnownCaip2ChainId.Mainnet,
            balance: { amount: '2' },
            metadata: { symbol: 'TA', decimals: 7 },
          },
        ]);

      const result = await onChainAccountService.resolveOnChainAccountFromCore(
        KnownCaip2ChainId.Mainnet,
        keyringAccountId,
        accountAddress,
      );

      expect(result).toBeInstanceOf(OnChainAccount);
      const full = result?.toSerializableFull();
      expect(full).toMatchObject({
        accountId: accountAddress,
        sequenceNumber: '0',
        scope: KnownCaip2ChainId.Mainnet,
        rawNativeBalance: '50000000',
        meta: {
          subentryCount: 0,
          numSponsoring: 0,
          numSponsored: 0,
        },
      });
      expect(full?.balances).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: usdcId,
            balance: '1630079',
            symbol: 'USDC',
            address: usdcIssuer,
            limit: MAX_INT64,
            authorized: true,
            sponsored: false,
          }),
          expect.objectContaining({
            assetId: sep41Id,
            balance: '20000000',
            symbol: 'TA',
            decimals: 7,
          }),
        ]),
      );
      expect(getAccountAssetsByScopeSpy).toHaveBeenCalledWith(
        KnownCaip2ChainId.Mainnet,
        keyringAccountId,
      );
    });

    it('overlays RPC ledger meta when resolveAccountFromNetwork is true', async () => {
      const accountAddress = Keypair.random().publicKey();
      const { getAccountLedgerMetaSpy } = getNetworkServiceSpies();
      getAccountLedgerMetaSpy.mockResolvedValue({
        sequenceNumber: '99',
        subentryCount: 4,
        numSponsoring: 2,
        numSponsored: 0,
        rawNativeBalance: '351010623',
      });

      const { onChainAccountService, assetsService } =
        mockOnChainAccountService();
      jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
      jest.spyOn(assetsService, 'getAccountAssetsByScope').mockResolvedValue([
        {
          id: getSlip44AssetId(KnownCaip2ChainId.Mainnet),
          chainId: KnownCaip2ChainId.Mainnet,
          balance: {
            amount: '1',
            metadata: {
              spendableBalance: '0',
              minimumReserveBalance: '10000000',
              decimal: 7,
            },
          },
          metadata: { symbol: 'XLM', decimals: 7 },
        },
      ]);

      const result = await onChainAccountService.resolveOnChainAccountFromCore(
        KnownCaip2ChainId.Mainnet,
        globalThis.crypto.randomUUID(),
        accountAddress,
        { resolveAccountFromNetwork: true },
      );

      expect(result?.sequenceNumber).toBe('99');
      expect(result?.subentryCount).toBe(4);
      expect(result?.numSponsoring).toBe(2);
      expect(result?.numSponsored).toBe(0);
      expect(result?.nativeRawBalance.toFixed(0)).toBe('351010623');
      expect(getAccountLedgerMetaSpy).toHaveBeenCalledWith(
        accountAddress,
        KnownCaip2ChainId.Mainnet,
      );
    });

    it('returns null when Horizon says the account is not activated', async () => {
      const accountAddress = Keypair.random().publicKey();
      const { getAccountLedgerMetaSpy } = getNetworkServiceSpies();
      getAccountLedgerMetaSpy.mockRejectedValue(
        new AccountNotActivatedException(
          accountAddress,
          KnownCaip2ChainId.Mainnet,
        ),
      );
      const { onChainAccountService, assetsService } =
        mockOnChainAccountService();
      jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
      const getAccountAssetsByScopeSpy = jest.spyOn(
        assetsService,
        'getAccountAssetsByScope',
      );

      expect(
        await onChainAccountService.resolveOnChainAccountFromCore(
          KnownCaip2ChainId.Mainnet,
          globalThis.crypto.randomUUID(),
          accountAddress,
          { resolveAccountFromNetwork: true },
        ),
      ).toBeNull();
      expect(getAccountAssetsByScopeSpy).not.toHaveBeenCalled();
    });
  });

  describe('synchronize', () => {
    it('calls OnChainAccountSynchronizeService', async () => {
      const keyringAccounts = generateMockStellarKeyringAccounts(
        2,
        'entropy-source-1',
      );
      const activatedAccountPairs = keyringAccounts.map((keyringAccount) => ({
        keyringAccount,
        onChainAccount: OnChainAccount.fromSerializable(
          horizonSource(
            createMockAccountWithBalances(
              keyringAccount.address,
              '1',
              DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
            ),
            KnownCaip2ChainId.Mainnet,
          ) as OnChainAccountSerializableFull,
        ),
      }));
      const { onChainAccountService } = mockOnChainAccountService();
      const synchronizeSpy = jest.spyOn(
        OnChainAccountSynchronizeService.prototype,
        'synchronize',
      );

      await onChainAccountService.synchronize(
        activatedAccountPairs,
        KnownCaip2ChainId.Mainnet,
        [],
      );

      expect(synchronizeSpy).toHaveBeenCalledWith(
        activatedAccountPairs,
        KnownCaip2ChainId.Mainnet,
        [],
      );
    });

    it('skips persist when Core migration is on', async () => {
      const { onChainAccountService, assetsService } =
        mockOnChainAccountService();
      jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
      const synchronizeSpy = jest.spyOn(
        OnChainAccountSynchronizeService.prototype,
        'synchronize',
      );

      await onChainAccountService.synchronize(
        [],
        KnownCaip2ChainId.Mainnet,
        [],
      );

      expect(synchronizeSpy).not.toHaveBeenCalled();
    });
  });
});
