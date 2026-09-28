import type {
  AccountId,
  Asset,
  Caip19AssetId,
} from '@metamask/assets-controller' with { 'resolution-mode': 'import' };
import type { CaipChainId } from '@metamask/utils';

import type { AssetsProviderMessenger } from './AssetsProvider';
import { AssetsProvider } from './AssetsProvider';

const ACCOUNT_ID: AccountId = '550e8400-e29b-41d4-a716-446655440000';
const ASSET_ID: Caip19AssetId = 'tron:728126428/slip44:195';
const CHAIN_ID: CaipChainId = 'tron:728126428';

type GetAssetsAccounts = Parameters<AssetsProvider['getAssets']>[0];
type GetAssetsResult = Awaited<ReturnType<AssetsProvider['getAssets']>>;

const ACCOUNTS = [
  {
    id: ACCOUNT_ID,
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    type: 'eip155:eoa',
    scopes: [CHAIN_ID],
    methods: [],
    options: {},
    metadata: {
      name: 'Account 1',
      importTime: 0,
      keyring: { type: 'MetaMaskKeyring' },
    },
  },
] as GetAssetsAccounts;

const ASSET = {
  id: ASSET_ID,
  chainId: CHAIN_ID,
  balance: { amount: '1000000' },
  metadata: {
    type: 'fungible',
    symbol: 'TRX',
    name: 'TRON',
    decimals: 6,
    image: 'https://example.com/trx.png',
  },
  price: {
    assetPriceType: 'fungible',
    price: 1,
    lastUpdated: 0,
    usdPrice: 1,
  },
  fiatValue: 1,
} as Asset;

type WithAssetsProviderCallback<ReturnValue> = (payload: {
  assetsProvider: AssetsProvider;
  mockMessenger: jest.Mocked<AssetsProviderMessenger>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for AssetsProvider by creating a fresh provider with a mock
 * messenger. The callback receives the provider and mock for test configuration.
 *
 * @param testFunction - The test body receiving the provider and mocks.
 * @returns The return value of the callback.
 */
async function withAssetsProvider<ReturnValue>(
  testFunction: WithAssetsProviderCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockMessenger: jest.Mocked<AssetsProviderMessenger> = {
    call: jest.fn(),
  };

  const assetsProvider = new AssetsProvider({
    messenger: mockMessenger,
  });

  return await testFunction({
    assetsProvider,
    mockMessenger,
  });
}

describe('AssetsProvider', () => {
  describe('getAccountAssetByID', () => {
    it('calls AssetsController:getAccountAssetByID', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAccountAssetByID(ACCOUNT_ID, ASSET_ID);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetByID',
          ACCOUNT_ID,
          ASSET_ID,
        );
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('calls AssetsController:getAccountAssetsByIDs', async () => {
      const assetIds = [ASSET_ID];

      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAccountAssetsByIDs(ACCOUNT_ID, assetIds);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByIDs',
          ACCOUNT_ID,
          assetIds,
        );
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('calls AssetsController:getAccountAssetsByScope', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAccountAssetsByScope(CHAIN_ID, ACCOUNT_ID);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByScope',
          ACCOUNT_ID,
          CHAIN_ID,
        );
      });
    });
  });

  describe('getAssets', () => {
    it('calls AssetsController:getAssets with the accounts and no options', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAssets(ACCOUNTS);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          ACCOUNTS,
          {},
        );
      });
    });

    it('forces an update when bypassing the server cache', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAssets(ACCOUNTS, { bypassServerCache: true });

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          ACCOUNTS,
          { forceUpdate: true, bypassServerCache: true },
        );
      });
    });

    it('forces an update when bypassing the server cache even if the caller opted out', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAssets(ACCOUNTS, {
          forceUpdate: false,
          bypassServerCache: true,
        });

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          ACCOUNTS,
          { forceUpdate: true, bypassServerCache: true },
        );
      });
    });

    it('forwards the remaining options when bypassing the server cache', async () => {
      const options = {
        chainIds: [CHAIN_ID],
        assetTypes: ['fungible' as const],
        dataTypes: ['balance' as const, 'metadata' as const],
        assetsForPriceUpdate: [ASSET_ID],
      };

      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAssets(ACCOUNTS, {
          ...options,
          bypassServerCache: true,
        });

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          ACCOUNTS,
          { ...options, forceUpdate: true, bypassServerCache: true },
        );
      });
    });

    it('forwards the caller options untouched when not bypassing the server cache', async () => {
      const options = {
        chainIds: [CHAIN_ID],
        assetTypes: ['fungible' as const],
        dataTypes: ['balance' as const, 'metadata' as const],
        forceUpdate: true,
        assetsForPriceUpdate: [ASSET_ID],
      };

      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAssets(ACCOUNTS, options);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          ACCOUNTS,
          { ...options, bypassServerCache: undefined },
        );
      });
    });

    it('does not force an update when the server cache is not bypassed', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAssets(ACCOUNTS, { bypassServerCache: false });

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          ACCOUNTS,
          { forceUpdate: undefined, bypassServerCache: false },
        );
      });
    });

    it('returns the assets resolved by the host', async () => {
      const assets: GetAssetsResult = {
        [ACCOUNT_ID]: { [ASSET_ID]: ASSET },
      };

      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue(assets);

        const result = await assetsProvider.getAssets(ACCOUNTS, {
          bypassServerCache: true,
        });

        expect(result).toStrictEqual(assets);
      });
    });
  });
});
