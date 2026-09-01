import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import type { CaipChainId } from '@metamask/utils';
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import type { Address } from '@solana/kit';
import { address as asAddress } from '@solana/kit';

import { KnownCaip19Id, Network } from '../../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { mockLogger } from '../../__mocks__/logger';
import { MOCK_MINT_ACCOUNT } from '../../__mocks__/mockSolanaRpcResponses';
import type { SolanaConnection } from '../../connection';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

const ACCOUNT_ID = MOCK_SOLANA_KEYRING_ACCOUNT_0.id;
const ACCOUNT_ADDRESS = MOCK_SOLANA_KEYRING_ACCOUNT_0.address;
const MAINNET_ASSET_ID = KnownCaip19Id.SolMainnet as Caip19AssetId;
const USDC_ASSET_ID = KnownCaip19Id.UsdcMainnet as Caip19AssetId;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Derives the associated token account address for a mint/owner/program.
 *
 * @param mint - Mint address.
 * @param owner - Owner address.
 * @param tokenProgram - Token program that owns the mint.
 * @returns The ATA address.
 */
async function expectedAssociatedTokenAccount(
  mint: string,
  owner: string,
  tokenProgram: Address,
): Promise<string> {
  const [ata] = await findAssociatedTokenPda({
    mint: asAddress(mint),
    owner: asAddress(owner),
    tokenProgram,
  });
  return ata;
}

/**
 * Builds a controller asset for adapter mapping tests.
 *
 * @param options - Fields to set on the controller asset.
 * @param options.id - CAIP-19 asset ID.
 * @param options.chainId - Chain ID. Defaults to Mainnet.
 * @param options.amount - Display-formatted balance amount.
 * @param options.symbol - Asset symbol.
 * @param options.decimals - Asset decimals.
 * @returns A controller `Asset`.
 */
function createControllerAsset(options: {
  id: Caip19AssetId;
  chainId?: Network;
  amount?: string;
  symbol?: string;
  decimals?: number;
}): Asset {
  const {
    id,
    chainId = Network.Mainnet,
    amount = '1',
    symbol = 'SOL',
    decimals = 9,
  } = options;

  return {
    id,
    chainId,
    balance: { amount },
    metadata: {
      type: 'fungible',
      symbol,
      name: symbol,
      decimals,
    },
    price: {
      assetPriceType: 'fungible',
      price: 0,
      lastUpdated: 0,
      usdPrice: 0,
    },
    fiatValue: 0,
  } as Asset;
}

/**
 * Builds a fresh CoreAssetsAdapter and the mocks it is constructed with.
 *
 * @returns The adapter and its mock dependencies.
 */
function createCoreAssetsAdapterContext(): {
  adapter: CoreAssetsAdapter;
  mockAssetsProvider: jest.Mocked<
    Pick<
      AssetsProvider,
      | 'getAccountAssetByID'
      | 'getAccountAssetsByIDs'
      | 'getAccountAssetsByScope'
    >
  >;
  mockFindAccountById: jest.Mock;
  mockGetActiveNetworks: jest.Mock;
  mockFetchMint: jest.MockedFunction<SolanaConnection['fetchMint']>;
} {
  const mockAssetsProvider = {
    getAccountAssetByID: jest.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: jest.fn().mockResolvedValue({}),
    getAccountAssetsByScope: jest.fn().mockResolvedValue({}),
  };

  const mockFindAccountById = jest
    .fn()
    .mockResolvedValue(MOCK_SOLANA_KEYRING_ACCOUNT_0);
  const mockGetActiveNetworks = jest.fn().mockResolvedValue([Network.Mainnet]);
  const mockFetchMint = jest
    .fn()
    .mockResolvedValue(MOCK_MINT_ACCOUNT) as jest.MockedFunction<
    SolanaConnection['fetchMint']
  >;

  const adapter = new CoreAssetsAdapter({
    logger: mockLogger,
    getAccountAssetByID: mockAssetsProvider.getAccountAssetByID,
    getAccountAssetsByIDs: mockAssetsProvider.getAccountAssetsByIDs,
    getAccountAssetsByScope: mockAssetsProvider.getAccountAssetsByScope,
    findAccountById: mockFindAccountById,
    getActiveNetworks: mockGetActiveNetworks,
    fetchMint: mockFetchMint,
  });

  return {
    adapter,
    mockAssetsProvider,
    mockFindAccountById,
    mockGetActiveNetworks,
    mockFetchMint,
  };
}

