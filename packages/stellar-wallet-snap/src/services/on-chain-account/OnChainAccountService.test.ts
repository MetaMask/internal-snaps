import { hexToBytes } from '@metamask/utils';
import { Keypair } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { MAX_INT64 } from '../../constants';
import { getSlip44AssetId, isSep41Id } from '../../utils';
import { bufferToUint8Array } from '../../utils/buffer';
import {
  generateMockStellarKeyringAccounts,
  generateStellarKeyringAccount,
} from '../account/__mocks__/account.fixtures';
import { DerivedAccountAddressMismatchException } from '../account/exceptions';
import { AssetMetadataService } from '../asset-metadata';
import {
  getMockSep41Assets,
  USDC_CLASSIC,
  USDC_SEP41,
  USDT_SEP41,
} from '../asset-metadata/__mocks__/assets.fixtures';
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
import {
  OnChainAccountBalanceNotAvailableException,
  OnChainAccountSep41BalanceNotFoundException,
} from './exceptions';
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

    it('binds SEP-41 balances including zero when resolveWithFullBalance is set', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
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
      const sep41Assets = getMockSep41Assets();
      const [usdc, usdt] = sep41Assets;
      if (
        usdc === undefined ||
        usdt === undefined ||
        !isSep41Id(usdc.assetId) ||
        !isSep41Id(usdt.assetId)
      ) {
        throw new Error('expected SEP-41 mock assets');
      }
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue(sep41Assets);
      const getSep41AssetBalancesSpy = jest
        .spyOn(NetworkService.prototype, 'getSep41AssetBalances')
        .mockResolvedValue({
          [signer.publicKey()]: {
            [usdc.assetId]: new BigNumber(10_000_000),
            [usdt.assetId]: new BigNumber(0),
          },
        });

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.resolveOnChainAccount(
        signer.publicKey(),
        KnownCaip2ChainId.Mainnet,
        { resolveWithFullBalance: true },
      );

      expect(getSep41AssetBalancesSpy).toHaveBeenCalledWith({
        accounts: [signer.publicKey()],
        assetIds: [usdc.assetId, usdt.assetId],
        scope: KnownCaip2ChainId.Mainnet,
      });
      expect(result.getRawAsset(USDC_SEP41)?.balance.toFixed()).toBe(
        '10000000',
      );
      expect(result.getAsset(USDC_SEP41)?.symbol).toBe('USDC');
      expect(result.getRawAsset(USDT_SEP41)?.balance.toFixed()).toBe('0');
      expect(result.getAsset(USDT_SEP41)).toBeUndefined();
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
    });

    it('returns the Horizon account when the SEP-41 catalog is empty', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
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
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue([]);
      const getSep41AssetBalancesSpy = jest.spyOn(
        NetworkService.prototype,
        'getSep41AssetBalances',
      );

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.resolveOnChainAccount(
        signer.publicKey(),
        KnownCaip2ChainId.Mainnet,
        { resolveWithFullBalance: true },
      );

      expect(result.accountId).toStrictEqual(signer.publicKey());
      expect(getSep41AssetBalancesSpy).not.toHaveBeenCalled();
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
    });

    it('returns the Horizon account when testnet has no SEP-41 balance map', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
      const loadedAcc = createMockAccountWithBalances(
        signer.publicKey(),
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const loaded = new OnChainAccount(
        loadedAcc,
        KnownCaip2ChainId.Testnet,
        horizonSource(loadedAcc, KnownCaip2ChainId.Testnet),
      );
      const { loadOnChainAccountSpy } = getNetworkServiceSpies();
      loadOnChainAccountSpy.mockResolvedValue(loaded);
      const sep41Assets = getMockSep41Assets();
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue(sep41Assets);
      const getSep41AssetBalancesSpy = jest.spyOn(
        NetworkService.prototype,
        'getSep41AssetBalances',
      );

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.resolveOnChainAccount(
        signer.publicKey(),
        KnownCaip2ChainId.Testnet,
        { resolveWithFullBalance: true },
      );

      expect(getSep41AssetBalancesSpy).toHaveBeenCalledWith({
        accounts: [signer.publicKey()],
        assetIds: sep41Assets.map((asset) => asset.assetId),
        scope: KnownCaip2ChainId.Testnet,
      });
      expect(result.accountId).toStrictEqual(signer.publicKey());
      expect(result.getRawAsset(USDC_SEP41)).toBeUndefined();
      expect(result.getRawAsset(USDT_SEP41)).toBeUndefined();
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
    });

    it('throws when mainnet returns no SEP-41 balance map for the account', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
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
      const sep41Assets = getMockSep41Assets();
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue(sep41Assets);
      const getSep41AssetBalancesSpy = jest
        .spyOn(NetworkService.prototype, 'getSep41AssetBalances')
        .mockResolvedValue({});

      const { onChainAccountService } = mockOnChainAccountService();
      await expect(
        onChainAccountService.resolveOnChainAccount(
          signer.publicKey(),
          KnownCaip2ChainId.Mainnet,
          { resolveWithFullBalance: true },
        ),
      ).rejects.toThrow(
        new OnChainAccountSep41BalanceNotFoundException(signer.publicKey()),
      );
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
    });

    it('throws when a requested SEP-41 balance cell was not read', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
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
      const sep41Assets = getMockSep41Assets();
      const [usdc, usdt] = sep41Assets;
      if (
        usdc === undefined ||
        usdt === undefined ||
        !isSep41Id(usdc.assetId) ||
        !isSep41Id(usdt.assetId)
      ) {
        throw new Error('expected SEP-41 mock assets');
      }
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue(sep41Assets);
      const getSep41AssetBalancesSpy = jest
        .spyOn(NetworkService.prototype, 'getSep41AssetBalances')
        .mockResolvedValue({
          [signer.publicKey()]: {
            [usdc.assetId]: null,
            [usdt.assetId]: new BigNumber(1),
          },
        });

      const { onChainAccountService } = mockOnChainAccountService();
      await expect(
        onChainAccountService.resolveOnChainAccount(
          signer.publicKey(),
          KnownCaip2ChainId.Mainnet,
          { resolveWithFullBalance: true },
        ),
      ).rejects.toThrow(
        new OnChainAccountBalanceNotAvailableException(usdc.assetId),
      );
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
    });

    it('throws when a requested SEP-41 asset id is missing from the balance map', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
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
      const sep41Assets = getMockSep41Assets();
      const [usdc, usdt] = sep41Assets;
      if (
        usdc === undefined ||
        usdt === undefined ||
        !isSep41Id(usdc.assetId) ||
        !isSep41Id(usdt.assetId)
      ) {
        throw new Error('expected SEP-41 mock assets');
      }
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue(sep41Assets);
      const getSep41AssetBalancesSpy = jest
        .spyOn(NetworkService.prototype, 'getSep41AssetBalances')
        .mockResolvedValue({
          [signer.publicKey()]: {
            [usdc.assetId]: new BigNumber(1),
          },
        });

      const { onChainAccountService } = mockOnChainAccountService();
      await expect(
        onChainAccountService.resolveOnChainAccount(
          signer.publicKey(),
          KnownCaip2ChainId.Mainnet,
          { resolveWithFullBalance: true },
        ),
      ).rejects.toThrow(
        new OnChainAccountBalanceNotAvailableException(usdt.assetId),
      );
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
    });

    it('propagates a SEP-41 balance read failure', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
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
      const fetchSep41Spy = jest
        .spyOn(AssetMetadataService.prototype, 'fetchSep41AssetsOrSyncOnce')
        .mockResolvedValue(getMockSep41Assets());
      const getSep41AssetBalancesSpy = jest
        .spyOn(NetworkService.prototype, 'getSep41AssetBalances')
        .mockRejectedValue(new Error('Failed to load SEP-41 token balance'));

      const { onChainAccountService } = mockOnChainAccountService();
      await expect(
        onChainAccountService.resolveOnChainAccount(
          signer.publicKey(),
          KnownCaip2ChainId.Mainnet,
          { resolveWithFullBalance: true },
        ),
      ).rejects.toThrow('Failed to load SEP-41 token balance');
      fetchSep41Spy.mockRestore();
      getSep41AssetBalancesSpy.mockRestore();
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
    const usdcIssuer = USDC_CLASSIC.split('-').at(1) as string;

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
            id: USDC_CLASSIC,
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
            id: USDC_SEP41,
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
            assetId: USDC_CLASSIC,
            balance: '1630079',
            symbol: 'USDC',
            address: usdcIssuer,
            limit: MAX_INT64,
            authorized: true,
            sponsored: false,
          }),
          expect.objectContaining({
            assetId: USDC_SEP41,
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
