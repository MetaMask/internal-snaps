import { AssetsRepository } from './AssetsRepository';
import type { NativeCaipAssetType, TokenCaipAssetType } from './types';
import { KnownCaip19Id, Network } from '../../constants';
import type {
  AssetEntity,
  NativeAsset,
  TokenAsset,
} from '../../entities/assets';
import type { IStateManager } from '../state/IStateManager';
import type { UnencryptedStateValue } from '../state/State';

describe('AssetsRepository', () => {
  const createNativeAsset = ({
    assetType,
    keyringAccountId = 'account-1',
    network = Network.Mainnet,
    decimals = 6,
    rawAmount,
    uiAmount,
  }: {
    assetType: NativeCaipAssetType;
    keyringAccountId?: string;
    network?: Network;
    decimals?: number;
    rawAmount: string;
    uiAmount: string;
  }): NativeAsset => ({
    assetType,
    keyringAccountId,
    network,
    symbol: 'TRX',
    decimals,
    rawAmount,
    uiAmount,
    iconUrl: '',
  });

  const createTokenAsset = ({
    assetType,
    keyringAccountId = 'account-1',
    network = Network.Mainnet,
    symbol = 'USDT',
    decimals = 6,
    rawAmount,
    uiAmount,
  }: {
    assetType: TokenCaipAssetType;
    keyringAccountId?: string;
    network?: Network;
    symbol?: string;
    decimals?: number;
    rawAmount: string;
    uiAmount: string;
  }): TokenAsset => ({
    assetType,
    keyringAccountId,
    network,
    symbol,
    decimals,
    rawAmount,
    uiAmount,
    iconUrl: '',
  });

  const mainnetTrx = (amount: string): AssetEntity =>
    createNativeAsset({
      assetType: KnownCaip19Id.TrxMainnet as NativeCaipAssetType,
      rawAmount: String(Number(amount) * 1_000_000),
      uiAmount: amount,
    });

  const nileTrx = (amount: string): AssetEntity =>
    createNativeAsset({
      assetType: KnownCaip19Id.TrxNile as NativeCaipAssetType,
      network: Network.Nile,
      rawAmount: String(Number(amount) * 1_000_000),
      uiAmount: amount,
    });

  const mainnetUsdt = (amount: string): AssetEntity =>
    createTokenAsset({
      assetType:
        `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType,
      rawAmount: String(Number(amount) * 1_000_000),
      uiAmount: amount,
    });

  const createRepository = (initialState: UnencryptedStateValue) => {
    let stateValue = initialState;

    const mockState: IStateManager<UnencryptedStateValue> = {
      get: async () => stateValue,
      getKey: async <TResponse>(key: string) => {
        if (key === 'assets') {
          return stateValue.assets as TResponse;
        }

        if (key.startsWith('assets.')) {
          const accountId = key.replace('assets.', '');
          return stateValue.assets[accountId] as TResponse;
        }

        return undefined;
      },
      setKey: async () => undefined,
      setKeyWith: async () => undefined,
      update: async (updater) => {
        stateValue = updater(stateValue);
        return stateValue;
      },
      deleteKey: async () => undefined,
    };

    return {
      repository: new AssetsRepository(mockState),
      getState: () => stateValue,
    };
  };

  const createState = (
    assets: UnencryptedStateValue['assets'] = {},
  ): UnencryptedStateValue => ({
    keyringAccounts: {},
    assets,
    tokenPrices: {},
    transactions: {},
    mapInterfaceNameToId: {},
  });

  describe('saveMany', () => {
    it('adds a new asset if not already present', async () => {
      const trx = mainnetTrx('1');
      const usdt = mainnetUsdt('10');
      const { repository } = createRepository(
        createState({
          'account-1': [trx],
        }),
      );

      await repository.saveMany([trx, usdt]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        trx,
        usdt,
      ]);
    });

    it('creates a new account entry when persisting the first snapshot for that account', async () => {
      const trx = createNativeAsset({
        assetType: KnownCaip19Id.TrxMainnet as NativeCaipAssetType,
        keyringAccountId: 'new-account',
        rawAmount: '1000000',
        uiAmount: '1',
      });
      const usdt = createTokenAsset({
        assetType:
          `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType,
        keyringAccountId: 'new-account',
        rawAmount: '2500000',
        uiAmount: '2.5',
      });
      const { repository } = createRepository(createState());

      await repository.saveMany([trx, usdt]);

      expect(await repository.getByAccountId('new-account')).toStrictEqual([
        trx,
        usdt,
      ]);
    });

    it('updates an asset balance when it decreases', async () => {
      const initialUsdt = mainnetUsdt('10');
      const finalUsdt = mainnetUsdt('4');
      const { repository } = createRepository(
        createState({
          'account-1': [initialUsdt],
        }),
      );

      await repository.saveMany([finalUsdt]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        finalUsdt,
      ]);
    });

    it('updates an asset balance when it increases', async () => {
      const initialUsdt = mainnetUsdt('4');
      const finalUsdt = mainnetUsdt('10');
      const { repository } = createRepository(
        createState({
          'account-1': [initialUsdt],
        }),
      );

      await repository.saveMany([finalUsdt]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        finalUsdt,
      ]);
    });

    it("updates an asset balance when it's balance goes to 0", async () => {
      const trx = mainnetTrx('1');
      const initialUsdt = mainnetUsdt('1');
      const { repository } = createRepository(
        createState({
          'account-1': [trx, initialUsdt],
        }),
      );

      const finalUsdt = mainnetUsdt('0');
      await repository.saveMany([trx, finalUsdt]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        trx,
        finalUsdt,
      ]);
    });

    it('replaces multiple network snapshots for the same account', async () => {
      const initialMainnetTrx = mainnetTrx('1');
      const initialMainnetUsdt = mainnetUsdt('10');
      const initialNileTrx = nileTrx('2');
      const initialNileUsdt = createTokenAsset({
        assetType:
          `${Network.Nile}/trc20:TNileTokenAddress` as TokenCaipAssetType,
        network: Network.Nile,
        rawAmount: '7000000',
        uiAmount: '7',
      });
      const { repository } = createRepository(
        createState({
          'account-1': [
            initialMainnetTrx,
            initialMainnetUsdt,
            initialNileTrx,
            initialNileUsdt,
          ],
        }),
      );

      const updatedMainnetTrx = mainnetTrx('3');
      const updatedMainnetUsdt = mainnetUsdt('4');
      const updatedNileTrx = nileTrx('5');

      // Updates only the received assets in the list
      await repository.saveMany([
        updatedMainnetTrx,
        updatedMainnetUsdt,
        updatedNileTrx,
      ]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        updatedMainnetTrx,
        updatedMainnetUsdt,
        updatedNileTrx,
        initialNileUsdt,
      ]);
    });

    it('keeps unsynchronized network slices untouched when only one network is refreshed', async () => {
      const mainnetTrxSnapshot = mainnetTrx('2');
      const nileTrxSnapshot = nileTrx('3');
      const nileUsdtSnapshot = createTokenAsset({
        assetType:
          `${Network.Nile}/trc20:TNileTokenAddress` as TokenCaipAssetType,
        network: Network.Nile,
        rawAmount: '9000000',
        uiAmount: '9',
      });
      const { repository } = createRepository(
        createState({
          'account-1': [mainnetTrxSnapshot, nileTrxSnapshot, nileUsdtSnapshot],
        }),
      );

      const updatedMainnetTrx = mainnetTrx('5');
      await repository.saveMany([updatedMainnetTrx]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        updatedMainnetTrx,
        nileTrxSnapshot,
        nileUsdtSnapshot,
      ]);
    });

    it('does nothing when receives an empty list', async () => {
      const trx = mainnetTrx('1');
      const usdt = mainnetUsdt('10');
      const initialState = createState({
        'account-1': [trx, usdt],
      });
      const { repository } = createRepository(initialState);

      await repository.saveMany([]);

      expect(await repository.getByAccountId('account-1')).toStrictEqual([
        trx,
        usdt,
      ]);
    });
  });
});