/**
 * Wraps CoreAssetsAdapter tests with a fresh adapter and mocks.
 *
 * @param testFunction - The test body.
 * @returns The return value of the callback.
 */
async function withCoreAssetsAdapter<ReturnValue>(
  testFunction: (
    payload: ReturnType<typeof createCoreAssetsAdapterContext>,
  ) => Promise<ReturnValue> | ReturnValue,
): Promise<ReturnValue> {
  return await testFunction(createCoreAssetsAdapterContext());
}

describe('CoreAssetsAdapter', () => {
  describe('getAccountAssetByID', () => {
    it('maps a native controller asset without deriving an ATA', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchMint }) => {
          const controllerAsset = createControllerAsset({
            id: MAINNET_ASSET_ID,
          });
          mockAssetsProvider.getAccountAssetByID.mockResolvedValue(
            controllerAsset,
          );

          const asset = await adapter.getAccountAssetByID(
            ACCOUNT_ID,
            MAINNET_ASSET_ID,
          );

          expect(mockAssetsProvider.getAccountAssetByID).toHaveBeenCalledWith(
            ACCOUNT_ID,
            MAINNET_ASSET_ID,
          );
          expect(mockFetchMint).not.toHaveBeenCalled();
          expect(asset).toStrictEqual({
            assetType: MAINNET_ASSET_ID,
            keyringAccountId: ACCOUNT_ID,
            network: Network.Mainnet,
            address: ACCOUNT_ADDRESS,
            symbol: 'SOL',
            decimals: 9,
            rawAmount: '1000000000',
            uiAmount: '1',
          });
        },
      );
    });

    it('maps an SPL token and derives its associated token account pubkey', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchMint }) => {
          const controllerAsset = createControllerAsset({
            id: USDC_ASSET_ID,
            symbol: 'USDC',
            decimals: 6,
            amount: '1.234567',
          });
          mockAssetsProvider.getAccountAssetByID.mockResolvedValue(
            controllerAsset,
          );

          const asset = await adapter.getAccountAssetByID(
            ACCOUNT_ID,
            USDC_ASSET_ID,
          );

          expect(mockFetchMint).toHaveBeenCalledWith(
            USDC_MINT,
            Network.Mainnet,
          );
          expect(asset).toStrictEqual({
            assetType: USDC_ASSET_ID,
            keyringAccountId: ACCOUNT_ID,
            network: Network.Mainnet,
            mint: USDC_MINT,
            pubkey: await expectedAssociatedTokenAccount(
              USDC_MINT,
              ACCOUNT_ADDRESS,
              TOKEN_PROGRAM_ADDRESS,
            ),
            symbol: 'USDC',
            decimals: 6,
            rawAmount: '1234567',
            uiAmount: '1.234567',
          });
        },
      );
    });

    it('derives the ATA with the Token-2022 program when the mint is Token-2022', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchMint }) => {
          mockFetchMint.mockResolvedValue({
            ...MOCK_MINT_ACCOUNT,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
          });
          mockAssetsProvider.getAccountAssetByID.mockResolvedValue(
            createControllerAsset({
              id: USDC_ASSET_ID,
              symbol: 'USDC',
              decimals: 6,
              amount: '1.234567',
            }),
          );

          const asset = await adapter.getAccountAssetByID(
            ACCOUNT_ID,
            USDC_ASSET_ID,
          );

          const tokenProgramAta = await expectedAssociatedTokenAccount(
            USDC_MINT,
            ACCOUNT_ADDRESS,
            TOKEN_PROGRAM_ADDRESS,
          );
          const token2022Ata = await expectedAssociatedTokenAccount(
            USDC_MINT,
            ACCOUNT_ADDRESS,
            TOKEN_2022_PROGRAM_ADDRESS,
          );

          expect(token2022Ata).not.toBe(tokenProgramAta);
          expect(asset).toMatchObject({ pubkey: token2022Ata });
        },
      );
    });

    it('returns null when the ATA cannot be derived', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchMint }) => {
          mockFetchMint.mockRejectedValue(new Error('mint missing'));
          mockAssetsProvider.getAccountAssetByID.mockResolvedValue(
            createControllerAsset({
              id: USDC_ASSET_ID,
              symbol: 'USDC',
              decimals: 6,
              amount: '1.234567',
            }),
          );

          const asset = await adapter.getAccountAssetByID(
            ACCOUNT_ID,
            USDC_ASSET_ID,
          );

          expect(asset).toBeNull();
        },
      );
    });

    it('returns null when the controller has no matching asset', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        const asset = await adapter.getAccountAssetByID(
          ACCOUNT_ID,
          MAINNET_ASSET_ID,
        );

        expect(asset).toBeNull();
      });
    });

    it('returns null when the account is missing', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFindAccountById, mockAssetsProvider }) => {
          mockFindAccountById.mockResolvedValue(null);

          const asset = await adapter.getAccountAssetByID(
            ACCOUNT_ID,
            MAINNET_ASSET_ID,
          );

          expect(asset).toBeNull();
          expect(mockAssetsProvider.getAccountAssetByID).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns mapped assets keyed by ID and null for missing IDs', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: mainnetAsset,
        });

        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          MAINNET_ASSET_ID,
          USDC_ASSET_ID,
        ]);

        expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
          ACCOUNT_ID,
          [MAINNET_ASSET_ID, USDC_ASSET_ID],
        );
        expect(assets[MAINNET_ASSET_ID]?.assetType).toBe(MAINNET_ASSET_ID);
        expect(assets[USDC_ASSET_ID]).toBeNull();
      });
    });

    it('derives ATA pubkeys for SPL tokens returned by ID', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: createControllerAsset({ id: MAINNET_ASSET_ID }),
          [USDC_ASSET_ID]: createControllerAsset({
            id: USDC_ASSET_ID,
            symbol: 'USDC',
            decimals: 6,
            amount: '1.234567',
          }),
        });

        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          MAINNET_ASSET_ID,
          USDC_ASSET_ID,
        ]);

        expect(assets[USDC_ASSET_ID]).toMatchObject({
          mint: USDC_MINT,
          pubkey: await expectedAssociatedTokenAccount(
            USDC_MINT,
            ACCOUNT_ADDRESS,
            TOKEN_PROGRAM_ADDRESS,
          ),
        });
        expect(assets[MAINNET_ASSET_ID]).not.toHaveProperty('pubkey');
      });
    });

    it('returns an empty record for an empty ID list', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, []);

        expect(assets).toStrictEqual({});
        expect(mockAssetsProvider.getAccountAssetsByIDs).not.toHaveBeenCalled();
      });
    });

    it('returns null entries when the account is missing', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFindAccountById, mockAssetsProvider }) => {
          mockFindAccountById.mockResolvedValue(null);

          const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
            MAINNET_ASSET_ID,
            USDC_ASSET_ID,
          ]);

          expect(assets).toStrictEqual({
            [MAINNET_ASSET_ID]: null,
            [USDC_ASSET_ID]: null,
          });
          expect(
            mockAssetsProvider.getAccountAssetsByIDs,
          ).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('maps every controller asset for the requested scope', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        const usdcAsset = createControllerAsset({
          id: USDC_ASSET_ID,
          symbol: 'USDC',
          decimals: 6,
          amount: '1.234567',
        });
        mockAssetsProvider.getAccountAssetsByScope.mockResolvedValue({
          [MAINNET_ASSET_ID]: mainnetAsset,
          [USDC_ASSET_ID]: usdcAsset,
        });

        const assets = await adapter.getAccountAssetsByScope(
          Network.Mainnet,
          ACCOUNT_ID,
        );

        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Mainnet,
          ACCOUNT_ID,
        );
        expect(assets.map((asset) => asset.assetType).sort()).toStrictEqual(
          [MAINNET_ASSET_ID, USDC_ASSET_ID].sort(),
        );
        expect(
          assets.every((asset) => asset.keyringAccountId === ACCOUNT_ID),
        ).toBe(true);
        const usdc = assets.find((asset) => asset.assetType === USDC_ASSET_ID);
        expect(usdc).toMatchObject({
          mint: USDC_MINT,
          pubkey: await expectedAssociatedTokenAccount(
            USDC_MINT,
            ACCOUNT_ADDRESS,
            TOKEN_PROGRAM_ADDRESS,
          ),
        });
      });
    });

    it('omits SPL tokens whose ATA cannot be derived', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchMint }) => {
          mockFetchMint.mockRejectedValue(new Error('mint missing'));
          mockAssetsProvider.getAccountAssetsByScope.mockResolvedValue({
            [MAINNET_ASSET_ID]: createControllerAsset({ id: MAINNET_ASSET_ID }),
            [USDC_ASSET_ID]: createControllerAsset({
              id: USDC_ASSET_ID,
              symbol: 'USDC',
              decimals: 6,
              amount: '1.234567',
            }),
          });

          const assets = await adapter.getAccountAssetsByScope(
            Network.Mainnet,
            ACCOUNT_ID,
          );

          expect(assets).toHaveLength(1);
          expect(assets[0]?.assetType).toBe(MAINNET_ASSET_ID);
        },
      );
    });

    it('skips null controller assets for the requested scope', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByScope.mockResolvedValue({
          [MAINNET_ASSET_ID]: createControllerAsset({ id: MAINNET_ASSET_ID }),
          [USDC_ASSET_ID]: null,
        } as unknown as Record<Caip19AssetId, Asset>);

        const assets = await adapter.getAccountAssetsByScope(
          Network.Mainnet,
          ACCOUNT_ID,
        );

        expect(assets).toHaveLength(1);
        expect(assets[0]?.assetType).toBe(MAINNET_ASSET_ID);
      });
    });

    it('returns an empty list when the account is missing', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFindAccountById, mockAssetsProvider }) => {
          mockFindAccountById.mockResolvedValue(null);

          const assets = await adapter.getAccountAssetsByScope(
            Network.Mainnet,
            ACCOUNT_ID,
          );

          expect(assets).toStrictEqual([]);
          expect(
            mockAssetsProvider.getAccountAssetsByScope,
          ).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('getAccountAssets', () => {
    it('concatenates mapped assets from each active network', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockGetActiveNetworks }) => {
          mockGetActiveNetworks.mockResolvedValue([
            Network.Mainnet,
            Network.Devnet,
          ]);
          const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
          const devnetAsset = createControllerAsset({
            id: KnownCaip19Id.SolDevnet as Caip19AssetId,
            chainId: Network.Devnet,
          });
          mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
            async (scope: CaipChainId) => {
              if (scope === Network.Mainnet) {
                return { [MAINNET_ASSET_ID]: mainnetAsset };
              }
              if (scope === Network.Devnet) {
                return {
                  [KnownCaip19Id.SolDevnet as Caip19AssetId]: devnetAsset,
                };
              }
              return {};
            },
          );

          const assets = await adapter.getAccountAssets(ACCOUNT_ID);

          expect(
            mockAssetsProvider.getAccountAssetsByScope,
          ).toHaveBeenCalledTimes(2);
          expect(assets.map((asset) => asset.assetType)).toStrictEqual([
            MAINNET_ASSET_ID,
            KnownCaip19Id.SolDevnet,
          ]);
        },
      );
    });

    it('rejects when any scope request fails', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockGetActiveNetworks }) => {
          mockGetActiveNetworks.mockResolvedValue([
            Network.Mainnet,
            Network.Devnet,
          ]);
          mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
            async (scope: CaipChainId) => {
              if (scope === Network.Devnet) {
                throw new Error('devnet failed');
              }
              return {};
            },
          );

          await expect(adapter.getAccountAssets(ACCOUNT_ID)).rejects.toThrow(
            'devnet failed',
          );
        },
      );
    });
  });
});
